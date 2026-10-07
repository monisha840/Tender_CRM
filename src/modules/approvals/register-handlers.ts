// Server-only. Import this module (for its side effect) from every server action file that can decide an approval,
// so the handler registry is populated on that server path. Each module registers its entityType(s) here.
import { registerApprovalHandler } from "@/modules/approvals/service";
import { applyGoNoGoDecision, convertTenderToProject, CONVERSION_ENTITY, GO_NO_GO_ENTITY } from "@/modules/tenders/service";

// Tender GO / NO-GO (also handles the demo seed's pending TENDER_GO_NO_GO requests). Reject = the proposal is declined:
// the tender stays Under Evaluation and the engine's audit row keeps the Director's reason.
registerApprovalHandler(GO_NO_GO_ENTITY, {
  onApproved: (tx, { request, user, reason }) => applyGoNoGoDecision(tx, user, { tenderId: request.entityId, requestId: request.id, directorNote: reason }),
  onRejected: async () => {},
});

// Tender -> project conversion: approval creates the project in the same transaction as the decision.
registerApprovalHandler(CONVERSION_ENTITY, {
  onApproved: async (tx, { request, user }) => {
    await convertTenderToProject(tx, user, { tenderId: request.entityId, requestId: request.id });
  },
  onRejected: async () => {},
});

// Other entity types in the demo seed (purchase requests, payroll, subcontractor bills, ...) belong to modules that are
// out of the minimal scope; they are not decidable until their module registers a handler.
export const REGISTERED_ENTITY_TYPES = [GO_NO_GO_ENTITY, CONVERSION_ENTITY] as const;
