import { Database } from "bun:sqlite"
import { z } from "zod"
import type { BrokerHealthStatus } from "./provider-health"
import { ensureProjectRegistry } from "./registry"
import type { ProjectPaths } from "./types"

export const specProviderSettingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("deterministic"), secretSource: z.literal("env").default("env") }),
  z.object({
    mode: z.literal("env-provider"),
    provider: z.string().min(1),
    model: z.string().min(1),
    baseUrl: z.string().url().optional(),
    secretSource: z.literal("env").default("env"),
  }),
  z.object({
    mode: z.literal("opencode-broker"),
    model: z.string().min(1),
    brokerUrl: z.string().url(),
    secretSource: z.literal("env").default("env"),
  }),
])

export type SpecProviderSettings = z.infer<typeof specProviderSettingsSchema>
export type SpecProviderSettingsInput = z.input<typeof specProviderSettingsSchema>

export type SavedSpecProviderSettings = {
  readonly settings: SpecProviderSettings
  readonly updatedAt: string
}

export type SpecProviderSettingsResolution = {
  readonly source: "saved" | "env" | "fallback"
  readonly readiness: "ready" | "invalid"
  readonly messages: readonly string[]
  readonly broker_health?: BrokerHealthStatus
}

type SpecProviderSettingsRow = {
  readonly mode: "deterministic" | "env-provider" | "opencode-broker"
  readonly provider: string | null
  readonly model: string | null
  readonly base_url: string | null
  readonly broker_url: string | null
  readonly secret_source: "env"
  readonly updated_at: string
}

const providerSettingsKey = "default"

export async function writeSpecProviderSettings(
  paths: ProjectPaths,
  input: SpecProviderSettingsInput,
): Promise<SavedSpecProviderSettings> {
  await ensureProjectRegistry(paths)
  const settings = specProviderSettingsSchema.parse(input)
  const updatedAt = new Date().toISOString()
  const db = new Database(paths.registryDb, { create: true })

  try {
    db.query(
      `insert into spec_provider_settings
         (settings_key, mode, provider, model, base_url, broker_url, secret_source, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(settings_key) do update set
         mode = excluded.mode,
         provider = excluded.provider,
         model = excluded.model,
         base_url = excluded.base_url,
         broker_url = excluded.broker_url,
         secret_source = excluded.secret_source,
         updated_at = excluded.updated_at`,
    ).run(
      providerSettingsKey,
      settings.mode,
      providerColumn(settings),
      modelColumn(settings),
      baseUrlColumn(settings),
      brokerUrlColumn(settings),
      settings.secretSource,
      updatedAt,
    )
  } finally {
    db.close()
  }

  return { settings, updatedAt }
}

export async function readSpecProviderSettings(
  paths: ProjectPaths,
): Promise<SavedSpecProviderSettings | null> {
  await ensureProjectRegistry(paths)
  const db = new Database(paths.registryDb, { readonly: true })

  try {
    const row = db
      .query<SpecProviderSettingsRow, [string]>(
        `select mode, provider, model, base_url, broker_url, secret_source, updated_at
         from spec_provider_settings
         where settings_key = ?`,
      )
      .get(providerSettingsKey)
    if (row === null) {
      return null
    }
    return { settings: specProviderSettingsFromRow(row), updatedAt: row.updated_at }
  } finally {
    db.close()
  }
}

export function resolveSpecProviderSettingsState(
  saved: SavedSpecProviderSettings | null,
  brokerHealth?: BrokerHealthStatus,
): SpecProviderSettingsResolution {
  if (saved !== null) {
    return {
      source: "saved",
      readiness: "ready",
      messages: brokerHealth?.status === "down" ? brokerHealth.messages : [],
      ...(brokerHealth !== undefined ? { broker_health: brokerHealth } : {}),
    }
  }
  return {
    source: "fallback",
    readiness: "ready",
    messages: ["Using daemon environment fallback."],
  }
}

function specProviderSettingsFromRow(row: SpecProviderSettingsRow): SpecProviderSettings {
  switch (row.mode) {
    case "deterministic":
      return { mode: "deterministic", secretSource: row.secret_source }
    case "env-provider":
      return specProviderSettingsSchema.parse({
        mode: row.mode,
        provider: row.provider,
        model: row.model,
        ...(row.base_url !== null ? { baseUrl: row.base_url } : {}),
        secretSource: row.secret_source,
      })
    case "opencode-broker":
      return specProviderSettingsSchema.parse({
        mode: row.mode,
        model: row.model,
        brokerUrl: row.broker_url,
        secretSource: row.secret_source,
      })
    default:
      return assertNever(row.mode)
  }
}

function providerColumn(settings: SpecProviderSettings): string | null {
  switch (settings.mode) {
    case "deterministic":
    case "opencode-broker":
      return null
    case "env-provider":
      return settings.provider
    default:
      return assertNever(settings)
  }
}

function modelColumn(settings: SpecProviderSettings): string | null {
  switch (settings.mode) {
    case "deterministic":
      return null
    case "env-provider":
    case "opencode-broker":
      return settings.model
    default:
      return assertNever(settings)
  }
}

function baseUrlColumn(settings: SpecProviderSettings): string | null {
  switch (settings.mode) {
    case "deterministic":
    case "opencode-broker":
      return null
    case "env-provider":
      return settings.baseUrl ?? null
    default:
      return assertNever(settings)
  }
}

function brokerUrlColumn(settings: SpecProviderSettings): string | null {
  switch (settings.mode) {
    case "deterministic":
    case "env-provider":
      return null
    case "opencode-broker":
      return settings.brokerUrl
    default:
      return assertNever(settings)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled spec provider settings: ${JSON.stringify(value)}`)
}
