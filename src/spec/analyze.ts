import { createRiskFindingId } from "./ids"
import type {
  RiskFindingInput,
  SpecBatchEntity,
  SpecBatchInput,
  SpecEvidenceLabel,
  SpecFindingStatus,
} from "./types"

type FindingConfidence = {
  readonly evidenceLabel: SpecEvidenceLabel
  readonly findingStatus: SpecFindingStatus
}

export function analyzeSpecRisk(input: SpecBatchInput): readonly RiskFindingInput[] {
  return input.entities.filter(isAnalysisTarget).map(toInventoryReviewFinding)
}

function isAnalysisTarget(entity: SpecBatchEntity): boolean {
  return entity.sourceCategory === "symbols"
}

function toInventoryReviewFinding(entity: SpecBatchEntity): RiskFindingInput {
  const confidence = findingConfidence(entity)
  return {
    findingId: createRiskFindingId(entity.entityId, "inventory_review"),
    entityId: entity.entityId,
    severity: "low",
    riskType: "inventory_review",
    summary: `Review ${entity.entityType} ${entity.symbolName ?? entity.filePath}`,
    evidence: entity.signature ?? entity.filePath,
    recommendation: "Review this symbol during AI-assisted migration analysis.",
    evidenceLabel: confidence.evidenceLabel,
    findingStatus: confidence.findingStatus,
  }
}

function findingConfidence(entity: SpecBatchEntity): FindingConfidence {
  if (
    entity.evidence.support_level === "high-confidence" &&
    entity.evidence.parser_mode !== "generic_ast" &&
    entity.evidence.missing_capability === null
  ) {
    return { evidenceLabel: "EXTRACTED", findingStatus: "open" }
  }
  if (entity.evidence.support_level === "unsupported") {
    return { evidenceLabel: "AMBIGUOUS", findingStatus: "unresolved" }
  }
  return { evidenceLabel: "INFERRED", findingStatus: "needs_review" }
}
