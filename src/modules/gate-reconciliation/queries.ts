import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { ColumnMap, DateFormat } from "./parse";
import { getGateReconciliationStatus, type GateStatus } from "./service";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
  organisationId: string;
  organisationName: string;
}
export interface MappingRow {
  id: string;
  organisationId: string;
  organisationName: string;
  name: string;
  columnMap: ColumnMap;
  dateFormat: DateFormat;
  updatedAt: string;
}
export interface UploadSummaryRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  periodMonth: string;
  fileName: string;
  uploadedAt: string;
  rowCount: number;
  matchedCount: number;
  totalExceptions: number;
  openExceptions: number;
  matchedPct: number;
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, organisationId: true, organisation: { select: { name: true } } },
  });
  return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, organisationId: p.organisationId, organisationName: p.organisation.name }));
}

export async function listMappings(): Promise<{ mappings: MappingRow[]; organisations: { id: string; name: string }[] }> {
  const [rows, orgs] = await Promise.all([
    prisma.gateAttendanceMapping.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    prisma.organisation.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const names = new Map(orgs.map((o) => [o.id, o.name]));
  return {
    organisations: orgs,
    mappings: rows.map((m) => ({
      id: m.id, organisationId: m.organisationId, organisationName: names.get(m.organisationId) ?? m.organisationId, name: m.name,
      columnMap: m.columnMap as unknown as ColumnMap, dateFormat: m.dateFormat as DateFormat, updatedAt: m.updatedAt.toISOString(),
    })),
  };
}

/** Latest upload per project and month, with open exception counts. */
export async function listUploadSummaries(): Promise<UploadSummaryRow[]> {
  const uploads = await prisma.gateAttendanceUpload.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  if (uploads.length === 0) return [];
  const [projects, grouped] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: [...new Set(uploads.map((u) => u.projectId))] } }, select: { id: true, code: true, name: true } }),
    prisma.gateAttendanceException.groupBy({ by: ["uploadId", "status"], where: { uploadId: { in: uploads.map((u) => u.id) }, deletedAt: null }, _count: { _all: true } }),
  ]);
  const proj = new Map(projects.map((p) => [p.id, p]));
  const count = (uploadId: string, status?: string) => grouped.filter((g) => g.uploadId === uploadId && (!status || g.status === status)).reduce((n, g) => n + g._count._all, 0);
  return uploads.map((u) => {
    const total = count(u.id);
    const compared = u.matchedCount + total;
    return {
      id: u.id, projectId: u.projectId, projectCode: proj.get(u.projectId)?.code ?? "", projectName: proj.get(u.projectId)?.name ?? u.projectId, periodMonth: u.periodMonth,
      fileName: u.fileName, uploadedAt: u.createdAt.toISOString(), rowCount: u.rowCount, matchedCount: u.matchedCount, totalExceptions: total,
      openExceptions: count(u.id, "OPEN"), matchedPct: compared === 0 ? 100 : Math.round((u.matchedCount / compared) * 1000) / 10,
    };
  });
}

export interface ExceptionRow {
  id: string;
  version: number;
  date: string;
  workerRef: string;
  workerName: string | null;
  kind: string;
  ourHours: number | null;
  theirHours: number | null;
  reason: string | null;
  status: string;
  resolution: string | null;
}
export interface UploadDetail {
  upload: { id: string; projectId: string; projectCode: string; projectName: string; periodMonth: string; fileName: string; uploadedAt: string; rowCount: number; matchedCount: number };
  status: GateStatus;
  exceptions: ExceptionRow[];
}

export async function getUploadDetail(uploadId: string): Promise<UploadDetail | null> {
  const up = await prisma.gateAttendanceUpload.findFirst({ where: { id: uploadId, deletedAt: null } });
  if (!up) return null;
  const [project, exceptions, status] = await Promise.all([
    prisma.project.findUnique({ where: { id: up.projectId }, select: { code: true, name: true } }),
    prisma.gateAttendanceException.findMany({ where: { uploadId: up.id, deletedAt: null }, orderBy: [{ status: "asc" },{ date: "asc" }, { workerRef: "asc" }] }),
    getGateReconciliationStatus(up.projectId, up.periodMonth),
  ]);
  return {
    upload: {
      id: up.id, projectId: up.projectId, projectCode: project?.code ?? "", projectName: project?.name ?? up.projectId, periodMonth: up.periodMonth, fileName: up.fileName,
      uploadedAt: up.createdAt.toISOString(), rowCount: up.rowCount, matchedCount: up.matchedCount,
    },
    status,
    exceptions: exceptions.map((e) => ({
      id: e.id, version: e.version, date: isoDay(e.date), workerRef: e.workerRef, workerName: e.workerName, kind: e.kind,
      ourHours: e.ourHours === null ? null : Number(e.ourHours), theirHours: e.theirHours === null ? null : Number(e.theirHours),
      reason: e.reason, status: e.status, resolution: e.resolution,
    })),
  };
}
