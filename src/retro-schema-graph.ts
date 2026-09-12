import { RETRO_RUNS_SQL, type RetroStoreSchema } from "./retro-schema-contract"

export const graphSchemas = {
  call_graph: {
    dbName: "call_graph.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists calls (
        call_id text primary key,
        retro_run_id text not null,
        caller_entity_id text not null,
        callee_entity_id text,
        callee_name text not null,
        file_path text not null,
        line integer not null,
        confidence real not null,
        confidence_label text not null check (confidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
        evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
        parser_backend text not null,
        resolution_status text not null check (resolution_status in ('resolved', 'unresolved', 'ambiguous')),
        reason text
      );
      create index if not exists idx_calls_caller_entity_id on calls (caller_entity_id);
      create index if not exists idx_calls_callee_entity_id on calls (callee_entity_id);
      create table if not exists sequence_candidates (
        sequence_id text primary key,
        retro_run_id text not null,
        root_entity_id text not null,
        participant_entity_ids text not null,
        participant_entity_ids_json text not null,
        call_path text not null,
        call_path_json text not null,
        confidence real not null,
        evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
        reason text
      );
      create table if not exists graph_communities (
        community_id text not null,
        entity_id text not null,
        algorithm text not null,
        resolution real not null,
        label text,
        computed_at text not null,
        primary key (community_id, entity_id)
      );
      create table if not exists usage_metrics (
        entity_id text primary key,
        incoming_ref_count integer not null,
        outgoing_ref_count integer not null,
        sql_ref_count integer not null,
        usage_score real not null,
        calculated_at text not null
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
        ],
      },
      {
        table: "calls",
        columns: [
          "call_id text not null default ''",
          "retro_run_id text not null default ''",
          "evidence_label text not null default 'EXTRACTED'",
          "parser_backend text not null default 'unknown'",
          "resolution_status text not null default 'resolved'",
          "reason text",
        ],
      },
      {
        table: "sequence_candidates",
        columns: [
          "retro_run_id text not null default ''",
          "participant_entity_ids_json text not null default '[]'",
          "call_path_json text not null default '[]'",
          "evidence_label text not null default 'EXTRACTED'",
        ],
      },
    ],
  },
} satisfies Record<"call_graph", RetroStoreSchema>
