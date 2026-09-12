import type {
  DashboardAnalysisLaunchInput,
  DashboardAnalysisLaunchSettings,
  DashboardSpecTemplateOption,
} from "./dashboard-analysis-launch-types"
import type { SpecProviderSettings } from "./provider-settings"

const providerModes = [
  {
    value: "deterministic",
    label: "deterministic",
    description: "Use the local deterministic analyzer for reproducible dashboard QA.",
    disabled: false,
  },
  {
    value: "env-provider",
    label: "env-provider",
    description: "Use the provider configured through the current environment.",
    disabled: false,
  },
  {
    value: "opencode-broker",
    label: "opencode-broker",
    description: "Use the configured opencode broker endpoint for login/session-backed models.",
    disabled: false,
  },
] as const

export function renderRunPlanPanel(input: DashboardAnalysisLaunchInput): string {
  const providerSettings = input.providerSettings?.settings ?? {
    mode: "deterministic",
    secretSource: "env",
  }
  return `<section class="project-option" data-gqo-id="daemon-dashboard.analysis-launch.run-plan" data-gqo-scope="section" data-gqo-editable="copy layout style">
		          <div class="project-header">
		            <span class="project-select">Analysis / Provider settings</span>
	            <span class="state-chip" data-state="available">ready</span>
	          </div>
	          <div class="project-fact auto-retro-input">
	            <span class="fact-label">Retro input: automatic</span>
	            <span class="fact-value">Full project uses the canonical full run. Selected folders use the latest matching partial run when available.</span>
		          </div>
		          ${renderTemplatePicker(input.specTemplates)}
		          ${renderProviderSettings(providerSettings)}
		          ${renderExecutionSettings(input.savedSettings)}
		          ${renderProviderSaveAction()}
		        </section>`
}

function renderTemplatePicker(templates: readonly DashboardSpecTemplateOption[]): string {
  return `<fieldset class="launch-fieldset template-picker">
            <legend>Spec template selector</legend>
            ${templates.map(renderTemplateOption).join("")}
          </fieldset>`
}

function renderTemplateOption(template: DashboardSpecTemplateOption): string {
  return `<label class="launch-choice">
            <input type="radio" name="spec_template" value="${template.name}" ${template.name === "risk" ? "checked" : ""}>
            <span>${template.name}<small>${escapeHtml(template.description)}</small></span>
          </label>`
}

function renderExecutionSettings(settings: DashboardAnalysisLaunchSettings | null): string {
  return `<fieldset class="launch-fieldset launch-execution-settings">
	          <legend>Analysis execution metadata</legend>
	          <p>Sent with Retro and Spec jobs as effective launch metadata.</p>
	          <div class="provider-settings-fields execution-size-fields">
	            <label class="provider-field">
                <span>Batch size</span>
                <input name="batch_size" type="number" min="1" max="1000" step="1" value="${settings?.batchSize ?? 50}">
              </label>
              <label class="provider-field">
                <span>Worker count</span>
                <input name="worker_count" type="number" min="1" max="1000" step="1" value="${settings?.workerCount ?? 2}">
              </label>
            </div>
	        <p class="project-fact launch-execution-summary">
	          <span class="fact-label">Saved execution metadata</span>
	          <span class="fact-value mono" data-launch-execution-summary>${escapeHtml(executionSettingsSummary(settings))}</span>
	        </p>
	        </fieldset>`
}

function executionSettingsSummary(settings: DashboardAnalysisLaunchSettings | null): string {
  if (settings === null) {
    return "batch 50 · workers 2"
  }
  return `batch ${settings.batchSize} · workers ${settings.workerCount}`
}

function renderProviderSettings(settings: SpecProviderSettings): string {
  return `<fieldset class="launch-fieldset provider-picker" data-provider-settings>
            <legend>Provider settings</legend>
            ${providerModes.map((provider) => renderProviderOption(provider, settings.mode)).join("")}
            <div class="provider-settings-fields">
              <label class="provider-field" data-provider-visible-modes="env-provider opencode-broker">
                <span>Model</span>
                <input name="provider_model" value="${escapeHtml(modelValue(settings))}" placeholder="openai/gpt-5.5">
              </label>
              <label class="provider-field" data-provider-visible-modes="env-provider">
                <span>Env provider</span>
                <input name="provider_name" value="${escapeHtml(providerValue(settings))}" placeholder="openai">
              </label>
              <label class="provider-field" data-provider-visible-modes="env-provider">
                <span>Base URL</span>
                <input name="provider_base_url" value="${escapeHtml(baseUrlValue(settings))}" placeholder="https://api.openai.com/v1">
              </label>
              <label class="provider-field" data-provider-visible-modes="opencode-broker">
                <span>Broker URL</span>
                <input name="broker_url" value="${escapeHtml(brokerUrlValue(settings))}" placeholder="http://127.0.0.1:9000">
              </label>
            </div>
            <p class="project-fact provider-secret-note">
              <span class="fact-label">Saved provider settings</span>
              <span class="fact-value mono" data-provider-settings-status>${escapeHtml(providerSettingsSummary(settings))}</span>
            </p>
	        </fieldset>`
}

function renderProviderSaveAction(): string {
  return `<div class="launch-settings-actions provider-save-actions">
		          <button class="launch-settings-button" type="button" data-save-provider>Save</button>
		        </div>`
}

function renderProviderOption(
  provider: (typeof providerModes)[number],
  selectedMode: SpecProviderSettings["mode"],
): string {
  const disabled = provider.disabled ? " disabled" : ""
  const className = provider.disabled ? "launch-choice provider-disabled" : "launch-choice"
  return `<label class="${className}">
            <input type="radio" name="provider_mode" value="${provider.value}"${disabled}${provider.value === selectedMode ? " checked" : ""}>
            <span>${provider.label}<small>${provider.description}</small></span>
          </label>`
}

function modelValue(settings: SpecProviderSettings): string {
  switch (settings.mode) {
    case "deterministic":
      return ""
    case "env-provider":
    case "opencode-broker":
      return settings.model
    default:
      return assertNever(settings)
  }
}

function providerValue(settings: SpecProviderSettings): string {
  switch (settings.mode) {
    case "deterministic":
    case "opencode-broker":
      return "openai"
    case "env-provider":
      return settings.provider
    default:
      return assertNever(settings)
  }
}

function baseUrlValue(settings: SpecProviderSettings): string {
  switch (settings.mode) {
    case "deterministic":
    case "opencode-broker":
      return ""
    case "env-provider":
      return settings.baseUrl ?? ""
    default:
      return assertNever(settings)
  }
}

function brokerUrlValue(settings: SpecProviderSettings): string {
  switch (settings.mode) {
    case "deterministic":
    case "env-provider":
      return ""
    case "opencode-broker":
      return settings.brokerUrl
    default:
      return assertNever(settings)
  }
}

export function providerSettingsSummary(settings: SpecProviderSettings): string {
  switch (settings.mode) {
    case "deterministic":
      return "deterministic"
    case "env-provider":
      return [settings.mode, settings.provider, settings.model, settings.baseUrl]
        .filter((value): value is string => value !== undefined)
        .join(" · ")
    case "opencode-broker":
      return `${settings.mode} · ${settings.model} · ${settings.brokerUrl}`
    default:
      return assertNever(settings)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled provider settings: ${JSON.stringify(value)}`)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
