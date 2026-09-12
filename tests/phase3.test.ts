import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import {
  daemonEndpoint,
  stopDaemons,
  submitAndAwait,
  tempProject,
  tempRuntime,
  writeRetroManifest,
  writeSampleProject,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 3 retro structure and symbols MVP", () => {
  test("Given C and Java sources When retro inventory job completes Then DBs and handoff are written", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeRetroManifest(projectRoot)

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "structure",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()

    const awaited = await ky
      .post(`jobs/${submitted.job_id}/await`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { timeout_ms: 5_000 },
      })
      .json<{
        readonly job_id: string
        readonly status: string
        readonly timed_out: boolean
        readonly progress_pct: number
      }>()

    expect(awaited).toEqual({
      job_id: submitted.job_id,
      status: "completed",
      timed_out: false,
      progress_pct: 100,
    })

    const structureDb = new Database(join(projectRoot, ".retrospec", "retro", "structure.db"), {
      readonly: true,
    })
    const symbolsDb = new Database(join(projectRoot, ".retrospec", "retro", "symbols.db"), {
      readonly: true,
    })
    const registryDb = new Database(join(projectRoot, ".retrospec", "registry.db"), {
      readonly: true,
    })

    try {
      expect(structureDb.query("select count(*) as count from files").get()).toEqual({ count: 2 })
      expect(symbolsDb.query("select name from symbols order by name").all()).toEqual([
        { name: "OrderService" },
        { name: "add_order" },
        { name: "total" },
      ])
      expect(registryDb.query("select count(*) as count from entities").get()).toEqual({ count: 5 })
      expect(structureDb.query("select count(*) as count from retro_runs").get()).toEqual({
        count: 1,
      })
      expect(symbolsDb.query("select count(*) as count from retro_runs").get()).toEqual({
        count: 1,
      })
      expect(
        registryDb
          .query(
            "select category, status, entity_count, retro_run_id from workflow_handoff order by category",
          )
          .all(),
      ).toEqual([
        {
          category: "structure",
          status: "ready_for_analysis",
          entity_count: 2,
          retro_run_id: structureDb
            .query<{ readonly retro_run_id: string }, []>("select retro_run_id from retro_runs")
            .get()?.retro_run_id,
        },
        {
          category: "symbols",
          status: "ready_for_analysis",
          entity_count: 3,
          retro_run_id: symbolsDb
            .query<{ readonly retro_run_id: string }, []>("select retro_run_id from retro_runs")
            .get()?.retro_run_id,
        },
      ])
    } finally {
      structureDb.close()
      symbolsDb.close()
      registryDb.close()
    }
  })

  test("Given a changed project When retro inventory reruns Then stale registry rows are replaced and fingerprint changes", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeRetroManifest(projectRoot)

    await submitAndAwait(endpoint, projectRoot, manifestPath, "completed")

    const registryDbBefore = new Database(join(projectRoot, ".retrospec", "registry.db"), {
      readonly: true,
    })
    const firstFingerprint = registryDbBefore
      .query<{ readonly source_fingerprint: string }, []>(
        "select source_fingerprint from workflow_handoff where category = 'structure'",
      )
      .get()?.source_fingerprint
    registryDbBefore.close()

    await rm(join(projectRoot, "src", "native", "order.c"))
    await writeFile(
      join(projectRoot, "src", "main", "java", "demo", "OrderService.java"),
      `package demo;
public class OrderService {
  public int total(int number) {
    return number;
  }
}
`,
    )

    await submitAndAwait(endpoint, projectRoot, manifestPath, "completed")

    const registryDbAfter = new Database(join(projectRoot, ".retrospec", "registry.db"), {
      readonly: true,
    })
    try {
      expect(registryDbAfter.query("select count(*) as count from entities").get()).toEqual({
        count: 3,
      })
      expect(
        registryDbAfter
          .query("select category, entity_count from workflow_handoff order by category")
          .all(),
      ).toEqual([
        { category: "structure", entity_count: 1 },
        { category: "symbols", entity_count: 2 },
      ])
      expect(
        registryDbAfter
          .query<{ readonly source_fingerprint: string }, []>(
            "select source_fingerprint from workflow_handoff where category = 'structure'",
          )
          .get()?.source_fingerprint,
      ).not.toBe(firstFingerprint)
    } finally {
      registryDbAfter.close()
    }
  })

  test("Given an unreadable source directory When retro inventory job fails Then handoff records failed status", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const blockedDir = join(projectRoot, "src", "blocked")
    await mkdir(blockedDir, { recursive: true })
    await chmod(blockedDir, 0o000)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeRetroManifest(projectRoot)

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "structure",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()

    const awaited = await ky
      .post(`jobs/${submitted.job_id}/await`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { timeout_ms: 5_000 },
      })
      .json<{
        readonly job_id: string
        readonly status: string
        readonly timed_out: boolean
        readonly progress_pct: number
      }>()

    await chmod(blockedDir, 0o700)
    expect(awaited).toEqual({
      job_id: submitted.job_id,
      status: "failed",
      timed_out: false,
      progress_pct: 100,
    })

    const registryDb = new Database(join(projectRoot, ".retrospec", "registry.db"), {
      readonly: true,
    })

    try {
      expect(
        registryDb
          .query(
            "select category, status, entity_count, error_message is not null as has_error from workflow_handoff order by category",
          )
          .all(),
      ).toEqual([
        { category: "structure", status: "failed", entity_count: 0, has_error: 1 },
        { category: "symbols", status: "failed", entity_count: 0, has_error: 1 },
      ])
    } finally {
      registryDb.close()
    }
  })
})
