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
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(configPath, JSON.stringify({ model: "openai/gpt-5.5" }))

    const result = await installRetrospecOpenCodeConfig(
      projectRoot,
      {},
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

  test("Given model selection is requested When the user chooses a provider model Then install uses that model", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    const prompt = promptIo("2\n")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        model: "openai/gpt-5.5",
        provider: { anthropic: { models: { "claude-sonnet-4-5-20250929": {} } } },
      }),
    )

    const result = await installRetrospecOpenCodeConfig(
      projectRoot,
      {},
      { selectModel: true, prompt: prompt.io },
    )

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(prompt.output()).toContain("Select opencode model for Retrospec agents")
    expect(result.agentModel).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(config.agent.retrospec.model).toBe("anthropic/claude-sonnet-4-5-20250929")
  })
})

function promptIo(answer: string): {
  readonly io: { readonly input: Readable; readonly output: Writable }
  readonly output: () => string
} {
  let written = ""
  return {
    io: {
      input: Readable.from([answer]),
      output: new Writable({
        write(chunk, _encoding, callback) {
          written += String(chunk)
          callback()
        },
      }),
    },
    output: () => written,
  }
}
