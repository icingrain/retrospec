import { describe, expect, test } from "bun:test"
import { validateGeneratedProgram } from "../src/generated-validation"
import {
  parserContract,
  tempProject,
  validationReport,
  writeGeneratedProgram,
  writeGeneratedProgramWithoutCapability,
  writeReferenceCandidate,
} from "./phase7-parser-fixtures"

describe("Phase 7 parser/AST strategy contract", () => {
  test("Given parser-backed contract When generated program is validated Then approval includes no blockers", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(projectRoot, parserContract(projectRoot))

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result).toMatchObject({ status: "approved", blockers: [] })
  })

  test("Given fallback without explicit capability metadata When validated Then silent fallback is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["selected_strategies"] = [
      {
        name: "regex-symbols",
        parser_backend: "regex",
        categories: ["symbols"],
        evidence_label: "EXTRACTED",
      },
    ]
    contract["fallbacks"] = [{ reason: "parser unavailable" }]
    const manifestPath = await writeGeneratedProgram(projectRoot, contract)

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("fallback_missing_capability")
    expect(result.blockers).toContain("fallback_requires_reduced_evidence_label")
  })

  test("Given missing-capability fallback marked ready When validated Then ready handoff is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["fallbacks"] = [
      {
        reason: "dynamic dispatch resolver unavailable",
        missing_capability: "dynamic-dispatch-resolution",
        evidence_label: "AMBIGUOUS",
      },
    ]
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      contract,
      validationReport({
        status: "passed_with_gaps",
        gaps: [{ type: "ambiguous", status: "open" }],
      }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("fallback_cannot_ready_handoff")
    expect(result.blockers).toContain("ambiguous_gap_cannot_ready_handoff")
  })

  test("Given selected strategy does not cover manifest category When validated Then contract is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["selected_strategies"] = [
      {
        name: "java-sql",
        parser_backend: "tree-sitter-java",
        categories: ["sql"],
        evidence_label: "EXTRACTED",
      },
    ]
    const manifestPath = await writeGeneratedProgram(projectRoot, contract)

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("selected_strategy_missing_manifest_category")
  })

  test("Given unsupported category support marked ready When validated Then ready handoff is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["language_capability"] = {
      matrix_path: "templates/generated-program/language-capability-matrix.json",
      language: "typescript",
      overall_confidence: "best-effort",
      category_support: [
        {
          category: "symbols",
          support_level: "unsupported",
          parser_backend: "generic",
          evidence_label: "AMBIGUOUS",
        },
      ],
      unsupported_categories: [],
    }
    const manifestPath = await writeGeneratedProgram(projectRoot, contract)

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("unsupported_support_cannot_ready_handoff")
  })

  test("Given manifest and contract disagree on capability and writes When validated Then mismatches are blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["skill"] = "code-relationship"
    contract["expected_writes"] = [".retrospec/logs/phase7.log", ".retrospec/retro/call_graph.db"]
    const manifestPath = await writeGeneratedProgram(projectRoot, contract)

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("contract_capability_mismatch")
    expect(result.blockers).toContain("contract_write_missing_from_manifest")
  })

  test("Given reference-missing gap without candidates file When validated Then candidates queue is required", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({
        status: "passed_with_gaps",
        gaps: [{ type: "reference-missing", status: "open" }],
      }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("missing_reference_candidates")
  })

  test("Given generated manifest omits capability When validated Then manifest is blocked", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgramWithoutCapability(
      projectRoot,
      parserContract(projectRoot),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("invalid_manifest")
  })

  test("Given validation report omits required status or gaps When validated Then report is blocked", async () => {
    const projectRoot = await tempProject()
    const report = {
      report_version: 1,
      run_id: "phase7-test",
      skill: "code-inventory",
      categories: ["symbols"],
      samples: [],
      expected_evidence: [],
      generated_results: [],
      comparisons: [],
      iterations: [],
    }
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      report,
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("invalid_validation_report")
  })

  test("Given validation report omits manifest category When validated Then category mismatch is blocked", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({ categories: ["structure"] }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("validation_report_category_mismatch")
  })

  test("Given reference candidates auto-merge When validated Then candidate boundary is blocked", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({
        status: "passed_with_gaps",
        gaps: [{ type: "reference-missing", status: "open" }],
      }),
    )
    await writeReferenceCandidate(projectRoot, {
      type: "reference-missing",
      source: "src/Main.java",
      reason: "new parser reference needed",
      auto_merge: true,
    })

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("invalid_reference_candidates")
  })

  test("Given reference-missing gap with reviewed candidates When validated Then candidates boundary passes", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["handoff"] = { status: "incomplete", reason: "reference candidate pending" }
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      contract,
      validationReport({
        status: "passed_with_gaps",
        gaps: [{ type: "reference-missing", status: "open" }],
      }),
    )
    await writeReferenceCandidate(projectRoot, {
      type: "reference-missing",
      source: "src/Main.java",
      reason: "new parser reference needed",
      auto_merge: false,
    })

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result).toMatchObject({ status: "approved", blockers: [] })
  })
})
