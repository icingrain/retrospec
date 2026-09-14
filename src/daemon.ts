import { writeFile } from "node:fs/promises"
import { Hono } from "hono"
import { registerAgentDecisionRoutes } from "./daemon-agent-decision-routes"
import { registerApiRoutes } from "./daemon-api-routes"
import { registerDashboardRoutes } from "./daemon-dashboard-routes"
import { readEndpoint, shutdownEndpoint } from "./discovery"
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
  onShutdown: () => void = () => {},
): Hono {
  const app = new Hono()

  app.use("*", async (c, next): Promise<Response | undefined> => {
    const authorization = c.req.header("Authorization")
    if (isBrowserSurface(c.req.path) && authorization === undefined) {
      await next()
      return
    }

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

  app.post("/shutdown", (c) => {
    setTimeout(onShutdown, 0)
    return c.json({ ok: true })
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
  await shutdownExistingDaemon(paths)
  await recoverInterruptedJobs(paths)

  const token = createAuthToken()
  const startedAt = new Date().toISOString()
  const watchers = createProjectWatcherManager()
  watchers.start(() => listProjects(paths).map((project) => project.project_path))
  let stopServer = (): void => {}
  const app = createDaemonApp(paths, token, startedAt, watchers, () => {
    watchers.stop()
    stopServer()
  })
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch })
  stopServer = () => server.stop(true)
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

async function shutdownExistingDaemon(paths: RuntimePaths): Promise<void> {
  const endpoint = await readEndpoint(paths)
  if (endpoint === null) {
    return
  }
  await shutdownEndpoint(endpoint)
}

export async function runDaemonForever(paths = runtimePaths()): Promise<void> {
  const daemon = await startDaemon(paths)
  console.log(`retrospec daemon listening on 127.0.0.1:${daemon.port}`)
  await new Promise<never>(() => {})
}
