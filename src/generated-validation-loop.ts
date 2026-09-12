import type { GenerationContract } from "./generated-contract"

export type GeneratedValidationReport = {
  readonly samples: readonly GeneratedValidationSample[]
  readonly iterations: readonly GeneratedValidationIteration[]
  readonly stop_reason: GenerationContract["validation_loop"]["stop_conditions"][number]
}

type GeneratedValidationSample = {
  readonly id: string
  readonly path: string
  readonly selection_reason: string
  readonly covered_categories: readonly string[]
}

type GeneratedValidationIteration = {
  readonly index: number
  readonly outcome: string
  readonly bug_count: number
}

export function validateGeneratedLoopEvidence(
  contract: GenerationContract,
  report: GeneratedValidationReport,
  blockers: string[],
): void {
  const expectedSampleCount = requiredSampleCount(contract.validation_loop.sample_policy)
  if (contract.validation_loop.sample_selection.length < expectedSampleCount) {
    blockers.push("contract_sample_count_below_minimum")
  }
  if (report.samples.length < expectedSampleCount) {
    blockers.push("validation_sample_count_below_minimum")
  }
  if (
    contract.validation_loop.sample_selection.length >
    contract.validation_loop.sample_policy.max_count
  ) {
    blockers.push("contract_sample_count_above_maximum")
  }
  if (report.samples.length > contract.validation_loop.sample_policy.max_count) {
    blockers.push("validation_sample_count_above_maximum")
  }
  if (report.iterations.length > contract.validation_loop.iteration_limit) {
    blockers.push("validation_iteration_limit_exceeded")
  }
  if (!contract.validation_loop.stop_conditions.includes(report.stop_reason)) {
    blockers.push("validation_stop_reason_not_allowed")
  }
  validateSampleConsistency(contract, report, blockers)
}

export function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function requiredSampleCount(
  policy: GenerationContract["validation_loop"]["sample_policy"],
): number {
  const ratioCount = Math.ceil(policy.eligible_file_count * policy.ratio)
  const policyCount = Math.max(policy.min_count, ratioCount)
  const boundedCount = Math.min(policyCount, policy.max_count)
  if (policy.allow_smaller_target_set) {
    return Math.min(boundedCount, policy.eligible_file_count)
  }
  return boundedCount
}

function validateSampleConsistency(
  contract: GenerationContract,
  report: GeneratedValidationReport,
  blockers: string[],
): void {
  const selectedPaths = new Set(
    contract.validation_loop.sample_selection.map((sample) => sample.path),
  )
  for (const sample of report.samples) {
    if (!selectedPaths.has(sample.path)) {
      blockers.push("validation_sample_missing_from_contract")
    }
    if (!sample.covered_categories.some((category) => contract.categories.includes(category))) {
      blockers.push("validation_sample_category_mismatch")
    }
  }
}
