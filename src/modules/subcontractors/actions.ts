"use server";

import { buildSubcontractorActions } from "@/modules/subcontractors/service";
import type { CreateSubcontractorRaw, UpdateSubcontractorRaw } from "@/modules/subcontractors/schema";

const a = buildSubcontractorActions();

export async function createSubcontractorAction(input: CreateSubcontractorRaw) {
  return a.createSubcontractor(input);
}
export async function updateSubcontractorAction(input: UpdateSubcontractorRaw) {
  return a.updateSubcontractor(input);
}
