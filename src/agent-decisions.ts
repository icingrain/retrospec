import { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import type { ProjectPaths } from "./types"

export type AgentDecisionRecord = {
  readonly decision_id: string
  readonly project_path: string
  readonly job_id: string | null
  readonly agent: string
  readonly skill: string | null
  readonly event_type: string
  readonly reason: string
  readonly payload_json: string
  readonly created_at: string
}

export type RecordAgentDecisionInput = {
  readonly projectPath: string
  readonly jobId?: string
  readonly agent: string
  readonly skill?: string
  readonly eventType: string
  readonly reason: string
  readonly payloadJson: string
}

export type ReadAgentDecisionsFilter = {
  readonly jobId?: string
}

export function recordAgentDecision(
  paths: ProjectPaths,
  input: RecordAgentDecisionInput,
): AgentDecisionRecord {
  ensureAgentDecisionStore(paths)
  const decision: AgentDecisionRecord = {
    decision_id: `adec_${randomUUID()}`,
    project_path: input.projectPath,
    job_id: input.jobId ?? null,
    agent: input.agent,
    skill: input.skill ?? null,
    event_type: input.eventType,
    reason: input.reason,
    payload_json: input.payloadJson,
    created_at: new Date().toISOString(),
  }
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.query(
      `insert into agent_decisions (
        decision_id, project_path, job_id, agent, skill, event_type, reason, payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      decision.decision_id,
      decision.project_path,
      decision.job_id,
      decision.agent,
      decision.skill,
      decision.event_type,
      decision.reason,
      decision.payload_json,
      decision.created_at,
    )
    return decision
  } finally {
    db.close()
  }
}

export function readAgentDecisions(
  paths: ProjectPaths,
  filter: ReadAgentDecisionsFilter = {},
): readonly AgentDecisionRecord[] {
  ensureAgentDecisionStore(paths)
  const db = new Database(paths.registryDb, { readonly: true })
  try {
    if (filter.jobId !== undefined) {
      return db
        .query<AgentDecisionRecord, [string]>(
          `select decision_id, project_path, job_id, agent, skill, event_type, reason, payload_json, created_at
           from agent_decisions
           where job_id = ?
           order by created_at asc`,
        )
        .all(filter.jobId)
    }
    return db
      .query<AgentDecisionRecord, []>(
        `select decision_id, project_path, job_id, agent, skill, event_type, reason, payload_json, created_at
         from agent_decisions
         order by created_at asc`,
      )
      .all()
  } finally {
    db.close()
  }
}

function ensureAgentDecisionStore(paths: ProjectPaths): void {
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.exec(`
      create table if not exists agent_decisions (
        decision_id text primary key,
        project_path text not null,
        job_id text,
        agent text not null,
        skill text,
        event_type text not null,
        reason text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists agent_decisions_job_id_idx
      on agent_decisions(job_id, created_at);
    `)
  } finally {
    db.close()
  }
}
