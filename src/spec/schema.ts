import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import { assertProjectStatePathSafe } from "../state-safety"
import type { ProjectPaths } from "../types"

type AnalysisRunColumn = {
  readonly name: string
  readonly pk: number
}

type AnalysisRunColumnDefinition = {
  readonly name: string
  readonly definition: string
}

const analysisRunMetadataColumns = [
  { name: "template_id", definition: "template_id text not null default ''" },
  { name: "provider_mode", definition: "provider_mode text not null default 'deterministic'" },
  { name: "prompt_tokens", definition: "prompt_tokens integer" },
  { name: "completion_tokens", definition: "completion_tokens integer" },
  { name: "total_tokens", definition: "total_tokens integer" },
  { name: "cost_usd", definition: "cost_usd real" },
  { name: "scope_mode", definition: "scope_mode text not null default 'full'" },
  { name: "scope_roots_json", definition: "scope_roots_json text not null default '[]'" },
  { name: "scope_fingerprint", definition: "scope_fingerprint text not null default ''" },
  {
    name: "input_retro_runs_json",
    definition: "input_retro_runs_json text not null default '[]'",
  },
  { name: "partial_result", definition: "partial_result text" },
  { name: "error_message", definition: "error_message text" },
  { name: "broker_run_id", definition: "broker_run_id text" },
] as const satisfies readonly AnalysisRunColumnDefinition[]

const riskFindingMetadataColumns = [
  { name: "evidence_label", definition: "evidence_label text" },
  { name: "finding_status", definition: "finding_status text" },
  { name: "memory_notes", definition: "memory_notes text" },
] as const satisfies readonly AnalysisRunColumnDefinition[]

export async function ensureSpecAnalysisStore(paths: ProjectPaths): Promise<void> {
  await assertProjectStatePathSafe(paths)
  await mkdir(paths.specDir, { recursive: true })
  const db = new Database(paths.specAnalysisDb, { create: true })

  try {
    db.exec(`
      create table if not exists analysis_runs (
        analysis_run_id text primary key,
        analysis_type text not null,
        template_id text not null default '',
        provider_mode text not null default 'deterministic',
        input_categories text not null,
        model text not null,
        prompt_version text not null,
        retro_handoff_snapshot text not null,
        started_at text not null,
        completed_at text,
        status text not null,
        prompt_tokens integer,
        completion_tokens integer,
        total_tokens integer,
        cost_usd real,
        scope_mode text not null default 'full',
        scope_roots_json text not null default '[]',
        scope_fingerprint text not null default '',
        input_retro_runs_json text not null default '[]',
        partial_result text,
        error_message text,
        broker_run_id text
      );

      create table if not exists risk_findings (
        finding_id text not null,
        analysis_run_id text not null,
        entity_id text not null,
        severity text not null,
        risk_type text not null,
        summary text not null,
        evidence text not null,
        recommendation text not null,
        evidence_label text,
        finding_status text,
        memory_notes text,
        created_at text not null,
        primary key (analysis_run_id, finding_id)
      );

      create table if not exists migration_groups (
        group_id text not null,
        analysis_run_id text not null,
        title text not null,
        priority text not null,
        summary text not null,
        evidence_label text not null,
        confidence real,
        source_anchor_json text not null default '{}',
        created_at text not null,
        primary key (analysis_run_id, group_id)
      );

      create table if not exists migration_findings (
        finding_id text not null,
        analysis_run_id text not null,
        entity_id text,
        file_path text,
        group_id text,
        migration_type text not null,
        priority text not null,
        summary text not null,
        recommendation text not null,
        evidence_label text not null,
        confidence real,
        source_anchor_json text not null default '{}',
        created_at text not null,
        primary key (analysis_run_id, finding_id)
      );

      create table if not exists summary_sections (
        section_id text not null,
        analysis_run_id text not null,
        entity_id text,
        file_path text,
        title text not null,
        body text not null,
        rank integer not null,
        evidence_label text not null,
        confidence real,
        source_anchor_json text not null default '{}',
        created_at text not null,
        primary key (analysis_run_id, section_id)
      );
    `)
    ensureColumns(db, "analysis_runs", analysisRunMetadataColumns)
    migrateRiskFindingsPrimaryKey(db)
    ensureColumns(db, "risk_findings", riskFindingMetadataColumns)
  } finally {
    db.close()
  }
}

function ensureColumns(
  db: Database,
  table: string,
  columns: readonly AnalysisRunColumnDefinition[],
): void {
  const existingColumns = new Set(
    db
      .query<AnalysisRunColumn, []>(`pragma table_info(${table})`)
      .all()
      .map((column) => column.name),
  )

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      db.exec(`alter table ${table} add column ${column.definition}`)
    }
  }
}

function migrateRiskFindingsPrimaryKey(db: Database): void {
  const columns = db.query<AnalysisRunColumn, []>("pragma table_info(risk_findings)").all()
  const findingIdColumn = columns.find((column) => column.name === "finding_id")
  const analysisRunIdColumn = columns.find((column) => column.name === "analysis_run_id")
  if (findingIdColumn?.pk !== 1 || analysisRunIdColumn?.pk !== 0) {
    return
  }

  db.exec(`
    alter table risk_findings rename to risk_findings_legacy_pk;
    create table risk_findings (
      finding_id text not null,
      analysis_run_id text not null,
      entity_id text not null,
      severity text not null,
      risk_type text not null,
      summary text not null,
      evidence text not null,
      recommendation text not null,
      evidence_label text,
      finding_status text,
      memory_notes text,
      created_at text not null,
      primary key (analysis_run_id, finding_id)
    );
    insert into risk_findings (finding_id, analysis_run_id, entity_id, severity, risk_type, summary,
      evidence, recommendation, evidence_label, finding_status, memory_notes, created_at)
    select finding_id, analysis_run_id, entity_id, severity, risk_type, summary, evidence, recommendation,
           evidence_label, finding_status, memory_notes, created_at
    from risk_findings_legacy_pk;
    drop table risk_findings_legacy_pk;
  `)
}
