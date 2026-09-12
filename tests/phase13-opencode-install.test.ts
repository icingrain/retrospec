import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  formatOpenCodeFileIncludePath,
  installRetrospecOpenCodeConfig,
} from "../src/opencode-install"
import { tempProject } from "./phase3-helpers"

const publicAgentKeys = ["retrospec", "retro", "spec"] as const
const internalAgentKeys = ["archivist", "curator", "surveyor", "appraiser", "excavator"] as const

describe("Phase 13 opencode install config merge", () => {
  test("Given a Windows absolute agent path When formatting an opencode file include Then it is not treated as project-relative", () => {
    const formatted = formatOpenCodeFileIncludePath(
      "C:/Users/ATSAdmin/AppData/Roaming/npm/node_modules/retrospec-agent/agents/retrospec/AGENT.md",
    )

    expect(formatted).toBe(
      "C:/Users/ATSAdmin/AppData/Roaming/npm/node_modules/retrospec-agent/agents/retrospec/AGENT.md",
    )
    expect(formatted).not.toStartWith("./")
  })

  test("Given existing opencode agent config When retrospec installs Then existing agents remain and public retrospec agents are added", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      `{
        // user-owned config must survive install
        "agent": {
          "custom-agent": { "model": "openai/gpt-5.5", "prompt": "keep me" }
        },
        "disabled_agents": ["oracle"],
      }`,
    )

    const result = await installRetrospecOpenCodeConfig(projectRoot, {
      RETROSPEC_AGENT_MODEL: "openai:gpt-5.5",
      RETROSPEC_AGENT_MODEL_SURVEYOR: "anthropic:claude-3-5-sonnet-latest",
    })

    const config = JSON.parse(await readFile(configPath, "utf8"))
    const plugin = await readFile(
      join(projectRoot, ".opencode", "plugins", "retrospec-agent-order.js"),
      "utf8",
    )

    expect(result.addedAgents).toEqual([
      "retrospec",
      "retro",
      "spec",
      "archivist",
      "curator",
      "surveyor",
      "appraiser",
      "excavator",
    ])
    expect(result.pluginPath).toBe(
      join(projectRoot, ".opencode", "plugins", "retrospec-agent-order.js"),
    )
    expect(config.disabled_agents).toEqual(["oracle"])
    expect(config.agent["custom-agent"]).toEqual({ model: "openai/gpt-5.5", prompt: "keep me" })
    expect(config.agent.retrospec.mode).toBe("primary")
    expect(config.agent.retrospec.model).toBe("openai/gpt-5.5")
    expect(config.agent.retro.model).toBe("anthropic/claude-3-5-sonnet-latest")
    expect(config.agent.retro.mode).toBe("primary")
    expect(config.agent.spec.model).toBe("openai/gpt-5.5")
    expect(config.agent.spec.mode).toBe("primary")
    expect(config.agent["retrospec"].prompt).toMatch(/^\{file:.+agents\/retrospec\/AGENT\.md\}$/)
    expect(config.agent["retrospec"].prompt).not.toStartWith("file://")
    expect(config.agent["retrospec"].prompt).not.toContain("../")
    expect(config.retrospec.hooks_enabled).toBe(true)
    expect(config.retrospec.skill_load_policy.retro).toContain("custom-analysis-interview")
    expect(config.retrospec.required_policy).toContain("session-start-health-status-hint")
    expect(config.retrospec.required_policy).toContain("agent-minimal-status-first-reminder")
    expect(config.retrospec.required_policy).toContain("agent-decision-openCode-conversation-line")
    for (const key of publicAgentKeys) {
      expect(config.agent[key].mode).toBe("primary")
    }
    for (const key of internalAgentKeys) {
      expect(config.agent[key].mode).toBe("subagent")
    }
    expect(config.agent.archivist.model).toBe("openai/gpt-5.5")
    expect(config.agent.surveyor.model).toBe("anthropic/claude-3-5-sonnet-latest")
    expect(config.agent.archivist.prompt).toMatch(/^\{file:.+agents\/Archivist\/AGENT\.md\}$/)
    expect(config.agent.curator.prompt).toMatch(/^\{file:.+agents\/Curator\/AGENT\.md\}$/)
    expect(config.agent.surveyor.prompt).toMatch(/^\{file:.+agents\/Surveyor\/AGENT\.md\}$/)
    expect(config.agent.appraiser.prompt).toMatch(/^\{file:.+agents\/Appraiser\/AGENT\.md\}$/)
    expect(config.agent.excavator.prompt).toMatch(/^\{file:.+agents\/Excavator\/AGENT\.md\}$/)
    expect(config.agent["retrospec-archivist"]).toBeUndefined()
    expect(plugin).toContain('RETROSPEC_AGENT_ORDER = ["retrospec", "retro", "spec"]')
    expect(plugin).toContain("export const RetrospecAgentOrder")
  })

  test("Given existing retrospec agent key When install runs Then installer does not overwrite that key", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        agent: {
          retrospec: { model: "user/model", prompt: "user prompt" },
        },
      }),
    )

    const result = await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(result.addedAgents).not.toContain("retrospec")
    expect(config.agent.retrospec).toEqual({ model: "user/model", prompt: "user prompt" })
    expect(config.agent.spec.model).toBe("openai/gpt-5.5")
    expect(config.agent.archivist.mode).toBe("subagent")
  })

  test("Given existing internal agent key owned by the user When install runs Then installer does not overwrite that key", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        agent: {
          archivist: { model: "user/model", prompt: "user prompt" },
        },
      }),
    )

    const result = await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(result.addedAgents).not.toContain("archivist")
    expect(config.agent.archivist).toEqual({ model: "user/model", prompt: "user prompt" })
    expect(config.agent.curator.mode).toBe("subagent")
  })

  test("Given previously generated retrospec agents without mode When install reruns Then managed agents receive expected modes", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        agent: {
          retrospec: {
            model: "openai:gpt-5.5",
            prompt: "file:///pkg/agents/retrospec/AGENT.md",
          },
          retro: { model: "openai:gpt-5.5", prompt: "file:///pkg/agents/retro/AGENT.md" },
          spec: { model: "openai:gpt-5.5", prompt: "file:///pkg/agents/spec/AGENT.md" },
          archivist: { model: "openai:gpt-5.5", prompt: "file:///pkg/agents/Archivist/AGENT.md" },
          curator: { model: "openai:gpt-5.5", prompt: "file:///pkg/agents/Curator/AGENT.md" },
        },
      }),
    )

    const result = await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(result.addedAgents).toEqual(["surveyor", "appraiser", "excavator"])
    expect(config.agent.retrospec.mode).toBe("primary")
    expect(config.agent.retrospec.model).toBe("openai/gpt-5.5")
    expect(config.agent.retrospec.prompt).toMatch(/^\{file:.+agents\/retrospec\/AGENT\.md\}$/)
    expect(config.agent.retrospec.prompt).not.toStartWith("file://")
    expect(config.agent.retro.mode).toBe("primary")
    expect(config.agent.retro.model).toBe("openai/gpt-5.5")
    expect(config.agent.retro.prompt).toMatch(/^\{file:.+agents\/retro\/AGENT\.md\}$/)
    expect(config.agent.retro.prompt).not.toStartWith("file://")
    expect(config.agent.spec.mode).toBe("primary")
    expect(config.agent.spec.model).toBe("openai/gpt-5.5")
    expect(config.agent.spec.prompt).toMatch(/^\{file:.+agents\/spec\/AGENT\.md\}$/)
    expect(config.agent.spec.prompt).not.toStartWith("file://")
    expect(config.agent.archivist.mode).toBe("subagent")
    expect(config.agent.archivist.model).toBe("openai/gpt-5.5")
    expect(config.agent.archivist.prompt).toMatch(/^\{file:.+agents\/Archivist\/AGENT\.md\}$/)
    expect(config.agent.curator.mode).toBe("subagent")
    expect(config.agent.curator.prompt).toMatch(/^\{file:.+agents\/Curator\/AGENT\.md\}$/)
  })

  test("Given existing npm plugin config When install runs Then installer does not clobber user plugin config", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        plugin: ["opencode-wakatime"],
        agent: {},
      }),
    )

    await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(config.plugin).toEqual(["opencode-wakatime"])
    expect(config.agent.retrospec.mode).toBe("primary")
    expect(config.agent.archivist.mode).toBe("subagent")
    await expect(
      readFile(join(projectRoot, ".opencode", "plugins", "retrospec-agent-order.js"), "utf8"),
    ).resolves.toContain("installRetrospecAgentOrderShim")
  })

  test("Given a fresh project When the install CLI runs Then generated opencode config is visible on disk and in stdout", async () => {
    const projectRoot = await tempProject()

    const processHandle = Bun.spawn(
      [process.execPath, "run", "src/cli.ts", "install", projectRoot],
      {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      },
    )

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
      processHandle.exited,
    ])

    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    const config = JSON.parse(await readFile(configPath, "utf8"))

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain(`opencode config: ${configPath}`)
    expect(stdout).toContain("added agents: retrospec, retro, spec")
    expect(config.agent.retrospec.mode).toBe("primary")
    expect(config.agent.retro.mode).toBe("primary")
    expect(config.agent.spec.mode).toBe("primary")
    expect(config.retrospec.hooks_enabled).toBe(true)
  })
})
