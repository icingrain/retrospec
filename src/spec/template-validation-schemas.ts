import { z } from "zod"

export const analysisTypeSchema = z.union([
  z.literal("risk"),
  z.literal("migration"),
  z.literal("summary"),
])

const providerModeSchema = z.union([
  z.literal("deterministic"),
  z.literal("env-provider"),
  z.literal("opencode-broker"),
])

export const templateMetadataSchema = z.object({
  template_version: z.literal(1),
  template_id: z.string().min(1),
  analysis_type: analysisTypeSchema,
  prompt_path: z.string().min(1),
  schema_path: z.string().min(1),
  run_stub_path: z.string().min(1),
  validation_cases_path: z.string().min(1),
  output_tables: z.array(z.string().min(1)).min(1),
  required_retro_categories: z.array(z.string().min(1)).min(1),
  provider_modes: z.array(providerModeSchema).min(1),
  evidence_policy: z.object({
    preserve_labels: z.literal(true),
    ambiguous_requires_review: z.literal(true),
  }),
  write_sandbox: z.literal(".retrospec/spec"),
})

export const generatedManifestSchema = z.object({
  manifest_version: z.literal(1),
  runtime: z.literal("bun"),
  entrypoint: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
  writes: z.array(z.string().min(1)).min(1),
  category: analysisTypeSchema,
  actor: z.literal("spec"),
  capability: z.literal("ai-analysis"),
  template_id: z.string().min(1),
})

export const specValidationReportSchema = z.object({
  report_version: z.literal(1),
  analysis_type: analysisTypeSchema,
  template_id: z.string().min(1),
  retro_readiness: z.object({
    checked: z.literal(true),
    required_categories: z.array(z.string().min(1)).min(1),
  }),
  scope: z.union([
    z.object({ mode: z.literal("full"), roots: z.array(z.string()) }),
    z.object({ mode: z.literal("partial"), roots: z.array(z.string().min(1)).min(1) }),
  ]),
  schema_output: z.object({ tables: z.array(z.string().min(1)).min(1) }),
  evidence_anchors: z.array(z.unknown()).min(1),
  conservative_labels_preserved: z.boolean(),
  write_sandbox: z.string().min(1),
  dry_run: z.object({ passed: z.boolean(), fixture: z.string().min(1) }),
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
  status: z.union([z.literal("passed"), z.literal("passed_with_gaps"), z.literal("failed")]),
})

export type TemplateMetadata = z.infer<typeof templateMetadataSchema>
export type GeneratedManifest = z.infer<typeof generatedManifestSchema>
export type SpecValidationReport = z.infer<typeof specValidationReportSchema>
