import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { analysisStatus, registerProjectWithDaemon } from "../src/client"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { ensureDaemon, health, readEndpoint } from "../src/discovery"
import { runtimePaths } from "../src/paths"
import { formatRouterSummary, routerSummary } from "../src/router"
import type { DaemonEndpoint, RuntimePaths } from "../src/types"
import { version } from "../src/version"

const daemons: DaemonServer[] = []

afterEach(() => {
  for (const daemon of daemons.splice(0)) {
    daemon.stop()
  }
})

async function tempRuntime(): Promise<RuntimePaths> {
  return runtimePaths(await mkdtemp(join(tmpdir(), "retrospec-runtime-")))
}

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "retrospec-project-"))
}

describe("Phase 1 daemon and router", () => {
  test("Given no daemon files When daemon starts Then endpoint discovery and health succeed", async () => {
    const runtime = await tempRuntime()

    const daemon = await startDaemon(runtime)
    daemons.push(daemon)
    const endpoint = await readEndpoint(runtime)
    expect(endpoint).not.toBeNull()

    const response = endpoint === null ? null : await health(endpoint)
    expect(response).toMatchObject({ ok: true, version })
  })

  test("Given a new project When router summarizes Then registry is created and retro is recommended", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const daemon = await startDaemon(runtime)
    daemons.push(daemon)

    const summary = await routerSummary(projectRoot, runtime)

    expect(summary.hasRetrospecState).toBe(false)
    expect(summary.retroStatuses).toEqual([])
    expect(summary.nextAction).toBe("Run retro first to create analysis DBs.")
    expect(formatRouterSummary(summary)).toContain("state: created .retrospec")
    expect(formatRouterSummary(summary)).toContain(`project: ${projectRoot}`)
  })

  test("Given an already registered project When registered again Then project id is stable", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const daemon = await startDaemon(runtime)
    daemons.push(daemon)
    const endpoint = await readEndpoint(runtime)
    expect(endpoint).not.toBeNull()

    if (endpoint === null) {
      throw new Error("daemon endpoint was not discoverable")
    }

    const first = await registerProjectWithDaemon(endpoint, projectRoot)
    const second = await registerProjectWithDaemon(endpoint, projectRoot)
    const status = await analysisStatus(endpoint, projectRoot)

    expect(second.project_id).toBe(first.project_id)
    expect(second.project_path).toBe(projectRoot)
    expect(status).toEqual({ retro: [], spec: [] })
  })

  test("Given status runs from a consumer cwd When daemon is missing Then bootstrap uses package CLI path", async () => {
    const runtime = await tempRuntime()
    const endpoint: DaemonEndpoint = {
      port: 49152,
      token: "rtok_test",
      baseUrl: "http://127.0.0.1:49152",
    }
    const spawned: string[][] = []
    let reads = 0

    await ensureDaemon(runtime, {
      readEndpointFn: async () => {
        reads += 1
        return reads === 1 ? null : endpoint
      },
      healthFn: async () => ({
        ok: true,
        version,
        started_at: "2026-08-06T00:00:00.000Z",
        watchers: { healthcheck_interval_ms: 30_000, watchers: [] },
      }),
      sleep: async () => {},
      spawnProcess: (command) => {
        spawned.push([...command])
        return { unref: () => {} }
      },
    })

    expect(spawned).toHaveLength(1)
    expect(spawned[0]?.slice(0, 2)).toEqual([process.execPath, "run"])
    expect(spawned[0]?.[2]).toEndWith("/src/cli.ts")
    expect(spawned[0]?.[2]).not.toBe("src/cli.ts")
    expect(spawned[0]?.[3]).toBe("daemon")
  })

  test("Given a stale daemon endpoint When daemon is ensured Then bootstrap replaces it with current package daemon", async () => {
    const runtime = await tempRuntime()
    const staleEndpoint: DaemonEndpoint = {
      port: 49152,
      token: "rtok_stale",
      baseUrl: "http://127.0.0.1:49152",
    }
    const currentEndpoint: DaemonEndpoint = {
      port: 49153,
      token: "rtok_current",
      baseUrl: "http://127.0.0.1:49153",
    }
    const spawned: string[][] = []
    let reads = 0

    const endpoint = await ensureDaemon(runtime, {
      readEndpointFn: async () => {
        reads += 1
        return reads === 1 ? staleEndpoint : currentEndpoint
      },
      healthFn: async (candidate) => ({
        ok: true,
        version: candidate.port === staleEndpoint.port ? "0.1.0" : version,
        started_at: "2026-08-06T00:00:00.000Z",
        watchers: { healthcheck_interval_ms: 30_000, watchers: [] },
      }),
      sleep: async () => {},
      spawnProcess: (command) => {
        spawned.push([...command])
        return { unref: () => {} }
      },
    })

    expect(endpoint).toEqual(currentEndpoint)
    expect(spawned).toHaveLength(1)
  })
})
