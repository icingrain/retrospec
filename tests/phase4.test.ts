import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { analyzeSpecRisk } from "../src/spec/analyze"
import { requireReadyRetroHandoffs } from "../src/spec/curator"
import { buildSpecBatchInput } from "../src/spec/input"
import { runSpecAnalysis } from "../src/spec/run"
import { beginSpecAnalysisRun, completeSpecAnalysisRun, writeRiskFindings } from "../src/spec/store"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 4 spec analysis store", () => {
  test("Given a project When a spec analysis run is completed Then ai_analysis.db records run metadata", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    const run = await beginSpecAnalysisRun(paths, {
      analysisType: "risk",
      inputCategories: ["structure", "symbols"],
      model: "deterministic-risk-v1",
      promptVersion: "risk-v1",
      retroHandoffSnapshot: JSON.stringify([{ category: "structure" }, { category: "symbols" }]),
    })
    await completeSpecAnalysisRun(paths, run.analysisRunId)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const row = db
        .query<
          {
            readonly analysis_run_id: string
            readonly analysis_type: string
            readonly input_categories: string
            readonly model: string
            readonly prompt_version: string
            readonly status: string
            readonly completed_at: string | null
          },
          []
        >(
          `select analysis_run_id, analysis_type, input_categories, model, prompt_version, status, completed_at
           from analysis_runs`,
        )
        .get()

      expect(row).toMatchObject({
        analysis_run_id: run.analysisRunId,
        analysis_type: "risk",
        input_categories: JSON.stringify(["structure", "symbols"]),
        model: "deterministic-risk-v1",
        prompt_version: "risk-v1",
        status: "completed",
      })
      expect(row?.completed_at).toBeString()
      expect(
        db
          .query<{ readonly name: string }, []>(
            "select name from sqlite_master where type = 'table' and name = 'risk_findings'",
          )
          .get(),
      ).toEqual({ name: "risk_findings" })
    } finally {
      db.close()
    }
  })

  test("Given no retro handoff When Curator checks required categories Then spec analysis is blocked", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await expect(requireReadyRetroHandoffs(paths, ["structure", "symbols"])).rejects.toThrow(
      "retro handoff is not ready: structure",
    )
  })

  test("Given ready retro handoffs When Curator checks required categories Then snapshots are returned", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const snapshots = await requireReadyRetroHandoffs(paths, ["structure", "symbols"])

    expect(snapshots.map((snapshot) => snapshot.category)).toEqual(["structure", "symbols"])
    expect(snapshots.every((snapshot) => snapshot.status === "ready_for_analysis")).toBe(true)
    expect(snapshots.every((snapshot) => snapshot.entityCount > 0)).toBe(true)
  })

  test("Given ready retro inventory When spec batch input is built Then only ready category entities are included", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const input = await buildSpecBatchInput(paths, ["structure", "symbols"])

    expect(input.handoffs.map((handoff) => handoff.category)).toEqual(["structure", "symbols"])
    expect(input.entities.map((entity) => entity.sourceCategory)).toContain("structure")
    expect(input.entities.map((entity) => entity.sourceCategory)).toContain("symbols")
    expect(input.entities.every((entity) => entity.filePath.length > 0)).toBe(true)
  })

  test("Given no retro handoff When spec batch input is built Then Curator blocker is propagated", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await expect(buildSpecBatchInput(paths, ["structure"])).rejects.toThrow(
      "retro handoff is not ready: structure",
    )
  })

  test("Given spec batch input When deterministic risk analysis runs Then findings are stored", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const input = await buildSpecBatchInput(paths, ["structure", "symbols"])
    const run = await beginSpecAnalysisRun(paths, {
      analysisType: "risk",
      inputCategories: ["structure", "symbols"],
      model: "deterministic-risk-v1",
      promptVersion: "risk-v1",
      retroHandoffSnapshot: JSON.stringify(input.handoffs),
    })

    const findings = analyzeSpecRisk(input)
    await writeRiskFindings(paths, run.analysisRunId, findings)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const row = db
        .query<
          {
            readonly analysis_run_id: string
            readonly severity: string
            readonly risk_type: string
            readonly summary: string
          },
          []
        >("select analysis_run_id, severity, risk_type, summary from risk_findings")
        .get()

      expect(findings.length).toBeGreaterThan(0)
      expect(row).toMatchObject({
        analysis_run_id: run.analysisRunId,
        severity: "low",
        risk_type: "inventory_review",
      })
      expect(row?.summary).toContain("Review")
    } finally {
      db.close()
    }
  })

  test("Given ready retro inventory When spec analysis runs Then completed run and findings are stored", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const result = await runSpecAnalysis(paths)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const row = db
        .query<{ readonly status: string }, [string]>(
          "select status from analysis_runs where analysis_run_id = ?",
        )
        .get(result.analysisRunId)
      const findingCount = db
        .query<{ readonly count: number }, [string]>(
          "select count(*) as count from risk_findings where analysis_run_id = ?",
        )
        .get(result.analysisRunId)

      expect(result.findingCount).toBeGreaterThan(0)
      expect(row).toEqual({ status: "completed" })
      expect(findingCount?.count).toBe(result.findingCount)
    } finally {
      db.close()
    }
  })

  test("Given no retro handoff When spec analysis runs Then Curator blocker is propagated", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await expect(runSpecAnalysis(paths)).rejects.toThrow("retro handoff is not ready: structure")
  })
})
