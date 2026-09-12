import { Database } from "bun:sqlite"
import { join } from "node:path"
import type { ProjectPaths } from "./types"

export type UsageMetric = {
  readonly entity_id: string
  readonly incoming_ref_count: number
  readonly outgoing_ref_count: number
  readonly sql_ref_count: number
  readonly usage_score: number
}

export type UsageMetricsResponse = {
  readonly metrics: readonly UsageMetric[]
}

type CallRow = {
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
}

type MutableUsageCounts = {
  incoming: number
  outgoing: number
}

export function generateUsageMetrics(paths: ProjectPaths): UsageMetricsResponse {
  const db = new Database(callGraphDbPath(paths), { create: true })
  try {
    ensureUsageMetricsTable(db)
    const metrics = calculateUsageMetrics(readCalls(db))
    replaceUsageMetrics(db, metrics)
    return { metrics }
  } finally {
    db.close()
  }
}

function readCalls(db: Database): readonly CallRow[] {
  return db
    .query<CallRow, []>(
      `select caller_entity_id, callee_entity_id
       from calls
       order by caller_entity_id, callee_entity_id`,
    )
    .all()
}

function calculateUsageMetrics(calls: readonly CallRow[]): readonly UsageMetric[] {
  const counts = new Map<string, MutableUsageCounts>()
  for (const call of calls) {
    ensureCounts(counts, call.caller_entity_id).outgoing += 1
    if (call.callee_entity_id !== null) {
      ensureCounts(counts, call.callee_entity_id).incoming += 1
    }
  }

  const maxReferenceCount = Math.max(
    1,
    ...[...counts.values()].map((count) => count.incoming + count.outgoing),
  )

  return [...counts.entries()]
    .map(([entityId, count]) => ({
      entity_id: entityId,
      incoming_ref_count: count.incoming,
      outgoing_ref_count: count.outgoing,
      sql_ref_count: 0,
      usage_score: (count.incoming + count.outgoing) / maxReferenceCount,
    }))
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id))
}

function ensureCounts(
  counts: Map<string, MutableUsageCounts>,
  entityId: string,
): MutableUsageCounts {
  const existing = counts.get(entityId)
  if (existing !== undefined) {
    return existing
  }
  const created = { incoming: 0, outgoing: 0 }
  counts.set(entityId, created)
  return created
}

function replaceUsageMetrics(db: Database, metrics: readonly UsageMetric[]): void {
  const calculatedAt = new Date().toISOString()
  const insert = db.query(
    `insert into usage_metrics
     (entity_id, incoming_ref_count, outgoing_ref_count, sql_ref_count, usage_score, calculated_at)
     values (?, ?, ?, ?, ?, ?)`,
  )

  db.exec("begin immediate transaction")
  try {
    db.exec("delete from usage_metrics")
    for (const metric of metrics) {
      insert.run(
        metric.entity_id,
        metric.incoming_ref_count,
        metric.outgoing_ref_count,
        metric.sql_ref_count,
        metric.usage_score,
        calculatedAt,
      )
    }
    db.exec("commit")
  } catch (error) {
    db.exec("rollback")
    throw error
  }
}

function ensureUsageMetricsTable(db: Database): void {
  db.exec(`
    create table if not exists usage_metrics (
      entity_id text primary key,
      incoming_ref_count integer not null,
      outgoing_ref_count integer not null,
      sql_ref_count integer not null,
      usage_score real not null,
      calculated_at text not null
    );
  `)
}

function callGraphDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "call_graph.db")
}
