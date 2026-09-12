import type { AnalysisLaunchControls } from "../analysis-launch-controls"
import { loadSpecProviderConfig } from "../config"
import { readSpecProviderSettings } from "../provider-settings"
import {
  type SpecAnalysisDriver,
  SpecAnalysisDriverError,
  selectSpecAnalysisDriver,
} from "../spec-analysis"
import type { AnalysisScope, ProjectPaths } from "../types"
import { buildSpecBatchInput } from "./input"
import {
  beginSpecAnalysisRun,
  completeSpecAnalysisRun,
  failSpecAnalysisRun,
  writeRiskFindings,
} from "./store"
import type { RiskFindingInput, SpecAnalysisResult, SpecBatchEntity } from "./types"

const specAnalysisCategories = ["structure", "symbols"] as const

export async function runSpecAnalysis(
  paths: ProjectPaths,
  scopeOrDriver?: AnalysisScope | AnalysisLaunchControls | SpecAnalysisDriver | undefined,
  driverInput?: SpecAnalysisDriver | undefined,
): Promise<SpecAnalysisResult> {
  const scope = isSpecAnalysisDriver(scopeOrDriver) ? undefined : scopeOrDriver
  const driver = isSpecAnalysisDriver(scopeOrDriver)
    ? scopeOrDriver
    : (driverInput ?? (await selectSavedSpecAnalysisDriver(paths)))
  const input = await buildSpecBatchInput(paths, specAnalysisCategories, launchScope(scope))
  const run = await beginSpecAnalysisRun(paths, {
    analysisType: "risk",
    inputCategories: specAnalysisCategories,
    providerMode: driver.providerMode,
    model: driver.model,
    promptVersion: driver.promptVersion,
    retroHandoffSnapshot: JSON.stringify({ handoffs: input.handoffs, preflight: input.preflight }),
    analysisScope: launchScope(scope),
    inputRetroRuns: input.handoffs.map((handoff) => handoff.retroRunId),
  })
  try {
    const { findings, usage, brokerRunId } = await driver.analyze(input)
    const normalizedFindings = normalizeRiskFindings(input.entities, findings)
    await writeRiskFindings(paths, run.analysisRunId, normalizedFindings)
    await completeSpecAnalysisRun(paths, run.analysisRunId, {
      ...(usage !== undefined ? { usage } : {}),
      ...(brokerRunId !== undefined ? { brokerRunId } : {}),
    })

    return { analysisRunId: run.analysisRunId, findingCount: normalizedFindings.length }
  } catch (error) {
    if (error instanceof SpecAnalysisDriverError) {
      const normalizedFindings = normalizeRiskFindings(input.entities, error.findings)
      await writeRiskFindings(paths, run.analysisRunId, normalizedFindings)
      await failSpecAnalysisRun(paths, run.analysisRunId, {
        findings: normalizedFindings,
        partialResult: error.partialResult,
        usage: error.usage,
        errorMessage: error.message,
        ...(error.brokerRunId !== undefined ? { brokerRunId: error.brokerRunId } : {}),
      })
    }
    throw error
  }
}

async function selectSavedSpecAnalysisDriver(paths: ProjectPaths): Promise<SpecAnalysisDriver> {
  const saved = await readSpecProviderSettings(paths)
  return selectSpecAnalysisDriver(loadSpecProviderConfig(process.env, saved?.settings ?? null))
}

function isSpecAnalysisDriver(
  value: AnalysisScope | AnalysisLaunchControls | SpecAnalysisDriver | undefined,
): value is SpecAnalysisDriver {
  return value !== undefined && "analyze" in value
}

function launchScope(
  value: AnalysisScope | AnalysisLaunchControls | undefined,
): AnalysisScope | undefined {
  return value !== undefined && "batchSize" in value ? value.scope : value
}

function normalizeRiskFindings(
  entities: readonly SpecBatchEntity[],
  findings: readonly RiskFindingInput[],
): readonly RiskFindingInput[] {
  const entitiesById = new Map(entities.map((entity) => [entity.entityId, entity]))
  return findings.map((finding) =>
    normalizeRiskFinding(entitiesById.get(finding.entityId), finding),
  )
}

function normalizeRiskFinding(
  entity: SpecBatchEntity | undefined,
  finding: RiskFindingInput,
): RiskFindingInput {
  if (entity === undefined || entity.evidence.support_level === "unsupported") {
    return { ...finding, evidenceLabel: "AMBIGUOUS", findingStatus: "unresolved" }
  }
  if (
    entity.evidence.support_level === "high-confidence" &&
    entity.evidence.parser_mode !== "generic_ast" &&
    entity.evidence.missing_capability === null
  ) {
    return {
      ...finding,
      evidenceLabel: finding.evidenceLabel ?? "EXTRACTED",
      findingStatus: finding.findingStatus ?? "open",
    }
  }
  return { ...finding, evidenceLabel: "INFERRED", findingStatus: "needs_review" }
}
