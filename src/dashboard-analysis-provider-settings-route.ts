import type { Hono } from "hono"
import { z } from "zod"
import { projectPaths } from "./paths"
import { readBrokerHealth } from "./provider-health"
import {
  readSpecProviderSettings,
  resolveSpecProviderSettingsState,
  specProviderSettingsSchema,
  writeSpecProviderSettings,
} from "./provider-settings"

const providerSettingsRequestSchema = z.object({
  project_path: z.string().min(1),
  settings: specProviderSettingsSchema,
})

export function registerDashboardAnalysisProviderSettingsRoute(app: Hono): void {
  app.get("/dashboard/analysis/provider-settings", async (c) => {
    const projectPath = z.string().min(1).parse(c.req.query("project_path"))
    const saved = await readSpecProviderSettings(projectPaths(projectPath))
    const brokerHealth = await readBrokerHealth(saved)
    return c.json({
      settings: saved?.settings ?? null,
      resolved: resolveSpecProviderSettingsState(saved, brokerHealth),
    })
  })

  app.post("/dashboard/analysis/provider-settings", async (c) => {
    if (!isSameOriginDashboardWrite(c.req.raw)) {
      return c.json({ error: "dashboard write origin mismatch" }, 403)
    }
    const parsed = providerSettingsRequestSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: "invalid provider settings" }, 400)
    }
    const saved = await writeSpecProviderSettings(
      projectPaths(parsed.data.project_path),
      parsed.data.settings,
    )
    const brokerHealth = await readBrokerHealth(saved)
    return c.json({
      settings: saved.settings,
      resolved: resolveSpecProviderSettingsState(saved, brokerHealth),
    })
  })
}

function isSameOriginDashboardWrite(request: Request): boolean {
  const origin = request.headers.get("origin")
  return origin !== null && origin === new URL(request.url).origin
}
