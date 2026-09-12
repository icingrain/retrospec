import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

describe("Phase 8B final skill readiness gate", () => {
  test("Given repo-local skill artifacts When final gate runs Then all readiness surfaces pass", async () => {
    const checker = Bun.spawn(["bun", "run", "scripts/check-skill-readiness-gate.mjs"], {
      cwd: process.cwd(),
      stderr: "pipe",
      stdout: "pipe",
    })

    const exitCode = await checker.exited
    const stdout = await new Response(checker.stdout).text()
    const stderr = await new Response(checker.stderr).text()

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(stdout).toContain("skill readiness gate ok: 8 skills, 3 owner agents")
  })

  test("Given package test script When read Then Phase 8B final gate is part of canonical test run", async () => {
    const packageText = await readFile("package.json", "utf8")

    expect(packageText).toContain("./tests/phase8b-final-skill-gate.test.ts")
  })

  test("Given Phase 3 skill structure work When reading docs Then owner core custom migration decision is recorded", async () => {
    const catalog = await readFile("skills/README.md", "utf8")
    const risks = await readFile(
      ".giqo/plans/retrospec-next-ontology/docs/09_RISK_AND_DECISIONS.md",
      "utf8",
    )

    expect(catalog).toContain("Current package layout remains flat")
    expect(catalog).toContain("skills/<owner>/core|custom")
    expect(catalog).toContain("before writing the first approved `origin: custom` skill")
    expect(risks).toContain("front matter의 `owner_agent`/`origin`")
    expect(risks).toContain("첫 `origin: custom` skill")
  })
})
