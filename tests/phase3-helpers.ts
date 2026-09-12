import { expect } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ky from "ky"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { readEndpoint } from "../src/discovery"
import { runtimePaths } from "../src/paths"
import type { DaemonEndpoint, RuntimePaths } from "../src/types"

const daemons: DaemonServer[] = []

export function stopDaemons(): void {
  for (const daemon of daemons.splice(0)) {
    daemon.stop()
  }
}

export async function tempRuntime(): Promise<RuntimePaths> {
  return runtimePaths(await mkdtemp(join(tmpdir(), "retrospec-runtime-")))
}

export async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "retrospec-project-"))
}

export async function daemonEndpoint(runtime: RuntimePaths): Promise<DaemonEndpoint> {
  const daemon = await startDaemon(runtime)
  daemons.push(daemon)
  const endpoint = await readEndpoint(runtime)

  if (endpoint === null) {
    throw new Error("daemon endpoint was not discoverable")
  }

  return endpoint
}

export async function writeSampleProject(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, "src", "main", "java", "demo"), { recursive: true })
  await mkdir(join(projectRoot, "src", "native"), { recursive: true })
  await writeFile(
    join(projectRoot, "src", "main", "java", "demo", "OrderService.java"),
    `package demo;
public class OrderService {
  public int total(int amount) {
    return amount;
  }
}
`,
  )
  await writeFile(
    join(projectRoot, "src", "native", "order.c"),
    `#include <stdio.h>
int add_order(int value) {
  return value + 1;
}
`,
  )
}

export async function writeRetroManifest(projectRoot: string): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "retro", "inventory")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, "run.ts")
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(entrypoint, "")
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [
        ".retrospec/retro/structure.db",
        ".retrospec/retro/symbols.db",
        ".retrospec/registry.db",
      ],
      category: "structure",
      actor: "retro",
      capability: "code-inventory",
    }),
  )
  return manifestPath
}

export async function writeSpecManifest(projectRoot: string): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "spec", "analysis")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, "run.ts")
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(entrypoint, "")
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [".retrospec/spec/ai_analysis.db"],
      category: "risk",
      actor: "spec",
      capability: "ai-analysis",
    }),
  )
  return manifestPath
}

export async function submitAndAwait(
  endpoint: DaemonEndpoint,
  projectRoot: string,
  manifestPath: string,
  expectedStatus: string,
): Promise<void> {
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
      readonly status: string
      readonly timed_out: boolean
    }>()

  expect(awaited.status).toBe(expectedStatus)
  expect(awaited.timed_out).toBe(false)
}

export async function submitSpecAndAwait(
  endpoint: DaemonEndpoint,
  projectRoot: string,
  manifestPath: string,
  expectedStatus: string,
): Promise<void> {
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
    .json<{ readonly job_id: string }>()

  const awaited = await ky
    .post(`jobs/${submitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })
    .json<{
      readonly status: string
      readonly timed_out: boolean
    }>()

  expect(awaited.status).toBe(expectedStatus)
  expect(awaited.timed_out).toBe(false)
}
