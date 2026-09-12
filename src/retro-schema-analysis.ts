import { RETRO_RUNS_SQL, type RetroStoreSchema } from "./retro-schema-contract"

export const analysisSchemas = {
  dependency: {
    dbName: "dependency.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists dependencies (
        dependency_id text primary key,
        retro_run_id text not null,
        source_entity_id text,
        source_file_path text not null,
        target_name text not null,
        target_entity_id text,
        dependency_type text not null,
        line integer,
        confidence real not null,
        evidence_label text not null,
        parser_backend text not null,
        resolution_status text not null,
        reason text
      );`,
  },
  sql: {
    dbName: "sql.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists sql_units (
        sql_unit_id text primary key,
        retro_run_id text not null,
        file_path text not null,
        owner_entity_id text,
        owner_name text,
        statement_type text not null,
        statement_text text not null,
        normalized_statement text,
        start_line integer,
        end_line integer,
        parser_backend text not null,
        evidence_label text not null,
        confidence real not null,
        reason text
      );
      create table if not exists sql_tables (
        sql_table_id text primary key,
        retro_run_id text not null,
        sql_unit_id text not null,
        object_name text not null,
        schema_name text,
        object_type text not null,
        operation text not null,
        alias text,
        confidence real not null,
        evidence_label text not null
      );
      create table if not exists sql_columns (
        sql_column_id text primary key,
        retro_run_id text not null,
        sql_unit_id text not null,
        sql_table_id text,
        column_name text not null,
        table_name text,
        operation text not null,
        confidence real not null,
        evidence_label text not null,
        reason text
      );`,
  },
  complexity: {
    dbName: "complexity.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists complexity_metrics (
        metric_id text primary key,
        retro_run_id text not null,
        entity_id text not null,
        entity_source_category text not null check (entity_source_category in ('structure', 'symbols')),
        file_path text not null,
        symbol_name text,
        metric_scope text not null,
        start_line integer,
        end_line integer,
        loc integer,
        cyclomatic_complexity integer,
        cognitive_complexity integer,
        branch_count integer,
        nesting_depth integer,
        confidence real not null,
        evidence_label text not null,
        parser_backend text not null,
        reason text
      );`,
  },
  security: {
    dbName: "security.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists security_findings (
        finding_id text primary key,
        retro_run_id text not null,
        rule_id text not null,
        title text not null,
        severity text not null,
        file_path text not null,
        start_line integer,
        end_line integer,
        entity_id text,
        sink_name text,
        source_name text,
        confidence real not null,
        evidence_label text not null,
        parser_backend text not null,
        reason text
      );`,
  },
  data_flow: {
    dbName: "data_flow.db",
    sql: `${RETRO_RUNS_SQL}
      create table if not exists data_flows (
        flow_id text primary key,
        retro_run_id text not null,
        source_entity_id text,
        source_name text not null,
        sink_entity_id text,
        sink_name text not null,
        file_path text not null,
        start_line integer,
        end_line integer,
        path_json text not null,
        confidence real not null,
        evidence_label text not null,
        parser_backend text not null,
        resolution_status text not null,
        reason text
      );`,
  },
} satisfies Record<"dependency" | "sql" | "complexity" | "security" | "data_flow", RetroStoreSchema>
