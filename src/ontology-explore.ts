import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { type GlossarySearchMatch, searchGlossary } from "./glossary-search"
import type { EvidenceLabel, ProjectPaths } from "./types"

export type OntologyInclude = "structure" | "semantics" | "evidence"

export type OntologyEntity = {
  readonly entity_id: string
  readonly entity_type: string
  readonly file_path: string
  readonly symbol_name: string | null
  readonly signature: string | null
  readonly evidence_label: EvidenceLabel
  readonly parser_backend: string
  readonly parser_mode: string
  readonly support_level: string
  readonly missing_capability: string | null
}

export type OntologyFinding = {
  readonly analysis_type: string
  readonly entity_id: string | null
  readonly summary: string
  readonly evidence_label: string
}

export type OntologyExploreResponse = {
  readonly anchor: { readonly requested: string; readonly resolved_entity_id: string | null }
  readonly structure: { readonly entities: readonly OntologyEntity[] }
  readonly semantics: {
    readonly glossary: readonly GlossarySearchMatch[]
    readonly findings: readonly OntologyFinding[]
  }
  readonly confidence: {
    readonly evidence_label: EvidenceLabel
    readonly confidence_label: EvidenceLabel
  }
  readonly status: { readonly stale_entities: readonly string[] }
}

export function exploreOntology(
  paths: ProjectPaths,
  anchor: string,
  depth: number,
  include: ReadonlySet<OntologyInclude>,
): OntologyExploreResponse {
  const entities = include.has("structure") ? resolveEntities(paths, anchor, depth) : []
  const resolvedEntityId = entities[0]?.entity_id ?? null
  const glossary = include.has("semantics") ? searchGlossary(paths, anchor) : []
  const findings = include.has("semantics") ? readFindings(paths, entities) : []
  const evidenceLabel = strongestEvidenceLabel(entities, findings)

  return {
    anchor: { requested: anchor, resolved_entity_id: resolvedEntityId },
    structure: { entities },
    semantics: { glossary, findings },
    confidence: { evidence_label: evidenceLabel, confidence_label: evidenceLabel },
    status: { stale_entities: [] },
  }
}

function resolveEntities(
  paths: ProjectPaths,
  anchor: string,
  depth: number,
): readonly OntologyEntity[] {
  if (!existsSync(paths.registryDb)) {
    return []
  }

  const db = new Database(paths.registryDb, { readonly: true })
  try {
    const direct = queryEntities(db, anchor)
    if (direct.length > 0 || depth <= 1) {
      return direct
    }
    return queryEntities(
      db,
      anchor
        .split(/[\s/._-]+/)
        .filter(Boolean)
        .join("%"),
    )
  } finally {
    db.close()
  }
}

function queryEntities(db: Database, anchor: string): readonly OntologyEntity[] {
  const likeAnchor = `%${anchor}%`
  return db
    .query<OntologyEntity, [string, string, string, string]>(
      `select entity_id, entity_type, file_path, symbol_name, signature, evidence_label,
              parser_backend, parser_mode, support_level, missing_capability
       from entities
       where entity_id = ? or file_path like ? or symbol_name like ?
       order by case when symbol_name = ? then 0 else 1 end, entity_type, file_path`,
    )
    .all(anchor, likeAnchor, likeAnchor, anchor)
}

function readFindings(
  paths: ProjectPaths,
  entities: readonly OntologyEntity[],
): readonly OntologyFinding[] {
  if (!existsSync(paths.specAnalysisDb) || entities.length === 0) {
    return []
  }

  const entityIds = new Set(entities.map((entity) => entity.entity_id))
  const db = new Database(paths.specAnalysisDb, { readonly: true })
  try {
    return db
      .query<OntologyFinding, []>(
        `select 'risk' as analysis_type, entity_id, summary, coalesce(evidence_label, 'INFERRED') as evidence_label
         from risk_findings
         order by created_at desc, finding_id`,
      )
      .all()
      .filter((finding) => finding.entity_id !== null && entityIds.has(finding.entity_id))
  } finally {
    db.close()
  }
}

function strongestEvidenceLabel(
  entities: readonly OntologyEntity[],
  findings: readonly OntologyFinding[],
): EvidenceLabel {
  const labels = [
    ...entities.map((entity) => entity.evidence_label),
    ...findings.map(toEvidenceLabel),
  ]
  if (labels.includes("AMBIGUOUS")) return "AMBIGUOUS"
  if (labels.includes("INFERRED")) return "INFERRED"
  return "EXTRACTED"
}

function toEvidenceLabel(finding: OntologyFinding): EvidenceLabel {
  if (finding.evidence_label === "EXTRACTED" || finding.evidence_label === "AMBIGUOUS") {
    return finding.evidence_label
  }
  return "INFERRED"
}
