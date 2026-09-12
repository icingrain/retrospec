import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import type { ProjectPaths } from "../types"

export async function ensureJobStore(paths: ProjectPaths): Promise<void> {
  await mkdir(paths.jobsDir, { recursive: true })
  const db = new Database(paths.jobsDb, { create: true })
  try {
    db.exec(`
      create table if not exists job_snapshot (
        job_id text primary key,
        project_path text not null,
        category text not null,
        actor text not null,
        status text not null,
        progress_pct real not null,
        current_step text,
        write_scope_key text not null default '',
        replaces_job_id text,
        submitted_at text not null,
        updated_at text not null
      );

      create table if not exists job_ledger (
        event_id text primary key,
        job_id text not null,
        event_type text not null,
        payload text not null,
        timestamp text not null
      );
    `)
    ensureColumns(db)
    db.exec(`
	      update job_snapshot
	      set write_scope_key = case
	        when actor = 'retro' and category in ('structure', 'symbols') then 'retro:code-inventory:full'
	        else actor || ':' || category || ':full'
	      end
	      where write_scope_key = '';

	      create unique index if not exists job_snapshot_active_write_scope_unique
	      on job_snapshot(project_path, actor, category, write_scope_key)
	      where status in ('queued', 'running');

	      create unique index if not exists job_snapshot_active_scope_key_unique
	      on job_snapshot(project_path, actor, write_scope_key)
	      where status in ('queued', 'running');
	    `)
  } finally {
    db.close()
  }
}

type ColumnRow = {
  readonly name: string
}

function ensureColumns(db: Database): void {
  const existing = new Set(
    db
      .query<ColumnRow, []>("pragma table_info(job_snapshot)")
      .all()
      .map((column) => column.name),
  )
  if (!existing.has("write_scope_key")) {
    db.exec("alter table job_snapshot add column write_scope_key text not null default ''")
  }
  if (!existing.has("replaces_job_id")) {
    db.exec("alter table job_snapshot add column replaces_job_id text")
  }
}
