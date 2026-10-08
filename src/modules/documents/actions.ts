"use server";

import { buildDocumentActions } from "@/modules/documents/service";
import type { CreateDocumentRaw, ReplaceDocumentRaw, UpdateDocumentRaw } from "@/modules/documents/schema";

const a = buildDocumentActions();

export async function createDocumentAction(input: CreateDocumentRaw) {
  return a.create(input);
}
export async function updateDocumentAction(input: UpdateDocumentRaw) {
  return a.update(input);
}
export async function replaceDocumentAction(input: ReplaceDocumentRaw) {
  return a.replace(input);
}
export async function deleteDocumentAction(input: { id: string; version: number; reason: string }) {
  return a.remove(input);
}
export async function getTenderDocumentIssuesAction(input: { tenderId: string }) {
  return a.tenderIssues(input);
}
