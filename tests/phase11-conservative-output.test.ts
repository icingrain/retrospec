import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import type { SpecAnalysisDriver } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 11.4 conservative spec output", () => {
  test("Given generic AST inventory When deterministic risk analysis runs Then findings stay inferred and need review", async () => {
    const projectRoot = await tempProject()
    await writeGenericAstProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const result = await runSpecAnalysis(paths)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const findings = db
        .query<
          {
            readonly evidence_label: string
            readonly finding_status: string
          },
          [string]
        >(
          `select evidence_label, finding_status
           from risk_findings
           where analysis_run_id = ?
           order by finding_id`,
        )
        .all(result.analysisRunId)

      expect(findings.length).toBeGreaterThan(0)
      expect(findings.every((finding) => finding.evidence_label === "INFERRED")).toBe(true)
      expect(findings.every((finding) => finding.finding_status === "needs_review")).toBe(true)
    } finally {
      db.close()
    }
  })

  test("Given provider overstates generic AST evidence When spec analysis stores findings Then output is downgraded", async () => {
    const projectRoot = await tempProject()
    await writeGenericAstProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const driver: SpecAnalysisDriver = {
      model: "provider:gpt-test",
      promptVersion: "risk-v1",
      analyze: (input) => ({
        findings: [
          {
            findingId: "risk_overstated_1",
            entityId: input.entities[0]?.entityId ?? "missing-entity",
            severity: "high",
            riskType: "provider_overstatement",
            summary: "Provider overstated reduced coverage evidence",
            evidence: "Provider claimed extracted evidence from generic AST source.",
            recommendation: "Clamp provider output to source coverage confidence.",
            evidenceLabel: "EXTRACTED",
            findingStatus: "open",
          },
        ],
      }),
    }

    const result = await runSpecAnalysis(paths, driver)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const finding = db
        .query<
          {
            readonly evidence_label: string
            readonly finding_status: string
          },
          [string]
        >("select evidence_label, finding_status from risk_findings where analysis_run_id = ?")
        .get(result.analysisRunId)

      expect(finding).toEqual({ evidence_label: "INFERRED", finding_status: "needs_review" })
    } finally {
      db.close()
    }
  })

  test("Given active memory notes When spec analysis runs Then ambiguous needs-review findings are stored conservatively", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    await writeMemoryNote(paths.specAnalysisDb, paths.projectRoot)

    const driver: SpecAnalysisDriver = {
      model: "provider:gpt-test",
      promptVersion: "risk-v1",
      analyze: (input) => {
        expect(input.memoryNotes).toEqual([
          {
            memoryId: "mem_order_context",
            anchorType: "project",
            anchorId: paths.projectRoot,
            kind: "context",
            content: "Order settlement risk is domain knowledge, not extracted source truth.",
          },
        ])

        return {
          findings: [
            {
              findingId: "risk_ambiguous_1",
              entityId: input.entities[0]?.entityId ?? "missing-entity",
              severity: "medium",
              riskType: "ambiguous_domain_context",
              summary: "Order settlement coupling needs review",
              evidence: "Memory note suggests domain coupling, but source evidence is ambiguous.",
              recommendation: "Review with a domain owner before migration planning.",
              evidenceLabel: "AMBIGUOUS",
              findingStatus: "needs_review",
              memoryNotes: ["mem_order_context"],
            },
          ],
        }
      },
    }

    const result = await runSpecAnalysis(paths, driver)

    const db = new Database(paths.specAnalysisDb, { readonly: true })
    try {
      const finding = db
        .query<
          {
            readonly evidence_label: string
            readonly finding_status: string
            readonly memory_notes: string
          },
          [string]
        >(
          "select evidence_label, finding_status, memory_notes from risk_findings where analysis_run_id = ?",
        )
        .get(result.analysisRunId)

      expect(finding).toEqual({
        evidence_label: "AMBIGUOUS",
        finding_status: "needs_review",
        memory_notes: JSON.stringify(["mem_order_context"]),
      })
    } finally {
      db.close()
    }
  })
})

async function writeGenericAstProject(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, "src"), { recursive: true })
  await writeFile(join(projectRoot, "src", "service.ts"), "export const loadUser = () => 1\n")
}

async function writeMemoryNote(specAnalysisDb: string, projectRoot: string): Promise<void> {
  await mkdir(dirname(specAnalysisDb), { recursive: true })
  const db = new Database(specAnalysisDb, { create: true })
  try {
    db.exec(`
      create table memory_notes (
        memory_id text primary key,
        anchor_type text not null,
        anchor_id text not null,
        kind text not null,
        content text not null,
        status text not null,
        created_by text not null,
        created_at text not null,
        superseded_by text
      );
    `)
    db.query(
      `insert into memory_notes
       (memory_id, anchor_type, anchor_id, kind, content, status, created_by, created_at, superseded_by)
       values (?, 'project', ?, 'context', ?, 'active', 'user', '2026-08-05T00:00:00.000Z', null)`,
    ).run(
      "mem_order_context",
      projectRoot,
      "Order settlement risk is domain knowledge, not extracted source truth.",
    )
  } finally {
    db.close()
  }
}
