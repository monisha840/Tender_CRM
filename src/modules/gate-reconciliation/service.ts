import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { getSettingValue } from "@/lib/server/settings-read";
import { runAction, ServiceError, updateWithVersion } from "@/lib/server/service";
import { isModuleEnabled } from "@/modules/bid-pricing/feature";
import { reconcile, type OurAttendance, type OurEmployee } from "./match";
import { parseGateGrid, type ColumnMap, type DateFormat } from "./parse";
import { RESOLUTIONS, resolveExceptionSchema, saveMappingSchema, uploadGateSchema } from "./schema";

const MODULE = "gate_reconciliation";

type Reader = Pick<typeof prisma, "gateAttendanceUpload" | "gateAttendanceException">;

// ---------------------------------------------------------------------------
// Status for the bill-readiness checklist
// ---------------------------------------------------------------------------

export interface GateStatus {
  /** A gate file has been uploaded for this project and month. */
  uploaded: boolean;
  /** Uploaded and no OPEN exceptions remain. This is what 'Gate attendance reconciled' reads. */
  reconciled: boolean;
  openExceptions: number;
  totalExceptions: number;
  matched: number;
  matchedPct: number | null;
  uploadId: string | null;
  uploadedAt: string | null;
}

/**
 * Reconciliation state of a project's month. `reconciled` = a (non-deleted) upload exists and it has no OPEN exceptions.
 * Used by the bill-readiness item 'Gate attendance reconciled'. Pass `db` (a transaction client) to read inside a transaction.
 */
export async function getGateReconciliationStatus(projectId: string, periodMonth: string, db: Reader = prisma): Promise<GateStatus> {
  const upload = await db.gateAttendanceUpload.findFirst({ where: { projectId, periodMonth, deletedAt: null }, orderBy: { createdAt: "desc" } });
  if (!upload) return { uploaded: false, reconciled: false, openExceptions: 0, totalExceptions: 0, matched: 0, matchedPct: null, uploadId: null, uploadedAt: null };
  const [open, total] = await Promise.all([
    db.gateAttendanceException.count({ where: { uploadId: upload.id, status: "OPEN", deletedAt: null } }),
    db.gateAttendanceException.count({ where: { uploadId: upload.id, deletedAt: null } }),
  ]);
  const compared = upload.matchedCount + total;
  return {
    uploaded: true,
    reconciled: open === 0,
    openExceptions: open,
    totalExceptions: total,
    matched: upload.matchedCount,
    matchedPct: compared === 0 ? 100 : Math.round((upload.matchedCount / compared) * 1000) / 10,
    uploadId: upload.id,
    uploadedAt: upload.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Our side of the comparison
// ---------------------------------------------------------------------------

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(periodMonth: string): { from: Date; to: Date } {
  const [y, m] = periodMonth.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** Attendance for a project/month, and the employees who worked or were assigned there (for code/name matching). */
export async function loadOurSide(db: Pick<typeof prisma, "attendance" | "siteAssignment" | "employee">, projectId: string, periodMonth: string): Promise<{ ours: OurAttendance[]; employees: OurEmployee[] }> {
  const { from, to } = monthBounds(periodMonth);
  const [rows, assigned] = await Promise.all([
    db.attendance.findMany({ where: { projectId, deletedAt: null, date: { gte: from, lt: to } }, select: { employeeId: true, date: true, dayFraction: true, overtimeMinutes: true } }),
    db.siteAssignment.findMany({ where: { projectId, deletedAt: null }, select: { employeeId: true } }),
  ]);
  const ids = [...new Set([...rows.map((r) => r.employeeId), ...assigned.map((a) => a.employeeId)])];
  const emps = await db.employee.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, code: true, name: true } });
  return {
    ours: rows.map((r) => ({ employeeId: r.employeeId, date: isoDay(r.date), dayFraction: Number(r.dayFraction), overtimeMinutes: r.overtimeMinutes })),
    employees: emps,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function buildGateActions() {
  const saveMapping = runAction({ schema: saveMappingSchema, module: MODULE, action: "EDIT" }, async ({ tx, user, input, audit }) => {
    const existing = await tx.gateAttendanceMapping.findUnique({ where: { organisationId: input.organisationId } });
    const data = { name: input.name, columnMap: input.columnMap as unknown as Prisma.InputJsonValue, dateFormat: input.dateFormat, deletedAt: null, updatedById: user.id };
    const row = existing
      ? await tx.gateAttendanceMapping.update({ where: { organisationId: input.organisationId }, data: { ...data, version: { increment: 1 } } })
      : await tx.gateAttendanceMapping.create({ data: { organisationId: input.organisationId, createdById: user.id, ...data } });
    await audit({
      action: existing ? "gate.mapping.update" : "gate.mapping.create", entityType: "GateAttendanceMapping", entityId: row.id,
      before: existing ? { name: existing.name, columnMap: existing.columnMap, dateFormat: existing.dateFormat } : undefined,
      after: { name: row.name, columnMap: row.columnMap, dateFormat: row.dateFormat },
      summary: `Gate attendance column mapping "${row.name}" saved`,
    });
    return { id: row.id };
  });

  const upload = runAction({ schema: uploadGateSchema, module: MODULE, action: "CREATE", timeoutMs: 60000 }, async ({ tx, user, input, audit }) => {
    if (!(await isModuleEnabled(MODULE))) throw new ServiceError("NOT_FOUND", "Gate reconciliation is switched off in Settings.");
    const project = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, select: { id: true, code: true, name: true, organisationId: true, regionId: true } });
    if (!project) throw new ServiceError("NOT_FOUND", "Project not found");

    const map = input.columnMap as ColumnMap;
    const parsed = parseGateGrid(input.grid, map, input.dateFormat as DateFormat);
    if (parsed.missingColumns.length > 0) throw new ServiceError("VALIDATION", `These mapped columns are not in the file: ${parsed.missingColumns.join(", ")}.`);
    if (parsed.rows.length === 0) throw new ServiceError("VALIDATION", parsed.issues[0] ? `No usable rows. Line ${parsed.issues[0].line}: ${parsed.issues[0].message}.` : "No usable rows in the file.");

    const [toleranceHrs, shiftHours] = await Promise.all([
      getSettingValue<number>("gate.hoursToleranceHrs", 0.5, tx),
      getSettingValue<number>("gate.shiftHours", 8, tx),
    ]);
    const side = await loadOurSide(tx, project.id, input.periodMonth);
    const result = reconcile(parsed.rows, side.ours, side.employees, input.periodMonth, { toleranceHrs: Number(toleranceHrs) || 0.5, shiftHours: Number(shiftHours) || 8 });
    if (result.compared === 0) throw new ServiceError("VALIDATION", `None of the file's rows fall in ${input.periodMonth} for this project. Check the month and the date format.`);

    // Mapping per client organisation.
    let mappingId: string | null = null;
    if (input.saveMapping) {
      const prev = await tx.gateAttendanceMapping.findUnique({ where: { organisationId: project.organisationId } });
      const data = { name: prev?.name ?? "Gate export", columnMap: input.columnMap as unknown as Prisma.InputJsonValue, dateFormat: input.dateFormat, deletedAt: null, updatedById: user.id };
      const m = prev
        ? await tx.gateAttendanceMapping.update({ where: { organisationId: project.organisationId }, data: { ...data, version: { increment: 1 } } })
        : await tx.gateAttendanceMapping.create({ data: { organisationId: project.organisationId, createdById: user.id, ...data } });
      mappingId = m.id;
      await audit({ action: prev ? "gate.mapping.update" : "gate.mapping.create", entityType: "GateAttendanceMapping", entityId: m.id, after: { columnMap: m.columnMap, dateFormat: m.dateFormat }, summary: "Gate attendance column mapping saved with an upload" });
    } else {
      mappingId = (await tx.gateAttendanceMapping.findFirst({ where: { organisationId: project.organisationId, deletedAt: null }, select: { id: true } }))?.id ?? null;
    }

    // A re-upload for the same project and month replaces the earlier one (kept, soft-deleted).
    const prior = await tx.gateAttendanceUpload.findMany({ where: { projectId: project.id, periodMonth: input.periodMonth, deletedAt: null }, select: { id: true } });
    if (prior.length > 0) {
      const now = new Date();
      await tx.gateAttendanceException.updateMany({ where: { uploadId: { in: prior.map((p) => p.id) }, deletedAt: null }, data: { deletedAt: now } });
      await tx.gateAttendanceUpload.updateMany({ where: { id: { in: prior.map((p) => p.id) } }, data: { deletedAt: now } });
    }

    const up = await tx.gateAttendanceUpload.create({
      data: {
        projectId: project.id, periodMonth: input.periodMonth, mappingId, fileName: input.fileName, rowCount: parsed.rows.length,
        matchedCount: result.matched, exceptionCount: result.exceptions.length, uploadedById: user.id, createdById: user.id,
      },
    });
    await tx.gateAttendanceRecord.createMany({
      data: parsed.rows.map((r) => ({ uploadId: up.id, workerRef: r.workerRef, workerName: r.workerName, date: new Date(`${r.date}T00:00:00.000Z`), inTime: r.inTime, outTime: r.outTime, hours: r.hours, shift: r.shift })),
    });
    if (result.exceptions.length > 0) {
      await tx.gateAttendanceException.createMany({
        data: result.exceptions.map((e) => ({
          uploadId: up.id, projectId: project.id, date: new Date(`${e.date}T00:00:00.000Z`), workerRef: e.workerRef, workerName: e.workerName, employeeId: e.employeeId,
          kind: e.kind, ourHours: e.ourHours, theirHours: e.theirHours, reason: e.reason, status: "OPEN", createdById: user.id,
        })),
      });
    }
    await audit({
      action: "gate.upload", entityType: "GateAttendanceUpload", entityId: up.id, projectId: project.id, regionId: project.regionId,
      after: { fileName: input.fileName, periodMonth: input.periodMonth, rows: parsed.rows.length, matched: result.matched, exceptions: result.exceptions.length, replaced: prior.length },
      summary: `Gate attendance for ${project.code} ${input.periodMonth}: ${result.matchedPct}% matched, ${result.exceptions.length} exceptions`,
    });
    return {
      uploadId: up.id, rows: parsed.rows.length, matched: result.matched, compared: result.compared, matchedPct: result.matchedPct,
      exceptions: result.exceptions.length, outOfPeriod: result.outOfPeriod, issues: parsed.issues.slice(0, 10), skipped: parsed.issues.length,
    };
  });

  const resolve = runAction({ schema: resolveExceptionSchema, module: MODULE, action: "EDIT", reasonRequired: true }, async ({ tx, user, input, audit }) => {
    const ex = await tx.gateAttendanceException.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!ex) throw new ServiceError("NOT_FOUND", "Exception not found");
    if (ex.status !== "OPEN") throw new ServiceError("CONFLICT", "This exception is already resolved.");
    const resolution = `${RESOLUTIONS[input.resolution]}: ${input.reason}`;
    await updateWithVersion(tx.gateAttendanceException, ex.id, input.version, { status: "RESOLVED", resolution, resolvedById: user.id, resolvedAt: new Date(), updatedById: user.id });
    await audit({
      action: "gate.exception.resolve", entityType: "GateAttendanceException", entityId: ex.id, projectId: ex.projectId,
      before: { status: ex.status }, after: { status: "RESOLVED", resolution },
      summary: `Gate exception (${ex.kind}) for ${ex.workerRef} on ${isoDay(ex.date)} resolved: ${RESOLUTIONS[input.resolution]}`,
    });
    return { id: ex.id };
  });

  return { saveMapping, upload, resolve };
}
