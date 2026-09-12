import { describe, expect, test } from "bun:test"
import ky from "ky"
import { inspectJob } from "../src/jobs"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { createSpecRateLimitScheduler } from "../src/spec/rate-limit"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
  writeSpecManifest,
} from "./phase3-helpers"

describe("Phase 10 spec rate limit scheduler", () => {
  test("Given simultaneous spec batches When reservations are made Then only the global burst is granted immediately", () => {
    const scheduler = createSpecRateLimitScheduler({ capacity: 1, refillPerSecond: 1 })

    const first = scheduler.reserve({ projectPath: "/project/a", jobId: "job_a", nowMs: 1_000 })
    const second = scheduler.reserve({ projectPath: "/project/b", jobId: "job_b", nowMs: 1_000 })

    expect(first).toMatchObject({ status: "granted", wait_ms: 0 })
    expect(second).toMatchObject({ status: "delayed", wait_ms: 1_000, available_at_ms: 2_000 })
  })

  test("Given two submitted spec jobs When both complete Then delayed job ledger explains the global rate limit wait", async () => {
    const runtime = await tempRuntime()
    const firstProject = await readySpecProject()
    const secondProject = await readySpecProject()
    const endpoint = await daemonEndpoint(runtime)
    const firstManifest = await writeSpecManifest(firstProject)
    const secondManifest = await writeSpecManifest(secondProject)

    const firstJob = await submitSpec(endpoint, firstProject, firstManifest)
    const secondJob = await submitSpec(endpoint, secondProject, secondManifest)
    await awaitJob(endpoint, firstJob)
    await awaitJob(endpoint, secondJob)

    const firstDetail = await inspectJob(projectPaths(firstProject), firstJob)
    const secondDetail = await inspectJob(projectPaths(secondProject), secondJob)
    const waitEvents = [...(firstDetail?.ledger ?? []), ...(secondDetail?.ledger ?? [])].filter(
      (event) => event.payload.includes("global_spec_rate_limit"),
    )

    expect(firstDetail?.snapshot.status).toBe("completed")
    expect(secondDetail?.snapshot.status).toBe("completed")
    expect(waitEvents.some((event) => event.event_type === "blocker")).toBe(true)
    stopDaemons()
  })
})

type SubmittedJob = {
  readonly job_id: string
}

type AwaitedJob = {
  readonly status: string
  readonly timed_out: boolean
}

type Endpoint = Awaited<ReturnType<typeof daemonEndpoint>>

async function readySpecProject(): Promise<string> {
  const projectRoot = await tempProject()
  await writeSampleProject(projectRoot)
  await runRetroInventory(projectRoot)
  return projectRoot
}

async function submitSpec(
  endpoint: Endpoint,
  projectRoot: string,
  manifestPath: string,
): Promise<string> {
  const submitted = await ky
    .post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: projectRoot,
        actor: "spec",
        category: "risk",
        manifest_path: manifestPath,
      },
    })
    .json<SubmittedJob>()
  return submitted.job_id
}

async function awaitJob(endpoint: Endpoint, jobId: string): Promise<void> {
  const awaited = await ky
    .post(`jobs/${jobId}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })
    .json<AwaitedJob>()

  expect(awaited.status).toBe("completed")
  expect(awaited.timed_out).toBe(false)
}
