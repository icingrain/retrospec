import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { projectPaths } from "../src/paths"
import { writeSpecProviderSettings } from "../src/provider-settings"
import { runRetroInventory } from "../src/retro/run"
import type { JobDetailResponse } from "../src/types"
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

describe("Phase 16 saved provider spec jobs", () => {
  test("Given saved opencode broker settings When spec job runs Then saved provider handles the job", async () => {
    const receivedRequests: unknown[] = []
    const previousBrokerToken = process.env["RETROSPEC_SPEC_BROKER_TOKEN"]
    process.env["RETROSPEC_SPEC_BROKER_TOKEN"] = "saved-broker-token"
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        expect(new URL(request.url).pathname).toBe("/spec/analyze")
        expect(request.headers.get("authorization")).toBe("Bearer saved-broker-token")
        receivedRequests.push(await request.json())
        return Response.json({
          findings: [],
          usage: { promptTokens: 7, completionTokens: 8, totalTokens: 15, costUsd: 0 },
        })
      },
    })

    try {
      const runtime = await tempRuntime()
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      const paths = projectPaths(projectRoot)
      await writeSpecProviderSettings(paths, {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: server.url.toString(),
      })
      const endpoint = await daemonEndpoint(runtime)
      const manifestPath = await writeSpecManifest(projectRoot)

      const submitted = await submitSpecJob(endpoint, projectRoot, manifestPath)
      const awaited = await awaitSpecJob(endpoint, submitted.job_id)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<{ readonly provider_mode: string; readonly model: string }, []>(
            "select provider_mode, model from analysis_runs order by started_at desc limit 1",
          )
          .get()

        expect(awaited).toMatchObject({ status: "completed", timed_out: false })
        expect(receivedRequests).toHaveLength(1)
        expect(receivedRequests[0]).toMatchObject({ model: "openai/gpt-5.5" })
        expect(run).toEqual({
          provider_mode: "opencode-broker",
          model: "opencode-broker:openai/gpt-5.5",
        })
        expect(JSON.stringify({ receivedRequests, run })).not.toContain("saved-broker-token")
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
      if (previousBrokerToken === undefined) {
        Reflect.deleteProperty(process.env, "RETROSPEC_SPEC_BROKER_TOKEN")
      } else {
        process.env["RETROSPEC_SPEC_BROKER_TOKEN"] = previousBrokerToken
      }
    }
  })

  test("Given saved env provider settings without secret When spec job runs Then job event names provider config failure", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    await writeSpecProviderSettings(projectPaths(projectRoot), {
      mode: "env-provider",
      provider: "openai",
      model: "gpt-phase3",
    })
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)

    const submitted = await submitSpecJob(endpoint, projectRoot, manifestPath)
    const awaited = await awaitSpecJob(endpoint, submitted.job_id)
    const detail = await ky
      .get(`jobs/${submitted.job_id}`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<JobDetailResponse>()

    expect(awaited).toMatchObject({ status: "failed", timed_out: false })
    expect(JSON.stringify(detail.ledger)).toContain("saved provider settings")
    expect(JSON.stringify(detail.ledger)).toContain("RETROSPEC_SPEC_API_KEY")
  })
})

type TestEndpoint = {
  readonly baseUrl: string
  readonly token: string
}

async function submitSpecJob(
  endpoint: TestEndpoint,
  projectRoot: string,
  manifestPath: string,
): Promise<{ readonly job_id: string }> {
  return ky
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
    .json()
}

async function awaitSpecJob(
  endpoint: TestEndpoint,
  jobId: string,
): Promise<{ readonly status: string; readonly timed_out: boolean }> {
  return ky
    .post(`jobs/${jobId}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })
    .json()
}
