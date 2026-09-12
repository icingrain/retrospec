import { Database } from "bun:sqlite"
import { join } from "node:path"
import type { CallConfidenceLabel } from "./call-graph"
import { type DetectedCommunity, detectGraphCommunities } from "./graph-community-detection"
import type { ProjectPaths } from "./types"

export type GraphCommunitySummary = {
  readonly community_id: string
  readonly label: string
  readonly algorithm: string
  readonly resolution: number
  readonly entity_count: number
  readonly hub_entities: readonly string[]
  readonly ambiguous_edge_count: number
}

export type GraphCommunitiesResponse = {
  readonly communities: readonly GraphCommunitySummary[]
}

type CallRow = {
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
  readonly confidence_label: CallConfidenceLabel
}

const COMMUNITY_ALGORITHM = "modularity-greedy-v1"
const COMMUNITY_RESOLUTION = 1

export function generateGraphCommunities(paths: ProjectPaths): GraphCommunitiesResponse {
  const db = new Database(callGraphDbPath(paths), { create: true })
  try {
    ensureGraphCommunitiesTable(db)
    const calls = readResolvedCalls(db)
    const components = detectGraphCommunities(calls)
    const summaries = replaceGraphCommunities(db, components)
    return { communities: summaries }
  } finally {
    db.close()
  }
}

function replaceGraphCommunities(
  db: Database,
  components: readonly DetectedCommunity[],
): readonly GraphCommunitySummary[] {
  db.exec("begin immediate transaction")
  try {
    db.exec("delete from graph_communities")
    const summaries = writeGraphCommunities(db, components)
    db.exec("commit")
    return summaries
  } catch (error) {
    db.exec("rollback")
    throw error
  }
}

function readResolvedCalls(db: Database): readonly CallRow[] {
  return db
    .query<CallRow, []>(
      `select caller_entity_id, callee_entity_id, confidence_label
       from calls
       where callee_entity_id is not null
       order by caller_entity_id, callee_entity_id`,
    )
    .all()
}

function writeGraphCommunities(
  db: Database,
  components: readonly DetectedCommunity[],
): readonly GraphCommunitySummary[] {
  const computedAt = new Date().toISOString()
  const insert = db.query(
    `insert into graph_communities
     (community_id, entity_id, algorithm, resolution, label, computed_at)
     values (?, ?, ?, ?, ?, ?)`,
  )

  return components.map((component, index) => {
    const communityId = `comm_${index + 1}`
    const label = `Community candidate ${index + 1}`
    for (const entityId of component.entities) {
      insert.run(
        communityId,
        entityId,
        COMMUNITY_ALGORITHM,
        COMMUNITY_RESOLUTION,
        label,
        computedAt,
      )
    }
    return {
      community_id: communityId,
      label,
      algorithm: COMMUNITY_ALGORITHM,
      resolution: COMMUNITY_RESOLUTION,
      entity_count: component.entities.length,
      hub_entities: component.hubEntities,
      ambiguous_edge_count: component.ambiguousEdgeCount,
    }
  })
}

function ensureGraphCommunitiesTable(db: Database): void {
  db.exec(`
    create table if not exists graph_communities (
      community_id text not null,
      entity_id text not null,
      algorithm text not null,
      resolution real not null,
      label text,
      computed_at text not null,
      primary key (community_id, entity_id)
    );
  `)
}

function callGraphDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "call_graph.db")
}
