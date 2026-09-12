import { Database } from "bun:sqlite"
import { lstat, mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { CallGraphInput } from "../src/call-graph"
import type { RetroInventory } from "../src/types"

export type TableColumn = {
  readonly name: string
}

export type HandoffStatusRow = {
  readonly category: string
  readonly status: string
  readonly parser_backend: string
  readonly support_level: string
  readonly evidence_label: string
  readonly missing_capability: string | null
  readonly coverage_summary_json: string
}

type ColumnDetail = {
  readonly name: string
  readonly notnull: number
}

export const upgradeInventory: RetroInventory = {
  sourceFingerprint: "phase8-upgrade-fingerprint",
  files: [
    {
      entity_id: "file_1",
      file_path: "src/Main.java",
      language: "java",
      loc: 10,
      size_bytes: 120,
      module_name: "demo",
      content_hash: "hash-1",
    },
  ],
  symbols: [
    {
      entity_id: "sym_1",
      parent_entity_id: null,
      symbol_type: "class",
      name: "Main",
      signature: "class Main",
      start_line: 1,
      end_line: 10,
      visibility: "public",
      file_path: "src/Main.java",
    },
  ],
}

export const upgradeCallGraph: CallGraphInput = {
  sourceFingerprint: "phase8-upgrade-fingerprint",
  calls: [
    {
      caller_entity_id: "sym_1",
      callee_entity_id: null,
      callee_name: "run",
      file_path: "src/Main.java",
      line: 4,
      confidence: 0.4,
      confidence_label: "AMBIGUOUS",
    },
  ],
  sequenceCandidates: [],
}

export function columns(dbPath: string, table: string): readonly string[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    return db
      .query<TableColumn, []>(`pragma table_info(${table})`)
      .all()
      .map((column) => column.name)
  } finally {
    db.close()
  }
}

export function notNullColumns(dbPath: string, table: string): readonly string[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    return db
      .query<ColumnDetail, []>(`pragma table_info(${table})`)
      .all()
      .filter((column) => column.notnull === 1)
      .map((column) => column.name)
  } finally {
    db.close()
  }
}

export async function seedOldStructureDb(stateDir: string): Promise<void> {
  await mkdir(join(stateDir, "retro"), { recursive: true })
  const db = new Database(join(stateDir, "retro", "structure.db"), { create: true })
  try {
    db.exec(`
      create table retro_runs (
        retro_run_id text primary key,
        category text not null,
        tool_version text not null,
        skill_version text not null,
        source_root text not null,
        source_fingerprint text not null,
        started_at text not null,
        completed_at text,
        status text not null
      );
      create table files (
        entity_id text primary key,
        file_path text not null,
        language text not null,
        loc integer not null,
        size_bytes integer not null,
        module_name text
      );
    `)
  } finally {
    db.close()
  }
}

export async function seedOldCallGraphDb(stateDir: string): Promise<void> {
  await mkdir(join(stateDir, "retro"), { recursive: true })
  const db = new Database(join(stateDir, "retro", "call_graph.db"), { create: true })
  try {
    db.exec(`
      create table retro_runs (
        retro_run_id text primary key,
        category text not null,
        tool_version text not null,
        skill_version text not null,
        source_root text not null,
        source_fingerprint text not null,
        started_at text not null,
        completed_at text,
        status text not null
      );
      create table calls (
        caller_entity_id text not null,
        callee_entity_id text,
        callee_name text not null,
        file_path text not null,
        line integer not null,
        confidence real not null,
        confidence_label text not null
      );
      create table sequence_candidates (
        sequence_id text primary key,
        root_entity_id text not null,
        participant_entity_ids text not null,
        call_path text not null,
        confidence real not null,
        reason text
      );
      create table graph_communities (
        community_id text not null,
        entity_id text not null,
        algorithm text not null,
        resolution real not null,
        label text,
        computed_at text not null,
        primary key (community_id, entity_id)
      );
      create table usage_metrics (
        entity_id text primary key,
        incoming_ref_count integer not null,
        outgoing_ref_count integer not null,
        sql_ref_count integer not null,
        usage_score real not null,
        calculated_at text not null
      );
    `)
  } finally {
    db.close()
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}
