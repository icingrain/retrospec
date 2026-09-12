import { dashboardStyles } from "./dashboard-styles"
import { readGlossaryReconciliation } from "./glossary"
import { projectPaths } from "./paths"

export type DashboardUploadsInput = {
  readonly selectedProjectPath: string | null
}

export function renderDashboardUploadsPage(input: DashboardUploadsInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec glossary upload staging page.">
    <title>Retrospec Glossary Uploads</title>
    <style>${dashboardStyles}${uploadDashboardStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Glossary uploads" data-gqo-id="daemon-dashboard.uploads-topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <a class="brand" href="${escapeHtml(dashboardHref(input.selectedProjectPath))}">retrospec dashboard</a>
        <span class="status-pill">Glossary uploads</span>
      </nav>
      <section class="hero" aria-labelledby="uploads-title" data-gqo-id="daemon-dashboard.uploads-hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Dedicated page</p>
        <h1 id="uploads-title">Stage glossary context files.</h1>
        <p class="lead">Upload CSV or XLSX glossary files into the selected project's staging directory before Archivist imports them in a later phase.</p>
      </section>
      <section class="grid" aria-label="Glossary upload form" data-gqo-id="daemon-dashboard.uploads-page" data-gqo-scope="section" data-gqo-editable="layout style">
        <article class="card" data-gqo-id="daemon-dashboard.upload-form-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Glossary</p>
          <h3>Upload staging</h3>
          ${renderUploadForm(input.selectedProjectPath)}
          ${renderReconciliation(input.selectedProjectPath)}
        </article>
      </section>
    </main>
  </body>
</html>`
}

function renderReconciliation(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return ""
  }
  const summary = readGlossaryReconciliation(projectPaths(selectedProjectPath))
  return `<div class="project-fact"><span class="fact-label">Glossary reconciliation</span><span class="fact-value">${summary.term_count} terms · Matched entities ${summary.entity_match_count} · Unmatched entities ${summary.unmatched_entities}</span></div>`
}

const uploadDashboardStyles = `
      .upload-form {
        display: grid;
        gap: var(--space-4);
        margin-top: var(--space-4);
      }

      .upload-form .project-fact {
        display: block;
      }

      .upload-form input[type="file"] {
        width: 100%;
        margin-top: var(--space-2);
        color: var(--text-primary);
      }
    `

function renderUploadForm(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return `<div class="project-fact"><span class="fact-label">Project</span><span class="fact-value">Select a project before staging glossary files.</span></div>`
  }
  return `<form class="upload-form" method="post" action="/uploads/glossary" enctype="multipart/form-data">
            <input type="hidden" name="project_path" value="${escapeHtml(selectedProjectPath)}">
            <label class="project-fact">
              <span class="fact-label">CSV or XLSX file</span>
              <input name="file" type="file" accept=".csv,.xlsx" required>
            </label>
            <p class="project-warning">Submitting this form calls POST /uploads/glossary and requires bearer token authentication outside this local HTML shell.</p>
          </form>`
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
