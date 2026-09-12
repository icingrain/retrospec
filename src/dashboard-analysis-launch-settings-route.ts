import type { Hono } from "hono"
import { z } from "zod"
import { writeAnalysisLaunchSettings } from "./analysis-launch-settings"
import { projectPaths } from "./paths"
import { analysisLaunchSettingsSchema } from "./schemas"

const launchSettingsRequestSchema = z.object({
  project_path: z.string().min(1),
  settings: analysisLaunchSettingsSchema,
})

export function registerDashboardAnalysisLaunchSettingsRoute(app: Hono): void {
  app.post("/dashboard/analysis/launch-settings", async (c) => {
    if (!isSameOriginDashboardWrite(c.req.raw)) {
      return c.json({ error: "dashboard write origin mismatch" }, 403)
    }
    const request = launchSettingsRequestSchema.parse(await c.req.json())
    const paths = projectPaths(request.project_path)
    const settings = await writeAnalysisLaunchSettings(paths, {
      scope: request.settings.scope,
      excludeFolders: request.settings.exclude_folders,
      excludeExtensions: request.settings.exclude_extensions,
      batchSize: request.settings.batch_size,
      workerCount: request.settings.worker_count,
    })
    return c.json(settings)
  })
}

function isSameOriginDashboardWrite(request: Request): boolean {
  const origin = request.headers.get("origin")
  return origin !== null && origin === new URL(request.url).origin
}
