import { readFile } from "node:fs/promises"
import { z } from "zod"
import type { JobActor } from "./types"

const evidenceLabelSchema = z.union([
  z.literal("EXTRACTED"),
  z.literal("INFERRED"),
  z.literal("AMBIGUOUS"),
])

const supportLevelSchema = z.union([
  z.literal("high-confidence"),
  z.literal("best-effort"),
  z.literal("unsupported"),
])

const handoffStatusSchema = z.union([
  z.literal("ready_for_analysis"),
  z.literal("incomplete"),
  z.literal("blocked"),
])

const strategySchema = z.object({
  name: z.string().min(1),
  parser_backend: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  evidence_label: evidenceLabelSchema,
})

const fallbackSchema = z.object({
  reason: z.string().min(1),
  missing_capability: z.string().min(1).optional(),
  evidence_label: evidenceLabelSchema.optional(),
})

const categorySupportSchema = z.object({
  category: z.string().min(1),
  support_level: supportLevelSchema,
  parser_backend: z.string().min(1),
  evidence_label: evidenceLabelSchema,
})

const unsupportedCategorySchema = z.object({
  category: z.string().min(1),
  reason: z.string().min(1),
  missing_capability: z.string().min(1),
  evidence_label: evidenceLabelSchema,
})

const sampleSelectionSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  selection_reason: z.string().min(1),
  covered_categories: z.array(z.string().min(1)).min(1),
  language: z.string().min(1).optional(),
})

const sampleStrategySchema = z.union([
  z.literal("deterministic-stratified"),
  z.literal("deterministic-first"),
  z.literal("seeded-random"),
])

const validationStopReasonSchema = z.union([
  z.literal("all_required_samples_pass"),
  z.literal("no_unresolved_bug_gap"),
  z.literal("iteration_limit_reached"),
  z.literal("no_meaningful_improvement"),
  z.literal("repeated_gap"),
  z.literal("budget_exceeded"),
])

const samplePolicySchema = z
  .object({
    candidate_source: z.literal("analysis-target-files"),
    eligible_file_count: z.number().int().min(0),
    min_count: z.number().int().min(1),
    max_count: z.number().int().min(1),
    ratio: z.number().min(0).max(1),
    strategy: sampleStrategySchema,
    must_cover: z.array(z.string().min(1)),
    allow_smaller_target_set: z.boolean(),
    random_seed: z.number().int().nullable(),
  })
  .refine((policy) => policy.max_count >= policy.min_count, {
    message: "max_count must be greater than or equal to min_count",
  })

const generationContractSchema = z.object({
  contract_version: z.literal(1),
  project_path: z.string().min(1),
  actor: z.union([z.literal("retro"), z.literal("spec"), z.literal("archivist")]),
  skill: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  status_evidence: z.object({ checked: z.literal(true), summary: z.string().min(1) }),
  survey: z.object({
    languages: z.array(z.string().min(1)).min(1),
    include_paths: z.array(z.string()),
    exclude_paths: z.array(z.string()),
    framework_hints: z.array(z.string()),
    generated_vendor_test_policy: z.string().min(1),
    large_file_policy: z.string().min(1),
  }),
  language_capability: z.object({
    matrix_path: z.string().min(1),
    language: z.string().min(1),
    overall_confidence: supportLevelSchema,
    category_support: z.array(categorySupportSchema),
    unsupported_categories: z.array(unsupportedCategorySchema),
  }),
  reference_cases: z.array(z.string().min(1)),
  selected_strategies: z.array(strategySchema).min(1),
  skipped_strategies: z.array(z.object({ name: z.string().min(1), reason: z.string().min(1) })),
  fallbacks: z.array(fallbackSchema),
  expected_writes: z.array(z.string().min(1)),
  handoff: z.object({ status: handoffStatusSchema, reason: z.string().min(1) }),
  validation_loop: z.object({
    required: z.literal(true),
    sample_policy: samplePolicySchema,
    sample_selection: z.array(sampleSelectionSchema).min(1),
    expected_evidence_source: z.string().min(1),
    generated_result_source: z.string().min(1),
    gap_taxonomy: z.array(
      z.union([
        z.literal("bug"),
        z.literal("unsupported"),
        z.literal("ambiguous"),
        z.literal("reference-missing"),
      ]),
    ),
    iteration_limit: z.number().int().min(1),
    stop_conditions: z.array(validationStopReasonSchema).min(1),
    report_path: z.string().min(1),
    reference_candidates_path: z.string().min(1),
    auto_merge_reference_candidates: z.literal(false),
  }),
})

export type GenerationContract = z.infer<typeof generationContractSchema>

export type GeneratedContractManifest = {
  readonly actor: JobActor
  readonly category: string
  readonly capability?: string | undefined
  readonly writes: readonly string[]
}

export async function validateGenerationContract(
  contractPath: string,
  manifest: GeneratedContractManifest,
  blockers: string[],
): Promise<GenerationContract | null> {
  const contract = await parseContract(contractPath, blockers)
  if (contract === null) {
    return null
  }

  if (contract.actor !== manifest.actor) {
    blockers.push("contract_actor_mismatch")
  }
  if (!contract.categories.includes(manifest.category)) {
    blockers.push("contract_category_mismatch")
  }
  if (manifest.capability !== undefined && contract.skill !== manifest.capability) {
    blockers.push("contract_capability_mismatch")
  }

  validateWrites(contract, manifest, blockers)
  validateStrategyCoverage(contract, manifest.category, blockers)
  return contract
}

export function contractHasReadyHandoff(contract: GenerationContract | null): boolean {
  return contract?.handoff.status === "ready_for_analysis"
}

async function parseContract(
  contractPath: string,
  blockers: string[],
): Promise<GenerationContract | null> {
  try {
    return generationContractSchema.parse(JSON.parse(await readFile(contractPath, "utf8")))
  } catch (error) {
    if (error instanceof Error) {
      blockers.push("invalid_generation_contract")
      return null
    }
    throw error
  }
}

function validateWrites(
  contract: GenerationContract,
  manifest: GeneratedContractManifest,
  blockers: string[],
): void {
  const expectedWrites = new Set(contract.expected_writes)
  const manifestWrites = new Set(manifest.writes)
  for (const writePath of manifest.writes) {
    if (!expectedWrites.has(writePath)) {
      blockers.push("manifest_write_missing_from_contract")
    }
  }
  for (const writePath of contract.expected_writes) {
    if (!manifestWrites.has(writePath)) {
      blockers.push("contract_write_missing_from_manifest")
    }
  }
}

function validateStrategyCoverage(
  contract: GenerationContract,
  manifestCategory: string,
  blockers: string[],
): void {
  const supportsManifestCategory = contract.language_capability.category_support.some(
    (support) => support.category === manifestCategory,
  )
  if (!supportsManifestCategory) {
    blockers.push("category_support_missing_for_manifest")
  }

  const strategyCoversManifestCategory = contract.selected_strategies.some((strategy) =>
    strategy.categories.includes(manifestCategory),
  )
  if (!strategyCoversManifestCategory) {
    blockers.push("selected_strategy_missing_manifest_category")
  }

  for (const strategy of contract.selected_strategies) {
    if (isReducedParser(strategy.parser_backend) && strategy.evidence_label === "EXTRACTED") {
      blockers.push("fallback_requires_reduced_evidence_label")
    }
  }

  for (const fallback of contract.fallbacks) {
    if (fallback.missing_capability === undefined) {
      blockers.push("fallback_missing_capability")
    }
    if (fallback.evidence_label === undefined || fallback.evidence_label === "EXTRACTED") {
      blockers.push("fallback_requires_reduced_evidence_label")
    }
  }

  if (contract.handoff.status === "ready_for_analysis") {
    if (contract.fallbacks.length > 0) {
      blockers.push("fallback_cannot_ready_handoff")
    }
    if (contract.selected_strategies.some((strategy) => isReducedParser(strategy.parser_backend))) {
      blockers.push("reduced_parser_cannot_ready_handoff")
    }
    if (contract.language_capability.unsupported_categories.length > 0) {
      blockers.push("unsupported_cannot_ready_handoff")
    }
    if (
      contract.language_capability.category_support.some(
        (support) => support.support_level === "unsupported",
      )
    ) {
      blockers.push("unsupported_support_cannot_ready_handoff")
    }
  }
}

function isReducedParser(parserBackend: string): boolean {
  const lowered = parserBackend.toLowerCase()
  return lowered.includes("regex") || lowered.includes("generic") || lowered.includes("basic")
}
