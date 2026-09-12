import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createProjectId } from "./ids"
import { ensureProjectStateDir } from "./paths"
import { assertProjectStatePathSafe } from "./state-safety"
import type {
  EvidenceLabel,
  LanguageSupportLevel,
  ProjectPaths,
  ProjectRecord,
  RuntimePaths,
} from "./types"

export function bootstrapProjectRegistry(paths: ProjectPaths): void {
  mkdirSync(dirname(paths.registryDb), { recursive: true })
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.exec(`
      create table if not exists entities (
        entity_id text primary key,
        entity_type text not null,
        file_path text not null,
        symbol_name text,
        signature text,
        source_category text not null,
        content_hash text,
        start_line integer,
        end_line integer,
        evidence_label text not null default 'EXTRACTED',
        parser_backend text not null default 'unknown',
        parser_mode text not null default 'regex',
        created_at text not null,
        updated_at text not null
      );

	      create table if not exists workflow_handoff (
        category text primary key,
        status text not null,
        completed_at text,
        entity_count integer not null,
        retro_run_id text not null,
        source_fingerprint text not null,
        parser_backend text not null default 'unknown',
        support_level text not null default 'high-confidence',
        evidence_label text not null default 'EXTRACTED',
        missing_capability text,
	        coverage_summary_json text not null default '{}',
	        scope_mode text not null default 'full',
	        scope_roots_json text not null default '[]',
	        scope_fingerprint text not null default '',
	        error_message text,
	        updated_at text not null
	      );

        create table if not exists analysis_launch_settings (
          settings_key text primary key,
          scope_mode text not null,
          scope_roots_json text not null,
          exclude_folders_json text not null default '[]',
          exclude_extensions_json text not null default '[]',
          batch_size integer not null default 50,
          worker_count integer not null default 2,
          updated_at text not null
        );

        create table if not exists spec_provider_settings (
          settings_key text primary key,
          mode text not null,
          provider text,
          model text,
          base_url text,
          broker_url text,
          secret_source text not null default 'env',
          updated_at text not null
        );
	    `)
    ensureRegistryColumns(db)
  } finally {
    db.close()
  }
}

type ColumnRow = {
  readonly name: string
}

function ensureRegistryColumns(db: Database): void {
  ensureColumns(db, "entities", [
    "start_line integer",
    "end_line integer",
    "evidence_label text not null default 'EXTRACTED'",
    "parser_backend text not null default 'unknown'",
    "parser_mode text not null default 'regex'",
    "support_level text not null default 'high-confidence'",
    "missing_capability text",
  ])
  ensureColumns(db, "workflow_handoff", [
    "parser_backend text not null default 'unknown'",
    "support_level text not null default 'high-confidence'",
    "evidence_label text not null default 'EXTRACTED'",
    "missing_capability text",
    "coverage_summary_json text not null default '{}'",
    "scope_mode text not null default 'full'",
    "scope_roots_json text not null default '[]'",
    "scope_fingerprint text not null default ''",
  ])
  ensureColumns(db, "analysis_launch_settings", [
    "exclude_folders_json text not null default '[]'",
    "exclude_extensions_json text not null default '[]'",
    "batch_size integer not null default 50",
    "worker_count integer not null default 2",
  ])
}

function ensureColumns(db: Database, table: string, definitions: readonly string[]): void {
  const existing = new Set(
    db
      .query<ColumnRow, []>(`pragma table_info(${table})`)
      .all()
      .map((column) => column.name),
  )
  for (const definition of definitions) {
    const columnName = definition.split(" ")[0]
    if (columnName !== undefined && !existing.has(columnName)) {
      db.exec(`alter table ${table} add column ${definition}`)
    }
  }
}

export async function ensureProjectRegistry(paths: ProjectPaths): Promise<void> {
  await assertProjectStatePathSafe(paths)
  await ensureProjectStateDir(paths)
  bootstrapProjectRegistry(paths)
}

export function ensureGlobalProjectRegistry(paths: RuntimePaths): void {
  const db = new Database(paths.projectsDb, { create: true })
  try {
    db.exec(`
      create table if not exists projects (
        project_id text primary key,
        project_path text not null unique,
        first_seen text not null,
        last_active text not null
      );
    `)
  } finally {
    db.close()
  }
}

export function registerProject(runtime: RuntimePaths, projectPath: string): ProjectRecord {
  ensureGlobalProjectRegistry(runtime)
  const now = new Date().toISOString()
  const projectId = createProjectId(projectPath)
  const db = new Database(runtime.projectsDb, { create: true })

  try {
    db.query(
      `insert into projects (project_id, project_path, first_seen, last_active)
       values ($project_id, $project_path, $now, $now)
       on conflict(project_path) do update set last_active = excluded.last_active`,
    ).run({ $project_id: projectId, $project_path: projectPath, $now: now })

    const record = db
      .query<ProjectRecord, [string]>(
        `select project_id, project_path, first_seen, last_active, 0 as active_jobs
         from projects
         where project_path = ?`,
      )
      .get(projectPath)

    if (record === null) {
      throw new Error("project registration failed")
    }

    return record
  } finally {
    db.close()
  }
}

export function listProjects(runtime: RuntimePaths): readonly ProjectRecord[] {
  ensureGlobalProjectRegistry(runtime)
  const db = new Database(runtime.projectsDb, { readonly: true })

  try {
    return db
      .query<ProjectRecord, []>(
        `select project_id, project_path, first_seen, last_active, 0 as active_jobs
         from projects
         order by last_active desc`,
      )
      .all()
  } finally {
    db.close()
  }
}

export function readRetroStatuses(paths: ProjectPaths) {
  if (!existsSync(paths.registryDb)) {
    return []
  }

  const db = new Database(paths.registryDb, { readonly: true })
  try {
    return db
      .query<
        {
          readonly category: string
          readonly status: string
          readonly entity_count: number
          readonly completed_at: string | null
          readonly parser_backend: string
          readonly support_level: LanguageSupportLevel
          readonly evidence_label: EvidenceLabel
          readonly missing_capability: string | null
          readonly coverage_summary_json: string
          readonly scope_mode: "full" | "partial"
          readonly scope_roots_json: string
          readonly scope_fingerprint: string
        },
        []
      >(
        `select category, status, entity_count, completed_at, parser_backend, support_level,
	                evidence_label, missing_capability, coverage_summary_json,
	                scope_mode, scope_roots_json, scope_fingerprint
         from workflow_handoff
         order by category`,
      )
      .all()
  } finally {
    db.close()
  }
}
