import type { AgentDecisionRecord } from "./agent-decisions"
import { dashboardDetailStyles } from "./dashboard-detail-styles"
import { dashboardStyles } from "./dashboard-styles"
import type { JobDetailResponse, JobLedgerEvent, JobSnapshot } from "./types"

export type DashboardJobsInput = {
  readonly selectedProjectPath: string | null
  readonly jobs: readonly JobSnapshot[]
  readonly selectedJob: JobDetailResponse | null
  readonly selectedJobDecisions: readonly AgentDecisionRecord[]
  readonly lastRefreshedAt: string
}

export function renderJobsCard(input: DashboardJobsInput): string {
  if (input.selectedProjectPath === null) {
    return `<article class="card" data-gqo-id="daemon-dashboard.jobs-empty" data-gqo-scope="state" data-gqo-editable="copy layout style">
          <p class="eyebrow">Jobs</p>
          <h3>Select a project to inspect jobs</h3>
          <p>Register or select a project_path before opening job ledger details.</p>
        </article>`
  }

  return `<article class="card" data-gqo-id="daemon-dashboard.jobs-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
	          <p class="eyebrow">Jobs</p>
	          <h3>Recent jobs</h3>
	          <p>Queued and running jobs are still waiting; an await timeout is not treated as failure.</p>
	          ${renderJobList(input, renderRefreshControl(input))}
	        </article>`
}

export function renderDashboardJobsPage(input: DashboardJobsInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local Retrospec jobs dashboard for queue status and ledger events.">
    <title>Retrospec Jobs</title>
	    <style>${dashboardStyles}${dashboardDetailStyles}</style>
  </head>
  <body>
    <main class="shell">
      <nav class="topbar" aria-label="Jobs dashboard" data-gqo-id="daemon-dashboard.jobs-topbar" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <a class="brand" href="${escapeHtml(dashboardHref(input.selectedProjectPath))}">retrospec dashboard</a>
        <span class="status-pill">Jobs ledger</span>
      </nav>
      <section class="hero" aria-labelledby="jobs-title" data-gqo-id="daemon-dashboard.jobs-hero" data-gqo-scope="section" data-gqo-editable="layout copy style">
        <p class="eyebrow">Dedicated page</p>
        <h1 id="jobs-title">Job queue and ledger detail.</h1>
        <p class="lead">Use this drill-down page for job status, progress, cancel endpoints, and event stream details.</p>
      </section>
	      <section class="grid" aria-label="Jobs detail" data-gqo-id="daemon-dashboard.jobs-page" data-gqo-scope="section" data-gqo-editable="layout style">
	        ${renderJobsCard(input)}
	      </section>
    </main>
  </body>
</html>`
}

function renderJobList(input: DashboardJobsInput, refreshControl: string): string {
  if (input.jobs.length === 0) {
    return `<div class="project-list">
              ${refreshControl}
              <div class="project-fact">
	              <span class="fact-label">Job queue</span>
	              <span class="fact-value">No jobs submitted for this project yet.</span>
	            </div>
            </div>`
  }

  return `<div class="project-list">
	          ${refreshControl}
	          ${input.jobs
              .map((job) =>
                renderJobRow(
                  input.selectedProjectPath ?? "",
                  job,
                  input.selectedJob,
                  input.selectedJobDecisions,
                ),
              )
              .join("")}
	        </div>`
}

function renderRefreshControl(input: DashboardJobsInput): string {
  return `<div class="project-fact jobs-refresh" data-gqo-id="daemon-dashboard.jobs-refresh" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <span class="fact-label">Refresh status</span>
            <span class="fact-value mono">last refreshed ${escapeHtml(input.lastRefreshedAt)}</span>
            <a class="dashboard-action" href="${escapeHtml(jobsRefreshHref(input))}">Refresh jobs</a>
          </div>`
}

function jobsRefreshHref(input: DashboardJobsInput): string {
  if (input.selectedProjectPath === null) {
    return "/dashboard/jobs"
  }
  if (input.selectedJob !== null) {
    return dashboardJobHref(input.selectedProjectPath, input.selectedJob.snapshot.job_id)
  }
  return `/dashboard/jobs?project_path=${encodeURIComponent(input.selectedProjectPath)}`
}

function renderJobRow(
  projectPath: string,
  job: JobSnapshot,
  selectedJob: JobDetailResponse | null,
  decisions: readonly AgentDecisionRecord[],
): string {
  const isSelected = selectedJob?.snapshot.job_id === job.job_id
  const detailHref = isSelected
    ? dashboardJobsHref(projectPath)
    : dashboardJobHref(projectPath, job.job_id)
  const rowDetail = isSelected ? renderJobDetail(selectedJob, decisions) : ""
  const cancelAction = `/jobs/${encodeURIComponent(job.job_id)}/cancel`
  const cancel = isCancellable(job)
    ? `<div class="project-warning">Cancel job: POST ${escapeHtml(cancelAction)} · Requires bearer token and confirmation.</div>`
    : ""

  return `<section class="project-option" data-gqo-id="daemon-dashboard.job-row.${escapeHtml(
    job.job_id,
  )}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select mono">${escapeHtml(job.job_id)}</span>
              <span class="state-chip" data-state="${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
            </div>
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">Category</span>
                <span class="fact-value">${escapeHtml(job.category)} · ${escapeHtml(job.actor)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Progress</span>
                <span class="fact-value">${job.progress_pct}%</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Scope</span>
                <span class="fact-value mono">${escapeHtml(jobScopeLabel(job.write_scope_key))}</span>
              </div>
            </div>
            <div class="project-meta mono">
              <div>current_step ${escapeHtml(job.current_step ?? "waiting")}</div>
              <div>updated_at ${escapeHtml(job.updated_at)}</div>
            </div>
            <a class="dashboard-action" href="${escapeHtml(detailHref)}">Job detail</a>
            ${cancel}
            ${rowDetail}
          </section>`
}

function renderJobDetail(
  detail: JobDetailResponse | null,
  decisions: readonly AgentDecisionRecord[],
): string {
  if (detail === null) {
    return ""
  }

  return `<section class="project-option" data-gqo-id="daemon-dashboard.job-detail.${escapeHtml(detail.snapshot.job_id)}" data-gqo-scope="section" data-gqo-editable="copy layout style">
            <div class="project-facts">
              <div class="project-fact">
                <span class="fact-label">Status</span>
                <span class="fact-value">${escapeHtml(detail.snapshot.status)}</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Progress</span>
                <span class="fact-value">${detail.snapshot.progress_pct}%</span>
              </div>
              <div class="project-fact">
                <span class="fact-label">Scope</span>
                <span class="fact-value mono">${escapeHtml(jobScopeLabel(detail.snapshot.write_scope_key))}</span>
              </div>
            </div>
            <div class="project-warning">Promotion or replacement actions require explicit confirmation before a partial result can affect full-project canonical output.</div>
            ${renderDecisionTrace(decisions)}
            <p class="eyebrow detail-section-label">Ledger events</p>
            <div class="project-list">
              ${detail.ledger.map(renderLedgerEvent).join("")}
            </div>
          </section>`
}

function renderDecisionTrace(decisions: readonly AgentDecisionRecord[]): string {
  if (decisions.length === 0) {
    return `<details class="detail-disclosure" data-gqo-id="daemon-dashboard.agent-decisions" data-gqo-scope="section" data-gqo-editable="copy layout style">
              <summary class="detail-summary">Agent decisions <span class="state-chip" data-state="best-effort">0</span></summary>
              <div class="project-fact">
	              <span class="fact-label">Trace</span>
	              <span class="fact-value">No agent decisions recorded for this job yet.</span>
	            </div>
            </details>`
  }
  return `<details class="detail-disclosure" data-gqo-id="daemon-dashboard.agent-decisions" data-gqo-scope="section" data-gqo-editable="copy layout style">
            <summary class="detail-summary">Agent decisions <span class="state-chip" data-state="high-confidence">${decisions.length}</span></summary>
            <div class="project-list">
	            ${decisions.map(renderDecisionEvent).join("")}
	          </div>
          </details>`
}

function renderDecisionEvent(decision: AgentDecisionRecord): string {
  const skill = decision.skill ?? "no skill"
  return `<div class="project-fact" data-gqo-id="daemon-dashboard.agent-decision.${escapeHtml(decision.decision_id)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <span class="fact-label">${escapeHtml(decision.created_at)}</span>
            <span class="fact-value mono">${escapeHtml(decision.agent)} · ${escapeHtml(skill)}</span>
            <span class="fact-value mono">${escapeHtml(decision.event_type)}</span>
            <span class="fact-value">${escapeHtml(decision.reason)}</span>
            <span class="fact-value mono">${escapeHtml(decision.payload_json)}</span>
          </div>`
}

function renderLedgerEvent(event: JobLedgerEvent): string {
  const payload = event.payload.length === 0 ? "{}" : event.payload
  return `<div class="project-fact" data-gqo-id="daemon-dashboard.ledger-event.${escapeHtml(event.event_id)}" data-gqo-scope="element" data-gqo-editable="copy layout style">
            <span class="fact-label">${escapeHtml(event.timestamp)}</span>
            <span class="fact-value mono">${escapeHtml(event.event_type)}</span>
            <span class="fact-value mono">${escapeHtml(payload)}</span>
          </div>`
}

function dashboardJobHref(projectPath: string, jobId: string): string {
  return `/dashboard/jobs?project_path=${encodeURIComponent(projectPath)}&job_id=${encodeURIComponent(jobId)}`
}

function dashboardJobsHref(projectPath: string): string {
  return `/dashboard/jobs?project_path=${encodeURIComponent(projectPath)}`
}

function dashboardHref(selectedProjectPath: string | null): string {
  if (selectedProjectPath === null) {
    return "/dashboard"
  }
  return `/dashboard?project_path=${encodeURIComponent(selectedProjectPath)}`
}

function isCancellable(job: JobSnapshot): boolean {
  return job.status === "queued" || job.status === "running"
}

function jobScopeLabel(writeScopeKey: string): string {
  if (writeScopeKey.endsWith(":full")) {
    return "Full project · canonical write scope"
  }
  if (writeScopeKey.includes(":partial:")) {
    return "Partial scope · does not replace full canonical result"
  }
  return writeScopeKey
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
