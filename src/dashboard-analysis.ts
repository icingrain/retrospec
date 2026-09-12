import type { AnalysisScope } from "./analysis-scope"
import { renderAnalysisConfidenceCard } from "./dashboard-analysis-confidence"
import { analysisConfidenceStyles } from "./dashboard-analysis-confidence-styles"
import { type DashboardAnalysisLaunchInput, renderScopeSummary } from "./dashboard-analysis-launch"
import { analysisLaunchStyles } from "./dashboard-analysis-launch-styles"
import { providerSettingsSummary } from "./dashboard-analysis-run-panel"
import { renderProviderOperationsCard } from "./dashboard-provider-operations"
import { dashboardStyles } from "./dashboard-styles"
import type { LanguageCoverageDashboard } from "./language-coverage"
import type { BrokerHealthStatus } from "./provider-health"
import type { SpecProviderSettings } from "./provider-settings"
import type { AnalysisCategoryStatus, SpecRunStatus } from "./types"

export type DashboardAnalysisInput = {
  readonly selectedProjectPath: string | null
  readonly retro: readonly AnalysisCategoryStatus[]
  readonly spec: readonly SpecRunStatus[]
  readonly languageCoverage: LanguageCoverageDashboard | null
  readonly launch: DashboardAnalysisLaunchInput
  readonly brokerHealth: BrokerHealthStatus
}

export function renderDashboardAnalysisPage(input: DashboardAnalysisInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec analysis dashboard for retro handoff and spec run readiness.">
    <title>Retrospec Analysis</title>
    <style>${dashboardStyles}${analysisConfidenceStyles}${analysisLaunchStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Analysis dashboard" data-gqo-id="daemon-dashboard.analysis-topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <a class="brand" href="${escapeHtml(dashboardHref(input.selectedProjectPath))}">retrospec dashboard</a>
        <span class="status-pill">Analysis status</span>
      </nav>
      <section class="hero" aria-labelledby="analysis-title" data-gqo-id="daemon-dashboard.analysis-hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Dedicated page</p>
        <h1 id="analysis-title">Analysis status and handoff readiness.</h1>
        <p class="lead">Review retro category handoff state, entity coverage, and completed spec analysis runs for the selected project.</p>
      </section>
      <section class="grid" aria-label="Analysis status" data-gqo-id="daemon-dashboard.analysis-page" data-gqo-scope="section" data-gqo-editable="layout style">
        ${renderAnalysisSettingsSummary(input.selectedProjectPath, input.launch)}
        ${renderProviderOperationsCard({
          providerSettings: input.launch.providerSettings?.settings ?? {
            mode: "deterministic",
            secretSource: "env",
          },
          brokerHealth: input.brokerHealth,
          spec: input.spec,
        })}
        ${renderRetroCard(input.retro)}
        ${renderSpecCard(input.spec)}
        ${renderAnalysisConfidenceCard(input.languageCoverage)}
      </section>
    </main>
  </body>
</html>`
}

function renderAnalysisSettingsSummary(
  selectedProjectPath: string | null,
  launch: DashboardAnalysisLaunchInput,
): string {
  const providerSettings: SpecProviderSettings = launch.providerSettings?.settings ?? {
    mode: "deterministic",
    secretSource: "env",
  }
  return `<article class="card analysis-launch" data-gqo-id="daemon-dashboard.analysis-settings-summary" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Launch configuration</p>
          <h3>Analysis settings</h3>
          <p>Keep launch controls on a dedicated page so status review stays focused on handoff readiness.</p>
          <div class="project-facts">
            <div class="project-fact">
              <span class="fact-label">Saved scope</span>
              <span class="fact-value mono">${escapeHtml(savedLaunchScopeSummary(launch.savedSettings?.scope ?? null))}</span>
            </div>
            <div class="project-fact">
              <span class="fact-label">Provider</span>
              <span class="fact-value mono">${escapeHtml(providerSettingsSummary(providerSettings))}</span>
            </div>
          </div>
          <div class="launch-settings-actions">
            <a class="launch-settings-button" href="${escapeHtml(analysisSettingsHref(selectedProjectPath))}">Open settings</a>
          </div>
        </article>`
}

function savedLaunchScopeSummary(scope: AnalysisScope | null): string {
  if (scope === null || scope.mode === "full") {
    return "Full project"
  }
  return scope.roots.join(", ")
}

function analysisSettingsHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/analysis/settings"
  }
  return `/dashboard/analysis/settings?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function renderRetroCard(statuses: readonly AnalysisCategoryStatus[]): string {
  return `<article class="card" data-gqo-id="daemon-dashboard.retro-handoff-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Analysis DB</p>
          <h3>Retro handoff</h3>
          <p>Categories become ready_for_analysis when Retro writes a handoff snapshot for Spec.</p>
          ${renderRetroStatuses(statuses)}
        </article>`
}

function renderRetroStatuses(statuses: readonly AnalysisCategoryStatus[]): string {
  if (statuses.length === 0) {
    return `<div class="project-fact">
              <span class="fact-label">Retro categories</span>
              <span class="fact-value">No retro handoff rows yet.</span>
            </div>`
  }

  return `<div class="project-list">
            ${statuses.map(renderRetroStatus).join("")}
          </div>`
}

function renderRetroStatus(status: AnalysisCategoryStatus): string {
  return `<section class="project-option" data-gqo-id="daemon-dashboard.retro-status.${escapeHtml(status.category)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select mono">${escapeHtml(status.category)}</span>
              <span class="state-chip" data-state="${escapeHtml(status.status)}">${escapeHtml(status.status)}</span>
            </div>
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">Entity coverage</span>
                <span class="fact-value">${entityLabel(status.entity_count)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Completed</span>
                <span class="fact-value mono">${escapeHtml(status.completed_at ?? "pending")}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Scope</span>
                <span class="fact-value mono">${escapeHtml(renderScopeSummary(status.scope_mode, status.scope_roots_json))}</span>
              </div>
            </div>
          </section>`
}

function renderSpecCard(statuses: readonly SpecRunStatus[]): string {
  return `<article class="card" data-gqo-id="daemon-dashboard.spec-runs-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Spec</p>
          <h3>Spec runs</h3>
          <p>Spec runs record model, prompt version, and completion status from the analysis store.</p>
          ${renderSpecStatuses(statuses)}
        </article>`
}

function renderSpecStatuses(statuses: readonly SpecRunStatus[]): string {
  if (statuses.length === 0) {
    return `<div class="project-fact">
              <span class="fact-label">Spec runs</span>
              <span class="fact-value">No spec runs recorded yet.</span>
            </div>`
  }

  return `<div class="project-list">
            ${statuses.map(renderSpecStatus).join("")}
          </div>`
}

function renderSpecStatus(status: SpecRunStatus): string {
  return `<section class="project-option" data-gqo-id="daemon-dashboard.spec-run.${escapeHtml(status.analysis_run_id)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select mono">${escapeHtml(status.analysis_type)}</span>
              <span class="state-chip" data-state="${escapeHtml(status.status)}">${escapeHtml(status.status)}</span>
            </div>
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">Model</span>
                <span class="fact-value mono">${escapeHtml(status.model)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Provider</span>
                <span class="fact-value mono">${escapeHtml(status.provider_mode)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Prompt</span>
                <span class="fact-value mono">${escapeHtml(status.prompt_version)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Scope</span>
                <span class="fact-value mono">${escapeHtml(renderScopeSummary(status.scope_mode, status.scope_roots_json))}</span>
              </div>
            </div>
            <div class="project-meta mono">
              <div>analysis_run_id ${escapeHtml(status.analysis_run_id)}</div>
            </div>
          </section>`
}

function dashboardHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard"
  }
  return `/dashboard?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function entityLabel(count: number): string {
  return `${count} ${count === 1 ? "entity" : "entities"}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
