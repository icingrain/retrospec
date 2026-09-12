import type { SpecProviderMode } from "./types"
import type { RiskFindingInput, SpecBatchInput, SpecUsageMetadata } from "./types"

export type SpecAnalysisDriverResult = {
  readonly findings: readonly RiskFindingInput[]
  readonly usage?: SpecUsageMetadata
  readonly partialResult?: string
  readonly brokerRunId?: string
}

export class SpecAnalysisDriverError extends Error {
  readonly findings: readonly RiskFindingInput[]
  readonly partialResult: string
  readonly usage: SpecUsageMetadata
  readonly brokerRunId: string | undefined

  constructor(
    message: string,
    result: Required<Omit<SpecAnalysisDriverResult, "brokerRunId">> & {
      readonly brokerRunId?: string
    },
  ) {
    super(message)
    this.name = "SpecAnalysisDriverError"
    this.findings = result.findings
    this.partialResult = result.partialResult
    this.usage = result.usage
    this.brokerRunId = result.brokerRunId
  }
}

export interface SpecAnalysisDriver {
  readonly model: string
  readonly promptVersion: string
  readonly providerMode?: SpecProviderMode
  analyze(input: SpecBatchInput): SpecAnalysisDriverResult | Promise<SpecAnalysisDriverResult>
}
