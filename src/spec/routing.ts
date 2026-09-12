import type { SpecAnalysisType, SpecProviderMode } from "./types"

export type SpecRouteCommand = "insight" | SpecAnalysisType

export type SpecRouteRequest = {
  readonly command: SpecRouteCommand
  readonly prompt?: string
  readonly scopeMode?: "full" | "partial"
  readonly templateId?: string
  readonly providerMode?: SpecProviderMode
  readonly saveInsight?: boolean
}

export type SpecRouteDecision =
  | { readonly kind: "insight"; readonly saveInsight: boolean }
  | {
      readonly kind: "generated"
      readonly analysisType: SpecAnalysisType
      readonly templateId: string
      readonly providerMode: SpecProviderMode
    }

export function decideSpecRequestRoute(request: SpecRouteRequest): SpecRouteDecision {
  switch (request.command) {
    case "insight":
      return { kind: "insight", saveInsight: request.saveInsight ?? false }
    case "risk":
    case "migration":
    case "summary":
      return {
        kind: "generated",
        analysisType: request.command,
        templateId: request.templateId ?? `${request.command}.v1`,
        providerMode: request.providerMode ?? "deterministic",
      }
    default:
      return assertNever(request.command)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled spec route command: ${value}`)
}
