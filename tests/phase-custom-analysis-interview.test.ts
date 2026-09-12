import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

describe("Phase 4 custom analysis interview route", () => {
  test("Given unmatched static-analysis intent When reading router and retro contracts Then they route to custom-analysis-interview", async () => {
    const retrospecAgent = await readFile("agents/retrospec/AGENT.md", "utf8")
    const retroAgent = await readFile("agents/retro/AGENT.md", "utf8")
    const catalog = await readFile("skills/README.md", "utf8")

    expect(retrospecAgent).toContain("custom-analysis-interview")
    expect(retrospecAgent).toContain("5th retro path")
    expect(retroAgent).toContain("custom-analysis-interview")
    expect(retroAgent).toContain("source sample")
    expect(catalog).toContain("custom-analysis-interview")
    expect(catalog).toContain("interview-backed unmatched static-analysis")
  })

  test("Given custom-analysis-interview artifacts When read Then they preserve generated-program and approval gates", async () => {
    const skill = await readFile("skills/custom-analysis-interview/SKILL.md", "utf8")
    const prompt = await readFile("templates/retro/custom-analysis-interview/prompt.md", "utf8")
    const job = await readFile("templates/retro/custom-analysis-interview/job.json", "utf8")

    for (const artifact of [skill, prompt]) {
      expect(artifact).toContain("Surveyor")
      expect(artifact).toContain("generation-contract.json")
      expect(artifact).toContain("validation-report.json")
      expect(artifact).toContain("Appraiser")
      expect(artifact).toContain("Excavator")
      expect(artifact).toContain("no auto-promotion")
    }
    expect(job).toContain('"capability": "custom-analysis-interview"')
    expect(job).toContain(
      '"entrypoint": ".retrospec/generated/retro/custom-analysis-interview/run.ts"',
    )
  })

  test("Given validated custom analysis When reusable skill is desired Then promotion queue blocks automatic skill writes", async () => {
    const generatedProgram = await readFile("templates/generated-program/README.md", "utf8")
    const promotionCandidates = await readFile(
      "templates/generated-program/skill-promotion-candidates.jsonl",
      "utf8",
    )
    const appraiser = await readFile("agents/Appraiser/AGENT.md", "utf8")
    const catalog = await readFile("skills/README.md", "utf8")

    for (const artifact of [generatedProgram, appraiser, catalog]) {
      expect(artifact).toContain("skill-promotion-candidates.jsonl")
      expect(artifact).toContain("approval_required")
      expect(artifact).toContain("auto_write_skills:false")
    }
    expect(promotionCandidates).toContain('"candidate_version":1')
    expect(promotionCandidates).toContain('"approval_required":true')
    expect(promotionCandidates).toContain('"auto_write_skills":false')
  })
})
