import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { createOpencodeBrokerApp } from "../src/opencode-broker"
import { projectPaths } from "../src/paths"
import { writeSpecProviderSettings } from "../src/provider-settings"
import { runRetroInventory } from "../src/retro/run"
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

describe("Phase 18 provider operations tracing", () => {
  test("Given empty broker settings When provider settings are saved Then the API returns a validation response", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.post("dashboard/analysis/provider-settings", {
      prefixUrl: endpoint.baseUrl,
      headers: { Origin: endpoint.baseUrl },
      throwHttpErrors: false,
      json: {
        project_path: projectRoot,
        settings: { mode: "opencode-broker", model: "", brokerUrl: "http://127.0.0.1:9000" },
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "invalid provider settings" })
  })

  test("Given broker defaults from the dashboard When provider settings are saved Then broker mode persists", async () => {
    const broker = Bun.serve({ port: 0, fetch: createOpencodeBrokerApp({ version: "test" }).fetch })
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    try {
      const response = await ky
        .post("dashboard/analysis/provider-settings", {
          prefixUrl: endpoint.baseUrl,
          headers: { Origin: endpoint.baseUrl },
          json: {
            project_path: projectRoot,
            settings: {
              mode: "opencode-broker",
              model: "openai/gpt-5.5",
              brokerUrl: broker.url.toString(),
            },
          },
        })
        .json()

      expect(response).toMatchObject({
        settings: {
          mode: "opencode-broker",
          model: "openai/gpt-5.5",
          brokerUrl: broker.url.toString(),
        },
        resolved: { broker_health: { status: "up", version: "test" } },
      })
    } finally {
      broker.stop(true)
    }
  })

  test("Given saved broker settings When provider settings API is read Then broker health is reported", async () => {
    const broker = Bun.serve({ port: 0, fetch: createOpencodeBrokerApp({ version: "test" }).fetch })
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    await writeSpecProviderSettings(projectPaths(projectRoot), {
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: broker.url.toString(),
    })

    try {
      const response = await ky
        .get("dashboard/analysis/provider-settings", {
          prefixUrl: endpoint.baseUrl,
          searchParams: { project_path: projectRoot },
        })
        .json()

      expect(response).toMatchObject({
        resolved: {
          readiness: "ready",
          broker_health: { status: "up", version: "test" },
        },
      })
    } finally {
      broker.stop(true)
    }
  })

  test("Given saved broker settings with down broker When analysis dashboard opens Then provider diagnostics are visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await writeSpecProviderSettings(projectPaths(projectRoot), {
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: "http://127.0.0.1:1",
    })
    const endpoint = await daemonEndpoint(runtime)
    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky
      .get("dashboard/analysis", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Provider operations")
    expect(html).toContain("Broker health")
    expect(html).toContain("down")
    expect(html).toContain("http://127.0.0.1:1")
    expect(html).toContain("retrospec opencode-broker")
  })

  test("Given saved broker settings When analysis settings opens Then provider status is secret-safe", async () => {
    const previousBrokerToken = process.env["RETROSPEC_SPEC_BROKER_TOKEN"]
    process.env["RETROSPEC_SPEC_BROKER_TOKEN"] = "phase4-secret-token"
    const broker = Bun.serve({ port: 0, fetch: createOpencodeBrokerApp({ version: "test" }).fetch })
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await writeSpecProviderSettings(projectPaths(projectRoot), {
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: broker.url.toString(),
    })
    const endpoint = await daemonEndpoint(runtime)
    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    try {
      const html = await ky
        .get("dashboard/analysis/settings", {
          prefixUrl: endpoint.baseUrl,
          searchParams: { project_path: projectRoot },
        })
        .text()

      expect(html).toContain("opencode-broker · openai/gpt-5.5")
      expect(html).toContain(broker.url.toString())
      expect(html).not.toContain("Provider confirmation")
      expect(html).not.toContain("data-provider-confirmation")
      expect(html).not.toContain("Credential policy")
      expect(html).not.toContain("phase4-secret-token")
    } finally {
      broker.stop(true)
      restoreEnv("RETROSPEC_SPEC_BROKER_TOKEN", previousBrokerToken)
    }
  })

  test("Given broker returns trace id When saved broker job completes Then analysis status exposes broker run id", async () => {
    const previousBrokerToken = process.env["RETROSPEC_SPEC_BROKER_TOKEN"]
    process.env["RETROSPEC_SPEC_BROKER_TOKEN"] = "trace-token"
    const broker = Bun.serve({
      port: 0,
      fetch(request) {
        expect(request.headers.get("authorization")).toBe("Bearer trace-token")
        return Response.json({
          broker_run_id: "brun_trace_1",
          findings: [],
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, costUsd: 0 },
        })
      },
    })

    try {
      const runtime = await tempRuntime()
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      await writeSpecProviderSettings(projectPaths(projectRoot), {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: broker.url.toString(),
      })
      const endpoint = await daemonEndpoint(runtime)
      const submitted = await submitSpecJob(
        endpoint,
        projectRoot,
        await writeSpecManifest(projectRoot),
      )
      const awaited = await awaitSpecJob(endpoint, submitted.job_id)
      const status = await ky
        .get("analysis/status", {
          prefixUrl: endpoint.baseUrl,
          headers: { Authorization: `Bearer ${endpoint.token}` },
          searchParams: { project_path: projectRoot },
        })
        .json()

      expect(awaited).toMatchObject({ status: "completed", timed_out: false })
      expect(status).toMatchObject({ spec: [{ broker_run_id: "brun_trace_1" }] })
    } finally {
      broker.stop(true)
      restoreEnv("RETROSPEC_SPEC_BROKER_TOKEN", previousBrokerToken)
    }
  })

  test("Given broker returns invalid findings When job fails Then partial result and error are inspectable", async () => {
    const broker = Bun.serve({
      port: 0,
      fetch() {
        return Response.json(
          {
            error: "broker returned invalid findings JSON",
            broker_run_id: "brun_invalid_1",
            partialResult: "not-json",
          },
          { status: 502 },
        )
      },
    })

    try {
      const runtime = await tempRuntime()
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      await writeSpecProviderSettings(projectPaths(projectRoot), {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: broker.url.toString(),
      })
      const endpoint = await daemonEndpoint(runtime)
      const submitted = await submitSpecJob(
        endpoint,
        projectRoot,
        await writeSpecManifest(projectRoot),
      )
      const awaited = await awaitSpecJob(endpoint, submitted.job_id)
      const db = new Database(projectPaths(projectRoot).specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<
            {
              readonly broker_run_id: string | null
              readonly partial_result: string | null
              readonly error_message: string | null
            },
            []
          >(
            "select broker_run_id, partial_result, error_message from analysis_runs order by started_at desc limit 1",
          )
          .get()

        expect(awaited).toMatchObject({ status: "failed", timed_out: false })
        expect(run).toEqual({
          broker_run_id: "brun_invalid_1",
          partial_result: "not-json",
          error_message: "broker returned invalid findings JSON",
        })
      } finally {
        db.close()
      }
    } finally {
      broker.stop(true)
    }
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name)
    return
  }
  process.env[name] = value
}
