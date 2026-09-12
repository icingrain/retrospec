import type { Hono } from "hono"
import { ZodError, z } from "zod"
import { normalizeAnalysisLaunchControls } from "./analysis-launch-controls"
import { registerExportRoutes } from "./daemon-export-routes"
import { validateGeneratedProgram } from "./generated-validation"
import { importStagedGlossaryCsv, readGlossaryReconciliation, readGlossaryTerms } from "./glossary"
import { generateGraphCommunities } from "./graph-communities"
import { readGraphImpact } from "./graph-impact"
import { cancelJob, submitJob } from "./job-runner"
import { SavedScopeConfirmationRequiredError } from "./job-scope"
import { awaitJob, findJob, findJobPaths, listJobs } from "./jobs"
import { ActiveJobConflictError } from "./jobs"
import { registerOntologyRoutes } from "./ontology-routes"
import { projectPaths } from "./paths"
import { ensureProjectRegistry, listProjects, readRetroStatuses, registerProject } from "./registry"
import { savedScopeConfirmationResponse } from "./saved-scope-confirmation-response"
import { analysisLaunchSettingsSchema, analysisScopeSchema } from "./schemas"
import { readSpecStatuses } from "./spec/status"
import type { RuntimePaths } from "./types"
import { stageGlossaryUpload } from "./uploads"
import type { ProjectWatcherManager } from "./watchers"

const registerRequestSchema = z.object({
  project_path: z.string().min(1),
})

const statusQuerySchema = z.object({
  project_path: z.string().min(1),
})

const graphImpactQuerySchema = z.object({
  project_path: z.string().min(1),
  entity_id: z.string().min(1),
  depth: z.coerce.number().int().min(1).max(8).default(1),
})

const submitJobRequestSchema = z.object({
  project_path: z.string().min(1),
  actor: z.union([z.literal("retro"), z.literal("spec"), z.literal("archivist")]),
  category: z.string().min(1),
  manifest_path: z.string().min(1),
  scope: analysisScopeSchema.optional(),
  launch_settings: analysisLaunchSettingsSchema.optional(),
  confirm_saved_scope: z.boolean().optional(),
  replace_existing: z.boolean().optional(),
})

const awaitJobRequestSchema = z.object({
  timeout_ms: z.number().int().min(0).max(300_000),
})

const generatedValidateRequestSchema = z.object({
  project_path: z.string().min(1),
  manifest_path: z.string().min(1),
})

const importGlossaryRequestSchema = z.object({
  project_path: z.string().min(1),
  upload_id: z.string().startsWith("upl_"),
})

export function registerApiRoutes(
  app: Hono,
  runtime: RuntimePaths,
  watchers?: ProjectWatcherManager,
): void {
  app.get("/projects", (c) => c.json({ projects: listProjects(runtime) }))

  app.post("/projects/register", async (c) => {
    const request = registerRequestSchema.parse(await c.req.json())
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    const project = registerProject(runtime, paths.projectRoot)
    watchers?.ensureProject(project.project_path)
    return c.json({ project_id: project.project_id, project_path: project.project_path })
  })

  app.get("/analysis/status", async (c) => {
    const request = statusQuerySchema.parse({ project_path: c.req.query("project_path") })
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    return c.json({ retro: readRetroStatuses(paths), spec: readSpecStatuses(paths) })
  })

  app.get("/graph/impact", async (c) => {
    try {
      const request = graphImpactQuerySchema.parse({
        project_path: c.req.query("project_path"),
        entity_id: c.req.query("entity_id"),
        depth: c.req.query("depth"),
      })
      const paths = projectPaths(request.project_path)
      await ensureProjectRegistry(paths)
      return c.json(readGraphImpact(paths, request.entity_id, request.depth))
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ error: "invalid graph impact query" }, 400)
      }
      throw error
    }
  })

  app.get("/graph/communities", async (c) => {
    try {
      const request = statusQuerySchema.parse({ project_path: c.req.query("project_path") })
      const paths = projectPaths(request.project_path)
      await ensureProjectRegistry(paths)
      return c.json(generateGraphCommunities(paths))
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ error: "invalid graph communities query" }, 400)
      }
      throw error
    }
  })

  registerExportRoutes(app, runtime)
  registerOntologyRoutes(app)

  app.post("/uploads/glossary", async (c) => {
    try {
      const body = await c.req.parseBody()
      const projectPath = body["project_path"]
      const file = body["file"]
      if (typeof projectPath !== "string" || !(file instanceof File)) {
        return c.json({ error: "project_path and file are required" }, 400)
      }
      const paths = projectPaths(projectPath)
      await ensureProjectRegistry(paths)
      registerProject(runtime, paths.projectRoot)
      return c.json(await stageGlossaryUpload(paths, file))
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })

  app.post("/glossary/import", async (c) => {
    try {
      const request = importGlossaryRequestSchema.parse(await c.req.json())
      const paths = projectPaths(request.project_path)
      await ensureProjectRegistry(paths)
      registerProject(runtime, paths.projectRoot)
      return c.json(await importStagedGlossaryCsv(paths, { uploadId: request.upload_id }))
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })

  app.get("/glossary/imports", async (c) => {
    const request = statusQuerySchema.parse({ project_path: c.req.query("project_path") })
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    return c.json({
      terms: readGlossaryTerms(paths),
      reconciliation: readGlossaryReconciliation(paths),
    })
  })

  app.post("/jobs", async (c) => {
    try {
      const request = submitJobRequestSchema.parse(await c.req.json())
      await ensureProjectRegistry(projectPaths(request.project_path))
      registerProject(runtime, projectPaths(request.project_path).projectRoot)
      return c.json(
        await submitJob({
          ...request,
          launch_settings:
            request.launch_settings === undefined
              ? undefined
              : normalizeAnalysisLaunchControls({
                  scope: request.launch_settings.scope,
                  excludeFolders: request.launch_settings.exclude_folders,
                  excludeExtensions: request.launch_settings.exclude_extensions,
                  batchSize: request.launch_settings.batch_size,
                  workerCount: request.launch_settings.worker_count,
                }),
        }),
      )
    } catch (error) {
      if (error instanceof ActiveJobConflictError) {
        return c.json(
          {
            error: error.message,
            conflict: {
              job_id: error.jobId,
              status: error.status,
              write_scope_key: error.writeScopeKey,
            },
          },
          409,
        )
      }
      if (error instanceof SavedScopeConfirmationRequiredError) {
        return savedScopeConfirmationResponse(c, error.scope)
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })

  app.get("/jobs", async (c) => {
    const request = statusQuerySchema.parse({ project_path: c.req.query("project_path") })
    return c.json({ jobs: await listJobs(request.project_path) })
  })

  app.get("/jobs/:job_id", async (c) => {
    const jobId = c.req.param("job_id")
    const detail = await findJob(runtime, jobId)
    if (detail === null) {
      return c.json({ error: "job not found" }, 404)
    }
    return c.json(detail)
  })

  app.post("/jobs/:job_id/await", async (c) => {
    const jobId = c.req.param("job_id")
    const paths = await findJobPaths(runtime, jobId)
    if (paths === null) {
      return c.json({ error: "job not found" }, 404)
    }

    const request = awaitJobRequestSchema.parse(await c.req.json())
    return c.json(await awaitJob(paths, jobId, request.timeout_ms))
  })

  app.post("/jobs/:job_id/cancel", async (c) => {
    const jobId = c.req.param("job_id")
    const paths = await findJobPaths(runtime, jobId)
    if (paths === null) {
      return c.json({ error: "job not found" }, 404)
    }

    return c.json(await cancelJob(paths, jobId))
  })

  app.post("/generated/validate", async (c) => {
    const request = generatedValidateRequestSchema.parse(await c.req.json())
    await ensureProjectRegistry(projectPaths(request.project_path))
    return c.json(await validateGeneratedProgram(request.project_path, request.manifest_path))
  })
}
