import { writeFile } from "node:fs/promises"
import { Hono } from "hono"
import { registerAgentDecisionRoutes } from "./daemon-agent-decision-routes"
import { registerApiRoutes } from "./daemon-api-routes"
import { registerDashboardRoutes } from "./daemon-dashboard-routes"
import { createAuthToken } from "./ids"
import { recoverInterruptedJobs } from "./jobs"
import { registerMcpRoutes } from "./mcp-routes"
import { ensureRuntimeDir, runtimePaths } from "./paths"
import { listProjects } from "./registry"
import type { AuthToken, HealthResponse, Port, RuntimePaths } from "./types"
import { version } from "./version"
import { type ProjectWatcherManager, createProjectWatcherManager } from "./watchers"

export type DaemonServer = {
  readonly port: Port
  readonly token: AuthToken
  readonly startedAt: string
  readonly stop: () => void
}

export function createDaemonApp(
  runtime: RuntimePaths,
  token: AuthToken,
  startedAt: string,
  watchers: ProjectWatcherManager = createProjectWatcherManager(),
): Hono {
  const app = new Hono()

  app.use("*", async (c, next): Promise<Response | undefined> => {
    if (isBrowserSurface(c.req.path)) {
      await next()
      return
    }

    const authorization = c.req.header("Authorization")
    if (authorization !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401)
    }

    await next()
    return undefined
  })

  app.get("/health", (c) => {
    const body: HealthResponse = {
      ok: true,
      version,
      started_at: startedAt,
      watchers: watchers.summary(),
    }
    return c.json(body)
  })

  registerDashboardRoutes(app, runtime, version, startedAt)

  app.get("/favicon.ico", (c) => c.body(null, 204))
  registerMcpRoutes(app)
  registerAgentDecisionRoutes(app, runtime)
  registerApiRoutes(app, runtime, watchers)

  return app
}

function isBrowserSurface(path: string): boolean {
  return (
    path === "/health" ||
    path === "/dashboard" ||
    path === "/dashboard/analysis" ||
    path === "/dashboard/analysis/settings" ||
    path === "/dashboard/analysis/launch-settings" ||
    path === "/dashboard/analysis/provider-settings" ||
    path === "/dashboard/exports" ||
    path === "/dashboard/jobs" ||
    path === "/dashboard/uploads" ||
    path === "/favicon.ico" ||
    (path.startsWith("/exports/") && path.endsWith("/download"))
  )
}

export async function startDaemon(paths = runtimePaths()): Promise<DaemonServer> {
  await ensureRuntimeDir(paths)
  await recoverInterruptedJobs(paths)

  const token = createAuthToken()
  const startedAt = new Date().toISOString()
  const watchers = createProjectWatcherManager()
  watchers.start(() => listProjects(paths).map((project) => project.project_path))
  const app = createDaemonApp(paths, token, startedAt, watchers)
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch })
  const port = server.port ?? 0

  if (port === 0) {
    server.stop(true)
    throw new Error("retrospec daemon did not receive a listening port")
  }

  await writeFile(paths.portFile, `${port}\n`, { mode: 0o600 })
  await writeFile(paths.tokenFile, `${token}\n`, { mode: 0o600 })

  return {
    port,
    token,
    startedAt,
    stop: () => {
      watchers.stop()
      server.stop(true)
    },
  }
}

export async function runDaemonForever(paths = runtimePaths()): Promise<void> {
  const daemon = await startDaemon(paths)
  console.log(`retrospec daemon listening on 127.0.0.1:${daemon.port}`)
  await new Promise<never>(() => {})
}
