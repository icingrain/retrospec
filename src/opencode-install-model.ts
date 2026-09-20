import {
  providerNames,
  readOpenCodeGlobalConfig,
  readRetrospecAgentModelDefaults,
  writeRetrospecAgentModelDefaults,
} from "./opencode-global-config"
import {
  type InstallModelPromptIo,
  selectInstallAgentModels,
} from "./opencode-install-model-prompt"
import {
  type RetrospecInstallAgentModels,
  completeAgentModels,
  defaultInstallModel,
  modelsForAll,
} from "./opencode-install-model-values"
export type { InstallModelPromptIo } from "./opencode-install-model-prompt"
export type {
  RetrospecInstallAgentKey,
  RetrospecInstallAgentModels,
} from "./opencode-install-model-values"
export { retrospecInstallAgentKeys } from "./opencode-install-model-values"

export type OpenCodeInstallModelConfig = {
  readonly model?: string | undefined
  readonly provider?: unknown
}

export type InstallModelSelectionOptions = {
  readonly model?: string | undefined
  readonly selectModel?: boolean | undefined
  readonly promptOnMissingModel?: boolean | undefined
  readonly prompt?: InstallModelPromptIo | undefined
}

export async function resolveInstallAgentModels(
  config: OpenCodeInstallModelConfig,
  env: NodeJS.ProcessEnv,
  options: InstallModelSelectionOptions,
): Promise<RetrospecInstallAgentModels> {
  const globalConfig = await readOpenCodeGlobalConfig(env)
  const fallbackModel = installFallbackModel(config, globalConfig)
  const savedModels = readRetrospecAgentModelDefaults(globalConfig)

  if (options.model !== undefined) {
    const agentModels = modelsForAll(options.model)
    await writeRetrospecAgentModelDefaults(env, agentModels)
    return agentModels
  }
  if (hasEnvAgentModel(env)) {
    return envAgentModels(env, fallbackModel)
  }
  if (
    options.selectModel === true ||
    (options.promptOnMissingModel === true && savedModels === undefined)
  ) {
    const agentModels = await selectInstallAgentModels(
      providerNames(globalConfig),
      fallbackModel,
      options.prompt,
    )
    await writeRetrospecAgentModelDefaults(env, agentModels)
    return agentModels
  }
  if (savedModels !== undefined) {
    return completeAgentModels(savedModels, fallbackModel)
  }
  return modelsForAll(fallbackModel)
}

export async function resolveInstallModel(
  config: OpenCodeInstallModelConfig,
  env: NodeJS.ProcessEnv,
  options: InstallModelSelectionOptions,
): Promise<string | undefined> {
  return (await resolveInstallAgentModels(config, env, options)).retrospec
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

function installFallbackModel(
  projectConfig: OpenCodeInstallModelConfig,
  globalConfig: OpenCodeInstallModelConfig,
): string {
  return projectConfig.model ?? globalConfig.model ?? defaultInstallModel
}

function hasEnvAgentModel(env: NodeJS.ProcessEnv): boolean {
  return (
    env["RETROSPEC_AGENT_MODEL"] !== undefined ||
    env["RETROSPEC_AGENT_MODEL_EXCAVATOR"] !== undefined ||
    env["RETROSPEC_AGENT_MODEL_SURVEYOR"] !== undefined ||
    env["RETROSPEC_AGENT_MODEL_CURATOR"] !== undefined ||
    env["RETROSPEC_AGENT_MODEL_ARCHIVIST"] !== undefined ||
    env["RETROSPEC_AGENT_MODEL_APPRAISER"] !== undefined
  )
}

function envAgentModels(
  env: NodeJS.ProcessEnv,
  fallbackModel: string,
): RetrospecInstallAgentModels {
  const defaultModel = env["RETROSPEC_AGENT_MODEL"] ?? fallbackModel
  return completeAgentModels(
    {
      ...(env["RETROSPEC_AGENT_MODEL_CURATOR"] === undefined
        ? {}
        : {
            retrospec: env["RETROSPEC_AGENT_MODEL_CURATOR"],
            spec: env["RETROSPEC_AGENT_MODEL_CURATOR"],
            curator: env["RETROSPEC_AGENT_MODEL_CURATOR"],
          }),
      ...(env["RETROSPEC_AGENT_MODEL_SURVEYOR"] === undefined
        ? {}
        : {
            retro: env["RETROSPEC_AGENT_MODEL_SURVEYOR"],
            surveyor: env["RETROSPEC_AGENT_MODEL_SURVEYOR"],
          }),
      ...(env["RETROSPEC_AGENT_MODEL_ARCHIVIST"] === undefined
        ? {}
        : { archivist: env["RETROSPEC_AGENT_MODEL_ARCHIVIST"] }),
      ...(env["RETROSPEC_AGENT_MODEL_APPRAISER"] === undefined
        ? {}
        : { appraiser: env["RETROSPEC_AGENT_MODEL_APPRAISER"] }),
      ...(env["RETROSPEC_AGENT_MODEL_EXCAVATOR"] === undefined
        ? {}
        : { excavator: env["RETROSPEC_AGENT_MODEL_EXCAVATOR"] }),
    },
    defaultModel,
  )
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
