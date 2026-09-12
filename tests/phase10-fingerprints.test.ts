import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { recordAnalyzedFileFingerprints, selectChangedFiles } from "../src/fingerprints"
import { projectPaths } from "../src/paths"
import { readRetroStatuses } from "../src/registry"
import { runRetroInventory } from "../src/retro/run"
import { surveySourceTree } from "../src/retro/survey"
import { tempProject, writeSampleProject } from "./phase3-helpers"

type FingerprintRow = {
  readonly file_path: string
  readonly content_sha256: string
  readonly size_bytes: number
  readonly last_retro_run_id: string | null
}

describe("Phase 10 file fingerprints", () => {
  test("Given partial analysis scope When source tree is surveyed Then only allowed roots define the fingerprint", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)

    const fullSurvey = await surveySourceTree(projectRoot)
    const partialSurvey = await surveySourceTree(projectRoot, {
      mode: "partial",
      roots: ["src/native"],
    })

    expect(partialSurvey.files.map((file) => file.relativePath)).toEqual(["src/native/order.c"])
    expect(partialSurvey.sourceFingerprint).not.toBe(fullSurvey.sourceFingerprint)
    expect(partialSurvey.analysisScope).toEqual({
      mode: "partial",
      roots: ["src/native"],
    })
  })

  test("Given full canonical inventory When partial inventory runs Then canonical handoff and entities stay full", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const fullStatuses = readRetroStatuses(paths)

    await runRetroInventory(projectRoot, { mode: "partial", roots: ["src/native"] })

    const statuses = readRetroStatuses(paths)
    const db = new Database(paths.registryDb, { readonly: true })
    const structureDb = new Database(join(paths.stateDir, "retro", "structure.db"), {
      readonly: true,
    })
    try {
      const entityRows = db
        .query<{ readonly file_path: string }, []>(
          "select file_path from entities where entity_type = 'file' order by file_path",
        )
        .all()
      const runScopes = structureDb
        .query<{ readonly scope_mode: string; readonly scope_roots_json: string }, []>(
          "select scope_mode, scope_roots_json from retro_runs order by scope_mode",
        )
        .all()

      expect(statuses).toEqual(fullStatuses)
      expect(entityRows.map((row) => row.file_path)).toEqual([
        "src/main/java/demo/OrderService.java",
        "src/native/order.c",
      ])
      expect(runScopes).toEqual([
        { scope_mode: "full", scope_roots_json: "[]" },
        { scope_mode: "partial", scope_roots_json: '["src/native"]' },
      ])
    } finally {
      structureDb.close()
      db.close()
    }
  })

  test("Given analyzed fingerprints When source files are surveyed again Then only changed files remain eligible", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const paths = projectPaths(projectRoot)

    const firstSurvey = await surveySourceTree(projectRoot)
    const firstSelection = await selectChangedFiles(paths, firstSurvey.files)
    await recordAnalyzedFileFingerprints(paths, {
      retroRunId: "rrun_phase10_first",
      analyzedAt: "2026-08-02T00:00:00.000Z",
      files: firstSurvey.files,
    })

    const unchangedSelection = await selectChangedFiles(
      paths,
      (await surveySourceTree(projectRoot)).files,
    )

    await writeFile(
      join(projectRoot, "src", "native", "order.c"),
      `#include <stdio.h>
int add_order(int value) {
  return value + 2;
}
`,
    )
    const changedSelection = await selectChangedFiles(
      paths,
      (await surveySourceTree(projectRoot)).files,
    )
    await recordAnalyzedFileFingerprints(paths, {
      retroRunId: "rrun_phase10_second",
      analyzedAt: "2026-08-02T00:10:00.000Z",
      files: changedSelection.changedFiles,
    })

    const db = new Database(paths.registryDb, { readonly: true })
    try {
      const rows = db
        .query<FingerprintRow, []>(
          `select file_path, content_sha256, size_bytes, last_retro_run_id
           from file_fingerprints
           order by file_path`,
        )
        .all()

      expect(firstSelection.changedFiles.map((file) => file.relativePath).sort()).toEqual([
        "src/main/java/demo/OrderService.java",
        "src/native/order.c",
      ])
      expect(firstSelection.unchangedFiles).toEqual([])
      expect(unchangedSelection.changedFiles).toEqual([])
      expect(unchangedSelection.unchangedFiles.map((file) => file.relativePath).sort()).toEqual([
        "src/main/java/demo/OrderService.java",
        "src/native/order.c",
      ])
      expect(changedSelection.changedFiles.map((file) => file.relativePath)).toEqual([
        "src/native/order.c",
      ])
      expect(changedSelection.unchangedFiles.map((file) => file.relativePath)).toEqual([
        "src/main/java/demo/OrderService.java",
      ])
      expect(rows).toHaveLength(2)
      expect(rows[0]?.last_retro_run_id).toBe("rrun_phase10_first")
      expect(rows[1]?.last_retro_run_id).toBe("rrun_phase10_second")
      expect(rows[0]?.content_sha256).toHaveLength(64)
      expect(rows[1]?.content_sha256).toHaveLength(64)
    } finally {
      db.close()
    }
  })
})
