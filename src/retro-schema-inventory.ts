import {
  RETRO_RUNS_SQL,
  type RetroStoreSchema,
  SOURCE_EVIDENCE_COLUMNS,
} from "./retro-schema-contract"

export const inventorySchemas = {
  structure: {
    dbName: "structure.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists files (
        entity_id text not null,
        retro_run_id text not null,
        file_path text not null,
        language text not null,
        loc integer not null,
        size_bytes integer not null,
        module_name text,
        content_hash text not null,
        ${SOURCE_EVIDENCE_COLUMNS},
        primary key (retro_run_id, entity_id)
      );`,
    migrations: [
      {
        table: "retro_runs",
        columns: [
          "parser_backend text not null default 'unknown'",
          "support_level text not null default 'high-confidence'",
          "evidence_label text not null default 'EXTRACTED'",
          "missing_capability text",
          "summary_json text not null default '{}'",
          "scope_mode text not null default 'full'",
          "scope_roots_json text not null default '[]'",
          "scope_fingerprint text not null default ''",
        ],
      },
      {
        table: "files",
        columns: [
          "retro_run_id text not null default ''",
          "content_hash text not null default ''",
          "parser_backend text not null default 'unknown'",
          "parser_mode text not null default 'regex'",
          "evidence_label text not null default 'EXTRACTED'",
          "support_level text not null default 'high-confidence'",
          "missing_capability text",
        ],
      },
    ],
  },
  symbols: {
    dbName: "symbols.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists symbols (
        entity_id text not null,
        retro_run_id text not null,
        parent_entity_id text,
        symbol_type text not null,
        name text not null,
        signature text,
        start_line integer not null,
        end_line integer not null,
        visibility text,
        file_path text not null,
        ${SOURCE_EVIDENCE_COLUMNS},
        primary key (retro_run_id, entity_id)
      );`,
    migrations: [
      {
        table: "retro_runs",
        columns: [
          "parser_backend text not null default 'unknown'",
          "support_level text not null default 'high-confidence'",
          "evidence_label text not null default 'EXTRACTED'",
          "missing_capability text",
          "summary_json text not null default '{}'",
          "scope_mode text not null default 'full'",
          "scope_roots_json text not null default '[]'",
          "scope_fingerprint text not null default ''",
        ],
      },
      {
        table: "symbols",
        columns: [
          "retro_run_id text not null default ''",
          "parser_backend text not null default 'unknown'",
          "parser_mode text not null default 'regex'",
          "evidence_label text not null default 'EXTRACTED'",
          "support_level text not null default 'high-confidence'",
          "missing_capability text",
        ],
      },
    ],
  },
  other: {
    dbName: "other.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists fallback_evidence (
        fallback_id text primary key,
        retro_run_id text not null,
        language text not null,
        category text not null,
        support_level text not null check (support_level in ('high-confidence', 'best-effort', 'unsupported')),
        evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
        missing_capability text not null,
        file_path text not null,
        start_line integer,
        end_line integer,
        reason text not null,
        recorded_at text not null
      );
      create index if not exists idx_fallback_evidence_language on fallback_evidence (language);
      create index if not exists idx_fallback_evidence_category on fallback_evidence (category);`,
    migrations: [
      {
        table: "retro_runs",
        columns: [
          "parser_backend text not null default 'unknown'",
          "support_level text not null default 'best-effort'",
          "evidence_label text not null default 'AMBIGUOUS'",
          "missing_capability text",
          "summary_json text not null default '{}'",
          "scope_mode text not null default 'full'",
          "scope_roots_json text not null default '[]'",
          "scope_fingerprint text not null default ''",
        ],
      },
      {
        table: "fallback_evidence",
        columns: ["fallback_id text not null default ''", "start_line integer", "end_line integer"],
      },
    ],
  },
} satisfies Record<"structure" | "symbols" | "other", RetroStoreSchema>
