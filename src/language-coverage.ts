import { Database } from "bun:sqlite"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { ProjectPaths } from "./types"

const matrixPath = join(
  import.meta.dir,
  "..",
  "templates",
  "generated-program",
  "language-capability-matrix.json",
)

const supportLevelSchema = z.union([
  z.literal("high-confidence"),
  z.literal("best-effort"),
  z.literal("unsupported"),
])

const evidenceLabelSchema = z.union([
  z.literal("EXTRACTED"),
  z.literal("INFERRED"),
  z.literal("AMBIGUOUS"),
])

const languageCapabilityMatrixSchema = z.object({
  categories: z.array(z.string()),
  languages: z.record(
    z.object({
      display_name: z.string(),
      overall_confidence: supportLevelSchema,
      categories: z.record(
        z.object({
          support_level: supportLevelSchema,
          evidence_label: evidenceLabelSchema,
        }),
      ),
    }),
  ),
})

export type LanguageCoverageSummary = {
  readonly totalLanguages: number
  readonly highConfidenceLanguages: number
  readonly bestEffortLanguages: number
  readonly unsupportedLanguages: number
  readonly categoryCount: number
  readonly highConfidenceCategoryCells: number
  readonly totalCategoryCells: number
  readonly fallbackEvidenceRows: number
}

export type LanguageCoverageRow = {
  readonly language: string
  readonly displayName: string
  readonly confidence: z.infer<typeof supportLevelSchema>
  readonly highConfidenceCategories: number
  readonly bestEffortCategories: number
  readonly unsupportedCategories: number
  readonly evidenceLabels: readonly z.infer<typeof evidenceLabelSchema>[]
}

export type FallbackEvidenceRow = {
  readonly language: string
  readonly category: string
  readonly support_level: z.infer<typeof supportLevelSchema>
  readonly evidence_label: z.infer<typeof evidenceLabelSchema>
  readonly missing_capability: string
  readonly file_path: string
  readonly reason: string
}

export type LanguageCoverageDashboard = {
  readonly summary: LanguageCoverageSummary
  readonly rows: readonly LanguageCoverageRow[]
  readonly fallbackRows: readonly FallbackEvidenceRow[]
}

type SupportCounts = {
  highConfidence: number
  bestEffort: number
  unsupported: number
}

export function readLanguageCoverage(paths: ProjectPaths): LanguageCoverageDashboard {
  const matrix = languageCapabilityMatrixSchema.parse(JSON.parse(readFileSync(matrixPath, "utf8")))
  const rows = Object.entries(matrix.languages).map(([language, capability]) => {
    const counts = supportCounts(Object.values(capability.categories))
    return {
      language,
      displayName: capability.display_name,
      confidence: capability.overall_confidence,
      highConfidenceCategories: counts.highConfidence,
      bestEffortCategories: counts.bestEffort,
      unsupportedCategories: counts.unsupported,
      evidenceLabels: uniqueEvidenceLabels(Object.values(capability.categories)),
    }
  })
  const matrixCounts = supportCounts(
    Object.values(matrix.languages).flatMap((language) => Object.values(language.categories)),
  )
  const languageCounts = supportCounts(
    Object.values(matrix.languages).map((language) => ({
      support_level: language.overall_confidence,
      evidence_label: "EXTRACTED",
    })),
  )
  const fallbackRows = readFallbackEvidence(paths)

  return {
    summary: {
      totalLanguages: rows.length,
      highConfidenceLanguages: languageCounts.highConfidence,
      bestEffortLanguages: languageCounts.bestEffort,
      unsupportedLanguages: languageCounts.unsupported,
      categoryCount: matrix.categories.length,
      highConfidenceCategoryCells: matrixCounts.highConfidence,
      totalCategoryCells:
        matrixCounts.highConfidence + matrixCounts.bestEffort + matrixCounts.unsupported,
      fallbackEvidenceRows: fallbackRows.length,
    },
    rows,
    fallbackRows,
  }
}

function supportCounts(
  categories: readonly { readonly support_level: z.infer<typeof supportLevelSchema> }[],
): SupportCounts {
  const counts: SupportCounts = { highConfidence: 0, bestEffort: 0, unsupported: 0 }
  for (const category of categories) {
    switch (category.support_level) {
      case "high-confidence":
        counts.highConfidence += 1
        break
      case "best-effort":
        counts.bestEffort += 1
        break
      case "unsupported":
        counts.unsupported += 1
        break
    }
  }
  return counts
}

function uniqueEvidenceLabels(
  categories: readonly { readonly evidence_label: z.infer<typeof evidenceLabelSchema> }[],
): readonly z.infer<typeof evidenceLabelSchema>[] {
  return [...new Set(categories.map((category) => category.evidence_label))]
}

function readFallbackEvidence(paths: ProjectPaths): readonly FallbackEvidenceRow[] {
  const otherDbPath = join(paths.stateDir, "retro", "other.db")
  if (!existsSync(otherDbPath)) {
    return []
  }

  const db = new Database(otherDbPath, { readonly: true })
  try {
    return db
      .query<FallbackEvidenceRow, []>(
        `select language, category, support_level, evidence_label, missing_capability, file_path, reason
         from fallback_evidence
         order by language, category, file_path`,
      )
      .all()
  } finally {
    db.close()
  }
}
