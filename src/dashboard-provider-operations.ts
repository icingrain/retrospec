import type { BrokerHealthStatus } from "./provider-health"
import type { SpecProviderSettings } from "./provider-settings"
import type { SpecRunStatus } from "./types"

export type ProviderOperationsInput = {
  readonly providerSettings: SpecProviderSettings
  readonly brokerHealth: BrokerHealthStatus
  readonly spec: readonly SpecRunStatus[]
}

export function renderProviderOperationsCard(input: ProviderOperationsInput): string {
  const latest = input.spec[0] ?? null
  return `<article class="card" data-gqo-id="daemon-dashboard.provider-operations-card" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Provider operations</p>
          <h3>Provider operations</h3>
          <p>Check broker reachability, provider readiness, and the latest Spec trace before starting another run.</p>
          <div class="project-facts">
            <div class="project-fact">
              <span class="fact-label">Broker health</span>
              <span class="fact-value mono">${escapeHtml(brokerHealthSummary(input.brokerHealth))}</span>
            </div>
            <div class="project-fact">
              <span class="fact-label">Readiness hint</span>
              <span class="fact-value">${escapeHtml(readinessHint(input.providerSettings, input.brokerHealth))}</span>
            </div>
            <div class="project-fact">
              <span class="fact-label">Latest broker run</span>
              <span class="fact-value mono">${escapeHtml(latest?.broker_run_id ?? "none")}</span>
            </div>
            <div class="project-fact">
              <span class="fact-label">Latest provider error</span>
              <span class="fact-value mono">${escapeHtml(latest?.error_message ?? "none")}</span>
            </div>
          </div>
        </article>`
}

function brokerHealthSummary(health: BrokerHealthStatus): string {
  switch (health.status) {
    case "up":
      return `up · ${health.version} · ${health.url}`
    case "down":
      return `down · ${health.url}`
    case "not-configured":
      return "not-configured"
    default:
      return assertNever(health)
  }
}

function readinessHint(settings: SpecProviderSettings, health: BrokerHealthStatus): string {
  if (settings.mode !== "opencode-broker") {
    return "Broker health is only checked for opencode-broker mode."
  }
  if (health.status === "up") {
    return "Broker is reachable for new Spec jobs."
  }
  return "Broker is unreachable. Start `retrospec opencode-broker` or check broker URL/token."
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function assertNever(value: never): never {
  throw new Error(`unhandled broker health status: ${JSON.stringify(value)}`)
}
