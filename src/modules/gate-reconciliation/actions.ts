"use server";

import { buildGateActions } from "@/modules/gate-reconciliation/service";
import type { ResolveExceptionInput, SaveMappingInput, UploadGateInput } from "@/modules/gate-reconciliation/schema";

const a = buildGateActions();

export async function saveGateMappingAction(input: SaveMappingInput) {
  return a.saveMapping(input);
}
export async function uploadGateFileAction(input: UploadGateInput) {
  return a.upload(input);
}
export async function resolveGateExceptionAction(input: ResolveExceptionInput) {
  return a.resolve(input);
}
