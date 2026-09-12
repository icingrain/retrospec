import ky, { HTTPError } from "ky"
import { z } from "zod"
import type { SpecProviderConfig } from "../config"
import type { SpecAnalysisDriver, SpecAnalysisDriverResult } from "./driver-types"
import { SpecAnalysisDriverError } from "./driver-types"
import type { RiskFindingInput, SpecBatchInput, SpecUsageMetadata } from "./types"

const riskFindingInputSchema = z.object({
  findingId: z.string(),
  entityId: z.string(),
  severity: z.string(),
  riskType: z.string(),
  summary: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  evidenceLabel: z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]).optional(),
  findingStatus: z.enum(["open", "needs_review", "unresolved"]).optional(),
  memoryNotes: z.array(z.string()).optional(),
})

const providerFindingsSchema = z.object({
  findings: z.array(riskFindingInputSchema),
})

const providerUsageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
})

const providerResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
  usage: providerUsageSchema.optional(),
})

const brokerUsageSchema = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  costUsd: z.number().optional(),
})

const brokerResponseSchema = z.object({
  broker_run_id: z.string().optional(),
  findings: z.array(riskFindingInputSchema),
  usage: brokerUsageSchema.optional(),
  partialResult: z.string().nullable().optional(),
})

const brokerErrorResponseSchema = z.object({
  error: z.string(),
  broker_run_id: z.string().optional(),
  partialResult: z.string().optional(),
})

type EnvProviderConfig = Extract<SpecProviderConfig, { readonly mode: "env-provider" }>
type OpencodeBrokerConfig = Extract<SpecProviderConfig, { readonly mode: "opencode-broker" }>
type ProviderRiskFindingInput = z.infer<typeof riskFindingInputSchema>

export function createEnvProviderDriver(config: EnvProviderConfig): SpecAnalysisDriver {
  return {
    model: `${config.provider}:${config.model}`,
    promptVersion: "risk-v1",
    providerMode: "env-provider",
    analyze: (input) => analyzeWithEnvProvider(config, input),
  }
}

export function createOpencodeBrokerDriver(config: OpencodeBrokerConfig): SpecAnalysisDriver {
  return {
    model: `opencode-broker:${config.model}`,
    promptVersion: "risk-v1",
    providerMode: "opencode-broker",
    analyze: (input) => analyzeWithOpencodeBroker(config, input),
  }
}

async function analyzeWithEnvProvider(
  config: EnvProviderConfig,
  input: SpecBatchInput,
): Promise<SpecAnalysisDriverResult> {
  const response = providerResponseSchema.parse(
    await ky
      .post(`${getEnvProviderBaseUrl(config)}/chat/completions`, {
        headers: { authorization: `Bearer ${config.apiKey}` },
        json: createProviderRequest(config.model, input),
        retry: { limit: 0 },
        timeout: 30_000,
      })
      .json(),
  )
  const usage = toEnvProviderUsageMetadata(response.usage)
  const partialResult = response.choices[0]?.message.content ?? ""

  try {
    const parsed = providerFindingsSchema.parse(JSON.parse(partialResult))
    return { findings: parsed.findings.map(toRiskFinding), usage }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new SpecAnalysisDriverError("provider returned invalid findings JSON", {
        findings: [],
        partialResult,
        usage,
      })
    }
    throw error
  }
}

async function analyzeWithOpencodeBroker(
  config: OpencodeBrokerConfig,
  input: SpecBatchInput,
): Promise<SpecAnalysisDriverResult> {
  const response = brokerResponseSchema.parse(await postBrokerAnalysis(config, input))

  return {
    findings: response.findings.map(toRiskFinding),
    usage: toBrokerUsageMetadata(response.usage),
    ...(response.broker_run_id !== undefined ? { brokerRunId: response.broker_run_id } : {}),
    ...(response.partialResult !== undefined && response.partialResult !== null
      ? { partialResult: response.partialResult }
      : {}),
  }
}

async function postBrokerAnalysis(
  config: OpencodeBrokerConfig,
  input: SpecBatchInput,
): Promise<unknown> {
  try {
    return await ky
      .post(`${removeTrailingSlash(config.brokerUrl)}/spec/analyze`, {
        headers: brokerHeaders(config),
        json: createBrokerRequest(config.model, input),
        retry: { limit: 0 },
        timeout: 30_000,
      })
      .json()
  } catch (error) {
    if (error instanceof HTTPError) {
      throw await toBrokerDriverError(error)
    }
    throw error
  }
}

async function toBrokerDriverError(error: HTTPError): Promise<SpecAnalysisDriverError> {
  const body = brokerErrorResponseSchema.safeParse(await error.response.json())
  if (body.success) {
    return new SpecAnalysisDriverError(body.data.error, {
      findings: [],
      partialResult: body.data.partialResult ?? "",
      usage: toBrokerUsageMetadata(undefined),
      ...(body.data.broker_run_id !== undefined ? { brokerRunId: body.data.broker_run_id } : {}),
    })
  }
  return new SpecAnalysisDriverError(error.message, {
    findings: [],
    partialResult: "",
    usage: toBrokerUsageMetadata(undefined),
  })
}

function brokerHeaders(config: OpencodeBrokerConfig): Record<string, string> {
  if (config.brokerToken === undefined) {
    return {}
  }
  return { authorization: `Bearer ${config.brokerToken}` }
}

function getEnvProviderBaseUrl(config: EnvProviderConfig): string {
  return removeTrailingSlash(config.baseUrl ?? getDefaultProviderBaseUrl(config.provider))
}

function getDefaultProviderBaseUrl(provider: string): string {
  if (provider === "openai") {
    return "https://api.openai.com/v1"
  }
  throw new Error(`unsupported spec provider: ${provider}`)
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function createProviderRequest(model: string, input: SpecBatchInput): unknown {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "Return strict JSON with a findings array. Each finding must use camelCase fields matching the Retrospec risk finding contract.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: { type: "json_object" },
  }
}

function createBrokerRequest(model: string, input: SpecBatchInput): unknown {
  return {
    protocol_version: 1,
    analysis_type: "risk",
    prompt_version: "risk-v1",
    model,
    input,
  }
}

function toRiskFinding(input: ProviderRiskFindingInput): RiskFindingInput {
  return {
    findingId: input.findingId,
    entityId: input.entityId,
    severity: input.severity,
    riskType: input.riskType,
    summary: input.summary,
    evidence: input.evidence,
    recommendation: input.recommendation,
    ...(input.evidenceLabel !== undefined ? { evidenceLabel: input.evidenceLabel } : {}),
    ...(input.findingStatus !== undefined ? { findingStatus: input.findingStatus } : {}),
    ...(input.memoryNotes !== undefined ? { memoryNotes: input.memoryNotes } : {}),
  }
}

function toEnvProviderUsageMetadata(
  usage: z.infer<typeof providerUsageSchema> | undefined,
): SpecUsageMetadata {
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
    costUsd: 0,
  }
}

function toBrokerUsageMetadata(
  usage: z.infer<typeof brokerUsageSchema> | undefined,
): SpecUsageMetadata {
  const promptTokens = usage?.promptTokens ?? 0
  const completionTokens = usage?.completionTokens ?? 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.totalTokens ?? promptTokens + completionTokens,
    costUsd: usage?.costUsd ?? 0,
  }
}
