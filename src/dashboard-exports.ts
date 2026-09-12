import type { DashboardExportFile } from "./dashboard-export-previews"
import { dashboardStyles } from "./dashboard-styles"

export type DashboardExportsInput = {
  readonly selectedProjectPath: string | null
  readonly exports: readonly DashboardExportFile[]
}

export function renderDashboardExportsPage(input: DashboardExportsInput): string {
  return `<!doctype html>
<html lang="en">
 <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec exports dashboard for generated analysis files.">
    <title>Retrospec Exports</title>
    <style>${dashboardStyles}</style>
    <style>${exportPreviewStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Exports dashboard" data-gqo-id="daemon-dashboard.exports-topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <a class="brand" href="${escapeHtml(dashboardHref(input.selectedProjectPath))}">retrospec dashboard</a>
        <span class="status-pill">Exports</span>
      </nav>
      <section class="hero" aria-labelledby="exports-title" data-gqo-id="daemon-dashboard.exports-hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Dedicated page</p>
        <h1 id="exports-title">Download generated exports.</h1>
        <p class="lead">Archivist will create report files in Phase 6; this page already exposes files found in the selected project's exports directory.</p>
      </section>
      <section class="grid exports-page" aria-label="Exports list" data-gqo-id="daemon-dashboard.exports-page" data-gqo-scope="section" data-gqo-editable="layout style">
        <article class="card" data-gqo-id="daemon-dashboard.exports-list-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Exports</p>
          <h3>Generated files</h3>
          ${renderExports(input)}
        </article>
      </section>
    </main>
  </body>
</html>`
}

function renderExports(input: DashboardExportsInput): string {
  if (input.selectedProjectPath === null) {
    return `<div class="project-fact"><span class="fact-label">Project</span><span class="fact-value">Select a project before browsing exports.</span></div>`
  }
  if (input.exports.length === 0) {
    return `<div class="project-fact"><span class="fact-label">Exports</span><span class="fact-value">No export files staged yet.</span></div>`
  }
  return `<div class="project-list">${input.exports.map(renderExportFile).join("")}</div>`
}

function renderExportFile(file: DashboardExportFile): string {
  return `<section class="project-option" data-gqo-id="daemon-dashboard.export-row.${escapeHtml(file.file_id)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <a class="project-select mono" href="${escapeHtml(file.download_url)}">${escapeHtml(file.file_name)}</a>
              <span class="state-chip" data-state="available">${escapeHtml(file.format)}</span>
            </div>
            <div class="project-facts">
              <div class="project-fact"><span class="fact-label">Size</span><span class="fact-value">${file.size_bytes} bytes</span></div>
              <div class="project-fact"><span class="fact-label">Created</span><span class="fact-value mono">${escapeHtml(file.created_at)}</span></div>
              ${renderExportMetadata(file)}
            </div>
            ${renderExportPreview(file)}
          </section>`
}

function renderExportMetadata(file: DashboardExportFile): string {
  if (file.category === undefined) {
    return ""
  }

  return `<div class="project-fact"><span class="fact-label">Category</span><span class="fact-value">${escapeHtml(file.category)}</span></div>
              <div class="project-fact"><span class="fact-label">Input DB</span><span class="fact-value mono">${escapeHtml(file.input_db_paths?.join(", ") ?? "Not recorded")}</span></div>
              <div class="project-fact"><span class="fact-label">Source fingerprint</span><span class="fact-value mono">${escapeHtml(file.source_fingerprint ?? "Not recorded")}</span></div>
              <div class="project-fact"><span class="fact-label">Analysis run</span><span class="fact-value mono">${escapeHtml(file.analysis_run_id ?? "Not applicable")}</span></div>`
}

function renderExportPreview(file: DashboardExportFile): string {
  if (file.preview === undefined) {
    return ""
  }

  return `<aside class="project-meta" aria-label="Export preview">
              <p class="eyebrow">Export preview</p>
              <h3>${escapeHtml(file.preview.title)}</h3>
              <p>${escapeHtml(file.preview.summary)}</p>
              ${renderPreviewFacts(file.preview.facts)}
              <div class="project-fact"><span class="fact-label">Source preview</span><span class="fact-value mono exports-source">${renderPreviewSource(file.preview.source)}</span></div>
            </aside>`
}

function renderPreviewFacts(facts: readonly string[]): string {
  if (facts.length === 0) {
    return ""
  }
  return `<div class="project-facts">${facts
    .map(
      (fact) =>
        `<div class="project-fact"><span class="fact-label">Preview fact</span><span class="fact-value mono">${escapeHtml(fact)}</span></div>`,
    )
    .join("")}</div>`
}

function renderPreviewSource(source: string): string {
  return escapeHtml(source).replaceAll("\n", "<br>")
}

function dashboardHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard"
  }
  return `/dashboard?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

const exportPreviewStyles = `
      .exports-page,
      .exports-page .card,
      .exports-page .project-list,
      .exports-page .project-option,
      .exports-page .project-facts,
      .exports-page .project-fact,
      .exports-page .project-meta {
        min-width: 0;
      }

      .exports-source {
        word-break: break-word;
      }
    `
