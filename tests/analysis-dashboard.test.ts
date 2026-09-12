import { afterEach, describe, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import ky from "ky"
import { renderDashboardAnalysisPage } from "../src/dashboard-analysis"
import { writeOtherAnalysis } from "../src/other-analysis"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import {
  daemonEndpoint,
  stopDaemons,
  submitSpecAndAwait,
  tempProject,
  tempRuntime,
  writeSampleProject,
  writeSpecManifest,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("analysis dashboard", () => {
  test("Given a selected project When dashboard overview is opened Then analysis opens as drill-down", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl }).text()

    expect(html).toContain("Open analysis")
    expect(html).toContain("Open analysis settings")
    expect(html).toContain(`/dashboard/analysis?project_path=${encodeURIComponent(projectRoot)}`)
    expect(html).toContain(
      `/dashboard/analysis/settings?project_path=${encodeURIComponent(projectRoot)}`,
    )
  })

  test("Given a registered project whose analysis DBs were deleted When analysis dashboard is opened Then empty state renders", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })
    await rm(projectPaths(projectRoot).stateDir, { recursive: true, force: true })

    const response = await ky.get("dashboard/analysis", {
      prefixUrl: endpoint.baseUrl,
      searchParams: { project_path: projectRoot },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("No retro handoff rows yet")
  })

  test("Given retro and spec statuses When analysis dashboard is opened Then handoff and spec runs are visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    await writeOtherAnalysis(projectPaths(projectRoot), {
      sourceFingerprint: "phase9-dashboard-fingerprint",
      records: [
        {
          language: "typescript",
          category: "call_graph",
          supportLevel: "unsupported",
          evidenceLabel: "AMBIGUOUS",
          missingCapability: "missing_capability",
          filePath: "src/example.ts",
          reason: "reason",
        },
      ],
    })
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)
    await submitSpecAndAwait(endpoint, projectRoot, manifestPath, "completed")

    const html = await ky
      .get("dashboard/analysis", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Analysis status")
    expect(html).toContain("Retro handoff")
    expect(html).toContain("structure")
    expect(html).toContain("symbols")
    expect(html).toContain("ready_for_analysis")
    expect(html).toContain("2 entities")
    expect(html).toContain("3 entities")
    expect(html).toContain("Spec runs")
    expect(html).toContain("risk")
    expect(html).toContain("completed")
    expect(html).toContain("deterministic-risk-v1")
    expect(html).toContain("risk-v1")
    expect(html).toContain("Analysis confidence")
    expect(html).toContain("Coverage and fallback evidence")
    expect(html).toContain("Use this section to decide which analysis results are source-backed")
    expect(html).toContain("C")
    expect(html).toContain("Java")
    expect(html).toContain("TypeScript")
    expect(html).toContain("high-confidence")
    expect(html).toContain("Source-backed parser coverage for this language or category.")
    expect(html).toContain("best-effort")
    expect(html).toContain(
      "Reduced-confidence coverage; use the evidence label before relying on it.",
    )
    expect(html).toContain("unsupported")
    expect(html).toContain("Not analyzed as successful coverage; recorded as fallback evidence.")
    expect(html).toContain("EXTRACTED")
    expect(html).toContain("Direct source evidence was captured.")
    expect(html).toContain("INFERRED")
    expect(html).toContain("Evidence was derived from a supported approximation.")
    expect(html).toContain("AMBIGUOUS")
    expect(html).toContain("Evidence is incomplete or has multiple possible interpretations.")
    expect(html).toContain("fallback-evidence-card")
    expect(html).toContain("1 fallback evidence row in .retrospec/retro/other.db")
    expect(html).toContain(".retrospec/retro/other.db")
    expect(html).toContain("missing_capability")
    expect(html).toContain("reason")
  })

  test("Given source folders and scoped runs When analysis dashboard is opened Then launch controls are visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    await runRetroInventory(projectRoot, { mode: "partial", roots: ["src/native"] })
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

    expect(html).toContain("Analysis settings")
    expect(html).toContain("Open settings")
    expect(html).toContain(
      `/dashboard/analysis/settings?project_path=${encodeURIComponent(projectRoot)}`,
    )
    expect(html).toContain("Saved scope")
    expect(html).toContain("Provider")
    expect(html).not.toContain("Scope selection")
    expect(html).not.toContain("data-folder-tree")
    expect(html).not.toContain('name="provider_mode"')
    expect(html).not.toContain("Save provider settings")
    expect(html).not.toContain("data-save-scope")
    expect(html).not.toContain(
      "Save to reuse this scope for Spec requests without a direct selection.",
    )
    expect(html).not.toContain("Current selection:")
    expect(html).not.toContain("Scope preview")
    expect(html).not.toContain("data-scope-preview")
    expect(html).not.toContain("Retro input: automatic")
    expect(html).not.toContain("Advanced Retro input")
    expect(html).not.toContain('name="retro_input"')
    expect(html).not.toContain('name="partial_retro_run"')
    expect(html).not.toContain("<legend>Retro input selector</legend>")
    expect(html).not.toContain('name="spec_template"')
    expect(html).not.toContain("This partial run will not replace the full canonical result.")
  })

  test("Given source folders When analysis settings page is opened Then launch controls are editable there", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
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

    expect(html).toContain("Analysis settings")
    expect(html).toContain("Back to analysis")
    expect(html).toContain("Analysis launch plan")
    expect(html).toContain("Scope selection")
    expect(html).toContain("Analysis / Provider settings")
    expect(html).toContain("Scope exclusions")
    expect(html).toContain("Analysis execution metadata")
    expect(html).toContain("data-launch-execution-summary")
    expect(html.indexOf("Scope exclusions")).toBeLessThan(
      html.indexOf("Analysis / Provider settings"),
    )
    expect(html.indexOf("Batch size")).toBeGreaterThan(html.indexOf("Analysis / Provider settings"))
    expect(html.indexOf("Provider settings")).toBeLessThan(
      html.indexOf("Analysis execution metadata"),
    )
    expect(html.indexOf("data-save-provider")).toBeGreaterThan(
      html.indexOf("Analysis execution metadata"),
    )
    expect(html).toContain("Sent with Retro and Spec jobs as effective launch metadata.")
    expect(html).toContain("Provider settings")
    expect(html).toContain("Saved provider settings")
    expect(html).not.toContain("Provider confirmation")
    expect(html).not.toContain("Credential policy")
    expect(html).not.toContain("Use this setting")
    expect(html).not.toContain("data-provider-confirmation")
    expect(html).toContain("data-folder-tree")
    expect(html).toContain('data-folder-path="src"')
    expect(html).toContain('name="provider_mode" value="opencode-broker"')
    expect(html).toContain("data-save-scope>Save</button>")
    expect(html).toContain("data-save-provider>Save</button>")
  })

  test("Given no selected project When analysis dashboard is rendered Then confidence empty state is explicit", () => {
    const html = renderDashboardAnalysisPage({
      selectedProjectPath: null,
      retro: [],
      spec: [],
      languageCoverage: null,
      launch: {
        folders: [],
        retroRuns: [],
        specTemplates: [],
        savedSettings: null,
        providerSettings: null,
        brokerHealth: { status: "not-configured", messages: ["Broker mode is not selected."] },
      },
      brokerHealth: { status: "not-configured", messages: ["Broker mode is not selected."] },
    })

    expect(html).toContain("Analysis confidence")
    expect(html).toContain(
      "Select a project to review analysis confidence, language/category coverage, and fallback evidence.",
    )
  })
})
