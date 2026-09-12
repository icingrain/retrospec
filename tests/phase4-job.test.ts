import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import {
  daemonEndpoint,
  stopDaemons,
  submitSpecAndAwait,
  tempProject,
  tempRuntime,
  writeSampleProject,
  writeSpecManifest,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 4 spec analysis jobs", () => {
  test("Given ready retro inventory When ai-analysis job is submitted Then spec findings are stored", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)

    await submitSpecAndAwait(endpoint, projectRoot, manifestPath, "completed")

    const paths = projectPaths(projectRoot)
    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const findingCount = db
        .query<{ readonly count: number }, []>("select count(*) as count from risk_findings")
        .get()

      expect(findingCount?.count).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })

  test("Given no retro handoff When ai-analysis job is submitted Then job fails", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)

    await submitSpecAndAwait(endpoint, projectRoot, manifestPath, "failed")
  })
})
