import { z } from "zod"
import type { BrokerAnalyzeRequest } from "./opencode-broker-schemas"
import {
  type riskFindingResponseSchema,
  riskFindingsResponseSchema,
} from "./opencode-broker-schemas"
import { analyzeSpecRisk } from "./spec/analyze"
import type { RiskFindingInput, SpecBatchInput, SpecUsageMetadata } from "./spec/types"

export const emptyBrokerUsage: SpecUsageMetadata = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
}

export type BrokerAnalyzer = (
  request: BrokerAnalyzeRequest,
) => BrokerAnalyzeResult | Promise<BrokerAnalyzeResult>

export type BrokerAnalyzeResult = {
  readonly findings: readonly RiskFindingInput[]
  readonly usage?: SpecUsageMetadata
  readonly partialResult?: string
}

export class BrokerAnalysisError extends Error {
  readonly brokerRunId: string
  readonly partialResult: string

  constructor(message: string, brokerRunId: string, partialResult: string) {
    super(message)
    this.name = "BrokerAnalysisError"
    this.brokerRunId = brokerRunId
    this.partialResult = partialResult
  }
}

export function deterministicBrokerAnalyzer(request: BrokerAnalyzeRequest): BrokerAnalyzeResult {
  const input: SpecBatchInput = request.input
  return { findings: analyzeSpecRisk(input), usage: emptyBrokerUsage }
}

export async function opencodeCliBrokerAnalyzer(
  request: BrokerAnalyzeRequest,
  brokerRunId: string,
): Promise<BrokerAnalyzeResult> {
  const prompt = createRiskPrompt(request.input)
  const processHandle = Bun.spawn(
    ["opencode", "run", "--model", request.model, "--format", "json", prompt],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`opencode broker model invocation failed: ${stderr.trim()}`)
  }
  const partialResult = extractOpencodeText(stdout)
  const parsed = parseRiskFindings(partialResult, brokerRunId)
  return { findings: parsed.findings.map(toRiskFinding), usage: emptyBrokerUsage, partialResult }
}

function createRiskPrompt(input: SpecBatchInput): string {
  return [
    "Return strict JSON only with a findings array.",
    "Each finding must use camelCase fields: findingId, entityId, severity, riskType, summary, evidence, recommendation, evidenceLabel, findingStatus, memoryNotes.",
    "Analyze this Retrospec Spec risk input:",
    JSON.stringify(input),
  ].join("\n")
}

function extractOpencodeText(stdout: string): string {
  const lines = stdout.split("\n").filter((line) => line.trim().length > 0)
  let text = ""
  for (const line of lines) {
    const parsedLine = parseOpencodeJsonLine(line)
    if (parsedLine === null) {
      continue
    }
    const parsed = z.object({ text: z.string().optional() }).safeParse(parsedLine)
    if (parsed.success && parsed.data.text !== undefined) {
      text += parsed.data.text
    }
  }
  return text.length === 0 ? stdout.trim() : text.trim()
}

function parseRiskFindings(
  partialResult: string,
  brokerRunId: string,
): z.infer<typeof riskFindingsResponseSchema> {
  try {
    return riskFindingsResponseSchema.parse(JSON.parse(partialResult))
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new BrokerAnalysisError(
        "broker returned invalid findings JSON",
        brokerRunId,
        partialResult,
      )
    }
    throw error
  }
}

function parseOpencodeJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

function toRiskFinding(input: z.infer<typeof riskFindingResponseSchema>): RiskFindingInput {
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
