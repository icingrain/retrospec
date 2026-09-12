import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { submitJob } from "../src/job-runner"
import { projectPaths } from "../src/paths"
import { readRetroStatuses } from "../src/registry"
import { runRetroInventory } from "../src/retro/run"
import type { SpecAnalysisDriver } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 2 scoped runtime behavior", () => {
  test("Given manifest-only partial scope When write scope is derived Then job lock uses partial scope key", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const manifestPath = await writeRetroManifest(projectRoot, {
      analysis_scope: { mode: "partial", roots: ["src/native"] },
    })

    await runRetroInventory(projectRoot)
    const submitted = await submitJob({
      project_path: projectRoot,
      actor: "retro",
      category: "structure",
      manifest_path: manifestPath,
    })

    const row = readJobScope(projectRoot, submitted.job_id)
    expect(row?.write_scope_key).toStartWith("retro:code-inventory:partial:")
  })

  test("Given full canonical inventory When partial inventory fails Then canonical handoff stays full ready", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const fullStatuses = readRetroStatuses(paths)

    await expect(
      runRetroInventory(projectRoot, { mode: "partial", roots: ["../outside"] }),
    ).rejects.toThrow()

    expect(readRetroStatuses(paths)).toEqual(fullStatuses)
  })

  test("Given partial spec scope When spec analysis runs Then input and stored run stay scoped", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const captured: string[][] = []
    const driver: SpecAnalysisDriver = {
      model: "test-driver",
      promptVersion: "risk-test",
      analyze: (input) => {
        captured.push(input.entities.map((entity) => entity.filePath).toSorted())
        return { findings: [] }
      },
    }

    const result = await runSpecAnalysis(paths, { mode: "partial", roots: ["src/native"] }, driver)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const row = db
        .query<{ readonly scope_mode: string; readonly scope_roots_json: string }, [string]>(
          "select scope_mode, scope_roots_json from analysis_runs where analysis_run_id = ?",
        )
        .get(result.analysisRunId)

      expect(captured).toEqual([["src/native/order.c", "src/native/order.c"]])
      expect(row).toEqual({ scope_mode: "partial", scope_roots_json: '["src/native"]' })
    } finally {
      db.close()
    }
  })

  test("Given public write_scope_key override When job is submitted Then server derives lock key", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const manifestPath = await writeRetroManifest(projectRoot, {})

    const submitted = await submitJob({
      project_path: projectRoot,
      actor: "retro",
      category: "structure",
      manifest_path: manifestPath,
      write_scope_key: "attacker:bypass",
    })

    const row = readJobScope(projectRoot, submitted.job_id)
    expect(row?.write_scope_key).toBe("retro:code-inventory:full")
  })
})

async function writeRetroManifest(
  projectRoot: string,
  extra: Record<string, unknown>,
): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "retro", "inventory")
  await mkdir(generatedDir, { recursive: true })
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(join(generatedDir, "run.ts"), "")
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint: join(generatedDir, "run.ts"),
      args: [],
      env: {},
      writes: [".retrospec/retro/structure.db"],
      category: "structure",
      actor: "retro",
      capability: "code-inventory",
      ...extra,
    }),
  )
  return manifestPath
}

function readJobScope(
  projectRoot: string,
  jobId: string,
): { readonly write_scope_key: string } | null {
  const db = new Database(projectPaths(projectRoot).jobsDb, { readonly: true })
  try {
    return db
      .query<{ readonly write_scope_key: string }, [string]>(
        "select write_scope_key from job_snapshot where job_id = ?",
      )
      .get(jobId)
  } finally {
    db.close()
  }
}
