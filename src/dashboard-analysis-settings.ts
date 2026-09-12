import { renderAnalysisLaunchCard } from "./dashboard-analysis-launch"
import type { DashboardAnalysisLaunchInput } from "./dashboard-analysis-launch"
import { analysisLaunchStyles } from "./dashboard-analysis-launch-styles"
import { dashboardStyles } from "./dashboard-styles"

export type DashboardAnalysisSettingsInput = {
  readonly selectedProjectPath: string | null
  readonly launch: DashboardAnalysisLaunchInput
}

export function renderDashboardAnalysisSettingsPage(input: DashboardAnalysisSettingsInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec analysis launch settings for scope, template, and provider configuration.">
    <title>Retrospec Analysis Settings</title>
    <style>${dashboardStyles}${analysisLaunchStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Analysis settings" data-gqo-id="daemon-dashboard.analysis-settings-topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <a class="brand" href="${escapeHtml(analysisHref(input.selectedProjectPath))}">Back to analysis</a>
        <span class="status-pill">Analysis settings</span>
      </nav>
      <section class="hero" aria-labelledby="analysis-settings-title" data-gqo-id="daemon-dashboard.analysis-settings-hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Launch configuration</p>
        <h1 id="analysis-settings-title">Analysis settings.</h1>
        <p class="lead">Set the saved scope, Spec template, and provider before launching analysis work.</p>
      </section>
      <section class="grid" aria-label="Analysis settings" data-gqo-id="daemon-dashboard.analysis-settings-page" data-gqo-scope="section" data-gqo-editable="layout style">
        ${renderAnalysisLaunchCard(input.launch)}
      </section>
    </main>
  </body>
</html>`
}

function analysisHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard/analysis"
  }
  return `/dashboard/analysis?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
