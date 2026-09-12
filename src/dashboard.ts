import { dashboardStyles } from "./dashboard-styles"
import type { ProjectRecord } from "./types"

export type DashboardProjectStatus = "available" | "deleted"

export type DashboardProject = ProjectRecord & {
  readonly path_status: DashboardProjectStatus
}

type DashboardShellInput = {
  readonly version: string
  readonly startedAt: string
  readonly projects: readonly DashboardProject[]
  readonly selectedProjectPath: string | null
}

type DashboardLauncherCard = {
  readonly label: string
  readonly title: string
  readonly body: string
  readonly href: string
  readonly action: string
}

const projectStatusLabel = {
  available: "Path available",
  deleted: "Deleted path",
} satisfies Record<DashboardProjectStatus, string>

export function renderDashboardShell(input: DashboardShellInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec dashboard for projects, analysis jobs, category status, uploads, and exports.">
    <title>Retrospec Dashboard</title>
    <style>${dashboardStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Dashboard" data-gqo-id="daemon-dashboard.topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <span class="brand">retrospec dashboard</span>
        <span class="status-pill">Status healthy</span>
      </nav>
      <section class="hero" aria-labelledby="dashboard-title" data-gqo-id="daemon-dashboard.hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Retrospec local dashboard</p>
        <h1 id="dashboard-title">Local command center for Retrospec analysis work.</h1>
        <p class="lead">Track daemon health, registered projects, background jobs, analysis handoffs, glossary staging, and exports from one browser surface.</p>
      </section>
      <section class="grid" aria-label="Dashboard overview" data-gqo-id="daemon-dashboard.overview" data-gqo-scope="section" data-gqo-editable="layout style">
        <div class="top-grid">
          ${renderDaemonCard(input)}
          ${renderProjectsCard(input.projects)}
        </div>
        <div class="lower-grid">
          ${renderLauncherCard({ label: "Jobs", title: "Ledger page", body: "Open the dedicated queue and ledger detail page for the selected project.", href: jobsHref(input.selectedProjectPath), action: "Open jobs" })}
          ${renderLauncherCard({ label: "Analysis DB", title: "Handoff page", body: "Review retro categories and spec run readiness from its own dashboard page.", href: analysisHref(input.selectedProjectPath), action: "Open analysis" })}
	          ${renderLauncherCard({ label: "Analysis settings", title: "Launch setup", body: "Edit saved scope, template, and provider settings before starting analysis work.", href: analysisSettingsHref(input.selectedProjectPath), action: "Open analysis settings" })}
	          ${renderLauncherCard({ label: "Glossary", title: "Upload page", body: "Stage CSV and XLSX glossary uploads without crowding the overview.", href: uploadsHref(input.selectedProjectPath), action: "Open glossary" })}
	          ${renderLauncherCard({ label: "Exports", title: "Download page", body: "Find generated CSV, XLSX, and report outputs from a separate download view.", href: exportsHref(input.selectedProjectPath), action: "Open exports" })}
        </div>
      </section>
    </main>
  </body>
</html>`
}

function renderDaemonCard(input: DashboardShellInput): string {
  return `<article class="card status-card" data-gqo-id="daemon-dashboard.daemon-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <div class="project-header">
            <p class="eyebrow">Daemon</p>
            <span class="state-chip" data-state="available">Status healthy</span>
          </div>
          <div class="meta mono">
            <div>version ${escapeHtml(input.version)}</div>
            <div>started ${escapeHtml(input.startedAt)}</div>
          </div>
        </article>`
}

function renderProjectsCard(projects: readonly DashboardProject[]): string {
  if (projects.length === 0) {
    return `<article class="card" data-gqo-id="daemon-dashboard.projects-empty" data-gqo-scope="state" data-gqo-editable="copy layout style">
          <p class="eyebrow">Projects</p>
          <h3>No projects registered</h3>
          <p>Register a project through the Retrospec router to populate this dashboard.</p>
        </article>`
  }

  return `<article class="card" data-gqo-id="daemon-dashboard.projects-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Projects</p>
          <p>Choose the project_path that later job, analysis, upload, and export panels will use.</p>
          <div class="project-list">
            ${projects.map((project, index) => renderProjectOption(project, index === 0)).join("")}
          </div>
        </article>`
}

function renderProjectOption(project: DashboardProject, selected: boolean): string {
  const selectedAttribute = selected ? " checked" : ""
  const warning = project.path_status === "deleted" ? renderDeletedPathWarning() : ""
  return `<section class="project-option" data-gqo-id="daemon-dashboard.project-row.${escapeHtml(project.project_id)}" data-gqo-scope="element" data-gqo-editable="copy layout style" data-project-path="${escapeHtml(project.project_path)}">
              <div class="project-header">
                <label class="project-select">
                  <input type="radio" name="project_path" value="${escapeHtml(project.project_path)}"${selectedAttribute}>
                  <span class="eyebrow">Selected project_path</span>
                </label>
                <span class="state-chip" data-state="${project.path_status}">${projectStatusLabel[project.path_status]}</span>
              </div>
              <div class="project-facts">
                <div class="project-fact project-path-fact">
                  <span class="fact-label">Path</span>
                  <span class="fact-value mono">${escapeHtml(project.project_path)}</span>
                </div>
                <div class="project-fact">
                  <span class="fact-label">Jobs</span>
                  <span class="fact-value">${activeJobLabel(project.active_jobs)}</span>
                </div>
              </div>
              ${warning}
              <div class="project-meta mono">
                <div>project_id ${escapeHtml(project.project_id)}</div>
                <div>last_active ${escapeHtml(project.last_active)}</div>
              </div>
            </section>`
}

function renderDeletedPathWarning(): string {
  return `<p class="project-warning">The registered path is missing on disk. Retrospec keeps it for review and does not auto-delete it.</p>`
}

function renderLauncherCard(card: DashboardLauncherCard): string {
  return `<article class="card" data-gqo-id="daemon-dashboard.${slugifyTarget(card.label)}-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">${escapeHtml(card.label)}</p>
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.body)}</p>
          <div class="meta">
            <a class="state-chip" href="${escapeHtml(card.href)}">${escapeHtml(card.action)}</a>
          </div>
        </article>`
}

function jobsHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/jobs"
  }
  return `/dashboard/jobs?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function analysisHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/analysis"
  }
  return `/dashboard/analysis?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function analysisSettingsHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/analysis/settings"
  }
  return `/dashboard/analysis/settings?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function uploadsHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/uploads"
  }
  return `/dashboard/uploads?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function exportsHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/exports"
  }
  return `/dashboard/exports?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function activeJobLabel(count: number): string {
  return `${count} active ${count === 1 ? "job" : "jobs"}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function slugifyTarget(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
}
