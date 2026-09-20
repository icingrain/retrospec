import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Writable } from "node:stream"
import { installRetrospecOpenCodeConfig } from "../src/opencode-install"
import { discoverOpenCodeModels } from "../src/opencode-install-model"
import { tempProject } from "./phase3-helpers"

describe("Phase 13 opencode install model selection", () => {
  test("Given opencode has a selected model When install runs Then Retrospec agents inherit that model", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(configPath, JSON.stringify({ model: "anthropic/claude-sonnet-4-5-20250929" }))

    const result = await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(result.agentModel).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.retrospec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.retro.model).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.spec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
  })

  test("Given install receives a model option When opencode has a different model Then the option wins", async () => {
    const projectRoot = await tempProject()
    const homeRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(configPath, JSON.stringify({ model: "openai/gpt-5.5" }))

    const result = await installRetrospecOpenCodeConfig(
      projectRoot,
      { HOME: homeRoot },
      { model: "google/gemini-2.5-pro" },
    )

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(result.agentModel).toBe("google/gemini-2.5-pro")
    expect(config.agent.retrospec.model).toBe("google/gemini-2.5-pro")
    expect(config.model).toBe("openai/gpt-5.5")
  })

  test("Given opencode providers define models When models are discovered Then provider-qualified choices are returned", () => {
    const models = discoverOpenCodeModels({
      model: "openai/gpt-5.5",
      provider: {
        anthropic: { models: { "claude-sonnet-4-5-20250929": {} } },
        openai: { models: { "gpt-5.5": {}, "gpt-5-mini": {} } },
      },
    })

    expect(models).toEqual([
      "openai/gpt-5.5",
      "anthropic/claude-sonnet-4-5-20250929",
      "openai/gpt-5-mini",
    ])
  })

  test("Given manual model setup is requested When one model is entered Then install saves reusable defaults", async () => {
    const projectRoot = await tempProject()
    const nextProjectRoot = await tempProject()
    const homeRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    const nextConfigPath = join(nextProjectRoot, ".opencode", "opencode.jsonc")
    const prompt = promptIo("1\ny\nanthropic/claude-sonnet-4-5-20250929\n")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await mkdir(join(nextProjectRoot, ".opencode"), { recursive: true })
    await writeFile(configPath, JSON.stringify({ model: "openai/gpt-5.5" }))

    const result = await installRetrospecOpenCodeConfig(
      projectRoot,
      { HOME: homeRoot },
      { selectModel: true, prompt: prompt.io },
    )
    await installRetrospecOpenCodeConfig(nextProjectRoot, { HOME: homeRoot })

    const config = JSON.parse(await readFile(configPath, "utf8"))
    const nextConfig = JSON.parse(await readFile(nextConfigPath, "utf8"))
    expect(prompt.output()).toContain("Select Retrospec model setup mode")
    expect(result.agentModel).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.retrospec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(nextConfig.agent.retrospec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
  })

  test("Given global opencode config defines providers When selecting provider mode Then install uses global provider choices", async () => {
    const projectRoot = await tempProject()
    const homeRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    const globalConfigDir = join(homeRoot, ".config", "opencode")
    const prompt = promptIo("2\n1\ny\nclaude-sonnet-4-5-20250929\n")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await mkdir(globalConfigDir, { recursive: true })
    await writeFile(configPath, JSON.stringify({ retrospec: { hooks_enabled: false } }))
    await writeFile(
      join(globalConfigDir, "opencode.json"),
      JSON.stringify({
        model: "openai/gpt-5.5",
        provider: { anthropic: { models: { "claude-sonnet-4-5-20250929": {} } } },
      }),
    )

    const result = await installRetrospecOpenCodeConfig(
      projectRoot,
      { HOME: homeRoot },
      { selectModel: true, prompt: prompt.io },
    )

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(prompt.output()).toContain("Select opencode provider")
    expect(result.agentModel).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.retrospec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.provider).toBeUndefined()
  })
})

function promptIo(answer: string): {
  readonly io: {
    readonly input: Readable
    readonly output: Writable
    readonly question: (prompt: string) => Promise<string>
  }
  readonly output: () => string
} {
  let written = ""
  const lines = answer.split("\n")
  return {
    io: {
      input: Readable.from([]),
      output: new Writable({
        write(chunk, _encoding, callback) {
          written += String(chunk)
          callback()
        },
      }),
      question: async (prompt) => {
        written += prompt
        return lines.shift() ?? ""
      },
    },
    output: () => written,
  }
}
