import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ky from "ky"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { readEndpoint } from "../src/discovery"
import { runtimePaths } from "../src/paths"
import type { DaemonEndpoint, RuntimePaths } from "../src/types"

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

async function daemonEndpoint(runtime: RuntimePaths): Promise<DaemonEndpoint> {
  const daemon = await startDaemon(runtime)
  daemons.push(daemon)
  const endpoint = await readEndpoint(runtime)

  if (endpoint === null) {
    throw new Error("daemon endpoint was not discoverable")
  }

  return endpoint
}

async function writeManifest(projectRoot: string, name: string, source: string): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "phase2")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, `${name}.ts`)
  const manifestPath = join(generatedDir, `${name}.json`)
  await writeFile(entrypoint, source)
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [".retrospec/logs/phase2.log"],
      category: "symbols",
      actor: "retro",
    }),
  )
  return manifestPath
}

describe("Phase 2 job lifecycle", () => {
  test("Given a dummy manifest When job is submitted Then await returns completed with durable ledger", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeManifest(
      projectRoot,
      "complete",
      "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n",
    )

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string; readonly status: string }>()

    expect(submitted.status).toBe("queued")

    const listed = await ky
      .get("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{ readonly jobs: readonly { readonly job_id: string; readonly status: string }[] }>()
    expect(listed.jobs.some((job) => job.job_id === submitted.job_id)).toBe(true)

    const awaited = await ky
      .post(`jobs/${submitted.job_id}/await`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { timeout_ms: 5_000 },
      })
      .json<{ readonly status: string; readonly timed_out: boolean }>()
    const inspected = await ky
      .get(`jobs/${submitted.job_id}`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<{
        readonly snapshot: { readonly status: string; readonly progress_pct: number }
        readonly ledger: readonly { readonly event_type: string }[]
      }>()

    expect(awaited).toMatchObject({ status: "completed", timed_out: false })
    expect(inspected.snapshot).toMatchObject({ status: "completed", progress_pct: 100 })
    expect(inspected.ledger.map((event) => event.event_type)).toEqual([
      "submitted",
      "started",
      "completed",
    ])
  })

  test("Given an unsafe manifest path When job is submitted Then daemon rejects it", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const unsafeManifest = join(projectRoot, "job.json")
    await writeFile(unsafeManifest, "{}")

    const response = await ky.post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: unsafeManifest,
      },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(400)
  })

  test("Given a running job When cancel is requested Then inspect shows cancelled ledger", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeManifest(projectRoot, "long", "await Bun.sleep(10_000)\n")

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()
    const cancelled = await ky
      .post(`jobs/${submitted.job_id}/cancel`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<{ readonly status: string }>()
    const inspected = await ky
      .get(`jobs/${submitted.job_id}`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<{ readonly ledger: readonly { readonly event_type: string }[] }>()

    expect(cancelled.status).toBe("cancelled")
    expect(inspected.ledger.map((event) => event.event_type)).toContain("cancelled")
  })
})
