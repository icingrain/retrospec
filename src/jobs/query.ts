import { projectPaths } from "../paths"
import { listProjects } from "../registry"
import type { JobDetailResponse, JobId, ProjectPaths, RuntimePaths } from "../types"
import { readJobLedger } from "./ledger-store"
import { ensureJobStore } from "./schema"
import { readJobSnapshot } from "./snapshot-store"

export async function inspectJob(
  paths: ProjectPaths,
  jobId: JobId,
): Promise<JobDetailResponse | null> {
  await ensureJobStore(paths)
  const snapshot = await readJobSnapshot(paths, jobId)

  if (snapshot === null) {
    return null
  }

  return {
    snapshot,
    ledger: readJobLedger(paths, jobId),
  }
}

export async function findJob(
  runtime: RuntimePaths,
  jobId: JobId,
): Promise<JobDetailResponse | null> {
  for (const project of listProjects(runtime)) {
    const detail = await inspectJob(projectPaths(project.project_path), jobId)
    if (detail !== null) {
      return detail
    }
  }
  return null
}

export async function findJobPaths(
  runtime: RuntimePaths,
  jobId: JobId,
): Promise<ProjectPaths | null> {
  for (const project of listProjects(runtime)) {
    const paths = projectPaths(project.project_path)
    const detail = await inspectJob(paths, jobId)
    if (detail !== null) {
      return paths
    }
  }
  return null
}
