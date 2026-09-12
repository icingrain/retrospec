import { z } from "zod"
import type { SpecProviderSettings } from "./provider-settings"

const providerEnvSchema = z.object({
  RETROSPEC_SPEC_PROVIDER_MODE: z
    .union([z.literal("deterministic"), z.literal("env-provider"), z.literal("opencode-broker")])
    .optional(),
  RETROSPEC_SPEC_PROVIDER: z.string().optional(),
  RETROSPEC_SPEC_MODEL: z.string().optional(),
  RETROSPEC_SPEC_API_KEY: z.string().optional(),
  RETROSPEC_SPEC_BASE_URL: z.string().url().optional(),
  RETROSPEC_SPEC_BROKER_URL: z.string().url().optional(),
  RETROSPEC_SPEC_BROKER_TOKEN: z.string().optional(),
  RETROSPEC_AGENT_MODEL: z.string().optional(),
  RETROSPEC_AGENT_MODEL_EXCAVATOR: z.string().optional(),
  RETROSPEC_AGENT_MODEL_SURVEYOR: z.string().optional(),
  RETROSPEC_AGENT_MODEL_CURATOR: z.string().optional(),
  RETROSPEC_AGENT_MODEL_ARCHIVIST: z.string().optional(),
  RETROSPEC_AGENT_MODEL_APPRAISER: z.string().optional(),
})

export const retrospecAgentNames = [
  "Excavator",
  "Surveyor",
  "Curator",
  "Archivist",
  "Appraiser",
] as const

export type RetrospecAgentName = (typeof retrospecAgentNames)[number]

export type RetrospecAgentModelConfig = {
  readonly defaultModel: string
  readonly agents: Readonly<Record<RetrospecAgentName, string>>
}

const defaultAgentModel = "openai/gpt-5.5"

export type SpecProviderConfig =
  | { readonly mode: "deterministic" }
  | {
      readonly mode: "env-provider"
      readonly provider: string
      readonly model: string
      readonly apiKey: string
      readonly baseUrl?: string
    }
  | {
      readonly mode: "opencode-broker"
      readonly model: string
      readonly brokerUrl: string
      readonly brokerToken?: string
    }

type SpecProviderEnvFields = {
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly apiKey: string | undefined
  readonly baseUrl: string | undefined
  readonly brokerUrl: string | undefined
  readonly brokerToken: string | undefined
}

export function loadSpecProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
  settings?: SpecProviderSettings | null,
): SpecProviderConfig {
  const parsed = providerEnvSchema.parse(env)
  const fields: SpecProviderEnvFields = {
    provider: parsed.RETROSPEC_SPEC_PROVIDER,
    model: parsed.RETROSPEC_SPEC_MODEL,
    apiKey: parsed.RETROSPEC_SPEC_API_KEY,
    baseUrl: parsed.RETROSPEC_SPEC_BASE_URL,
    brokerUrl: parsed.RETROSPEC_SPEC_BROKER_URL,
    brokerToken: parsed.RETROSPEC_SPEC_BROKER_TOKEN,
  }
  if (settings !== undefined && settings !== null) {
    return loadSavedSpecProviderConfig(settings, fields)
  }
  const providerMode = parsed.RETROSPEC_SPEC_PROVIDER_MODE
  const resolvedMode = providerMode ?? inferSpecProviderMode(fields)

  switch (resolvedMode) {
    case "deterministic":
      return { mode: "deterministic" }
    case "env-provider":
      return loadEnvProviderConfig(fields)
    case "opencode-broker":
      return loadOpencodeBrokerConfig(fields)
    default:
      return assertNever(resolvedMode)
  }
}

function loadSavedSpecProviderConfig(
  settings: SpecProviderSettings,
  fields: SpecProviderEnvFields,
): SpecProviderConfig {
  switch (settings.mode) {
    case "deterministic":
      return { mode: "deterministic" }
    case "env-provider":
      return loadEnvProviderConfig({
        provider: settings.provider,
        model: settings.model,
        apiKey: fields.apiKey,
        baseUrl: settings.baseUrl,
        brokerUrl: undefined,
        brokerToken: undefined,
      })
    case "opencode-broker":
      return loadOpencodeBrokerConfig({
        provider: undefined,
        model: settings.model,
        apiKey: undefined,
        baseUrl: undefined,
        brokerUrl: settings.brokerUrl,
        brokerToken: fields.brokerToken,
      })
    default:
      return assertNever(settings)
  }
}

function inferSpecProviderMode(fields: SpecProviderEnvFields): SpecProviderConfig["mode"] {
  if (fields.brokerUrl !== undefined) {
    return "opencode-broker"
  }
  if (fields.provider === undefined && fields.model === undefined && fields.apiKey === undefined) {
    return "deterministic"
  }
  return "env-provider"
}

function loadEnvProviderConfig(fields: SpecProviderEnvFields): SpecProviderConfig {
  const { provider, model, apiKey, baseUrl } = fields
  if (provider === undefined || model === undefined || apiKey === undefined) {
    throw new Error(
      "provider config requires RETROSPEC_SPEC_PROVIDER, RETROSPEC_SPEC_MODEL, and RETROSPEC_SPEC_API_KEY",
    )
  }
  if (baseUrl !== undefined) {
    return { mode: "env-provider", provider, model, apiKey, baseUrl }
  }
  return { mode: "env-provider", provider, model, apiKey }
}

function loadOpencodeBrokerConfig(fields: SpecProviderEnvFields): SpecProviderConfig {
  const { model, brokerUrl, brokerToken } = fields
  if (brokerUrl === undefined) {
    throw new Error("opencode-broker config requires RETROSPEC_SPEC_BROKER_URL")
  }
  if (model === undefined) {
    throw new Error("opencode-broker config requires RETROSPEC_SPEC_MODEL")
  }
  if (brokerToken !== undefined) {
    return { mode: "opencode-broker", model, brokerUrl, brokerToken }
  }
  return { mode: "opencode-broker", model, brokerUrl }
}

function assertNever(value: never): never {
  throw new Error(`unhandled spec provider mode: ${value}`)
}

export function loadRetrospecAgentModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): RetrospecAgentModelConfig {
  const parsed = providerEnvSchema.parse(env)
  const defaultModel = normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL ?? defaultAgentModel)
  return {
    defaultModel,
    agents: {
      Excavator: normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL_EXCAVATOR ?? defaultModel),
      Surveyor: normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL_SURVEYOR ?? defaultModel),
      Curator: normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL_CURATOR ?? defaultModel),
      Archivist: normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL_ARCHIVIST ?? defaultModel),
      Appraiser: normalizeOpenCodeModelId(parsed.RETROSPEC_AGENT_MODEL_APPRAISER ?? defaultModel),
    },
  }
}

function normalizeOpenCodeModelId(model: string): string {
  return model.replace(/^([^:/]+):/, "$1/")
}

export function resolveRetrospecAgentModel(
  agentName: RetrospecAgentName,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return loadRetrospecAgentModelConfig(env).agents[agentName]
}
