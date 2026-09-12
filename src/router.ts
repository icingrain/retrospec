import { existsSync } from "node:fs"
import { analysisStatus, registerProjectWithDaemon } from "./client"
import { ensureDaemon, health } from "./discovery"
import { projectPaths, runtimePaths } from "./paths"
import type { RouterSummary, RuntimePaths } from "./types"

export async function routerSummary(
  projectRoot = process.cwd(),
  runtime: RuntimePaths = runtimePaths(),
): Promise<RouterSummary> {
  const paths = projectPaths(projectRoot)
  const endpoint = await ensureDaemon(runtime)
  const daemon = await health(endpoint)

  if (daemon === null) {
    throw new Error("retrospec daemon health check failed after startup")
  }

  const hadState = existsSync(paths.stateDir)
  const project = await registerProjectWithDaemon(endpoint, paths.projectRoot)
  const status = await analysisStatus(endpoint, paths.projectRoot)

  return {
    daemon,
    project,
    dashboardUrl: endpoint.baseUrl,
    hasRetrospecState: hadState,
    retroStatuses: status.retro,
    specStatuses: status.spec,
    nextAction:
      status.retro.length === 0
        ? "Run retro first to create analysis DBs."
        : "Review retro status, then run spec for ready categories.",
  }
}

export function formatRouterSummary(summary: RouterSummary): string {
  const retroLine =
    summary.retroStatuses.length === 0
      ? "retro: no analysis DBs yet"
      : `retro: ${summary.retroStatuses.map((item) => `${item.category}=${item.status}`).join(", ")}`

  const specLine =
    summary.specStatuses.length === 0
      ? "spec: no AI analysis runs yet"
      : `spec: ${summary.specStatuses.map((item) => `${item.analysis_type}=${item.status}`).join(", ")}`

  return [
    `daemon: healthy (${summary.daemon.version})`,
    `dashboard: ${summary.dashboardUrl}`,
    `project: ${summary.project.project_path}`,
    `state: ${summary.hasRetrospecState ? "existing .retrospec" : "created .retrospec"}`,
    retroLine,
    specLine,
    `next: ${summary.nextAction}`,
  ].join("\n")
}
