import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { projectPaths } from "../paths"
import { type SpecRouteRequest, decideSpecRequestRoute } from "./routing"
import { SpecTemplateValidationError } from "./template-validation-error"
import {
  assertNever,
  isInside,
  parseJsonFile,
  resolveProjectPath,
  sameStringSet,
} from "./template-validation-helpers"
import {
  type GeneratedManifest,
  type SpecValidationReport,
  type TemplateMetadata,
  generatedManifestSchema,
  specValidationReportSchema,
  templateMetadataSchema,
} from "./template-validation-schemas"
import type { SpecAnalysisType, SpecProviderMode } from "./types"

export type SpecTemplate = {
  readonly templateId: string
  readonly analysisType: SpecAnalysisType
  readonly templatePath: string
  readonly manifestTemplatePath: string
  readonly promptPath: string
  readonly schemaPath: string
  readonly runStubPath: string
  readonly validationCasesPath: string
  readonly outputTables: readonly string[]
  readonly requiredRetroCategories: readonly string[]
  readonly providerModes: readonly SpecProviderMode[]
  readonly writeSandbox: ".retrospec/spec"
}

export type SpecTemplateValidationResult = {
  readonly status: "approved" | "blocked"
  readonly template: SpecTemplate
  readonly blockers: readonly string[]
}

export type GeneratedSpecValidationResult = {
  readonly status: "approved" | "blocked"
  readonly analysisType: SpecAnalysisType
  readonly templateId: string
  readonly manifestPath: string
  readonly reportPath: string
  readonly blockers: readonly string[]
}

export type SpecCommandTemplateDecision =
  | { readonly kind: "insight"; readonly saveInsight: boolean }
  | {
      readonly kind: "generated"
      readonly analysisType: SpecAnalysisType
      readonly templateId: string
      readonly providerMode: SpecProviderMode
      readonly templatePath: string
      readonly manifestTemplatePath: string
      readonly runStubPath: string
    }

const emptyTemplate = (templateRoot: string, analysisType: SpecAnalysisType): SpecTemplate => ({
  templateId: `${analysisType}.v1`,
  analysisType,
  templatePath: join(templateRoot, analysisType),
  manifestTemplatePath: join(templateRoot, analysisType, "job.json"),
  promptPath: join(templateRoot, analysisType, "prompt.md"),
  schemaPath: join(templateRoot, analysisType, "schema.sql"),
  runStubPath: join(templateRoot, analysisType, "run.ts.stub"),
  validationCasesPath: join(templateRoot, analysisType, "validation-cases.json"),
  outputTables: [],
  requiredRetroCategories: [],
  providerModes: [],
  writeSandbox: ".retrospec/spec",
})

export async function validateSpecTemplatePackage(
  templateRoot: string,
  analysisType: SpecAnalysisType,
): Promise<SpecTemplateValidationResult> {
  const templatePath = join(templateRoot, analysisType)
  const blockers: string[] = []
  const metadata = await parseJsonFile(
    join(templatePath, "template.json"),
    templateMetadataSchema,
    blockers,
    "template_metadata",
  )
  const template = metadata
    ? toSpecTemplate(templatePath, metadata)
    : emptyTemplate(templateRoot, analysisType)

  if (metadata !== null && metadata.analysis_type !== analysisType) {
    blockers.push("template_analysis_type_mismatch")
  }
  for (const path of [
    template.manifestTemplatePath,
    template.promptPath,
    template.schemaPath,
    template.runStubPath,
    template.validationCasesPath,
  ]) {
    if (!existsSync(path)) {
      blockers.push("missing_template_file")
    }
  }

  return { status: blockers.length === 0 ? "approved" : "blocked", template, blockers }
}

export async function validateGeneratedSpecAnalysis(
  projectPath: string,
  manifestPath: string,
  templateRoot = "templates/spec",
): Promise<GeneratedSpecValidationResult> {
  const paths = projectPaths(projectPath)
  const resolvedManifestPath = resolveProjectPath(paths.projectRoot, manifestPath)
  const reportPath = join(dirname(resolvedManifestPath), "spec-validation-report.json")
  const generatedSpecRoot = resolve(paths.stateDir, "generated", "spec")
  const blockers: string[] = []

  if (!isInside(generatedSpecRoot, resolvedManifestPath)) {
    blockers.push("manifest_path_outside_generated_spec")
  }

  const manifest = await parseJsonFile(
    resolvedManifestPath,
    generatedManifestSchema,
    blockers,
    "spec_manifest",
  )
  const report = await parseJsonFile(
    reportPath,
    specValidationReportSchema,
    blockers,
    "spec_validation_report",
  )
  const analysisType = manifest?.category ?? report?.analysis_type ?? "risk"
  const templateId = manifest?.template_id ?? report?.template_id ?? `${analysisType}.v1`
  const templateResult = await validateSpecTemplatePackage(templateRoot, analysisType)
  blockers.push(...templateResult.blockers)

  if (manifest !== null && report !== null) {
    validateGeneratedSpecManifest(paths.stateDir, dirname(resolvedManifestPath), manifest, blockers)
    validateGeneratedSpecReport(templateResult.template, manifest, report, blockers)
  }

  return {
    status: blockers.length === 0 ? "approved" : "blocked",
    analysisType,
    templateId,
    manifestPath: resolvedManifestPath,
    reportPath,
    blockers: [...new Set(blockers)],
  }
}

export async function resolveSpecCommandTemplate(
  request: SpecRouteRequest,
  templateRoot = "templates/spec",
): Promise<SpecCommandTemplateDecision> {
  const decision = decideSpecRequestRoute(request)
  switch (decision.kind) {
    case "insight":
      return decision
    case "generated": {
      const template = await validateSpecTemplatePackage(templateRoot, decision.analysisType)
      if (template.status === "blocked" || template.template.templateId !== decision.templateId) {
        throw new SpecTemplateValidationError(decision.templateId, template.blockers)
      }
      return { ...decision, ...template.template }
    }
    default:
      return assertNever(decision)
  }
}

function validateGeneratedSpecManifest(
  stateDir: string,
  generatedDir: string,
  manifest: GeneratedManifest,
  blockers: string[],
): void {
  const entrypointPath = resolveProjectPath(dirname(generatedDir), manifest.entrypoint)
  if (entrypointPath !== join(generatedDir, "run.ts")) {
    blockers.push("entrypoint_not_sibling_run_ts")
  }
  for (const writePath of manifest.writes) {
    const resolvedWritePath = resolveProjectPath(dirname(stateDir), writePath)
    if (!isInside(join(stateDir, "spec"), resolvedWritePath)) {
      blockers.push("write_outside_spec_sandbox")
    }
  }
}

function validateGeneratedSpecReport(
  template: SpecTemplate,
  manifest: GeneratedManifest,
  report: SpecValidationReport,
  blockers: string[],
): void {
  if (
    manifest.category !== report.analysis_type ||
    template.analysisType !== report.analysis_type
  ) {
    blockers.push("analysis_type_mismatch")
  }
  if (manifest.template_id !== report.template_id || template.templateId !== report.template_id) {
    blockers.push("template_id_mismatch")
  }
  if (
    !sameStringSet(template.requiredRetroCategories, report.retro_readiness.required_categories)
  ) {
    blockers.push("retro_readiness_category_mismatch")
  }
  if (!template.outputTables.every((table) => report.schema_output.tables.includes(table))) {
    blockers.push("schema_output_missing_template_table")
  }
  if (!report.conservative_labels_preserved) {
    blockers.push("conservative_labels_not_preserved")
  }
  if (report.write_sandbox !== template.writeSandbox) {
    blockers.push("write_sandbox_mismatch")
  }
  if (!report.dry_run.passed) {
    blockers.push("dry_run_failed")
  }
  if (report.status === "failed") {
    blockers.push("validation_report_not_approved")
  }
  for (const gap of report.gaps) {
    if (gap.type === "bug" && gap.status !== "resolved") {
      blockers.push("unresolved_bug_gap")
    }
  }
}

function toSpecTemplate(templatePath: string, metadata: TemplateMetadata): SpecTemplate {
  return {
    templateId: metadata.template_id,
    analysisType: metadata.analysis_type,
    templatePath,
    manifestTemplatePath: join(templatePath, "job.json"),
    promptPath: join(templatePath, metadata.prompt_path),
    schemaPath: join(templatePath, metadata.schema_path),
    runStubPath: join(templatePath, metadata.run_stub_path),
    validationCasesPath: join(templatePath, metadata.validation_cases_path),
    outputTables: metadata.output_tables,
    requiredRetroCategories: metadata.required_retro_categories,
    providerModes: metadata.provider_modes,
    writeSandbox: metadata.write_sandbox,
  }
}
