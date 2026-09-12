import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { z } from "zod"
import {
  type GenerationContract,
  contractHasReadyHandoff,
  validateGenerationContract,
} from "./generated-contract"
import { sameStringSet, validateGeneratedLoopEvidence } from "./generated-validation-loop"
import { projectPaths } from "./paths"
import type { GeneratedValidationResponse } from "./types"

const manifestSchema = z.object({
  manifest_version: z.literal(1),
  runtime: z.literal("bun"),
  entrypoint: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
  writes: z.array(z.string()),
  category: z.string().min(1),
  actor: z.union([z.literal("retro"), z.literal("spec"), z.literal("archivist")]),
  capability: z.string().min(1),
})

const validationReportSchema = z.object({
  report_version: z.literal(1),
  run_id: z.string().min(1),
  skill: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  samples: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      selection_reason: z.string().min(1),
      covered_categories: z.array(z.string().min(1)).min(1),
    }),
  ),
  expected_evidence: z.array(z.unknown()),
  generated_results: z.array(z.unknown()),
  comparisons: z.array(z.unknown()),
  iterations: z.array(
    z.object({
      index: z.number().int().min(1),
      outcome: z.string().min(1),
      bug_count: z.number().int().min(0),
    }),
  ),
  stop_reason: z.union([
    z.literal("all_required_samples_pass"),
    z.literal("no_unresolved_bug_gap"),
    z.literal("iteration_limit_reached"),
    z.literal("no_meaningful_improvement"),
    z.literal("repeated_gap"),
    z.literal("budget_exceeded"),
  ]),
  status: z.union([z.literal("passed"), z.literal("passed_with_gaps"), z.literal("failed")]),
  gaps: z.array(
    z.object({
      type: z.union([
        z.literal("bug"),
        z.literal("unsupported"),
        z.literal("ambiguous"),
        z.literal("reference-missing"),
      ]),
      status: z.string().min(1),
    }),
  ),
})

const referenceCandidateSchema = z.object({
  type: z.literal("reference-missing"),
  source: z.string().min(1),
  reason: z.string().min(1),
  auto_merge: z.literal(false),
})

type Manifest = z.infer<typeof manifestSchema>

export async function validateGeneratedProgram(
  projectPath: string,
  manifestPath: string,
): Promise<GeneratedValidationResponse> {
  const paths = projectPaths(projectPath)
  const generatedRoot = resolve(paths.stateDir, "generated")
  const resolvedManifestPath = resolveProjectPath(paths.projectRoot, manifestPath)
  const blockers: string[] = []

  if (!isInside(generatedRoot, resolvedManifestPath)) {
    blockers.push("manifest_path_outside_generated")
  }

  const manifest = await parseJsonFile(resolvedManifestPath, manifestSchema, blockers, "manifest")
  const baseDir = dirname(resolvedManifestPath)
  const contractPath = join(baseDir, "generation-contract.json")
  const reportPath = join(baseDir, "validation-report.json")
  const entrypointPath = manifest
    ? resolveProjectPath(paths.projectRoot, manifest.entrypoint)
    : join(baseDir, "run.ts")

  if (!existsSync(contractPath)) {
    blockers.push("missing_generation_contract")
  }
  if (!existsSync(reportPath)) {
    blockers.push("missing_validation_report")
  }
  if (!existsSync(entrypointPath)) {
    blockers.push("missing_entrypoint")
  }

  if (manifest) {
    validateManifestPaths(
      paths.projectRoot,
      paths.stateDir,
      generatedRoot,
      manifest,
      entrypointPath,
      blockers,
    )
    const contract = await validateGenerationContract(contractPath, manifest, blockers)
    validateEntrypoint(baseDir, entrypointPath, blockers)
    await validateReport(reportPath, blockers, contract)
  }

  return {
    status: blockers.length === 0 ? "approved" : "blocked",
    manifest_path: resolvedManifestPath,
    generation_contract_path: contractPath,
    validation_report_path: reportPath,
    entrypoint_path: entrypointPath,
    blockers: [...new Set(blockers)],
  }
}

function validateManifestPaths(
  projectRoot: string,
  stateDir: string,
  generatedRoot: string,
  manifest: Manifest,
  entrypointPath: string,
  blockers: string[],
): void {
  if (!isInside(generatedRoot, entrypointPath)) {
    blockers.push("entrypoint_outside_generated")
  }

  for (const writePath of manifest.writes) {
    const resolvedWritePath = resolveProjectPath(projectRoot, writePath)
    if (!isInside(stateDir, resolvedWritePath)) {
      blockers.push("write_outside_state")
    }
  }
}

function validateEntrypoint(baseDir: string, entrypointPath: string, blockers: string[]): void {
  if (entrypointPath !== join(baseDir, "run.ts")) {
    blockers.push("entrypoint_not_sibling_run_ts")
  }
}

async function validateReport(
  reportPath: string,
  blockers: string[],
  contract: GenerationContract | null,
): Promise<void> {
  if (!existsSync(reportPath)) {
    return
  }

  const report = await parseJsonFile(
    reportPath,
    validationReportSchema,
    blockers,
    "validation_report",
  )
  if (!report) {
    return
  }

  const hasReadyHandoff = contractHasReadyHandoff(contract)

  if (report.status === "failed") {
    blockers.push("validation_report_not_approved")
  }
  if (contract !== null && report.skill !== contract.skill) {
    blockers.push("validation_report_skill_mismatch")
  }
  if (contract !== null && !sameStringSet(report.categories, contract.categories)) {
    blockers.push("validation_report_category_mismatch")
  }
  if (contract !== null) {
    validateGeneratedLoopEvidence(contract, report, blockers)
  }

  for (const gap of report.gaps ?? []) {
    if (gap.type === "bug" && gap.status !== "resolved") {
      blockers.push("unresolved_bug_gap")
    }
    if (hasReadyHandoff && gap.type === "unsupported" && gap.status !== "resolved") {
      blockers.push("unsupported_gap_cannot_ready_handoff")
    }
    if (hasReadyHandoff && gap.type === "ambiguous" && gap.status !== "resolved") {
      blockers.push("ambiguous_gap_cannot_ready_handoff")
    }
    if (contract !== null && gap.type === "reference-missing") {
      await validateReferenceCandidates(contract, blockers)
    }
  }
}

async function validateReferenceCandidates(
  contract: GenerationContract,
  blockers: string[],
): Promise<void> {
  const candidatesPath = resolveProjectPath(
    contract.project_path,
    contract.validation_loop.reference_candidates_path,
  )
  if (!existsSync(candidatesPath)) {
    blockers.push("missing_reference_candidates")
    return
  }
  try {
    const text = await readFile(candidatesPath, "utf8")
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) {
      blockers.push("empty_reference_candidates")
      return
    }
    for (const line of lines) {
      referenceCandidateSchema.parse(JSON.parse(line))
    }
  } catch (error) {
    if (error instanceof Error) {
      blockers.push("invalid_reference_candidates")
      return
    }
    throw error
  }
}

async function parseJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
  blockers: string[],
  label: string,
): Promise<T | null> {
  try {
    return schema.parse(JSON.parse(await readFile(filePath, "utf8")))
  } catch (error) {
    if (error instanceof Error) {
      blockers.push(`invalid_${label}`)
      return null
    }
    throw error
  }
}

function resolveProjectPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(projectRoot, path)
}

function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}
