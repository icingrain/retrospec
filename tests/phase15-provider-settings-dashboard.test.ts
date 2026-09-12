import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { projectPaths } from "../src/paths"
import { readSpecProviderSettings } from "../src/provider-settings"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 15 dashboard provider settings", () => {
  test("Given dashboard provider settings request When settings are saved Then API persists non-secret config", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .post("dashboard/analysis/provider-settings", {
        prefixUrl: endpoint.baseUrl,
        headers: { Origin: endpoint.baseUrl },
        json: {
          project_path: projectRoot,
          settings: {
            mode: "opencode-broker",
            model: "openai/gpt-5.5",
            brokerUrl: "http://127.0.0.1:9000",
          },
        },
      })
      .json()

    expect(response).toMatchObject({
      settings: {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: "http://127.0.0.1:9000",
        secretSource: "env",
      },
      resolved: { source: "saved", readiness: "ready" },
    })
    expect(JSON.stringify(response)).not.toContain("RETROSPEC_SPEC_BROKER_TOKEN")
    expect(await readSpecProviderSettings(projectPaths(projectRoot))).toMatchObject({
      settings: { mode: "opencode-broker" },
    })
  })

  test("Given saved provider settings When analysis pages open Then dashboard summarizes and settings form shows current values", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })
    await ky.post("dashboard/analysis/provider-settings", {
      prefixUrl: endpoint.baseUrl,
      headers: { Origin: endpoint.baseUrl },
      json: {
        project_path: projectRoot,
        settings: {
          mode: "opencode-broker",
          model: "openai/gpt-5.5",
          brokerUrl: "http://127.0.0.1:9000",
        },
      },
    })

    const dashboardHtml = await ky
      .get("dashboard/analysis", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(dashboardHtml).toContain("Analysis settings")
    expect(dashboardHtml).toContain("Provider")
    expect(dashboardHtml).toContain("opencode-broker · openai/gpt-5.5 · http://127.0.0.1:9000")
    expect(dashboardHtml).toContain(
      `/dashboard/analysis/settings?project_path=${encodeURIComponent(projectRoot)}`,
    )
    expect(dashboardHtml).not.toContain("data-provider-settings")

    const html = await ky
      .get("dashboard/analysis/settings", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Provider settings")
    expect(html).toContain("data-provider-settings")
    expect(html).toContain('name="provider_model" value="openai/gpt-5.5"')
    expect(html).toContain('name="broker_url" value="http://127.0.0.1:9000"')
    expect(html).toContain('data-provider-visible-modes="env-provider opencode-broker"')
    expect(html).toContain('data-provider-visible-modes="opencode-broker"')
    expect(html).toContain("updateProviderFields()")
    expect(html).toContain('name="provider_mode" value="opencode-broker" checked')
    expect(html).toContain(
      'class="launch-settings-button" type="button" data-save-provider>Save</button>',
    )
    expect(html).toContain("Saved provider settings")
    expect(html).toContain('class="fact-value mono" data-provider-settings-status')
    expect(html).toContain("opencode-broker · openai/gpt-5.5 · http://127.0.0.1:9000")
    expect(html).not.toContain("data-provider-mode-note")
    expect(html).not.toContain(
      "OpenCode broker mode uses model plus broker URL; provider identity and secrets stay outside the dashboard.",
    )
    expect(html).toContain(".provider-save-actions")
    expect(html).toContain("justify-content: flex-end")
  })
})
