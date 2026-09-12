import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { loadRetrospecAgentModelConfig } from "./config"
import { retrospecConfigDefaults } from "./opencode-defaults"

const opencodeConfigSchema = z.object({
  agent: z.record(z.unknown()).optional(),
})

const retrospecRoot = fileURLToPath(new URL("..", import.meta.url))
const retrospecAgentOrderPluginPath = join(".opencode", "plugins", "retrospec-agent-order.js")
const retrospecAgentOrderPlugin = `const RETROSPEC_AGENT_ORDER = ["retrospec", "retro", "spec"]
const RETROSPEC_AGENT_RANK = new Map(RETROSPEC_AGENT_ORDER.map((name, index) => [name, index + 1]))
const UNRANKED = Number.MAX_SAFE_INTEGER

let installed = false

function extractAgentName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : ""
}

function isRetrospecAgentArray(values) {
  if (values.length < 2) return false

  let rankedCount = 0
  for (const value of values) {
    if (!value || typeof value !== "object" || typeof value.name !== "string") return false
    if (RETROSPEC_AGENT_RANK.has(value.name)) rankedCount += 1
  }

  return rankedCount >= 2
}

function compareAgents(left, right, fallback) {
  const leftRank = RETROSPEC_AGENT_RANK.get(extractAgentName(left)) ?? UNRANKED
  const rightRank = RETROSPEC_AGENT_RANK.get(extractAgentName(right)) ?? UNRANKED
  if (leftRank !== rightRank) return leftRank - rightRank
  return fallback ? fallback(left, right) : 0
}

function installRetrospecAgentOrderShim() {
  if (installed) return

  const originalSort = Array.prototype.sort
  const originalToSorted = Array.prototype.toSorted

  Object.defineProperty(Array.prototype, "sort", {
    value(compareFn) {
      if (isRetrospecAgentArray(this)) {
        return originalSort.call(this, (left, right) => compareAgents(left, right, compareFn))
      }
      return originalSort.call(this, compareFn)
    },
    configurable: true,
    writable: true,
    enumerable: false,
  })

  if (typeof originalToSorted === "function") {
    Object.defineProperty(Array.prototype, "toSorted", {
      value(compareFn) {
        if (isRetrospecAgentArray(this)) {
          return originalToSorted.call(this, (left, right) => compareAgents(left, right, compareFn))
        }
        return originalToSorted.call(this, compareFn)
      },
      configurable: true,
      writable: true,
      enumerable: false,
    })
  }

  installed = true
}

export const RetrospecAgentOrder = async () => {
  installRetrospecAgentOrderShim()
  return {}
}
`

type OpenCodeConfig = z.infer<typeof opencodeConfigSchema> & Record<string, unknown>

type AgentDefinition = {
  readonly key: string
  readonly mode: "primary" | "subagent"
  readonly promptPath: string
  readonly model: string
}

type InstalledAgent = {
  readonly mode: "primary" | "subagent"
  readonly model: string
  readonly prompt: string
}

export type InstallRetrospecOpenCodeConfigResult = {
  readonly configPath: string
  readonly pluginPath: string
  readonly addedAgents: readonly string[]
}

export async function installRetrospecOpenCodeConfig(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<InstallRetrospecOpenCodeConfigResult> {
  const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
  const pluginPath = join(projectRoot, retrospecAgentOrderPluginPath)
  const config = await readOpenCodeConfig(configPath)
  const agentConfig = loadRetrospecAgentModelConfig(env)
  const existingAgents = toAgentRecord(config.agent)
  const addedAgents: string[] = []

  for (const agent of createRetrospecAgentDefinitions(agentConfig.agents)) {
    const installedAgent = createInstalledAgent(agent, dirname(configPath))
    if (!Object.hasOwn(existingAgents, agent.key)) {
      existingAgents[agent.key] = installedAgent
      addedAgents.push(agent.key)
      continue
    }

    if (isRetrospecManagedAgent(existingAgents[agent.key], agent)) {
      existingAgents[agent.key] = installedAgent
    }
  }

  await mkdir(dirname(configPath), { recursive: true })
  await mkdir(dirname(pluginPath), { recursive: true })
  await writeFile(
    configPath,
    `${JSON.stringify(
      { ...config, agent: existingAgents, retrospec: createRetrospecConfig(config["retrospec"]) },
      null,
      2,
    )}\n`,
  )
  await writeFile(pluginPath, retrospecAgentOrderPlugin)

  return { configPath, pluginPath, addedAgents }
}

async function readOpenCodeConfig(configPath: string): Promise<OpenCodeConfig> {
  const file = Bun.file(configPath)
  if (!(await file.exists())) {
    return {}
  }

  const raw = await readFile(configPath, "utf8")
  const parsed = JSON.parse(stripJsonComments(raw))
  return opencodeConfigSchema.passthrough().parse(parsed)
}

function toAgentRecord(value: unknown): Record<string, unknown> {
  return z.record(z.unknown()).catch({}).parse(value)
}

function createRetrospecConfig(value: unknown): Record<string, unknown> {
  const existing = z.record(z.unknown()).catch({}).parse(value)
  return { ...retrospecConfigDefaults, ...existing, hooks_enabled: true }
}

function createRetrospecAgentDefinitions(
  models: ReturnType<typeof loadRetrospecAgentModelConfig>["agents"],
): readonly AgentDefinition[] {
  return [
    {
      key: "retrospec",
      mode: "primary",
      promptPath: "agents/retrospec/AGENT.md",
      model: models.Curator,
    },
    { key: "retro", mode: "primary", promptPath: "agents/retro/AGENT.md", model: models.Surveyor },
    { key: "spec", mode: "primary", promptPath: "agents/spec/AGENT.md", model: models.Curator },
    {
      key: "archivist",
      mode: "subagent",
      promptPath: "agents/Archivist/AGENT.md",
      model: models.Archivist,
    },
    {
      key: "curator",
      mode: "subagent",
      promptPath: "agents/Curator/AGENT.md",
      model: models.Curator,
    },
    {
      key: "surveyor",
      mode: "subagent",
      promptPath: "agents/Surveyor/AGENT.md",
      model: models.Surveyor,
    },
    {
      key: "appraiser",
      mode: "subagent",
      promptPath: "agents/Appraiser/AGENT.md",
      model: models.Appraiser,
    },
    {
      key: "excavator",
      mode: "subagent",
      promptPath: "agents/Excavator/AGENT.md",
      model: models.Excavator,
    },
  ] as const
}

function createInstalledAgent(agent: AgentDefinition, configDir: string): InstalledAgent {
  return {
    mode: agent.mode,
    model: agent.model,
    prompt: createPromptInclude(configDir, agent.promptPath),
  }
}

function createPromptInclude(configDir: string, promptPath: string): string {
  const absolutePath = join(retrospecRoot, promptPath)
  const relativePath = relative(configDir, absolutePath).split(sep).join("/")
  const includePath = formatOpenCodeFileIncludePath(
    isRelativeEscapePath(relativePath) ? absolutePath : relativePath,
  )
  return `{file:${includePath}}`
}

export function formatOpenCodeFileIncludePath(path: string): string {
  if (path.startsWith(".") || path.startsWith("/") || isWindowsAbsolutePath(path)) {
    return path
  }
  return `./${path}`
}

function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:\//.test(path) || path.startsWith("//")
}

function isRelativeEscapePath(path: string): boolean {
  return path === ".." || path.startsWith("../")
}

function isRetrospecManagedAgent(value: unknown, agent: AgentDefinition): boolean {
  const parsed = z.object({ prompt: z.string() }).safeParse(value)
  if (!parsed.success) {
    return false
  }

  return parsed.data.prompt.includes(agent.promptPath)
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
}
