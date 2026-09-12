import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { generateRetroExports } from "../src/exports"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import type { AnalysisStatusResponse, DaemonEndpoint } from "../src/types"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
  writeSpecManifest,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 7 end-to-end regression QA", () => {
  test("Given duplicate partial daemon jobs When submitted through HTTP Then conflict and replacement preserve scope policy", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSlowRetroManifest(projectRoot)
    const scope = { mode: "partial", roots: ["src/native"] } as const

    const first = await postJob(endpoint, projectRoot, manifestPath, false, scope)
    const conflict = await ky.post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: manifestPath,
        scope,
      },
      throwHttpErrors: false,
    })

    const conflictBody = await conflict.json<{
      readonly error: string
      readonly conflict: { readonly write_scope_key: string }
    }>()
    const replacement = await postJob(endpoint, projectRoot, manifestPath, true, scope)
    const awaited = await ky
      .post(`jobs/${replacement.job_id}/await`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { timeout_ms: 5_000 },
      })
      .json<{ readonly status: string; readonly timed_out: boolean }>()
    const originalDetail = await ky
      .get(`jobs/${first.job_id}`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<{
        readonly snapshot: { readonly status: string }
        readonly ledger: readonly JobEvent[]
      }>()
    const jobsHtml = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot, job_id: first.job_id },
      })
      .text()

    expect(conflict.status).toBe(409)
    expect(conflictBody.error).toBe("active job already owns this write scope")
    expect(conflictBody.conflict.write_scope_key).toContain("retro:code-inventory:partial:")
    expect(replacement.replaced_job_id).toBe(first.job_id)
    expect(awaited).toMatchObject({ status: "completed", timed_out: false })
    expect(originalDetail.snapshot.status).toBe("cancelled")
    expect(originalDetail.ledger.some((event) => event.payload.includes(replacement.job_id))).toBe(
      true,
    )
    expect(jobsHtml).toContain("Partial scope · does not replace full canonical result")
    expect(jobsHtml).toContain(
      "Promotion or replacement actions require explicit confirmation before a partial result can affect full-project canonical output.",
    )
  })

  test("Given env-provider spec job When submitted through daemon Then status dashboard and exports expose the completed run", async () => {
    const provider = Bun.serve({
      port: 0,
      fetch(request) {
        expect(request.headers.get("authorization")).toBe("Bearer phase7-secret")
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        })
      },
    })
    const previousEnv = captureProviderEnv()

    process.env["RETROSPEC_SPEC_PROVIDER_MODE"] = "env-provider"
    process.env["RETROSPEC_SPEC_PROVIDER"] = "openai"
    process.env["RETROSPEC_SPEC_MODEL"] = "gpt-phase7"
    process.env["RETROSPEC_SPEC_API_KEY"] = "phase7-secret"
    process.env["RETROSPEC_SPEC_BASE_URL"] = `${provider.url}v1`
    try {
      const runtime = await tempRuntime()
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      await runRetroInventory(projectRoot, { mode: "partial", roots: ["src/native"] })
      await generateRetroExports(projectPaths(projectRoot), { format: "csv" })
      const endpoint = await daemonEndpoint(runtime)
      const manifestPath = await writeSpecManifest(projectRoot)
      const specJob = await ky
        .post("jobs", {
          prefixUrl: endpoint.baseUrl,
          headers: { Authorization: `Bearer ${endpoint.token}` },
          json: {
            project_path: projectRoot,
            actor: "spec",
            category: "risk",
            manifest_path: manifestPath,
            scope: { mode: "partial", roots: ["src/native"] },
          },
        })
        .json<{ readonly job_id: string }>()

      const awaited = await ky
        .post(`jobs/${specJob.job_id}/await`, {
          prefixUrl: endpoint.baseUrl,
          headers: { Authorization: `Bearer ${endpoint.token}` },
          json: { timeout_ms: 5_000 },
        })
        .json<{ readonly status: string; readonly timed_out: boolean }>()
      const status = await ky
        .get("analysis/status", {
          prefixUrl: endpoint.baseUrl,
          headers: { Authorization: `Bearer ${endpoint.token}` },
          searchParams: { project_path: projectRoot },
        })
        .json<AnalysisStatusResponse>()
      const analysisHtml = await ky
        .get("dashboard/analysis", {
          prefixUrl: endpoint.baseUrl,
          searchParams: { project_path: projectRoot },
        })
        .text()
      const exportsResponse = await ky
        .post("exports/regenerate", {
          prefixUrl: endpoint.baseUrl,
          headers: { Authorization: `Bearer ${endpoint.token}` },
          json: { project_path: projectRoot },
        })
        .json<{ readonly exports: readonly { readonly file_id: string }[] }>()

      expect(awaited).toMatchObject({ status: "completed", timed_out: false })
      expect(status.spec[0]).toMatchObject({
        status: "completed",
        model: "openai:gpt-phase7",
        provider_mode: "env-provider",
        scope_mode: "partial",
        scope_roots_json: '["src/native"]',
      })
      expect(analysisHtml).toContain("openai:gpt-phase7")
      expect(analysisHtml).toContain("env-provider")
      expect(analysisHtml).toContain("Partial scope · src/native")
      expect(exportsResponse.exports.length).toBeGreaterThan(0)
      expect(JSON.stringify({ status, analysisHtml })).not.toContain("phase7-secret")
    } finally {
      restoreProviderEnv(previousEnv)
      provider.stop(true)
    }
  })
})

type JobEvent = { readonly payload: string }
type PartialScope = { readonly mode: "partial"; readonly roots: readonly [string] }
type ProviderEnvSnapshot = Readonly<Record<(typeof providerEnvNames)[number], string | undefined>>

const providerEnvNames = [
  "RETROSPEC_SPEC_PROVIDER_MODE",
  "RETROSPEC_SPEC_PROVIDER",
  "RETROSPEC_SPEC_MODEL",
  "RETROSPEC_SPEC_API_KEY",
  "RETROSPEC_SPEC_BASE_URL",
] as const

async function writeSlowRetroManifest(projectRoot: string): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "retro", "phase7-e2e")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, "run.ts")
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(
    entrypoint,
    "await Bun.sleep(1_000)\nawait Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n",
  )
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [".retrospec/logs/phase7-e2e.log"],
      category: "symbols",
      actor: "retro",
    }),
  )
  return manifestPath
}

async function postJob(
  endpoint: DaemonEndpoint,
  projectRoot: string,
  manifestPath: string,
  replaceExisting: boolean,
  scope: PartialScope,
): Promise<{ readonly job_id: string; readonly replaced_job_id?: string }> {
  return ky
    .post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: projectRoot,
        actor: "retro",
        category: "symbols",
        manifest_path: manifestPath,
        scope,
        replace_existing: replaceExisting,
      },
    })
    .json<{ readonly job_id: string; readonly replaced_job_id?: string }>()
}

function captureProviderEnv(): ProviderEnvSnapshot {
  return {
    RETROSPEC_SPEC_PROVIDER_MODE: process.env["RETROSPEC_SPEC_PROVIDER_MODE"],
    RETROSPEC_SPEC_PROVIDER: process.env["RETROSPEC_SPEC_PROVIDER"],
    RETROSPEC_SPEC_MODEL: process.env["RETROSPEC_SPEC_MODEL"],
    RETROSPEC_SPEC_API_KEY: process.env["RETROSPEC_SPEC_API_KEY"],
    RETROSPEC_SPEC_BASE_URL: process.env["RETROSPEC_SPEC_BASE_URL"],
  }
}

function restoreProviderEnv(snapshot: ProviderEnvSnapshot): void {
  for (const name of providerEnvNames) {
    const value = snapshot[name]
    if (value === undefined) {
      delete process.env[name]
      continue
    }
    process.env[name] = value
  }
}
