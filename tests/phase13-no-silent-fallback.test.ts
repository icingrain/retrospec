import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { validateGeneratedProgram } from "../src/generated-validation"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { runSpecAnalysis } from "../src/spec/run"
import { readSpecStatuses } from "../src/spec/status"
import { tempProject } from "./phase3-helpers"
import { parserContract, validationReport, writeGeneratedProgram } from "./phase7-parser-fixtures"

describe("Phase 13 no-silent-fallback QA", () => {
  test("Given reduced parser strategy marked ready When generated program validates Then ready handoff is blocked", async () => {
    const projectRoot = await tempProject()
    const contract = parserContract(projectRoot)
    contract["selected_strategies"] = [
      {
        name: "typescript-generic-symbols",
        parser_backend: "generic-ast-substrate",
        categories: ["symbols"],
        evidence_label: "INFERRED",
      },
    ]
    const manifestPath = await writeGeneratedProgram(projectRoot, contract)

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("reduced_parser_cannot_ready_handoff")
  })

  test("Given unsupported validation gap with ready handoff When generated program validates Then gap blocks execution", async () => {
    const projectRoot = await tempProject()
    const manifestPath = await writeGeneratedProgram(
      projectRoot,
      parserContract(projectRoot),
      validationReport({
        status: "passed_with_gaps",
        gaps: [{ type: "unsupported", status: "open" }],
      }),
    )

    const result = await validateGeneratedProgram(projectRoot, manifestPath)

    expect(result.status).toBe("blocked")
    expect(result.blockers).toContain("unsupported_gap_cannot_ready_handoff")
  })

  test("Given generic AST ready handoff When spec status is read Then reduced coverage remains user visible", async () => {
    const projectRoot = await tempProject()
    await writeGenericAstProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    await runSpecAnalysis(paths)

    expect(readSpecStatuses(paths)[0]).toMatchObject({
      preflight_status: "limited",
      review_needed: true,
      coverage_languages: ["typescript"],
      coverage_modes: ["generic_ast"],
      missing_capabilities: ["language-specific-reference-pack"],
    })
  })
})

async function writeGenericAstProject(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, "src"), { recursive: true })
  await writeFile(join(projectRoot, "src", "service.ts"), "export const loadUser = () => 1\n")
}
