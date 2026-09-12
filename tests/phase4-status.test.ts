import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { runRetroInventory } from "../src/retro/run"
import { analysisStatusResponseSchema } from "../src/schemas"
import type { AnalysisStatusResponse } from "../src/types"
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

describe("Phase 4 analysis status", () => {
  test("Given legacy retro status rows When parsed by the client schema Then metadata defaults preserve status output", () => {
    const status = analysisStatusResponseSchema.parse({
      retro: [
        {
          category: "symbols",
          status: "ready_for_analysis",
          entity_count: 1,
          completed_at: "2026-08-27T00:00:00.000Z",
        },
      ],
      spec: [],
    })

    expect(status.retro[0]).toMatchObject({
      parser_backend: "unknown",
      support_level: "unsupported",
      evidence_label: "AMBIGUOUS",
      missing_capability: null,
      coverage_summary_json: "{}",
      scope_mode: "full",
      scope_roots_json: "[]",
      scope_fingerprint: "",
    })
  })

  test("Given completed spec analysis When status is requested Then spec run is returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeSpecManifest(projectRoot)
    await submitSpecAndAwait(endpoint, projectRoot, manifestPath, "completed")

    const status = await ky
      .get("analysis/status", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<AnalysisStatusResponse>()

    expect(status.spec).toHaveLength(1)
    expect(status.spec[0]).toMatchObject({
      analysis_type: "risk",
      status: "completed",
      model: "deterministic-risk-v1",
      prompt_version: "risk-v1",
      preflight_status: "limited",
      review_needed: true,
      coverage_languages: ["c", "java"],
      coverage_modes: ["regex"],
      missing_capabilities: [],
    })
  })
})
