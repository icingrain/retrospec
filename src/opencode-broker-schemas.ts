import { z } from "zod"

const distributionSchema = z.object({ value: z.string(), count: z.number() })

const evidenceSchema = z.object({
  parser_backend: z.string(),
  parser_mode: z.enum(["ast", "generic_ast", "regex", "config", "partial"]),
  support_level: z.enum(["high-confidence", "best-effort", "unsupported"]),
  evidence_label: z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]),
  missing_capability: z.string().nullable(),
})

export const specBatchInputSchema = z.object({
  handoffs: z.array(
    z.object({
      category: z.string(),
      status: z.string(),
      entityCount: z.number(),
      retroRunId: z.string(),
      sourceFingerprint: z.string(),
      completedAt: z.string().nullable(),
      parserBackend: z.string(),
      supportLevel: z.string(),
      evidenceLabel: z.string(),
      missingCapability: z.string().nullable(),
      coverageLanguages: z.array(z.string()),
      coverageModes: z.array(z.string()),
    }),
  ),
  preflight: z.object({
    status: z.enum(["ready", "limited"]),
    reviewNeeded: z.boolean(),
    coverageLanguages: z.array(z.string()),
    coverageModes: z.array(z.string()),
    parserModes: z.array(distributionSchema),
    supportLevels: z.array(distributionSchema),
    evidenceLabels: z.array(distributionSchema),
    missingCapabilities: z.array(z.string()),
    notes: z.array(z.string()),
  }),
  entities: z.array(
    z.object({
      entityId: z.string(),
      entityType: z.string(),
      filePath: z.string(),
      symbolName: z.string().nullable(),
      signature: z.string().nullable(),
      sourceCategory: z.string(),
      contentHash: z.string().nullable(),
      evidence: evidenceSchema,
    }),
  ),
  memoryNotes: z.array(
    z.object({
      memoryId: z.string(),
      anchorType: z.string(),
      anchorId: z.string(),
      kind: z.string(),
      content: z.string(),
    }),
  ),
  glossaryMatches: z.array(
    z.object({
      entityId: z.string(),
      glossaryType: z.string(),
      glossaryKey: z.string(),
      confidence: z.number(),
    }),
  ),
})

export const brokerAnalyzeRequestSchema = z.object({
  protocol_version: z.literal(1),
  analysis_type: z.literal("risk"),
  prompt_version: z.literal("risk-v1"),
  model: z.string().min(1),
  input: specBatchInputSchema,
})

export const riskFindingResponseSchema = z.object({
  findingId: z.string(),
  entityId: z.string(),
  severity: z.string(),
  riskType: z.string(),
  summary: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  evidenceLabel: z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]).optional(),
  findingStatus: z.enum(["open", "needs_review", "unresolved"]).optional(),
  memoryNotes: z.array(z.string()).optional(),
})

export const riskFindingsResponseSchema = z.object({
  findings: z.array(riskFindingResponseSchema),
})

export type BrokerAnalyzeRequest = z.infer<typeof brokerAnalyzeRequestSchema>
