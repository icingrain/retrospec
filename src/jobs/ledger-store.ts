import { Database } from "bun:sqlite"
import { createEventId } from "../ids"
import type { JobEventType, JobId, JobLedgerEvent, ProjectPaths } from "../types"
import { ensureJobStore } from "./schema"

export async function appendJobEvent(
  paths: ProjectPaths,
  jobId: JobId,
  eventType: JobEventType,
  payload = "{}",
): Promise<void> {
  await ensureJobStore(paths)
  const db = new Database(paths.jobsDb, { create: true })
  try {
    insertLedger(db, jobId, eventType, payload, new Date().toISOString())
  } finally {
    db.close()
  }
}

export function readJobLedger(paths: ProjectPaths, jobId: JobId): readonly JobLedgerEvent[] {
  const db = new Database(paths.jobsDb, { readonly: true })
  try {
    return db
      .query<JobLedgerEvent, [JobId]>(
        `select event_id, job_id, event_type, payload, timestamp
         from job_ledger
         where job_id = ?
         order by timestamp asc`,
      )
      .all(jobId)
  } finally {
    db.close()
  }
}

export function insertLedger(
  db: Database,
  jobId: JobId,
  eventType: JobEventType,
  payload: string,
  timestamp: string,
): void {
  db.query(
    `insert into job_ledger (event_id, job_id, event_type, payload, timestamp)
     values (?, ?, ?, ?, ?)`,
  ).run(createEventId(), jobId, eventType, payload, timestamp)
}
