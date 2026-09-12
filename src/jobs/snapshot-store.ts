import { Database } from "bun:sqlite"
import { toLaunchSettingsPayload } from "../analysis-launch-controls"
import { createScopeFingerprint, normalizeAnalysisScope } from "../analysis-scope"
import { createJobId } from "../ids"
import { projectPaths } from "../paths"
import type {
  JobId,
  JobSnapshot,
  JobStatus,
  ProjectPaths,
  SubmitJobRequest,
  SubmitJobResponse,
} from "../types"
import { insertLedger } from "./ledger-store"
import { ensureJobStore } from "./schema"

export type ActiveJobConflict = {
  readonly job_id: JobId
  readonly status: Extract<JobStatus, "queued" | "running">
  readonly write_scope_key: string
}

export class ActiveJobConflictError extends Error {
  readonly jobId: JobId
  readonly writeScopeKey: string
  readonly status: ActiveJobConflict["status"]

  constructor(input: ActiveJobConflict) {
    super("active job already owns this write scope")
    this.name = "ActiveJobConflictError"
    this.jobId = input.job_id
    this.writeScopeKey = input.write_scope_key
    this.status = input.status
  }
}

export async function createJob(request: SubmitJobRequest): Promise<SubmitJobResponse> {
  const paths = projectPaths(request.project_path)
  await ensureJobStore(paths)
  const now = new Date().toISOString()
  const jobId = createJobId()
  const db = new Database(paths.jobsDb, { create: true })
  const scopeKey = writeScopeKey(request)

  try {
    db.exec("begin immediate")
    try {
      const conflict = findActiveJobConflictInDb(db, paths.projectRoot, request, scopeKey)
      if (conflict !== null && request.replace_existing !== true) {
        throw new ActiveJobConflictError(conflict)
      }

      if (conflict !== null) {
        db.query(
          `update job_snapshot
           set status = 'cancelled', progress_pct = 0, current_step = 'cancelled', updated_at = ?
           where job_id = ? and status in ('queued', 'running')`,
        ).run(now, conflict.job_id)
        insertLedger(
          db,
          conflict.job_id,
          "cancelled",
          JSON.stringify({ replaced_by_job_id: jobId }),
          now,
        )
      }

      db.query(
        `insert into job_snapshot
	     (job_id, project_path, category, actor, status, progress_pct, current_step, write_scope_key, replaces_job_id, submitted_at, updated_at)
	     values (?, ?, ?, ?, 'queued', 0, 'queued', ?, ?, ?, ?)`,
      ).run(
        jobId,
        paths.projectRoot,
        request.category,
        request.actor,
        scopeKey,
        conflict?.job_id ?? request.replaces_job_id ?? null,
        now,
        now,
      )
      insertLedger(
        db,
        jobId,
        "submitted",
        JSON.stringify({
          manifest_path: request.manifest_path,
          write_scope_key: scopeKey,
          ...(request.launch_settings === undefined
            ? {}
            : { launch_settings: toLaunchSettingsPayload(request.launch_settings) }),
        }),
        now,
      )
      db.exec("commit")
      return {
        job_id: jobId,
        status: "queued",
        ...(conflict === null ? {} : { replaced_job_id: conflict.job_id }),
      }
    } catch (error) {
      db.exec("rollback")
      throw error
    }
  } finally {
    db.close()
  }
}

export async function listJobs(projectPath: string): Promise<readonly JobSnapshot[]> {
  const paths = projectPaths(projectPath)
  await ensureJobStore(paths)
  const db = new Database(paths.jobsDb, { readonly: true })
  try {
    return db
      .query<JobSnapshot, []>(
        `select job_id, project_path, category, actor, status, progress_pct, current_step, write_scope_key, replaces_job_id, submitted_at, updated_at
	       from job_snapshot
	       order by updated_at desc`,
      )
      .all()
  } finally {
    db.close()
  }
}

export async function readJobSnapshot(
  paths: ProjectPaths,
  jobId: JobId,
): Promise<JobSnapshot | null> {
  await ensureJobStore(paths)
  const db = new Database(paths.jobsDb, { readonly: true })
  try {
    return db
      .query<JobSnapshot, [JobId]>(
        `select job_id, project_path, category, actor, status, progress_pct, current_step, write_scope_key, replaces_job_id, submitted_at, updated_at
	       from job_snapshot
	       where job_id = ?`,
      )
      .get(jobId)
  } finally {
    db.close()
  }
}

export async function findActiveJobConflict(
  request: SubmitJobRequest,
): Promise<ActiveJobConflict | null> {
  const paths = projectPaths(request.project_path)
  await ensureJobStore(paths)
  const db = new Database(paths.jobsDb, { readonly: true })
  try {
    return findActiveJobConflictInDb(db, paths.projectRoot, request, writeScopeKey(request))
  } finally {
    db.close()
  }
}

function findActiveJobConflictInDb(
  db: Database,
  projectRoot: string,
  request: SubmitJobRequest,
  scopeKey: string,
): ActiveJobConflict | null {
  return db
    .query<ActiveJobConflict, [string, string, string]>(
      `select job_id, status, write_scope_key
       from job_snapshot
       where project_path = ?
         and actor = ?
         and write_scope_key = ?
         and status in ('queued', 'running')
       order by updated_at asc
       limit 1`,
    )
    .get(projectRoot, request.actor, scopeKey)
}

export function writeScopeKey(request: SubmitJobRequest): string {
  const scope = normalizeAnalysisScope(request.scope)
  const category = lockCategory(request)
  if (scope.mode === "full") {
    return `${request.actor}:${category}:full`
  }
  return `${request.actor}:${category}:${scope.mode}:${createScopeFingerprint(scope)}`
}

function lockCategory(request: SubmitJobRequest): string {
  if (request.actor === "retro" && ["structure", "symbols"].includes(request.category)) {
    return "code-inventory"
  }
  return request.category
}

export async function updateJob(
  paths: ProjectPaths,
  jobId: JobId,
  status: JobStatus,
  progressPct: number,
  currentStep: string | null,
): Promise<void> {
  await ensureJobStore(paths)
  const now = new Date().toISOString()
  const db = new Database(paths.jobsDb, { create: true })
  try {
    db.query(
      `update job_snapshot
       set status = ?, progress_pct = ?, current_step = ?, updated_at = ?
       where job_id = ?`,
    ).run(status, progressPct, currentStep, now, jobId)
  } finally {
    db.close()
  }
}
