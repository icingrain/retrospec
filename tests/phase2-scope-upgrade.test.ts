import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { projectPaths } from "../src/paths"
import { ensureRetroCategoryStore } from "../src/retro-schema"
import { readSpecStatuses } from "../src/spec/status"
import { tempProject } from "./phase3-helpers"

describe("Phase 2 scope upgrade safety", () => {
  test("Given legacy entity-id primary key inventory DB When schema is ensured Then rows migrate into run-scoped primary key", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await mkdir(join(paths.stateDir, "retro"), { recursive: true })
    const db = new Database(join(paths.stateDir, "retro", "structure.db"), { create: true })
    try {
      db.exec(`
        create table retro_runs (
          retro_run_id text primary key,
          category text not null,
          tool_version text not null,
          skill_version text not null,
          source_root text not null,
          source_fingerprint text not null,
          parser_backend text not null,
          support_level text not null,
          evidence_label text not null,
          missing_capability text,
          started_at text not null,
          completed_at text,
          status text not null,
          summary_json text not null
        );
        create table files (
          entity_id text primary key,
          retro_run_id text not null default '',
          file_path text not null,
          language text not null,
          loc integer not null,
          size_bytes integer not null,
          module_name text,
          content_hash text not null default '',
          parser_backend text not null default 'unknown',
          parser_mode text not null default 'regex',
          evidence_label text not null default 'EXTRACTED',
          support_level text not null default 'high-confidence',
          missing_capability text
        );
      `)
      db.query(
        `insert into files
         (entity_id, retro_run_id, file_path, language, loc, size_bytes, module_name, content_hash,
          parser_backend, parser_mode, evidence_label, support_level, missing_capability)
         values ('ent_old', 'rrun_old', 'src/old.ts', 'typescript', 1, 10, 'src', 'hash',
          'builtin-regex', 'regex', 'EXTRACTED', 'high-confidence', null)`,
      ).run()
    } finally {
      db.close()
    }

    ensureRetroCategoryStore(paths, "structure")

    const migrated = new Database(join(paths.stateDir, "retro", "structure.db"), { readonly: true })
    try {
      const row = migrated
        .query<{ readonly entity_id: string; readonly retro_run_id: string }, []>(
          "select entity_id, retro_run_id from files",
        )
        .get()
      const pk = migrated
        .query<{ readonly name: string; readonly pk: number }, []>("pragma table_info(files)")
        .all()
        .filter((column) => column.pk > 0)
        .toSorted((left, right) => left.pk - right.pk)

      expect(row).toEqual({ entity_id: "ent_old", retro_run_id: "rrun_old" })
      expect(pk.map((column) => column.name)).toEqual(["retro_run_id", "entity_id"])
    } finally {
      migrated.close()
    }
  })

  test("Given legacy spec analysis DB without scope columns When statuses are read Then full-scope defaults are returned", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await mkdir(paths.specDir, { recursive: true })
    const db = new Database(paths.specAnalysisDb, { create: true })
    try {
      db.exec(`
        create table analysis_runs (
          analysis_run_id text primary key,
          analysis_type text not null,
          input_categories text not null,
          model text not null,
          prompt_version text not null,
          retro_handoff_snapshot text not null,
          started_at text not null,
          completed_at text,
          status text not null
        );
      `)
      db.query(
        `insert into analysis_runs
         (analysis_run_id, analysis_type, input_categories, model, prompt_version,
          retro_handoff_snapshot, started_at, completed_at, status)
         values ('sar_old', 'risk', '[]', 'model', 'prompt', '{"preflight":{"status":"ready"}}',
          '2026-08-22T00:00:00.000Z', null, 'completed')`,
      ).run()
    } finally {
      db.close()
    }

    expect(readSpecStatuses(paths)[0]).toMatchObject({
      analysis_run_id: "sar_old",
      scope_mode: "full",
      scope_roots_json: "[]",
      scope_fingerprint: "",
    })
  })
})
