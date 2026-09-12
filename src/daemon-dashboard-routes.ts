import { existsSync } from "node:fs"
import type { Hono } from "hono"
import { readAgentDecisions } from "./agent-decisions"
import type { DashboardProject } from "./dashboard"
import { renderDashboardShell } from "./dashboard"
import { renderDashboardAnalysisPage } from "./dashboard-analysis"
import { analysisLaunchInput, emptyAnalysisLaunch } from "./dashboard-analysis-launch-input"
import { registerDashboardAnalysisLaunchSettingsRoute } from "./dashboard-analysis-launch-settings-route"
import { registerDashboardAnalysisProviderSettingsRoute } from "./dashboard-analysis-provider-settings-route"
import { renderDashboardAnalysisSettingsPage } from "./dashboard-analysis-settings"
import { attachExportPreviews } from "./dashboard-export-previews"
import { renderDashboardExportsPage } from "./dashboard-exports"
import { renderDashboardJobsPage } from "./dashboard-jobs"
import { renderDashboardUploadsPage } from "./dashboard-uploads"
import { listExportFiles } from "./exports"
import { findJob, listJobs } from "./jobs"
import { readLanguageCoverage } from "./language-coverage"
import { projectPaths } from "./paths"
import { listProjects, readRetroStatuses } from "./registry"
import { readSpecStatuses } from "./spec/status"
import type { JobDetailResponse, RuntimePaths } from "./types"

export function registerDashboardRoutes(
  app: Hono,
  runtime: RuntimePaths,
  version: string,
  startedAt: string,
): void {
  app.get("/dashboard", (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    return c.html(renderDashboardShell({ version, startedAt, projects, selectedProjectPath }))
  })

  app.get("/dashboard/jobs", async (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    const jobs = selectedProjectPath === null ? [] : await listJobs(selectedProjectPath)
    const selectedJob = await selectedDashboardJob(
      runtime,
      selectedProjectPath,
      c.req.query("job_id") ?? null,
    )
    return c.html(
      renderDashboardJobsPage({
        selectedProjectPath,
        jobs,
        selectedJob,
        selectedJobDecisions:
          selectedProjectPath === null || selectedJob === null
            ? []
            : readAgentDecisions(projectPaths(selectedProjectPath), {
                jobId: selectedJob.snapshot.job_id,
              }),
        lastRefreshedAt: new Date().toISOString(),
      }),
    )
  })

  app.get("/dashboard/analysis", async (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    const paths = selectedProjectPath === null ? null : projectPaths(selectedProjectPath)
    const launch = paths === null ? emptyAnalysisLaunch() : await analysisLaunchInput(paths)
    return c.html(
      renderDashboardAnalysisPage({
        selectedProjectPath,
        retro: paths === null ? [] : readRetroStatuses(paths),
        spec: paths === null ? [] : readSpecStatuses(paths),
        languageCoverage: paths === null ? null : readLanguageCoverage(paths),
        launch,
        brokerHealth: launch.brokerHealth,
      }),
    )
  })

  app.get("/dashboard/analysis/settings", async (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    const paths = selectedProjectPath === null ? null : projectPaths(selectedProjectPath)
    return c.html(
      renderDashboardAnalysisSettingsPage({
        selectedProjectPath,
        launch: paths === null ? emptyAnalysisLaunch() : await analysisLaunchInput(paths),
      }),
    )
  })

  registerDashboardAnalysisLaunchSettingsRoute(app)
  registerDashboardAnalysisProviderSettingsRoute(app)

  app.get("/dashboard/exports", async (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    const paths = selectedProjectPath === null ? null : projectPaths(selectedProjectPath)
    return c.html(
      renderDashboardExportsPage({
        selectedProjectPath,
        exports:
          paths === null ? [] : await attachExportPreviews(paths, await listExportFiles(paths)),
      }),
    )
  })

  app.get("/dashboard/uploads", (c) => {
    const projects = dashboardProjects(runtime)
    const selectedProjectPath = selectedDashboardProjectPath(
      projects,
      c.req.query("project_path") ?? null,
    )
    return c.html(renderDashboardUploadsPage({ selectedProjectPath }))
  })
}

function dashboardProjects(runtime: RuntimePaths): readonly DashboardProject[] {
  return listProjects(runtime).map((project) => ({
    ...project,
    path_status: existsSync(project.project_path) ? "available" : "deleted",
  }))
}

function selectedDashboardProjectPath(
  projects: readonly DashboardProject[],
  requestedProjectPath: string | null,
): string | null {
  if (projects.length === 0) {
    return null
  }

  const requestedProject = projects.find((project) => project.project_path === requestedProjectPath)
  return requestedProject?.project_path ?? projects[0]?.project_path ?? null
}

async function selectedDashboardJob(
  runtime: RuntimePaths,
  selectedProjectPath: string | null,
  requestedJobId: string | null,
): Promise<JobDetailResponse | null> {
  if (selectedProjectPath === null || requestedJobId === null) {
    return null
  }

  const detail = await findJob(runtime, requestedJobId)
  if (detail?.snapshot.project_path !== selectedProjectPath) {
    return null
  }
  return detail
}
