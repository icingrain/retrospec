import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { loadSpecProviderConfig } from "../src/config"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { type SpecAnalysisDriver, selectSpecAnalysisDriver } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 11.1 spec analysis driver", () => {
  test("Given a custom spec analysis driver When spec analysis runs Then driver metadata and findings are stored", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const driver: SpecAnalysisDriver = {
      model: "custom-provider-model",
      promptVersion: "risk-custom-v1",
      analyze: (input) => ({
        findings: [
          {
            findingId: "risk_custom_1",
            entityId: input.entities[0]?.entityId ?? "missing-entity",
            severity: "medium",
            riskType: "driver_review",
            summary: "Driver-generated review finding",
            evidence: "custom driver evidence",
            recommendation: "Review provider-backed finding before migration.",
          },
        ],
      }),
    }

    const result = await runSpecAnalysis(paths, driver)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const run = db
        .query<
          { readonly model: string; readonly prompt_version: string; readonly status: string },
          [string]
        >("select model, prompt_version, status from analysis_runs where analysis_run_id = ?")
        .get(result.analysisRunId)
      const finding = db
        .query<
          { readonly risk_type: string; readonly severity: string; readonly summary: string },
          [string]
        >("select risk_type, severity, summary from risk_findings where analysis_run_id = ?")
        .get(result.analysisRunId)

      expect(result.findingCount).toBe(1)
      expect(run).toEqual({
        model: "custom-provider-model",
        prompt_version: "risk-custom-v1",
        status: "completed",
      })
      expect(finding).toEqual({
        risk_type: "driver_review",
        severity: "medium",
        summary: "Driver-generated review finding",
      })
    } finally {
      db.close()
    }
  })

  test("Given provider base URL When spec analysis runs Then provider response findings and usage are stored", async () => {
    const receivedRequests: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        receivedRequests.push(await request.text())
        expect(request.headers.get("authorization")).toBe("Bearer test-key")
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  findings: [
                    {
                      findingId: "risk_provider_1",
                      entityId: "entity_provider_1",
                      severity: "high",
                      riskType: "provider_review",
                      summary: "Provider generated risk",
                      evidence: "provider evidence",
                      recommendation: "Review provider-backed result.",
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 21, completion_tokens: 9, total_tokens: 30 },
        })
      },
    })

    try {
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      const paths = projectPaths(projectRoot)
      const driver = selectSpecAnalysisDriver(
        loadSpecProviderConfig({
          RETROSPEC_SPEC_PROVIDER: "openai",
          RETROSPEC_SPEC_MODEL: "gpt-test",
          RETROSPEC_SPEC_API_KEY: "test-key",
          RETROSPEC_SPEC_BASE_URL: `${server.url}v1`,
        }),
      )

      const result = await runSpecAnalysis(paths, driver)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<
            {
              readonly prompt_tokens: number | null
              readonly completion_tokens: number | null
              readonly total_tokens: number | null
              readonly cost_usd: number | null
              readonly status: string
            },
            [string]
          >(
            "select prompt_tokens, completion_tokens, total_tokens, cost_usd, status from analysis_runs where analysis_run_id = ?",
          )
          .get(result.analysisRunId)
        const finding = db
          .query<
            { readonly risk_type: string; readonly severity: string; readonly summary: string },
            [string]
          >("select risk_type, severity, summary from risk_findings where analysis_run_id = ?")
          .get(result.analysisRunId)

        expect(receivedRequests).toHaveLength(1)
        expect(receivedRequests[0]?.includes("gpt-test")).toBe(true)
        expect(run).toEqual({
          prompt_tokens: 21,
          completion_tokens: 9,
          total_tokens: 30,
          cost_usd: 0,
          status: "completed",
        })
        expect(finding).toEqual({
          risk_type: "provider_review",
          severity: "high",
          summary: "Provider generated risk",
        })
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
    }
  })

  test("Given provider invalid JSON When spec analysis runs Then failed run stores partial provider output", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          choices: [{ message: { content: '{"findings":[{"findingId":"risk_broken"}]' } }],
          usage: { prompt_tokens: 13, completion_tokens: 7, total_tokens: 20 },
        })
      },
    })

    try {
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      const paths = projectPaths(projectRoot)
      const driver = selectSpecAnalysisDriver(
        loadSpecProviderConfig({
          RETROSPEC_SPEC_PROVIDER: "openai",
          RETROSPEC_SPEC_MODEL: "gpt-test",
          RETROSPEC_SPEC_API_KEY: "test-key",
          RETROSPEC_SPEC_BASE_URL: `${server.url}v1`,
        }),
      )

      await expect(runSpecAnalysis(paths, driver)).rejects.toThrow(
        "provider returned invalid findings JSON",
      )

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<
            {
              readonly status: string
              readonly prompt_tokens: number | null
              readonly completion_tokens: number | null
              readonly total_tokens: number | null
              readonly cost_usd: number | null
              readonly partial_result: string | null
              readonly error_message: string | null
            },
            []
          >(
            "select status, prompt_tokens, completion_tokens, total_tokens, cost_usd, partial_result, error_message from analysis_runs",
          )
          .get()

        expect(run).toEqual({
          status: "failed",
          prompt_tokens: 13,
          completion_tokens: 7,
          total_tokens: 20,
          cost_usd: 0,
          partial_result: '{"findings":[{"findingId":"risk_broken"}]',
          error_message: "provider returned invalid findings JSON",
        })
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
    }
  })
})
