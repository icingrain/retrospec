import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runRetroInventory } from "../src/retro/run"
import { tempProject } from "./phase3-helpers"

const matrixPath = "templates/generated-program/language-capability-matrix.json"

describe("Phase 9.1 language capability matrix", () => {
  test("Given the language matrix When parsed Then priority languages are high confidence before analysis", async () => {
    const matrix = JSON.parse(await readFile(matrixPath, "utf8"))

    expect(matrix.matrix_version).toBe(1)
    expect(matrix.confidence_terms).toEqual(["high-confidence", "best-effort", "unsupported"])
    expect(matrix.evidence_labels).toEqual(["EXTRACTED", "INFERRED", "AMBIGUOUS"])

    for (const language of ["c", "cpp", "java", "proc"]) {
      expect(matrix.languages[language].overall_confidence).toBe("high-confidence")
      expect(matrix.languages[language].coverage_preflight).toContain("analysis/status")
    }
  })

  test("Given non-priority languages When matrix is read Then only explicitly scoped categories are best effort", async () => {
    const matrix = JSON.parse(await readFile(matrixPath, "utf8"))

    expect(matrix.languages.typescript.overall_confidence).toBe("best-effort")
    expect(matrix.languages.python.overall_confidence).toBe("best-effort")
    expect(matrix.languages.typescript.categories.structure.support_level).toBe("best-effort")
    expect(matrix.languages.typescript.categories.call_graph.support_level).toBe("unsupported")
    expect(matrix.languages.python.categories.structure.support_level).toBe("best-effort")
    expect(matrix.languages.python.categories.sql.support_level).toBe("unsupported")
  })

  test("Given skill documentation When read Then it links to the machine-readable matrix", async () => {
    const catalog = await readFile("skills/language-capability-matrix.md", "utf8")

    expect(catalog).toContain("templates/generated-program/language-capability-matrix.json")
    expect(catalog).toContain("high-confidence")
    expect(catalog).toContain("best-effort")
    expect(catalog).toContain("other.db")
  })

  test("Given broad parser-backed source files When inventory runs Then generic substrate evidence is persisted", async () => {
    const projectRoot = await tempProject()
    await mkdir(join(projectRoot, "src"), { recursive: true })
    await writeFile(join(projectRoot, "src", "service.ts"), "export const loadUser = () => 1\n")
    await writeFile(join(projectRoot, "src", "worker.py"), "def sync_user():\n    return 1\n")
    await writeFile(
      join(projectRoot, "src", "native.cpp"),
      "int sum_value(int value) { return value; }\n",
    )

    await runRetroInventory(projectRoot)

    const structureDb = new Database(join(projectRoot, ".retrospec", "retro", "structure.db"), {
      readonly: true,
    })
    const symbolsDb = new Database(join(projectRoot, ".retrospec", "retro", "symbols.db"), {
      readonly: true,
    })
    const registryDb = new Database(join(projectRoot, ".retrospec", "registry.db"), {
      readonly: true,
    })

    try {
      expect(
        structureDb
          .query(
            "select language, parser_backend, parser_mode, support_level, evidence_label, missing_capability from files order by language",
          )
          .all(),
      ).toEqual([
        {
          language: "cpp",
          parser_backend: "generic-ast-substrate",
          parser_mode: "generic_ast",
          support_level: "best-effort",
          evidence_label: "INFERRED",
          missing_capability: "language-specific-reference-pack",
        },
        {
          language: "python",
          parser_backend: "generic-ast-substrate",
          parser_mode: "generic_ast",
          support_level: "best-effort",
          evidence_label: "INFERRED",
          missing_capability: "language-specific-reference-pack",
        },
        {
          language: "typescript",
          parser_backend: "generic-ast-substrate",
          parser_mode: "generic_ast",
          support_level: "best-effort",
          evidence_label: "INFERRED",
          missing_capability: "language-specific-reference-pack",
        },
      ])
      expect(symbolsDb.query("select name from symbols order by name").all()).toEqual([
        { name: "loadUser" },
        { name: "sum_value" },
        { name: "sync_user" },
      ])
      expect(
        registryDb
          .query<{ readonly coverage_summary_json: string }, []>(
            "select coverage_summary_json from workflow_handoff where category = 'structure'",
          )
          .get()?.coverage_summary_json,
      ).toBe(
        '{"files":3,"symbols":3,"languages":["cpp","python","typescript"],"modes":["generic_ast"]}',
      )
    } finally {
      structureDb.close()
      symbolsDb.close()
      registryDb.close()
    }
  })

  test("Given the code-inventory job template When parsed Then it uses the canonical generated skill directory", async () => {
    const job = JSON.parse(await readFile("templates/retro/code-inventory/job.json", "utf8"))

    expect(job.entrypoint).toBe(".retrospec/generated/retro/code-inventory/run.ts")
    expect(job.capability).toBe("code-inventory")
  })
})
