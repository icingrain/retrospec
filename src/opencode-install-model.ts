import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"

export type OpenCodeInstallModelConfig = {
  readonly model?: string | undefined
  readonly provider?: unknown
}

export type InstallModelPromptIo = {
  readonly input: NodeJS.ReadableStream
  readonly output: NodeJS.WritableStream
}

export type InstallModelSelectionOptions = {
  readonly model?: string | undefined
  readonly selectModel?: boolean | undefined
  readonly prompt?: InstallModelPromptIo | undefined
}

export async function resolveInstallModel(
  config: OpenCodeInstallModelConfig,
  env: NodeJS.ProcessEnv,
  options: InstallModelSelectionOptions,
): Promise<string | undefined> {
  const envModel = env["RETROSPEC_AGENT_MODEL"]
  if (options.model !== undefined) {
    return options.model
  }
  if (envModel !== undefined) {
    return envModel
  }
  if (options.selectModel === true) {
    const selected = await selectOpenCodeModel(
      discoverOpenCodeModels(config),
      config.model,
      options.prompt,
    )
    return selected ?? config.model
  }
  return config.model
}

export function applyInstallModelEnv(
  env: NodeJS.ProcessEnv,
  model: string | undefined,
): NodeJS.ProcessEnv {
  if (model === undefined) {
    return env
  }
  return { ...env, RETROSPEC_AGENT_MODEL: model }
}

export function discoverOpenCodeModels(config: OpenCodeInstallModelConfig): readonly string[] {
  const models = new Set<string>()
  if (config.model !== undefined) {
    models.add(config.model)
  }
  for (const model of discoverProviderModels(config.provider)) {
    models.add(model)
  }
  return [...models]
}

async function selectOpenCodeModel(
  models: readonly string[],
  currentModel: string | undefined,
  prompt: InstallModelPromptIo | undefined,
): Promise<string | undefined> {
  if (models.length === 0) {
    return undefined
  }
  if (models.length === 1) {
    return models[0]
  }

  const io = prompt ?? { input: stdin, output: stdout }
  const rl = createInterface({ input: io.input, output: io.output })
  try {
    writeModelChoices(io.output, models, currentModel)
    const fallbackIndex = defaultModelIndex(models, currentModel)
    const answer = await rl.question(`Choose Retrospec agent model [${fallbackIndex + 1}]: `)
    return parseModelChoice(answer, models, fallbackIndex)
  } finally {
    rl.close()
  }
}

function discoverProviderModels(provider: unknown): readonly string[] {
  if (!isRecord(provider)) {
    return []
  }
  const models: string[] = []
  for (const [providerName, providerConfig] of Object.entries(provider)) {
    const modelRecord = providerModelRecord(providerConfig)
    if (modelRecord === null) {
      continue
    }
    for (const modelName of Object.keys(modelRecord)) {
      models.push(`${providerName}/${modelName}`)
    }
  }
  return models
}

function providerModelRecord(providerConfig: unknown): Record<string, unknown> | null {
  if (!isRecord(providerConfig)) {
    return null
  }
  const models = providerConfig["models"]
  return isRecord(models) ? models : null
}

function writeModelChoices(
  output: NodeJS.WritableStream,
  models: readonly string[],
  currentModel: string | undefined,
): void {
  output.write("Select opencode model for Retrospec agents:\n")
  for (const [index, model] of models.entries()) {
    const marker = model === currentModel ? " (current)" : ""
    output.write(`  ${index + 1}. ${model}${marker}\n`)
  }
}

function defaultModelIndex(models: readonly string[], currentModel: string | undefined): number {
  const index = currentModel === undefined ? -1 : models.indexOf(currentModel)
  return index < 0 ? 0 : index
}

function parseModelChoice(
  answer: string,
  models: readonly string[],
  fallbackIndex: number,
): string {
  const fallback = models[fallbackIndex] ?? models[0]
  if (fallback === undefined) {
    throw new Error("model selection requires at least one model")
  }
  const trimmed = answer.trim()
  if (trimmed.length === 0) {
    return fallback
  }
  const selectedIndex = Number.parseInt(trimmed, 10) - 1
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= models.length) {
    throw new Error(`invalid model selection: ${answer}`)
  }
  return models[selectedIndex] ?? fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
