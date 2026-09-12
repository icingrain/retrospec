import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

describe("Phase 8B skill dry-run QA", () => {
  test("Given fixture dry-run matrix When checker runs Then required readiness paths are covered", async () => {
    const checker = Bun.spawn(["bun", "run", "scripts/check-skill-dry-run-fixtures.mjs"], {
      cwd: process.cwd(),
      stderr: "pipe",
      stdout: "pipe",
    })

    const exitCode = await checker.exited
    const stdout = await new Response(checker.stdout).text()
    const stderr = await new Response(checker.stderr).text()

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(stdout).toContain("skill dry-run fixtures ok: 16 cases")
  })

  test("Given Phase 8B fixture matrix When read as QA surface Then it covers happy fallback generated and validation paths", async () => {
    const fixtureText = await readFile(
      join("templates", "fixtures", "skill-dry-run", "phase8b6-cases.json"),
      "utf8",
    )

    expect(fixtureText).toContain("happy-retro-sql-proc-dynamic")
    expect(fixtureText).toContain("happy-spec-ai-analysis")
    expect(fixtureText).toContain("happy-archivist-report-export")
    expect(fixtureText).toContain("fallback-unsupported-language-parser")
    expect(fixtureText).toContain("refusal-export-outside-boundary")
    expect(fixtureText).toContain("refusal-spec-missing-handoff")
    expect(fixtureText).toContain("generated-code-inventory-source-fit")
    expect(fixtureText).toContain("generated-sql-data-access-proc")
    expect(fixtureText).toContain("generated-custom-analysis-interview")
    expect(fixtureText).toContain("validation-loop-bug-gap")
    expect(fixtureText).toContain("validation-loop-reference-candidate")
    expect(fixtureText).toContain("validation-loop-skill-promotion-candidate")
    expect(fixtureText).toContain("fixture-code-inventory-c-cpp-java-symbols")
    expect(fixtureText).toContain("fixture-code-relationship-c-java-calls")
    expect(fixtureText).toContain("fixture-sql-data-access-jvm")
    expect(fixtureText).toContain("fixture-quality-risk-c-cpp-java")
  })
})
