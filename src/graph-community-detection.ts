import type { CallConfidenceLabel } from "./call-graph"

export type CommunityDetectionCall = {
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
  readonly confidence_label: CallConfidenceLabel
}

export type DetectedCommunity = {
  readonly entities: readonly string[]
  readonly ambiguousEdgeCount: number
  readonly hubEntities: readonly string[]
}

type Edge = {
  readonly left: string
  readonly right: string
}

const EPSILON = 0.000_001

export function detectGraphCommunities(
  calls: readonly CommunityDetectionCall[],
): readonly DetectedCommunity[] {
  const edges = uniqueUndirectedEdges(calls)
  const adjacency = buildAdjacency(edges)
  const communities = greedyModularityCommunities(adjacency, edges)
  return communities.map((entities) => ({
    entities,
    ambiguousEdgeCount: countAmbiguousEdges(calls, entities),
    hubEntities: findHubEntitiesByInternalDegree(adjacency, entities),
  }))
}

function uniqueUndirectedEdges(calls: readonly CommunityDetectionCall[]): readonly Edge[] {
  const edges = new Map<string, Edge>()
  for (const call of calls) {
    const callee = call.callee_entity_id
    if (callee === null || call.caller_entity_id === callee) {
      continue
    }
    const [left, right] = orderedPair(call.caller_entity_id, callee)
    edges.set(`${left}\0${right}`, { left, right })
  }
  return [...edges.values()].sort(compareEdges)
}

function orderedPair(left: string, right: string): readonly [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left]
}

function compareEdges(left: Edge, right: Edge): number {
  return left.left.localeCompare(right.left) || left.right.localeCompare(right.right)
}

function buildAdjacency(edges: readonly Edge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    connect(adjacency, edge.left, edge.right)
    connect(adjacency, edge.right, edge.left)
  }
  return adjacency
}

function connect(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const neighbors = adjacency.get(from) ?? new Set<string>()
  neighbors.add(to)
  adjacency.set(from, neighbors)
}

function greedyModularityCommunities(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  edges: readonly Edge[],
): readonly (readonly string[])[] {
  const entities = [...adjacency.keys()].sort()
  const assignments = new Map(entities.map((entity) => [entity, entity]))
  let score = modularity(assignments, adjacency, edges.length)
  let changed = true

  while (changed) {
    changed = false
    for (const entity of entities) {
      const current = assignments.get(entity)
      if (current === undefined) {
        continue
      }
      const candidates = neighborCommunities(entity, adjacency, assignments)
      let bestCommunity = current
      let bestScore = score
      for (const candidate of candidates) {
        assignments.set(entity, candidate)
        const candidateScore = modularity(assignments, adjacency, edges.length)
        if (candidateScore > bestScore + EPSILON) {
          bestCommunity = candidate
          bestScore = candidateScore
        }
      }
      assignments.set(entity, bestCommunity)
      if (bestCommunity !== current) {
        score = bestScore
        changed = true
      }
    }
  }

  return sortCommunities(groupAssignments(assignments))
}

function neighborCommunities(
  entity: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  assignments: ReadonlyMap<string, string>,
): readonly string[] {
  return [...(adjacency.get(entity) ?? [])]
    .map((neighbor) => assignments.get(neighbor))
    .filter((community): community is string => community !== undefined)
    .sort()
}

function modularity(
  assignments: ReadonlyMap<string, string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  edgeCount: number,
): number {
  if (edgeCount === 0) {
    return 0
  }
  const communities = groupAssignments(assignments)
  return [...communities.values()].reduce((total, entities) => {
    const internalEdges = countInternalEdges(entities, adjacency)
    const degreeSum = entities.reduce((sum, entity) => sum + (adjacency.get(entity)?.size ?? 0), 0)
    const edgeRatio = internalEdges / edgeCount
    const degreeRatio = degreeSum / (2 * edgeCount)
    return total + edgeRatio - degreeRatio * degreeRatio
  }, 0)
}

function groupAssignments(assignments: ReadonlyMap<string, string>): Map<string, string[]> {
  const communities = new Map<string, string[]>()
  for (const [entity, community] of assignments) {
    const members = communities.get(community) ?? []
    members.push(entity)
    communities.set(community, members)
  }
  return communities
}

function countInternalEdges(
  entities: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const entitySet = new Set(entities)
  return (
    entities.reduce(
      (count, entity) =>
        count +
        [...(adjacency.get(entity) ?? [])].filter((neighbor) => entitySet.has(neighbor)).length,
      0,
    ) / 2
  )
}

function sortCommunities(
  communities: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  return [...communities.values()]
    .map((entities) => [...entities].sort())
    .sort(
      (left, right) =>
        right.length - left.length || firstEntity(left).localeCompare(firstEntity(right)),
    )
}

function firstEntity(entities: readonly string[]): string {
  return entities[0] ?? ""
}

function countAmbiguousEdges(
  calls: readonly CommunityDetectionCall[],
  entities: readonly string[],
): number {
  const entitySet = new Set(entities)
  return calls.filter(
    (call) =>
      call.confidence_label === "AMBIGUOUS" &&
      call.callee_entity_id !== null &&
      entitySet.has(call.caller_entity_id) &&
      entitySet.has(call.callee_entity_id),
  ).length
}

function findHubEntitiesByInternalDegree(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  entities: readonly string[],
): readonly string[] {
  const entitySet = new Set(entities)
  let maxDegree = 0
  for (const entity of entities) {
    maxDegree = Math.max(maxDegree, internalDegree(adjacency, entity, entitySet))
  }
  return entities.filter((entity) => internalDegree(adjacency, entity, entitySet) === maxDegree)
}

function internalDegree(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  entity: string,
  entitySet: ReadonlySet<string>,
): number {
  return [...(adjacency.get(entity) ?? [])].filter((neighbor) => entitySet.has(neighbor)).length
}
