import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { loadSpecProviderConfig } from "../src/config"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { selectSpecAnalysisDriver } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 6 provider execution modes", () => {
  test("Given env provider config When spec analysis runs Then provider mode is stored without secrets", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        expect(request.headers.get("authorization")).toBe("Bearer env-secret-key")
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
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
          RETROSPEC_SPEC_PROVIDER_MODE: "env-provider",
          RETROSPEC_SPEC_PROVIDER: "openai",
          RETROSPEC_SPEC_MODEL: "gpt-phase6",
          RETROSPEC_SPEC_API_KEY: "env-secret-key",
          RETROSPEC_SPEC_BASE_URL: `${server.url}v1`,
        }),
      )

      const result = await runSpecAnalysis(paths, driver)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<
            {
              readonly provider_mode: string
              readonly model: string
              readonly retro_handoff_snapshot: string
            },
            [string]
          >(
            "select provider_mode, model, retro_handoff_snapshot from analysis_runs where analysis_run_id = ?",
          )
          .get(result.analysisRunId)

        expect(run?.provider_mode).toBe("env-provider")
        expect(run?.model).toBe("openai:gpt-phase6")
        expect(JSON.stringify(run)).not.toContain("env-secret-key")
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
    }
  })

  test("Given opencode broker config When spec analysis runs Then broker endpoint receives a spec analysis request", async () => {
    const receivedRequests: unknown[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        expect(new URL(request.url).pathname).toBe("/spec/analyze")
        expect(request.headers.get("authorization")).toBe("Bearer broker-token")
        const body = await request.json()
        receivedRequests.push(body)
        return Response.json({
          broker_run_id: "broker-run-1",
          findings: [
            {
              findingId: "risk_broker_1",
              entityId: "entity_provider_1",
              severity: "medium",
              riskType: "broker_review",
              summary: "Broker generated risk",
              evidence: "broker evidence",
              recommendation: "Review broker-backed result.",
            },
          ],
          usage: { promptTokens: 11, completionTokens: 13, totalTokens: 24, costUsd: 0 },
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
          RETROSPEC_SPEC_PROVIDER_MODE: "opencode-broker",
          RETROSPEC_SPEC_MODEL: "openai/gpt-5.5",
          RETROSPEC_SPEC_BROKER_URL: server.url.toString(),
          RETROSPEC_SPEC_BROKER_TOKEN: "broker-token",
        }),
      )

      const result = await runSpecAnalysis(paths, driver)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<
            {
              readonly provider_mode: string
              readonly model: string
              readonly prompt_tokens: number | null
              readonly completion_tokens: number | null
              readonly total_tokens: number | null
            },
            [string]
          >(
            "select provider_mode, model, prompt_tokens, completion_tokens, total_tokens from analysis_runs where analysis_run_id = ?",
          )
          .get(result.analysisRunId)
        const finding = db
          .query<{ readonly risk_type: string; readonly summary: string }, [string]>(
            "select risk_type, summary from risk_findings where analysis_run_id = ?",
          )
          .get(result.analysisRunId)

        expect(receivedRequests).toHaveLength(1)
        expect(receivedRequests[0]).toMatchObject({
          protocol_version: 1,
          analysis_type: "risk",
          prompt_version: "risk-v1",
          model: "openai/gpt-5.5",
        })
        expect(run).toEqual({
          provider_mode: "opencode-broker",
          model: "opencode-broker:openai/gpt-5.5",
          prompt_tokens: 11,
          completion_tokens: 13,
          total_tokens: 24,
        })
        expect(finding).toEqual({ risk_type: "broker_review", summary: "Broker generated risk" })
        expect(JSON.stringify({ run, receivedRequests })).not.toContain("broker-token")
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
    }
  })

  test("Given opencode broker mode without endpoint When config is loaded Then automatic registry use is rejected", () => {
    expect(() =>
      loadSpecProviderConfig({
        RETROSPEC_SPEC_PROVIDER_MODE: "opencode-broker",
        RETROSPEC_SPEC_MODEL: "openai/gpt-5.5",
      }),
    ).toThrow("opencode-broker config requires RETROSPEC_SPEC_BROKER_URL")
  })
})
