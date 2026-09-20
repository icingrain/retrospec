import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type OpenCodeGlobalConfig = Record<string, unknown>

export type RetrospecAgentModelDefaults = Record<string, string>

export async function readOpenCodeGlobalConfig(
  env: NodeJS.ProcessEnv,
): Promise<OpenCodeGlobalConfig> {
  const config = await readFirstExistingConfig(openCodeConfigPaths(env))
  return config ?? {}
}

export async function writeRetrospecAgentModelDefaults(
  env: NodeJS.ProcessEnv,
  agentModels: RetrospecAgentModelDefaults,
): Promise<void> {
  const path = writableOpenCodeConfigPath(env)
  const existing = (await readOpenCodeConfig(path)) ?? {}
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify(withRetrospecAgentModels(existing, agentModels), null, 2)}\n`,
  )
}

export function readRetrospecAgentModelDefaults(
  config: OpenCodeGlobalConfig,
): RetrospecAgentModelDefaults | undefined {
  const retrospec = config["retrospec"]
  if (!isRecord(retrospec)) {
    return undefined
  }
  const models = retrospec["agent_models"]
  if (!isRecord(models)) {
    return undefined
  }
  const entries = Object.entries(models).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  )
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

export function providerNames(config: OpenCodeGlobalConfig): readonly string[] {
  const provider = config["provider"]
  return isRecord(provider) ? Object.keys(provider) : []
}

function withRetrospecAgentModels(
  config: OpenCodeGlobalConfig,
  agentModels: RetrospecAgentModelDefaults,
): OpenCodeGlobalConfig {
  const retrospec = isRecord(config["retrospec"]) ? config["retrospec"] : {}
  return { ...config, retrospec: { ...retrospec, agent_models: agentModels } }
}

async function readFirstExistingConfig(
  paths: readonly string[],
): Promise<OpenCodeGlobalConfig | undefined> {
  for (const path of paths) {
    const config = await readOpenCodeConfig(path)
    if (config !== undefined) {
      return config
    }
  }
  return undefined
}

async function readOpenCodeConfig(path: string): Promise<OpenCodeGlobalConfig | undefined> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return undefined
  }
  const parsed = JSON.parse(stripJsonComments(await readFile(path, "utf8")))
  return isRecord(parsed) ? parsed : {}
}

function writableOpenCodeConfigPath(env: NodeJS.ProcessEnv): string {
  const customConfigDir = env["OPENCODE_CONFIG_DIR"]?.trim()
  if (customConfigDir !== undefined && customConfigDir.length > 0) {
    return join(customConfigDir, "opencode.json")
  }
  const xdgConfigHome = env["XDG_CONFIG_HOME"]?.trim()
  if (xdgConfigHome !== undefined && xdgConfigHome.length > 0) {
    return join(xdgConfigHome, "opencode", "opencode.json")
  }
  const home = env["HOME"]?.trim() ?? homedir()
  return join(home, ".config", "opencode", "opencode.json")
}

function openCodeConfigPaths(env: NodeJS.ProcessEnv): readonly string[] {
  const paths: string[] = []
  const customConfigDir = env["OPENCODE_CONFIG_DIR"]?.trim()
  if (customConfigDir !== undefined && customConfigDir.length > 0) {
    paths.push(join(customConfigDir, "opencode.json"), join(customConfigDir, "opencode.jsonc"))
  }
  const xdgConfigHome = env["XDG_CONFIG_HOME"]?.trim()
  if (xdgConfigHome !== undefined && xdgConfigHome.length > 0) {
    paths.push(
      join(xdgConfigHome, "opencode", "opencode.json"),
      join(xdgConfigHome, "opencode", "opencode.jsonc"),
    )
  }
  const home = env["HOME"]?.trim() ?? homedir()
  paths.push(join(home, ".config", "opencode", "opencode.json"))
  paths.push(join(home, ".config", "opencode", "opencode.jsonc"))
  return [...new Set(paths)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stripJsonComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}
