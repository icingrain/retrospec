import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { writeOtherAnalysis } from "../src/other-analysis"
import { projectPaths } from "../src/paths"
import { tempProject } from "./phase3-helpers"

type OtherEvidenceRow = {
  readonly language: string
  readonly category: string
  readonly support_level: string
  readonly evidence_label: string
  readonly missing_capability: string
  readonly file_path: string
}

describe("Phase 9 other.db fallback records", () => {
  test("Given unsupported language categories When other analysis is written Then fallback evidence is stored and handed off", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await writeOtherAnalysis(paths, {
      sourceFingerprint: "phase9-other-fingerprint-1",
      records: [
        {
          language: "typescript",
          category: "call_graph",
          supportLevel: "unsupported",
          evidenceLabel: "AMBIGUOUS",
          missingCapability: "typescript-call-graph-resolver",
          filePath: "src/app.ts",
          reason: "Phase 9.1 matrix marks TypeScript call_graph unsupported",
        },
        {
          language: "python",
          category: "structure",
          supportLevel: "best-effort",
          evidenceLabel: "INFERRED",
          missingCapability: "python-ast-reference-pack",
          filePath: "app/main.py",
          reason: "Phase 9.1 matrix allows Python structure as best-effort only",
        },
      ],
    })

    const otherDb = new Database(join(paths.stateDir, "retro", "other.db"), { readonly: true })
    const registry = new Database(paths.registryDb, { readonly: true })
    try {
      const rows = otherDb
        .query<OtherEvidenceRow, []>(
          `select language, category, support_level, evidence_label, missing_capability, file_path
           from fallback_evidence
           order by language, category`,
        )
        .all()
      const handoff = registry
        .query<{ readonly status: string; readonly entity_count: number }, []>(
          "select status, entity_count from workflow_handoff where category = 'other'",
        )
        .get()

      expect(rows).toEqual([
        {
          language: "python",
          category: "structure",
          support_level: "best-effort",
          evidence_label: "INFERRED",
          missing_capability: "python-ast-reference-pack",
          file_path: "app/main.py",
        },
        {
          language: "typescript",
          category: "call_graph",
          support_level: "unsupported",
          evidence_label: "AMBIGUOUS",
          missing_capability: "typescript-call-graph-resolver",
          file_path: "src/app.ts",
        },
      ])
      expect(handoff).toEqual({ status: "ready_for_analysis", entity_count: 2 })
    } finally {
      otherDb.close()
      registry.close()
    }
  })

  test("Given regenerated fallback evidence When other analysis is written Then stale rows are cleared", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await writeOtherAnalysis(paths, {
      sourceFingerprint: "phase9-other-stale-1",
      records: [
        {
          language: "typescript",
          category: "security",
          supportLevel: "unsupported",
          evidenceLabel: "AMBIGUOUS",
          missingCapability: "typescript-security-resolver",
          filePath: "src/old.ts",
          reason: "old fallback",
        },
      ],
    })

    await writeOtherAnalysis(paths, {
      sourceFingerprint: "phase9-other-stale-2",
      records: [
        {
          language: "python",
          category: "complexity",
          supportLevel: "best-effort",
          evidenceLabel: "INFERRED",
          missingCapability: "python-complexity-reference-pack",
          filePath: "app/new.py",
          reason: "new fallback",
        },
      ],
    })

    const db = new Database(join(paths.stateDir, "retro", "other.db"), { readonly: true })
    try {
      const rows = db
        .query<{ readonly file_path: string }, []>("select file_path from fallback_evidence")
        .all()

      expect(rows).toEqual([{ file_path: "app/new.py" }])
    } finally {
      db.close()
    }
  })
})
