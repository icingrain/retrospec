import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
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

describe("analysis launch settings", () => {
  test("Given a saved partial dashboard scope When analysis settings are reopened Then scope settings are restored", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const saved = await ky
      .post("dashboard/analysis/launch-settings", {
        prefixUrl: endpoint.baseUrl,
        headers: { Origin: endpoint.baseUrl },
        json: {
          project_path: projectRoot,
          scope: { mode: "partial", roots: ["src/native"] },
        },
      })
      .json<{ readonly scope: { readonly mode: string; readonly roots: readonly string[] } }>()

    const html = await ky
      .get("dashboard/analysis/settings", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(saved.scope).toEqual({ mode: "partial", roots: ["src/native"] })
    expect(html).toContain('name="scope_mode" value="partial" checked')
    expect(html).toContain(
      'value="src/native" data-folder-checkbox aria-label="Select src/native and child folders" checked',
    )
    expect(html).toContain("Saved scope")
    expect(html).toContain(
      '<span class="fact-value mono" data-saved-scope-status>src/native</span>',
    )
    expect(html).toContain("data-save-scope")
    expect(html).not.toContain("data-edit-scope")
    expect(html.indexOf('data-gqo-id="daemon-dashboard.analysis-launch.scope"')).toBeLessThan(
      html.indexOf("data-save-scope"),
    )
    expect(html.indexOf("data-save-scope")).toBeLessThan(
      html.indexOf('data-gqo-id="daemon-dashboard.analysis-launch.run-plan"'),
    )
  })

  test("Given saved dashboard scope and no direct Spec scope When Spec job is submitted Then confirmation is required before using saved scope", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })
    await ky.post("dashboard/analysis/launch-settings", {
      prefixUrl: endpoint.baseUrl,
      headers: { Origin: endpoint.baseUrl },
      json: {
        project_path: projectRoot,
        scope: { mode: "partial", roots: ["src/native"] },
      },
    })

    const crossOriginSave = await ky.post("dashboard/analysis/launch-settings", {
      prefixUrl: endpoint.baseUrl,
      headers: { Origin: "https://example.invalid" },
      throwHttpErrors: false,
      json: {
        project_path: projectRoot,
        scope: { mode: "full", roots: [] },
      },
    })
    const blocked = await ky.post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      throwHttpErrors: false,
      json: {
        project_path: projectRoot,
        actor: "spec",
        category: "risk",
        manifest_path: manifestPath,
      },
    })
    const blockedBody = await blocked.json<{
      readonly confirmation: {
        readonly kind: string
        readonly scope: { readonly mode: string; readonly roots: readonly string[] }
      }
    }>()
    const confirmed = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "spec",
          category: "risk",
          manifest_path: manifestPath,
          confirm_saved_scope: true,
        },
      })
      .json<{ readonly status: string }>()

    expect(crossOriginSave.status).toBe(403)
    expect(blocked.status).toBe(409)
    expect(blockedBody.confirmation.kind).toBe("saved_analysis_scope")
    expect(blockedBody.confirmation.scope).toEqual({ mode: "partial", roots: ["src/native"] })
    expect(confirmed.status).toBe("queued")
  })
})
