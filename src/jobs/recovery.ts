import { Database } from "bun:sqlite"
import { projectPaths } from "../paths"
import { listProjects } from "../registry"
import type { JobSnapshot, RuntimePaths } from "../types"
import { insertLedger } from "./ledger-store"
import { ensureJobStore } from "./schema"

type CheckpointRecord = {
  readonly payload: string
}

export async function recoverInterruptedJobs(runtime: RuntimePaths): Promise<void> {
  for (const project of listProjects(runtime)) {
    const paths = projectPaths(project.project_path)
    await ensureJobStore(paths)
    const db = new Database(paths.jobsDb, { create: true })
    try {
      const runningJobs = db
        .query<JobSnapshot, []>(
          `select job_id, project_path, category, actor, status, progress_pct, current_step, write_scope_key, replaces_job_id, submitted_at, updated_at
	         from job_snapshot
	         where status = 'running'
           order by updated_at asc`,
        )
        .all()

      for (const job of runningJobs) {
        const now = new Date().toISOString()
        const checkpoint = db
          .query<CheckpointRecord, [string]>(
            `select payload
             from job_ledger
             where job_id = ? and event_type = 'checkpoint'
             order by timestamp desc
             limit 1`,
          )
          .get(job.job_id)
        db.query(
          `update job_snapshot
           set status = 'failed', current_step = 'failed: daemon startup recovery', updated_at = ?
           where job_id = ? and status = 'running'`,
        ).run(now, job.job_id)
        insertLedger(
          db,
          job.job_id,
          "failed",
          JSON.stringify({
            reason: "daemon_startup_recovery",
            recovered_from: "checkpoint",
            checkpoint_payload: checkpoint?.payload ?? null,
          }),
          now,
        )
      }
    } finally {
      db.close()
    }
  }
}
