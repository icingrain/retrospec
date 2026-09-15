import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { projectPaths } from "../src/paths"
import { writeSpecProviderSettings } from "../src/provider-settings"
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

describe("Phase 18 provider API key settings", () => {
  test("Given env provider API key from dashboard When provider settings are saved Then responses only expose masked key state", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    const saveResponse = await ky
      .post("dashboard/analysis/provider-settings", {
        prefixUrl: endpoint.baseUrl,
        headers: { Origin: endpoint.baseUrl },
        json: {
          project_path: projectRoot,
          settings: {
            mode: "env-provider",
            provider: "openai",
            model: "gpt-dashboard",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "dashboard-secret-key",
          },
        },
      })
      .json()

    const readResponse = await ky
      .get("dashboard/analysis/provider-settings", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .json()
    const updateResponse = await ky
      .post("dashboard/analysis/provider-settings", {
        prefixUrl: endpoint.baseUrl,
        headers: { Origin: endpoint.baseUrl },
        json: {
          project_path: projectRoot,
          settings: {
            mode: "env-provider",
            provider: "openai",
            model: "gpt-dashboard-updated",
            baseUrl: "https://api.openai.com/v1",
          },
        },
      })
      .json()

    expect(saveResponse).toMatchObject({
      settings: {
        mode: "env-provider",
        provider: "openai",
        model: "gpt-dashboard",
        hasApiKey: true,
      },
    })
    expect(readResponse).toMatchObject({ settings: { mode: "env-provider", hasApiKey: true } })
    expect(updateResponse).toMatchObject({
      settings: { mode: "env-provider", model: "gpt-dashboard-updated", hasApiKey: true },
    })
    expect(JSON.stringify({ saveResponse, readResponse, updateResponse })).not.toContain(
      "dashboard-secret-key",
    )
  })

  test("Given saved env provider API key When analysis settings opens Then API key field is masked without exposing the secret", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await writeSpecProviderSettings(projectPaths(projectRoot), {
      mode: "env-provider",
      provider: "openai",
      model: "gpt-dashboard",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "saved-dashboard-secret",
    })
    const endpoint = await daemonEndpoint(runtime)
    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky
      .get("dashboard/analysis/settings", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain('name="provider_api_key"')
    expect(html).toContain('placeholder="••••••••"')
    expect(html).toContain("API key saved: ••••••••")
    expect(html).not.toContain("saved-dashboard-secret")
  })
})
