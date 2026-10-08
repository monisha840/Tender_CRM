// Server-only: never import from client components.
import { gstinStateCode } from "@/lib/gst-validation";
import { type Tx } from "@/lib/server/audit";
import { runAction, ServiceError, updateWithVersion, type UserResolver } from "@/lib/server/service";
import { createSubcontractorSchema, updateSubcontractorSchema } from "./schema";

/** Subcontractor entry (add / edit). One transaction writes the Party, the Subcontractor row and the audit entry. */

type Fields = { name: string; pan: string; gstin: string; stateId: string };

const snapshot = (p: { name: string; gstin: string | null; pan: string; address: string; stateId: string; contactName: string; phone: string; email: string | null }, s: { tradeCategory: string; isLabourSupplier: boolean; status: string }) => ({
  name: p.name, gstin: p.gstin, pan: p.pan, address: p.address, stateId: p.stateId, contactName: p.contactName, phone: p.phone, email: p.email,
  tradeCategory: s.tradeCategory, isLabourSupplier: s.isLabourSupplier, status: s.status,
});

/** The state must exist and agree with the GSTIN; the name, GSTIN and PAN must not belong to another party. */
async function assertUnique(tx: Tx, v: Fields, excludePartyId?: string) {
  const state = await tx.state.findFirst({ where: { id: v.stateId, deletedAt: null } });
  if (!state) throw new ServiceError("VALIDATION", "State not found");
  if (v.gstin && gstinStateCode(v.gstin) !== state.gstStateCode) {
    throw new ServiceError("VALIDATION", `GSTIN state code ${gstinStateCode(v.gstin)} does not match the state '${state.name}' (${state.gstStateCode})`);
  }
  const others = await tx.party.findMany({
    where: { deletedAt: null, ...(excludePartyId ? { id: { not: excludePartyId } } : {}) },
    select: { name: true, gstin: true, pan: true },
  });
  if (others.some((p) => p.name.trim().toLowerCase() === v.name.trim().toLowerCase())) throw new ServiceError("CONFLICT", `'${v.name}' already exists`);
  if (v.gstin) {
    const hit = others.find((p) => p.gstin?.toUpperCase() === v.gstin);
    if (hit) throw new ServiceError("CONFLICT", `GSTIN ${v.gstin} already belongs to '${hit.name}'`);
  }
  // A PAN may repeat only when both records carry GSTINs of different states.
  const hit = others.find((p) => {
    if (p.pan.toUpperCase() !== v.pan) return false;
    const otherState = p.gstin ? gstinStateCode(p.gstin) : "";
    const mine = v.gstin ? gstinStateCode(v.gstin) : "";
    return !mine || !otherState || mine === otherState;
  });
  if (hit) throw new ServiceError("CONFLICT", `PAN ${v.pan} already belongs to '${hit.name}'`);
}

export function buildSubcontractorActions(getUser?: UserResolver) {
  const createSubcontractor = runAction({ schema: createSubcontractorSchema, module: "subcontractors", action: "CREATE", getUser }, async ({ tx, user, input, audit }) => {
    await assertUnique(tx, input);
    const party = await tx.party.create({
      data: {
        name: input.name, gstin: input.gstin || null, pan: input.pan, address: input.address, stateId: input.stateId,
        contactName: input.contactName, phone: input.phone, email: input.email || null, isActive: input.status === "ACTIVE", createdById: user.id,
      },
    });
    const sub = await tx.subcontractor.create({
      data: { partyId: party.id, tradeCategory: input.tradeCategory, isLabourSupplier: input.isLabourSupplier, status: input.status, createdById: user.id },
    });
    await audit({
      action: "subcontractor.create", entityType: "Subcontractor", entityId: sub.id, after: snapshot(party, sub), summary: `Added subcontractor ${party.name}`,
    });
    return { id: sub.id, name: party.name };
  });

  const updateSubcontractor = runAction({ schema: updateSubcontractorSchema, module: "subcontractors", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const sub = await tx.subcontractor.findFirst({ where: { id: input.id, deletedAt: null }, include: { party: true } });
    if (!sub) throw new ServiceError("NOT_FOUND", "Subcontractor not found. It may have been removed.");
    await assertUnique(tx, input, sub.partyId);
    await updateWithVersion(tx.subcontractor, sub.id, input.version, {
      tradeCategory: input.tradeCategory, isLabourSupplier: input.isLabourSupplier, status: input.status, updatedById: user.id,
    });
    await tx.party.update({
      where: { id: sub.partyId },
      data: {
        name: input.name, gstin: input.gstin || null, pan: input.pan, address: input.address, stateId: input.stateId,
        contactName: input.contactName, phone: input.phone, email: input.email || null, isActive: input.status === "ACTIVE",
        updatedById: user.id, version: { increment: 1 },
      },
    });
    const after = await tx.subcontractor.findUniqueOrThrow({ where: { id: sub.id }, include: { party: true } });
    await audit({
      action: "subcontractor.update", entityType: "Subcontractor", entityId: sub.id,
      before: snapshot(sub.party, sub), after: snapshot(after.party, after), reason: input.reason ?? null, summary: `Updated subcontractor ${after.party.name}`,
    });
    return { id: sub.id, version: after.version };
  });

  return { createSubcontractor, updateSubcontractor };
}
