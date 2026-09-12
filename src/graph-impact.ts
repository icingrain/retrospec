import { Database } from "bun:sqlite"
import { join } from "node:path"
import type { CallConfidenceLabel } from "./call-graph"
import type { ProjectPaths } from "./types"

export type ImpactRelationship = "caller" | "callee"

export type ImpactedEntity = {
  readonly entity_id: string
  readonly relationship: ImpactRelationship
  readonly distance: number
  readonly confidence: number
  readonly confidence_label: CallConfidenceLabel
  readonly file_path: string
}

export type ConfidenceSummary = Record<CallConfidenceLabel, number>

export type GraphImpactResponse = {
  readonly root_entity_id: string
  readonly depth: number
  readonly impacted_entities: readonly ImpactedEntity[]
  readonly impacted_files: readonly string[]
  readonly usage: {
    readonly incoming_ref_count: number
    readonly outgoing_ref_count: number
    readonly usage_score: number
  }
  readonly confidence_summary: ConfidenceSummary
}

type CallRow = {
  readonly row_id: number
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
  readonly file_path: string
  readonly confidence: number
  readonly confidence_label: CallConfidenceLabel
}

type TraversalState = {
  readonly impacted: ImpactedEntity[]
  readonly impactedFiles: Set<string>
  readonly confidenceSummary: ConfidenceSummary
  readonly expandedEntities: Set<string>
  readonly seenCallRows: Set<number>
  readonly seenImpacts: Set<string>
}

const EMPTY_CONFIDENCE_SUMMARY: ConfidenceSummary = {
  EXTRACTED: 0,
  INFERRED: 0,
  AMBIGUOUS: 0,
}

export function readGraphImpact(
  paths: ProjectPaths,
  rootEntityId: string,
  depth: number,
): GraphImpactResponse {
  const db = new Database(callGraphDbPath(paths), { readonly: true })
  try {
    const state: TraversalState = {
      impacted: [],
      impactedFiles: new Set<string>(),
      confidenceSummary: { ...EMPTY_CONFIDENCE_SUMMARY },
      expandedEntities: new Set<string>([rootEntityId]),
      seenCallRows: new Set<number>(),
      seenImpacts: new Set<string>(),
    }
    walkImpact(db, rootEntityId, depth, state)
    return {
      root_entity_id: rootEntityId,
      depth,
      impacted_entities: state.impacted,
      impacted_files: [...state.impactedFiles].sort(),
      usage: readUsage(db, rootEntityId),
      confidence_summary: state.confidenceSummary,
    }
  } finally {
    db.close()
  }
}

function walkImpact(
  db: Database,
  rootEntityId: string,
  maxDepth: number,
  state: TraversalState,
): void {
  let frontier = [rootEntityId]
  for (let distance = 1; distance <= maxDepth; distance += 1) {
    const nextFrontier: string[] = []
    for (const entityId of frontier) {
      const rows = adjacentRows(db, entityId)
      for (const row of rows) {
        if (!state.seenCallRows.has(row.row_id)) {
          state.seenCallRows.add(row.row_id)
          state.impactedFiles.add(row.file_path)
          state.confidenceSummary[row.confidence_label] += 1
        }
      }
      for (const impact of adjacentImpacts(rows, entityId, distance)) {
        if (impact.entity_id === rootEntityId) {
          continue
        }
        const impactKey = `${impact.entity_id}\0${impact.relationship}\0${impact.file_path}\0${impact.distance}`
        if (state.seenImpacts.has(impactKey)) {
          continue
        }
        state.seenImpacts.add(impactKey)
        state.impacted.push(impact)
        if (!state.expandedEntities.has(impact.entity_id)) {
          state.expandedEntities.add(impact.entity_id)
          nextFrontier.push(impact.entity_id)
        }
      }
    }
    frontier = nextFrontier
  }
}

function adjacentRows(db: Database, entityId: string): readonly CallRow[] {
  return db
    .query<CallRow, [string, string]>(
      `select rowid as row_id, caller_entity_id, callee_entity_id, file_path, confidence, confidence_label
       from calls
       where caller_entity_id = ? or callee_entity_id = ?
       order by line`,
    )
    .all(entityId, entityId)
}

function adjacentImpacts(
  rows: readonly CallRow[],
  entityId: string,
  distance: number,
): readonly ImpactedEntity[] {
  return rows.flatMap((row) => impactFromRow(row, entityId, distance))
}

function impactFromRow(
  row: CallRow,
  entityId: string,
  distance: number,
): readonly ImpactedEntity[] {
  if (row.caller_entity_id === entityId && row.callee_entity_id !== null) {
    return [
      {
        entity_id: row.callee_entity_id,
        relationship: "callee",
        distance,
        confidence: row.confidence,
        confidence_label: row.confidence_label,
        file_path: row.file_path,
      },
    ]
  }
  if (row.callee_entity_id === entityId) {
    return [
      {
        entity_id: row.caller_entity_id,
        relationship: "caller",
        distance,
        confidence: row.confidence,
        confidence_label: row.confidence_label,
        file_path: row.file_path,
      },
    ]
  }
  return []
}

function readUsage(db: Database, entityId: string): GraphImpactResponse["usage"] {
  const incoming = db
    .query<{ readonly count: number }, [string]>(
      "select count(*) as count from calls where callee_entity_id = ?",
    )
    .get(entityId)
  const outgoing = db
    .query<{ readonly count: number }, [string]>(
      "select count(*) as count from calls where caller_entity_id = ?",
    )
    .get(entityId)
  const incomingCount = incoming?.count ?? 0
  const outgoingCount = outgoing?.count ?? 0
  return {
    incoming_ref_count: incomingCount,
    outgoing_ref_count: outgoingCount,
    usage_score: incomingCount + outgoingCount > 0 ? 1 : 0,
  }
}

function callGraphDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "call_graph.db")
}
