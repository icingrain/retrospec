import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { type SpecAnalysisDriver, SpecAnalysisDriverError } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 11.3 spec analysis metadata", () => {
  test("Given driver usage metadata When spec analysis completes Then token cost metadata is stored", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const driver: SpecAnalysisDriver = {
      model: "provider:gpt-test",
      promptVersion: "risk-v1",
      analyze: (input) => ({
        findings: [
          {
            findingId: "risk_usage_1",
            entityId: input.entities[0]?.entityId ?? "missing-entity",
            severity: "low",
            riskType: "metadata_capture",
            summary: "Usage metadata was captured",
            evidence: "driver returned usage metadata",
            recommendation: "Persist prompt and completion usage with the analysis run.",
          },
        ],
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20, costUsd: 0.0004 },
      }),
    }

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

      expect(run).toEqual({
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
        cost_usd: 0.0004,
        status: "completed",
      })
    } finally {
      db.close()
    }
  })

  test("Given provider failure with partial output When spec analysis runs Then failed run keeps partial metadata", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const driver: SpecAnalysisDriver = {
      model: "provider:gpt-test",
      promptVersion: "risk-v1",
      analyze: (input) => {
        throw new SpecAnalysisDriverError("provider returned invalid JSON", {
          findings: [
            {
              findingId: "risk_partial_1",
              entityId: input.entities[0]?.entityId ?? "missing-entity",
              severity: "medium",
              riskType: "partial_output",
              summary: "Partial provider output was recoverable",
              evidence: "provider emitted one valid finding before failure",
              recommendation: "Review partial output before rerunning provider analysis.",
            },
          ],
          partialResult: '{"findings":[{"finding_id":"risk_partial_1"}]',
          usage: { promptTokens: 30, completionTokens: 14, totalTokens: 44, costUsd: 0.0011 },
        })
      },
    }

    await expect(runSpecAnalysis(paths, driver)).rejects.toThrow("provider returned invalid JSON")

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
      const findingCount = db
        .query<{ readonly count: number }, []>("select count(*) as count from risk_findings")
        .get()

      expect(run).toEqual({
        status: "failed",
        prompt_tokens: 30,
        completion_tokens: 14,
        total_tokens: 44,
        cost_usd: 0.0011,
        partial_result: '{"findings":[{"finding_id":"risk_partial_1"}]',
        error_message: "provider returned invalid JSON",
      })
      expect(findingCount).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })

  test("Given repeated spec analysis in one project When runs start close together Then run ids do not collide", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const first = await runSpecAnalysis(paths)
    const second = await runSpecAnalysis(paths)

    expect(first.analysisRunId).not.toBe(second.analysisRunId)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const runCount = db
        .query<{ readonly count: number }, []>("select count(*) as count from analysis_runs")
        .get()
      const findingCounts = db
        .query<{ readonly analysis_run_id: string; readonly count: number }, []>(
          `select analysis_run_id, count(*) as count
           from risk_findings
           group by analysis_run_id
           order by analysis_run_id`,
        )
        .all()

      expect(runCount).toEqual({ count: 2 })
      expect(findingCounts).toEqual(
        [
          { analysis_run_id: first.analysisRunId, count: first.findingCount },
          { analysis_run_id: second.analysisRunId, count: second.findingCount },
        ].toSorted((left, right) => left.analysis_run_id.localeCompare(right.analysis_run_id)),
      )
    } finally {
      db.close()
    }
  })
})
