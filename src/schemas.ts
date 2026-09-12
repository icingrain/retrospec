import { z } from "zod"

const analysisScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full"), roots: z.array(z.string()).default([]) }),
  z.object({ mode: z.literal("partial"), roots: z.array(z.string().min(1)).min(1) }),
])

const analysisLaunchSettingsSchema = z.object({
  scope: analysisScopeSchema.optional(),
  exclude_folders: z.array(z.string()).optional(),
  exclude_extensions: z.array(z.string()).optional(),
  batch_size: z.number().int().min(1).max(1_000).optional(),
  worker_count: z.number().int().min(1).max(1_000).optional(),
})

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  started_at: z.string(),
  watchers: z.object({
    healthcheck_interval_ms: z.number().int(),
    watchers: z.array(
      z.object({
        project_path: z.string(),
        status: z.union([z.literal("watching"), z.literal("dead"), z.literal("missing")]),
        restart_count: z.number().int(),
        last_healthcheck_at: z.string().nullable(),
      }),
    ),
  }),
})

export const registerProjectResponseSchema = z.object({
  project_id: z.string().startsWith("prj_"),
  project_path: z.string(),
})

export const analysisStatusResponseSchema = z.object({
  retro: z.array(
    z.object({
      category: z.string(),
      status: z.string(),
      entity_count: z.number().int(),
      completed_at: z.string().nullable(),
      parser_backend: z.string().default("unknown"),
      support_level: z
        .union([z.literal("high-confidence"), z.literal("best-effort"), z.literal("unsupported")])
        .default("unsupported"),
      evidence_label: z
        .union([z.literal("EXTRACTED"), z.literal("INFERRED"), z.literal("AMBIGUOUS")])
        .default("AMBIGUOUS"),
      missing_capability: z.string().nullable().default(null),
      coverage_summary_json: z.string().default("{}"),
      scope_mode: z.union([z.literal("full"), z.literal("partial")]).default("full"),
      scope_roots_json: z.string().default("[]"),
      scope_fingerprint: z.string().default(""),
    }),
  ),
  spec: z.array(
    z.object({
      analysis_run_id: z.string(),
      analysis_type: z.string(),
      status: z.string(),
      provider_mode: z.string().default("deterministic"),
      model: z.string(),
      prompt_version: z.string(),
      preflight_status: z.union([z.literal("ready"), z.literal("limited")]).nullable(),
      review_needed: z.boolean(),
      coverage_languages: z.array(z.string()),
      coverage_modes: z.array(z.string()),
      missing_capabilities: z.array(z.string()),
      scope_mode: z.union([z.literal("full"), z.literal("partial")]).default("full"),
      scope_roots_json: z.string().default("[]"),
      scope_fingerprint: z.string().default(""),
      broker_run_id: z.string().nullable().default(null),
      partial_result: z.string().nullable().default(null),
      error_message: z.string().nullable().default(null),
    }),
  ),
})

export const submitJobResponseSchema = z.object({
  job_id: z.string().startsWith("job_"),
  status: z.union([
    z.literal("queued"),
    z.literal("running"),
    z.literal("completed"),
    z.literal("failed"),
    z.literal("cancelled"),
  ]),
  replaced_job_id: z.string().startsWith("job_").optional(),
})

export { analysisLaunchSettingsSchema, analysisScopeSchema }

export const jobSnapshotSchema = z.object({
  job_id: z.string().startsWith("job_"),
  project_path: z.string(),
  category: z.string(),
  actor: z.union([z.literal("retro"), z.literal("spec"), z.literal("archivist")]),
  status: submitJobResponseSchema.shape.status,
  progress_pct: z.number(),
  current_step: z.string().nullable(),
  write_scope_key: z.string(),
  replaces_job_id: z.string().startsWith("job_").nullable(),
  submitted_at: z.string(),
  updated_at: z.string(),
})

export const jobDetailResponseSchema = z.object({
  snapshot: jobSnapshotSchema,
  ledger: z.array(
    z.object({
      event_id: z.string(),
      job_id: z.string().startsWith("job_"),
      event_type: z.union([
        z.literal("submitted"),
        z.literal("started"),
        z.literal("checkpoint"),
        z.literal("blocker"),
        z.literal("error"),
        z.literal("completed"),
        z.literal("failed"),
        z.literal("cancelled"),
      ]),
      payload: z.string(),
      timestamp: z.string(),
    }),
  ),
})

export const awaitJobResponseSchema = z.object({
  job_id: z.string().startsWith("job_"),
  status: submitJobResponseSchema.shape.status,
  timed_out: z.boolean(),
  progress_pct: z.number(),
})

export const jobListResponseSchema = z.object({
  jobs: z.array(jobSnapshotSchema),
})

export const exportFileRecordSchema = z.object({
  file_id: z.string(),
  file_name: z.string(),
  format: z.string(),
  size_bytes: z.number(),
  created_at: z.string(),
  download_url: z.string(),
  category: z.union([z.literal("structure"), z.literal("symbols")]).optional(),
  input_db_paths: z.array(z.string()).optional(),
  source_fingerprint: z.string().nullable().optional(),
  analysis_run_id: z.string().nullable().optional(),
  glossary_reconciliation: z
    .object({
      term_count: z.number(),
      entity_match_count: z.number(),
      unmatched_entities: z.number(),
    })
    .optional(),
})

export const exportListResponseSchema = z.object({
  exports: z.array(exportFileRecordSchema),
})

export const generatedValidationResponseSchema = z.object({
  status: z.union([z.literal("approved"), z.literal("blocked")]),
  manifest_path: z.string(),
  generation_contract_path: z.string(),
  validation_report_path: z.string(),
  entrypoint_path: z.string(),
  blockers: z.array(z.string()),
})
