import type { AwaitJobResponse, JobId, JobStatus, ProjectPaths } from "../types"
import { inspectJob } from "./query"

export async function awaitJob(
  paths: ProjectPaths,
  jobId: JobId,
  timeoutMs: number,
): Promise<AwaitJobResponse> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const detail = await inspectJob(paths, jobId)
    if (detail === null) {
      throw new Error("job not found")
    }

    if (isTerminalStatus(detail.snapshot.status)) {
      return {
        job_id: jobId,
        status: detail.snapshot.status,
        timed_out: false,
        progress_pct: detail.snapshot.progress_pct,
      }
    }

    await Bun.sleep(25)
  }

  const detail = await inspectJob(paths, jobId)
  if (detail === null) {
    throw new Error("job not found")
  }

  return {
    job_id: jobId,
    status: detail.snapshot.status,
    timed_out: true,
    progress_pct: detail.snapshot.progress_pct,
  }
}

function isTerminalStatus(
  status: JobStatus,
): status is Extract<JobStatus, "completed" | "failed" | "cancelled"> {
  return status === "completed" || status === "failed" || status === "cancelled"
}
