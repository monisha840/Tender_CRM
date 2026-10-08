"use server";

import * as svc from "@/modules/settings/service";

// Thin server-action wrappers. Every one goes through runAction: Zod parse -> assertCan('settings'|'users', EDIT) ->
// transaction with audit. The Director holds only VIEW, so a forged call is rejected with FORBIDDEN.

export async function setSettingAction(input: unknown) { return svc.setSetting(input); }
export async function setHealthThresholdsAction(input: unknown) { return svc.setHealthThresholds(input); }
export async function saveApprovalRulesAction(input: unknown) { return svc.saveApprovalRules(input); }
export async function saveRegionAction(input: unknown) { return svc.saveRegion(input); }
export async function saveOfficeAction(input: unknown) { return svc.saveOffice(input); }
export async function saveGstinAction(input: unknown) { return svc.saveGstin(input); }
export async function saveStageAction(input: unknown) { return svc.saveStage(input); }
export async function reorderStagesAction(input: unknown) { return svc.reorderStages(input); }
export async function addChecklistItemAction(input: unknown) { return svc.addChecklistItem(input); }
export async function toggleChecklistMandatoryAction(input: unknown) { return svc.toggleChecklistMandatory(input); }
export async function removeChecklistItemAction(input: unknown) { return svc.removeChecklistItem(input); }
export async function saveServiceLineAction(input: unknown) { return svc.saveServiceLine(input); }
export async function setDeductionRateAction(input: unknown) { return svc.setDeductionRate(input); }
export async function saveProjectStatusAction(input: unknown) { return svc.saveProjectStatus(input); }
export async function reorderProjectStatusesAction(input: unknown) { return svc.reorderProjectStatuses(input); }
export async function addStatutoryRateAction(input: unknown) { return svc.addStatutoryRate(input); }
export async function setStatutoryRateActiveAction(input: unknown) { return svc.setStatutoryRateActive(input); }
export async function updateUserAction(input: unknown) { return svc.updateUser(input); }
export async function sendPasswordResetAction(input: unknown) { return svc.sendPasswordReset(input); }
