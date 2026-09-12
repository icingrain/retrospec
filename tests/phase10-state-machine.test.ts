import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { submitJob } from "../src/job-runner"
import { appendJobEvent, createJob, ensureJobStore, inspectJob, updateJob } from "../src/jobs"
import { listJobs } from "../src/jobs"
import { projectPaths } from "../src/paths"
import { readRetroStatuses } from "../src/registry"
import { runRetroInventory } from "../src/retro/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"
import { parserContract, validationReport, writeGeneratedProgram } from "./phase7-parser-fixtures"

describe("Phase 10 retro execution state machine", () => {
  test("Given blocked generated validation When job is submitted Then submission is refused before queueing", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({
        status: "failed",
        gaps: [{ type: "bug", status: "open" }],
      }),
    )

    await expect(
      submitJob({
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: manifestPath,
      }),
    ).rejects.toThrow("generated program validation blocked")

    expect(await listJobs(projectRoot)).toEqual([])
  })

  test("Given approved generated validation When job is submitted Then queueing is allowed", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(projectRoot, parserContract(projectRoot))

    const submitted = await submitJob({
      project_path: projectRoot,
      actor: "retro",
      category: "symbols",
      manifest_path: manifestPath,
    })

    expect(submitted.status).toBe("queued")
  })

  test("Given active job for same write scope When another job is submitted Then submission is refused", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(projectRoot, parserContract(projectRoot))

    const first = await submitJob({
      project_path: projectRoot,
      actor: "retro",
      category: "symbols",
      manifest_path: manifestPath,
      write_scope_key: "retro:symbols:full",
    })
    const paths = projectPaths(projectRoot)
    await updateJob(paths, first.job_id, "running", 10, "running")

    await expect(
      submitJob({
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: manifestPath,
        write_scope_key: "retro:symbols:full",
      }),
    ).rejects.toThrow("active job already owns this write scope")
  })

  test("Given migrated active job with blank write scope When default scope job is submitted Then submission is refused", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(projectRoot, parserContract(projectRoot))
    const paths = projectPaths(projectRoot)
    const legacy = await createJob({
      project_path: projectRoot,
      actor: "retro",
      category: "symbols",
      manifest_path: manifestPath,
    })
    await updateJob(paths, legacy.job_id, "running", 10, "legacy running")
    const db = new Database(paths.jobsDb, { create: true })
    try {
      db.query("update job_snapshot set write_scope_key = '' where job_id = ?").run(legacy.job_id)
    } finally {
      db.close()
    }

    await ensureJobStore(paths)

    await expect(
      submitJob({
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: manifestPath,
      }),
    ).rejects.toThrow("active job already owns this write scope")
  })

  test("Given replacement requested When active job owns same write scope Then existing job is cancelled before queueing replacement", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(projectRoot, parserContract(projectRoot))
    const paths = projectPaths(projectRoot)
    const existing = await createJob({
      project_path: projectRoot,
      actor: "retro",
      category: "symbols",
      manifest_path: manifestPath,
      write_scope_key: "retro:symbols:full",
    })
    await updateJob(paths, existing.job_id, "running", 45, "extracting symbols")
    await appendJobEvent(paths, existing.job_id, "started")

    const replacement = await submitJob({
      project_path: projectRoot,
      actor: "retro",
      category: "symbols",
      manifest_path: manifestPath,
      write_scope_key: "retro:symbols:full",
      replace_existing: true,
    })

    const replaced = await inspectJob(paths, existing.job_id)
    expect(replacement.status).toBe("queued")
    expect(replacement.replaced_job_id).toBe(existing.job_id)
    expect(replaced?.snapshot.status).toBe("cancelled")
    expect(
      replaced?.ledger.some(
        (event) => event.event_type === "cancelled" && event.payload.includes(replacement.job_id),
      ),
    ).toBe(true)
  })

  test("Given Phase 9 inventory When status is read Then parser coverage metadata is exposed for gates", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)

    const statuses = readRetroStatuses(projectPaths(projectRoot))

    expect(statuses).toEqual([
      expect.objectContaining({
        category: "structure",
        status: "ready_for_analysis",
        parser_backend: "mixed-parser-substrate",
        support_level: "best-effort",
        evidence_label: "INFERRED",
      }),
      expect.objectContaining({
        category: "symbols",
        status: "ready_for_analysis",
        parser_backend: "mixed-parser-substrate",
        support_level: "best-effort",
        evidence_label: "INFERRED",
      }),
    ])
    expect(statuses[0]?.coverage_summary_json).toContain('"modes"')
  })
})
