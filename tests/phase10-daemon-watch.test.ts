import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import type { HealthResponse } from "../src/types"
import { createProjectWatcherManager } from "../src/watchers"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 10 daemon watcher healthcheck", () => {
  test("Given a dead project watcher When healthcheck runs Then watcher is restarted under the 30s policy", async () => {
    const projectRoot = await tempProject()
    const manager = createProjectWatcherManager({ healthcheckIntervalMs: 30_000 })
    manager.ensureProject(projectRoot)
    manager.markWatcherDead(projectRoot)

    manager.runHealthcheck([projectRoot])

    const summary = manager.summary()
    expect(summary.healthcheck_interval_ms).toBe(30_000)
    expect(summary.watchers).toHaveLength(1)
    expect(summary.watchers[0]).toMatchObject({
      project_path: projectRoot,
      status: "watching",
      restart_count: 1,
    })
  })

  test("Given a registered project When daemon health is requested Then watcher health is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const health = await ky.get("health", { prefixUrl: endpoint.baseUrl }).json<HealthResponse>()

    expect(health.watchers.healthcheck_interval_ms).toBe(30_000)
    expect(health.watchers.watchers).toContainEqual(
      expect.objectContaining({ project_path: projectRoot, status: "watching" }),
    )
  })
})
