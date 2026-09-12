import type { SpecProviderConfig } from "./config"
import { analyzeSpecRisk } from "./spec/analyze"
import type { SpecAnalysisDriver } from "./spec/driver-types"
export { SpecAnalysisDriverError } from "./spec/driver-types"
export type { SpecAnalysisDriver, SpecAnalysisDriverResult } from "./spec/driver-types"
import { createEnvProviderDriver, createOpencodeBrokerDriver } from "./spec/provider-drivers"

export const deterministicSpecAnalysisDriver: SpecAnalysisDriver = {
  model: "deterministic-risk-v1",
  promptVersion: "risk-v1",
  providerMode: "deterministic",
  analyze: (input) => ({ findings: analyzeSpecRisk(input) }),
}

export function selectSpecAnalysisDriver(config: SpecProviderConfig): SpecAnalysisDriver {
  switch (config.mode) {
    case "deterministic":
      return deterministicSpecAnalysisDriver
    case "env-provider":
      return createEnvProviderDriver(config)
    case "opencode-broker":
      return createOpencodeBrokerDriver(config)
    default:
      return assertNever(config)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled spec provider config: ${JSON.stringify(value)}`)
}
