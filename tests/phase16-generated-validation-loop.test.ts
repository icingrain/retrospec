import { describe, expect, test } from "bun:test"
import { validateGeneratedProgram } from "../src/generated-validation"
import {
  parserContract,
  tempProject,
  validationReport,
  writeGeneratedProgram,
} from "./phase7-parser-fixtures"

describe("Phase 16 generated validation loop policy", () => {
  test("Given validation report exceeds iteration limit When validated Then loop budget is blocked", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({
        iterations: [
          { index: 1, outcome: "bug-fixed", bug_count: 2 },
          { index: 2, outcome: "bug-fixed", bug_count: 1 },
          { index: 3, outcome: "bug-fixed", bug_count: 1 },
          { index: 4, outcome: "passed", bug_count: 0 },
        ],
      }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("validation_iteration_limit_exceeded")
  })

  test("Given validation samples do not meet policy When validated Then sample gate is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    const validationLoop = Object.assign({}, contract["validation_loop"], {
      sample_policy: {
        candidate_source: "analysis-target-files",
        eligible_file_count: 20,
        min_count: 3,
        max_count: 12,
        ratio: 0.1,
        strategy: "deterministic-stratified",
        must_cover: ["language", "extension", "requested_category"],
        allow_smaller_target_set: true,
        random_seed: null,
      },
    })
    contract["validation_loop"] = validationLoop
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      contract,
      validationReport({ samples: [] }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("validation_sample_count_below_minimum")
  })

  test("Given validation report misses stop reason When validated Then stop policy is blocked", async () => {
    const projectRoot = await tempProject()
    const { stop_reason: _stopReason, ...report } = validationReport()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      report,
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("invalid_validation_report")
  })
})
