"use server";

import "@/modules/approvals/register-handlers";
import { buildTenderActions } from "@/modules/tenders/service";
import type { CreateTenderRaw, UpdateTenderRaw } from "@/modules/tenders/schema";

const a = buildTenderActions();

export async function createTenderAction(input: CreateTenderRaw) {
  return a.createTender(input);
}
export async function updateTenderAction(input: UpdateTenderRaw) {
  return a.updateTender(input);
}
export async function deleteTenderAction(input: { id: string; version: number; reason: string }) {
  return a.deleteTender(input);
}
export async function moveTenderStageAction(input: { id: string; toStageId: string; version: number; reason?: string }) {
  return a.moveStage(input);
}
export async function requestGoNoGoAction(input: { id: string; recommendation?: "GO" | "NO_GO"; reason?: string }) {
  return a.requestGoNoGo(input);
}
export async function markTenderWonAction(input: { id: string; version: number; reason: string }) {
  return a.markWon(input);
}
export async function markTenderLostAction(input: { id: string; version: number; reason: string }) {
  return a.markLost(input);
}
export async function requestConversionAction(input: { id: string; overrideReason?: string }) {
  return a.requestConversion(input);
}
