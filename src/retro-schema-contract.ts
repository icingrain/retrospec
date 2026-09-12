export const RETRO_CATEGORIES = [
  "structure",
  "symbols",
  "call_graph",
  "dependency",
  "sql",
  "complexity",
  "security",
  "data_flow",
  "other",
] as const

export type RetroCategory = (typeof RETRO_CATEGORIES)[number]

export type RetroStoreSchema = {
  readonly dbName: string
  readonly sql: string
  readonly migrations?: readonly TableMigration[]
}

export type TableMigration = {
  readonly table: string
  readonly columns: readonly string[]
}

export const RETRO_RUNS_SQL = `
  create table if not exists retro_runs (
    retro_run_id text primary key,
    category text not null,
    tool_version text not null,
    skill_version text not null,
 	    source_root text not null,
	    source_fingerprint text not null,
	    scope_mode text not null default 'full' check (scope_mode in ('full', 'partial')),
	    scope_roots_json text not null default '[]',
	    scope_fingerprint text not null default '',
	    parser_backend text not null,
    support_level text not null check (support_level in ('high-confidence', 'best-effort', 'unsupported')),
    evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
    missing_capability text,
    started_at text not null,
    completed_at text,
    status text not null check (status in ('completed', 'incomplete', 'failed')),
    summary_json text not null
  );
`

export const SOURCE_EVIDENCE_COLUMNS = `
  parser_backend text not null,
  parser_mode text not null check (parser_mode in ('ast', 'generic_ast', 'regex', 'config', 'partial')),
  evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
  support_level text not null check (support_level in ('high-confidence', 'best-effort', 'unsupported')),
  missing_capability text
`
