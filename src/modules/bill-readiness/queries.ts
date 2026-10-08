import "server-only";
import { prisma } from "@/lib/server/prisma";
import { toIstDate } from "@/lib/dates";
import { gateReconciledMap } from "./gate";
import { GATE_ITEM_CODE, GATE_ITEM_LABEL, readinessStatus, type ReadinessItem, type ReadinessResult } from "./readiness";

export const currentMonth = () => toIstDate(new Date().toISOString()).slice(0, 7);

export interface ChecklistRow extends ReadinessItem {
  templateItemId: string | null;
  /** Auto-derived items cannot be ticked. */
  derived: boolean;
  doneOn: string | null;
  reference: string | null;
  note: string | null;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function loadTemplate() {
  return prisma.billReadinessTemplateItem.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
}

export async function loadChecklist(projectId: string, periodMonth: string): Promise<{ rows: ChecklistRow[]; status: ReadinessResult } | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
  if (!project) return null;
  const [template, checks, gate] = await Promise.all([
    prisma.billReadinessTemplateItem.findMany({ where: { isActive: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.billReadinessCheck.findMany({ where: { projectId, periodMonth, deletedAt: null } }),
    gateReconciledMap([projectId], periodMonth),
  ]);
  const byItem = new Map(checks.map((c) => [c.templateItemId, c]));
  const rows: ChecklistRow[] = template.map((t) => {
    const c = byItem.get(t.id);
    return { code: t.code, label: t.label, isMandatory: t.isMandatory, isDone: !!c?.isDone, templateItemId: t.id, derived: false, doneOn: day(c?.doneOn ?? null), reference: c?.reference ?? null, note: c?.note ?? null };
  });
  rows.push({ code: GATE_ITEM_CODE, label: GATE_ITEM_LABEL, isMandatory: true, isDone: gate.get(projectId) ?? false, templateItemId: null, derived: true, doneOn: null, reference: null, note: null });
  return { rows, status: readinessStatus(rows) };
}

export interface OverviewRow {
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  status: ReadinessResult;
}

/** Every live project with its checklist status for the month (two bulk queries plus the gate lookup). */
export async function loadOverview(periodMonth: string): Promise<OverviewRow[]> {
  const [projects, template, checks] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, status: { isActive: true } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, organisation: { select: { name: true } } },
    }),
    prisma.billReadinessTemplateItem.findMany({ where: { isActive: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.billReadinessCheck.findMany({ where: { periodMonth, deletedAt: null, isDone: true }, select: { projectId: true, templateItemId: true } }),
  ]);
  const gate = await gateReconciledMap(projects.map((p) => p.id), periodMonth);
  const done = new Map<string, Set<string>>();
  for (const c of checks) (done.get(c.projectId) ?? done.set(c.projectId, new Set()).get(c.projectId)!).add(c.templateItemId);
  return projects.map((p) => {
    const ticked = done.get(p.id);
    const items: ReadinessItem[] = template.map((t) => ({ code: t.code, label: t.label, isMandatory: t.isMandatory, isDone: !!ticked?.has(t.id) }));
    items.push({ code: GATE_ITEM_CODE, label: GATE_ITEM_LABEL, isMandatory: true, isDone: gate.get(p.id) ?? false });
    return { projectId: p.id, code: p.code, name: p.name, clientName: p.organisation.name, status: readinessStatus(items) };
  });
}
