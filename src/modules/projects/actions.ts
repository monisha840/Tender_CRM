"use server";

import { buildProjectActions } from "@/modules/projects/service";
import type { CreateProjectRaw, UpdateProjectRaw } from "@/modules/projects/schema";

const a = buildProjectActions();

export async function createProjectAction(input: CreateProjectRaw) {
  return a.createProject(input);
}
export async function updateProjectAction(input: UpdateProjectRaw) {
  return a.updateProject(input);
}
