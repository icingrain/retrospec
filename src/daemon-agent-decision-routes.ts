import type { Hono } from "hono"
import { z } from "zod"
import { readAgentDecisions, recordAgentDecision } from "./agent-decisions"
import { projectPaths } from "./paths"
import { ensureProjectRegistry, registerProject } from "./registry"
import type { RuntimePaths } from "./types"

const decisionRequestSchema = z.object({
  project_path: z.string().min(1),
  job_id: z.string().min(1).optional(),
  agent: z.string().min(1),
  skill: z.string().min(1).optional(),
  event_type: z.string().min(1),
  reason: z.string().min(1),
  payload: z.unknown().optional(),
})

const decisionQuerySchema = z.object({
  project_path: z.string().min(1),
  job_id: z.string().min(1).optional(),
})

export function registerAgentDecisionRoutes(app: Hono, runtime: RuntimePaths): void {
  app.post("/agent/decisions", async (c) => {
    const request = decisionRequestSchema.parse(await c.req.json())
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    registerProject(runtime, paths.projectRoot)
    const decision = recordAgentDecision(paths, {
      projectPath: paths.projectRoot,
      agent: request.agent,
      eventType: request.event_type,
      reason: request.reason,
      payloadJson: JSON.stringify(request.payload ?? {}),
      ...(request.job_id === undefined ? {} : { jobId: request.job_id }),
      ...(request.skill === undefined ? {} : { skill: request.skill }),
    })
    return c.json(decision)
  })

  app.get("/agent/decisions", async (c) => {
    const request = decisionQuerySchema.parse({
      project_path: c.req.query("project_path"),
      job_id: c.req.query("job_id"),
    })
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    const filter = request.job_id === undefined ? {} : { jobId: request.job_id }
    return c.json({ decisions: readAgentDecisions(paths, filter) })
  })
}
