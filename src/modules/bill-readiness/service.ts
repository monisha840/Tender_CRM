import "server-only";
// Server-only: never import from client components.
import { runAction, ServiceError, type UserResolver } from "@/lib/server/service";
import { toIstDate } from "@/lib/dates";
import { seedTemplateSchema, setCheckSchema, templateItemSchema } from "./schema";
import { STANDARD_TEMPLATE } from "./readiness";

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export function buildBillReadinessActions(getUser?: UserResolver) {
  /** Tick or untick one checklist item for a project and month (date + reference). */
  const setCheck = runAction({ schema: setCheckSchema, module: "bill_readiness", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const [project, item] = await Promise.all([
      tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, select: { id: true, code: true } }),
      tx.billReadinessTemplateItem.findFirst({ where: { id: input.templateItemId, deletedAt: null }, select: { id: true, label: true } }),
    ]);
    if (!project) throw new ServiceError("NOT_FOUND", "Project not found");
    if (!item) throw new ServiceError("NOT_FOUND", "Checklist item not found");
    const key = { projectId_periodMonth_templateItemId: { projectId: input.projectId, periodMonth: input.periodMonth, templateItemId: input.templateItemId } };
    const before = await tx.billReadinessCheck.findUnique({ where: key });
    const doneOn = input.isDone ? toDate(input.doneOn ?? toIstDate(new Date().toISOString())) : null;
    const data = { isDone: input.isDone, doneOn, reference: input.reference, note: input.note, deletedAt: null };
    const row = await tx.billReadinessCheck.upsert({
      where: key,
      create: { projectId: input.projectId, periodMonth: input.periodMonth, templateItemId: input.templateItemId, ...data, createdById: user.id },
      update: { ...data, updatedById: user.id, version: { increment: 1 } },
    });
    const snap = (r: { isDone: boolean; doneOn: Date | null; reference: string | null; note: string | null } | null) =>
      r && { isDone: r.isDone, doneOn: r.doneOn?.toISOString().slice(0, 10) ?? null, reference: r.reference, note: r.note };
    await audit({
      action: input.isDone ? "bill_readiness.tick" : "bill_readiness.untick", entityType: "BillReadinessCheck", entityId: row.id, projectId: project.id,
      before: snap(before), after: snap(row), summary: `${project.code} ${input.periodMonth}: ${item.label} ${input.isDone ? "done" : "reopened"}`,
    });
    return { id: row.id };
  });

  /** Add or edit a checklist template item (admin screen). */
  const saveTemplateItem = runAction({ schema: templateItemSchema, module: "bill_readiness", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const clash = await tx.billReadinessTemplateItem.findFirst({ where: { code: input.code, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
    if (clash) throw new ServiceError("CONFLICT", `Code '${input.code}' is already used`);
    const data = { code: input.code, label: input.label, isMandatory: input.isMandatory, sortOrder: input.sortOrder, isActive: input.isActive };
    if (input.id) {
      const before = await tx.billReadinessTemplateItem.findFirst({ where: { id: input.id, deletedAt: null } });
      if (!before) throw new ServiceError("NOT_FOUND", "Checklist item not found");
      await tx.billReadinessTemplateItem.update({ where: { id: before.id }, data: { ...data, updatedById: user.id, version: { increment: 1 } } });
      await audit({
        action: "bill_readiness.template.update", entityType: "BillReadinessTemplateItem", entityId: before.id,
        before: { code: before.code, label: before.label, isMandatory: before.isMandatory, sortOrder: before.sortOrder, isActive: before.isActive }, after: data,
        summary: `Updated checklist item ${input.label}`,
      });
      return { id: before.id };
    }
    const row = await tx.billReadinessTemplateItem.create({ data: { ...data, createdById: user.id } });
    await audit({ action: "bill_readiness.template.create", entityType: "BillReadinessTemplateItem", entityId: row.id, after: data, summary: `Added checklist item ${input.label}` });
    return { id: row.id };
  });

  /** Load the six standard items (skips any code that already exists). */
  const seedTemplate = runAction({ schema: seedTemplateSchema, module: "bill_readiness", action: "EDIT", getUser }, async ({ tx, user, audit }) => {
    const existing = new Set((await tx.billReadinessTemplateItem.findMany({ select: { code: true } })).map((r) => r.code));
    const todo = STANDARD_TEMPLATE.filter((s) => !existing.has(s.code));
    if (todo.length === 0) throw new ServiceError("CONFLICT", "The standard items are already in the checklist");
    let order = (await tx.billReadinessTemplateItem.count()) * 10;
    for (const s of todo) {
      order += 10;
      await tx.billReadinessTemplateItem.create({ data: { code: s.code, label: s.label, isMandatory: true, sortOrder: order, createdById: user.id } });
    }
    await audit({
      action: "bill_readiness.template.seed", entityType: "BillReadinessTemplateItem", entityId: "standard", after: todo.map((t) => t.code),
      summary: `Loaded ${todo.length} standard checklist items`,
    });
    return { added: todo.length };
  });

  return { setCheck, saveTemplateItem, seedTemplate };
}
