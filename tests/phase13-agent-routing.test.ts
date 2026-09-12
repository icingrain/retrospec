import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

describe("Phase 13 agent routing contract", () => {
  test("Given export or Excel requests When reading the router docs Then they point to Archivist", async () => {
    const retrospecAgent = await readFile("agents/retrospec/AGENT.md", "utf8")
    const archivistAgent = await readFile("agents/Archivist/AGENT.md", "utf8")

    expect(retrospecAgent).toContain("CSV/XLSX/Excel exports")
    expect(retrospecAgent).toContain("requests to Archivist")
    expect(archivistAgent).toContain("CSV/XLSX/Excel exports")
    expect(archivistAgent).toContain("report-export")
  })

  test("Given retro and spec contracts When reading agent docs Then both require the shared confirmation state machine", async () => {
    const retroAgent = await readFile("agents/retro/AGENT.md", "utf8")
    const specAgent = await readFile("agents/spec/AGENT.md", "utf8")

    for (const agent of [retroAgent, specAgent]) {
      expect(agent).toContain(
        "request received → scope confirmed → preview shown → final approval → execution",
      )
      expect(agent).toContain(
        "Do not submit jobs, build batch input, or start execution before final approval",
      )
    }
    expect(specAgent).toContain("tell the user to run `retro` first")
  })

  test("Given Retrospec OpenCode agents When reading first-response contracts Then agent skill decisions are visible", async () => {
    const retrospecAgent = await readFile("agents/retrospec/AGENT.md", "utf8")
    const retroAgent = await readFile("agents/retro/AGENT.md", "utf8")
    const specAgent = await readFile("agents/spec/AGENT.md", "utf8")
    const sessionStartHook = await readFile("hooks/retrospec-session-start/README.md", "utf8")

    for (const contract of [retrospecAgent, retroAgent, specAgent]) {
      expect(contract).toContain("Agent decision: agent=")
      expect(contract).toContain("skill=")
      expect(contract).toContain("reason=")
      expect(contract).toContain("visible in the OpenCode conversation")
    }
    expect(retroAgent).toContain(
      "code-inventory | code-relationship | sql-data-access | quality-risk-scan | custom-analysis-interview | none",
    )
    expect(specAgent).toContain("ai-spec-analysis | none")
    expect(sessionStartHook).toContain("agent-decision-openCode-conversation-line")
    expect(sessionStartHook).toContain(
      "Agent decision: agent=<agent> skill=<skill|none> reason=<reason>",
    )
  })
})
