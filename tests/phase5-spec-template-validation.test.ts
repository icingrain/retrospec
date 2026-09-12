import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  resolveSpecCommandTemplate,
  validateGeneratedSpecAnalysis,
  validateSpecTemplatePackage,
} from "../src/spec/template-validation"
import { tempProject } from "./phase3-helpers"

const templateRoot = "templates/spec"

describe("Phase 5 spec template validation loop", () => {
  test("Given built-in spec templates When packages validate Then risk migration and summary expose complete contracts", async () => {
    const results = await Promise.all([
      validateSpecTemplatePackage(templateRoot, "risk"),
      validateSpecTemplatePackage(templateRoot, "migration"),
      validateSpecTemplatePackage(templateRoot, "summary"),
    ])

    expect(results.map((result) => result.status)).toEqual(["approved", "approved", "approved"])
    expect(results.map((result) => result.template.templateId)).toEqual([
      "risk.v1",
      "migration.v1",
      "summary.v1",
    ])
    expect(results.flatMap((result) => result.blockers)).toEqual([])
  })

  test("Given generated migration script output When validation runs Then schema labels sandbox and dry-run must pass", async () => {
    const projectRoot = await tempProject()
    const generatedDir = join(projectRoot, ".retrospec", "generated", "spec", "migration")
    await mkdir(generatedDir, { recursive: true })
    await writeGeneratedSpecPackage(generatedDir, {
      analysisType: "migration",
      templateId: "migration.v1",
      tables: ["migration_groups", "migration_findings"],
      conservativeLabelsPreserved: true,
      dryRunPassed: true,
      gaps: [],
    })

    const result = await validateGeneratedSpecAnalysis(
      projectRoot,
      join(generatedDir, "job.json"),
      templateRoot,
    )

    expect(result).toMatchObject({
      status: "approved",
      analysisType: "migration",
      templateId: "migration.v1",
      blockers: [],
    })
  })

  test("Given generated summary with unsafe evidence and bug gap When validation runs Then it is blocked before daemon submission", async () => {
    const projectRoot = await tempProject()
    const generatedDir = join(projectRoot, ".retrospec", "generated", "spec", "summary")
    await mkdir(generatedDir, { recursive: true })
    await writeGeneratedSpecPackage(generatedDir, {
      analysisType: "summary",
      templateId: "summary.v1",
      tables: ["summary_sections"],
      conservativeLabelsPreserved: false,
      dryRunPassed: true,
      gaps: [{ type: "bug", status: "open" }],
    })

    const result = await validateGeneratedSpecAnalysis(
      projectRoot,
      join(generatedDir, "job.json"),
      templateRoot,
    )

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("conservative_labels_not_preserved")
    expect(result.blockers).toContain("unresolved_bug_gap")
  })

  test("Given spec command request When template resolves Then command entrypoint uses the matching template package", async () => {
    const result = await resolveSpecCommandTemplate(
      {
        command: "migration",
        scopeMode: "partial",
        templateId: "migration.v1",
        providerMode: "env-provider",
      },
      templateRoot,
    )

    expect(result).toMatchObject({
      kind: "generated",
      analysisType: "migration",
      templateId: "migration.v1",
      providerMode: "env-provider",
      templatePath: "templates/spec/migration",
      manifestTemplatePath: "templates/spec/migration/job.json",
      runStubPath: "templates/spec/migration/run.ts.stub",
    })
  })
})

type GeneratedSpecFixture = {
  readonly analysisType: "risk" | "migration" | "summary"
  readonly templateId: string
  readonly tables: readonly string[]
  readonly conservativeLabelsPreserved: boolean
  readonly dryRunPassed: boolean
  readonly gaps: readonly { readonly type: string; readonly status: string }[]
}

async function writeGeneratedSpecPackage(
  generatedDir: string,
  fixture: GeneratedSpecFixture,
): Promise<void> {
  await writeFile(join(generatedDir, "run.ts"), "export const generatedSpecAnalysis = true\n")
  await writeFile(join(generatedDir, "reference-candidates.jsonl"), "")
  await writeFile(
    join(generatedDir, "job.json"),
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint: join(generatedDir, "run.ts"),
      args: [],
      env: {},
      writes: [".retrospec/spec/ai_analysis.db"],
      category: fixture.analysisType,
      actor: "spec",
      capability: "ai-analysis",
      template_id: fixture.templateId,
    }),
  )
  await writeFile(
    join(generatedDir, "spec-validation-report.json"),
    JSON.stringify({
      report_version: 1,
      analysis_type: fixture.analysisType,
      template_id: fixture.templateId,
      retro_readiness: { checked: true, required_categories: ["structure", "symbols"] },
      scope: { mode: "full", roots: [] },
      schema_output: { tables: fixture.tables },
      evidence_anchors: [{ source: "registry", entity_id: "entity-1" }],
      conservative_labels_preserved: fixture.conservativeLabelsPreserved,
      write_sandbox: ".retrospec/spec",
      dry_run: { passed: fixture.dryRunPassed, fixture: "templates/spec/fixtures/minimal.json" },
      gaps: fixture.gaps,
      status: fixture.gaps.some((gap) => gap.type === "bug" && gap.status !== "resolved")
        ? "failed"
        : "passed",
    }),
  )
}
