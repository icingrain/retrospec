import type { LanguageCoverageDashboard, LanguageCoverageRow } from "./language-coverage"

export function renderAnalysisConfidenceCard(coverage: LanguageCoverageDashboard | null): string {
  if (coverage === null) {
    return `<article class="card" data-gqo-id="daemon-dashboard.analysis-confidence-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
              <p class="eyebrow">Analysis confidence</p>
              <h3>Coverage and fallback evidence</h3>
              <p>Select a project to review analysis confidence, language/category coverage, and fallback evidence.</p>
            </article>`
  }

  return `<article class="card" data-gqo-id="daemon-dashboard.analysis-confidence-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
            <p class="eyebrow">Analysis confidence</p>
            <h3>Coverage and fallback evidence</h3>
            <p>Use this section to decide which analysis results are source-backed, which are reduced-confidence, and which were recorded only as fallback evidence.</p>
            <div class="project-facts confidence-summary">
              <div class="project-fact">
                <span class="fact-label">Language confidence</span>
                <span class="fact-value">${coverage.summary.highConfidenceLanguages} high-confidence · ${coverage.summary.bestEffortLanguages} best-effort · ${coverage.summary.unsupportedLanguages} unsupported</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">High-confidence category cells</span>
                <span class="fact-value">${coverage.summary.highConfidenceCategoryCells} / ${coverage.summary.totalCategoryCells} category cells</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Fallback evidence</span>
                <span class="fact-value">${fallbackSummary(coverage.summary.fallbackEvidenceRows)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Categories tracked</span>
                <span class="fact-value">${coverage.summary.categoryCount} categories</span>
              </div>
            </div>
            ${renderTermGuide()}
            <div class="project-list confidence-list" aria-label="Language confidence rows">
              ${coverage.rows.map(renderLanguageConfidenceRow).join("")}
            </div>
            ${renderFallbackEvidence(coverage)}
          </article>`
}

function renderTermGuide(): string {
  return `<section class="project-option confidence-guide" data-gqo-id="daemon-dashboard.analysis-confidence-guide" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <h3>How to read confidence</h3>
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">high-confidence</span>
                <span class="fact-value">Source-backed parser coverage for this language or category.</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">best-effort</span>
                <span class="fact-value">Reduced-confidence coverage; use the evidence label before relying on it.</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">unsupported</span>
                <span class="fact-value">Not analyzed as successful coverage; recorded as fallback evidence.</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">EXTRACTED</span>
                <span class="fact-value">Direct source evidence was captured.</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">INFERRED</span>
                <span class="fact-value">Evidence was derived from a supported approximation.</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">AMBIGUOUS</span>
                <span class="fact-value">Evidence is incomplete or has multiple possible interpretations.</span>
              </div>
            </div>
          </section>`
}

function renderLanguageConfidenceRow(row: LanguageCoverageRow): string {
  return `<section class="project-option" data-gqo-id="daemon-dashboard.language-confidence.${escapeHtml(row.language)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select mono">${escapeHtml(row.displayName)}</span>
              <span class="state-chip" data-state="${escapeHtml(row.confidence)}">${escapeHtml(row.confidence)}</span>
            </div>
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">Category mix</span>
                <span class="fact-value">${row.highConfidenceCategories} high-confidence · ${row.bestEffortCategories} best-effort · ${row.unsupportedCategories} unsupported</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Evidence labels</span>
                <span class="fact-value mono">${escapeHtml(row.evidenceLabels.join(", "))}</span>
              </div>
            </div>
          </section>`
}

function renderFallbackEvidence(coverage: LanguageCoverageDashboard): string {
  if (coverage.fallbackRows.length === 0) {
    return `<section class="project-option fallback-evidence-card" data-gqo-id="daemon-dashboard.fallback-evidence-empty" data-gqo-scope="element" data-gqo-editable="copy layout style">
              <div class="project-header">
                <span class="project-select">Fallback evidence</span>
                <span class="state-chip" data-state="ready_for_analysis">none</span>
              </div>
              <p>No fallback evidence recorded in .retrospec/retro/other.db.</p>
            </section>`
  }

  return `<section class="project-option fallback-evidence-card" data-gqo-id="daemon-dashboard.fallback-evidence-list" data-gqo-scope="section" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select">Fallback evidence list</span>
              <span class="state-chip" data-state="unsupported">${coverage.fallbackRows.length} rows</span>
            </div>
            <p>Fallback rows are not successful coverage; they preserve reduced-confidence or unsupported evidence for review.</p>
            <div class="project-list fallback-list">
              ${coverage.fallbackRows.map(renderFallbackEvidenceRow).join("")}
            </div>
          </section>`
}

function renderFallbackEvidenceRow(row: LanguageCoverageDashboard["fallbackRows"][number]): string {
  return `<section class="project-fact" data-gqo-id="daemon-dashboard.fallback-evidence.${escapeHtml(row.language)}.${escapeHtml(row.category)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select mono">${escapeHtml(row.language)} / ${escapeHtml(row.category)}</span>
              <span class="state-chip" data-state="${escapeHtml(row.support_level)}">${escapeHtml(row.support_level)}</span>
            </div>
            <div class="project-meta mono">
              <div>${escapeHtml(row.evidence_label)} · ${escapeHtml(row.missing_capability)}</div>
              <div>${escapeHtml(row.file_path)}</div>
              <div>${escapeHtml(row.reason)}</div>
            </div>
          </section>`
}

function fallbackSummary(rowCount: number): string {
  if (rowCount === 0) {
    return "No fallback evidence rows in .retrospec/retro/other.db"
  }
  return `${rowCount} ${rowCount === 1 ? "fallback evidence row" : "fallback evidence rows"} in .retrospec/retro/other.db`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
