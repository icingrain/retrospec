import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { projectPaths } from "../src/paths"
import { decideSpecRequestRoute } from "../src/spec/routing"
import {
  beginSpecAnalysisRun,
  writeMigrationFindings,
  writeMigrationGroups,
  writeSummarySections,
} from "../src/spec/store"
import { tempProject } from "./phase3-helpers"

describe("Phase 4 spec routing and durable schema", () => {
  test("Given durable migration metadata When a spec run starts Then analysis type and template metadata are stored", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    const run = await beginSpecAnalysisRun(paths, {
      analysisType: "migration",
      templateId: "migration.v1",
      providerMode: "env-provider",
      inputCategories: ["structure", "symbols"],
      model: "openai:gpt-5.5",
      promptVersion: "migration-v1",
      retroHandoffSnapshot: JSON.stringify({ handoffs: [], preflight: { status: "ready" } }),
      inputRetroRuns: ["retro_full_1"],
    })

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const row = db
        .query<
          {
            readonly analysis_type: string
            readonly template_id: string
            readonly provider_mode: string
            readonly input_retro_runs_json: string
          },
          [string]
        >(
          "select analysis_type, template_id, provider_mode, input_retro_runs_json from analysis_runs where analysis_run_id = ?",
        )
        .get(run.analysisRunId)

      expect(row).toEqual({
        analysis_type: "migration",
        template_id: "migration.v1",
        provider_mode: "env-provider",
        input_retro_runs_json: JSON.stringify(["retro_full_1"]),
      })
    } finally {
      db.close()
    }
  })

  test("Given migration and summary results When rows are written Then typed result tables keep structured fields", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    const run = await beginSpecAnalysisRun(paths, {
      analysisType: "migration",
      templateId: "migration.v1",
      providerMode: "deterministic",
      inputCategories: ["structure"],
      model: "deterministic-migration-v1",
      promptVersion: "migration-v1",
      retroHandoffSnapshot: JSON.stringify({ handoffs: [], preflight: { status: "ready" } }),
    })

    await writeMigrationGroups(paths, run.analysisRunId, [
      {
        groupId: "group-auth",
        title: "Auth migration",
        priority: "high",
        summary: "Move auth module first.",
        sourceAnchor: { filePath: "src/auth.ts" },
      },
    ])
    await writeMigrationFindings(paths, run.analysisRunId, [
      {
        findingId: "mig-1",
        entityId: "entity-auth",
        filePath: "src/auth.ts",
        groupId: "group-auth",
        migrationType: "rewrite",
        priority: "high",
        summary: "Auth needs typed migration.",
        recommendation: "Migrate auth before API handlers.",
        evidenceLabel: "EXTRACTED",
        confidence: 0.91,
        sourceAnchor: { filePath: "src/auth.ts", line: 10 },
      },
    ])
    await writeSummarySections(paths, run.analysisRunId, [
      {
        sectionId: "overview",
        title: "Overview",
        body: "Auth migration comes first.",
        rank: 1,
        evidenceLabel: "INFERRED",
        sourceAnchor: { filePath: "src/auth.ts" },
      },
    ])

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const group = db
        .query<
          {
            readonly group_id: string
            readonly priority: string
            readonly source_anchor_json: string
          },
          []
        >("select group_id, priority, source_anchor_json from migration_groups")
        .get()
      const finding = db
        .query<
          {
            readonly finding_id: string
            readonly group_id: string
            readonly evidence_label: string
            readonly confidence: number
          },
          []
        >("select finding_id, group_id, evidence_label, confidence from migration_findings")
        .get()
      const section = db
        .query<
          { readonly section_id: string; readonly rank: number; readonly evidence_label: string },
          []
        >("select section_id, rank, evidence_label from summary_sections")
        .get()

      expect(group).toEqual({
        group_id: "group-auth",
        priority: "high",
        source_anchor_json: JSON.stringify({ filePath: "src/auth.ts" }),
      })
      expect(finding).toEqual({
        finding_id: "mig-1",
        group_id: "group-auth",
        evidence_label: "EXTRACTED",
        confidence: 0.91,
      })
      expect(section).toEqual({ section_id: "overview", rank: 1, evidence_label: "INFERRED" })
    } finally {
      db.close()
    }
  })

  test("Given spec request intent When route is decided Then insight stays read-only and generated requests are durable", () => {
    expect(decideSpecRequestRoute({ command: "insight", prompt: "위험 높은 모듈 요약" })).toEqual({
      kind: "insight",
      saveInsight: false,
    })
    expect(
      decideSpecRequestRoute({
        command: "migration",
        scopeMode: "partial",
        templateId: "migration.v1",
        providerMode: "env-provider",
      }),
    ).toEqual({
      kind: "generated",
      analysisType: "migration",
      templateId: "migration.v1",
      providerMode: "env-provider",
    })
  })
})
