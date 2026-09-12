import type { DashboardAnalysisLaunchInput } from "./dashboard-analysis-launch-types"
import { renderRunPlanPanel } from "./dashboard-analysis-run-panel"
import { renderScopePanel } from "./dashboard-analysis-scope-panel"
export type {
  DashboardAnalysisLaunchInput,
  DashboardFolderOption,
  DashboardRetroRunOption,
  DashboardSpecTemplateOption,
} from "./dashboard-analysis-launch-types"

export function renderAnalysisLaunchCard(input: DashboardAnalysisLaunchInput): string {
  return `<article class="card analysis-launch" data-gqo-id="daemon-dashboard.analysis-launch" data-gqo-scope="section" data-gqo-editable="copy layout style">
          <p class="eyebrow">Scoped launch</p>
          <h3>Analysis launch plan</h3>
          <p>Choose whether the next Retro and Spec work represents the full project or only selected folders before submitting jobs.</p>
	          <div class="launch-grid">
	            ${renderScopePanel(input)}
	            ${renderRunPlanPanel(input)}
	          </div>
	          ${renderLaunchScript()}
	        </article>`
}

export function renderScopeSummary(scopeMode: "full" | "partial", rootsJson: string): string {
  const roots = parseScopeRoots(rootsJson)
  if (scopeMode === "full") {
    return "Full project · canonical result"
  }
  return `Partial scope · ${roots.length === 0 ? "scope roots unavailable" : roots.join(", ")}`
}

function parseScopeRoots(rootsJson: string): readonly string[] {
  const parsed: unknown = JSON.parse(rootsJson)
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.filter((value): value is string => typeof value === "string")
}

function renderLaunchScript(): string {
  return `<script>
            (() => {
              const root = document.currentScript.closest(".analysis-launch");
              const warning = root.querySelector("[data-partial-warning]");
              const tree = root.querySelector("[data-folder-tree]");
		              const rootSelected = root.querySelector("[data-root-selected]");
		              const savedStatus = root.querySelector("[data-saved-scope-status]");
		              const executionSummary = root.querySelector("[data-launch-execution-summary]");
		              const providerStatus = root.querySelector("[data-provider-settings-status]");
		              const projectPath = new URLSearchParams(window.location.search).get("project_path");
              const folderCheckboxes = () => [...root.querySelectorAll('input[name="scope_roots"]')];
              const descendantCheckboxes = (path) => folderCheckboxes().filter((input) => input.value.startsWith(path + "/"));
              const ancestorCheckboxes = (path) => folderCheckboxes().filter((input) => path.startsWith(input.value + "/")).sort((left, right) => right.value.length - left.value.length);
              const updateAncestorStates = (path) => {
                for (const ancestor of ancestorCheckboxes(path)) {
                  const descendants = descendantCheckboxes(ancestor.value);
                  const checkedCount = descendants.filter((input) => input.checked).length;
                  ancestor.checked = false;
                  ancestor.indeterminate = checkedCount > 0;
                }
              };
              const cascadeFolderSelection = (changed) => {
                changed.indeterminate = false;
                for (const descendant of descendantCheckboxes(changed.value)) {
                  descendant.checked = changed.checked;
                  descendant.indeterminate = false;
                }
                updateAncestorStates(changed.value);
              };
	              const updateScopePreview = () => {
                const mode = root.querySelector('input[name="scope_mode"]:checked')?.value;
                const selected = [...root.querySelectorAll('input[name="scope_roots"]:checked')].map((input) => input.value);
                const isPartial = mode === "partial";
                if (tree) tree.disabled = !isPartial;
                if (rootSelected) rootSelected.hidden = isPartial;
                if (mode === "partial") {
                  warning.hidden = false;
                  return;
                }
                warning.hidden = true;
	              };
	              const currentScope = () => {
	                const mode = root.querySelector('input[name="scope_mode"]:checked')?.value;
	                const selected = [...root.querySelectorAll('input[name="scope_roots"]:checked')].map((input) => input.value);
	                return mode === "partial" ? { mode: "partial", roots: selected } : { mode: "full", roots: [] };
	              };
		              const describeScope = (scope) => scope.mode === "partial" ? scope.roots.join(", ") : "Full project";
		              const describeExecutionSettings = (settings) => "batch " + settings.batchSize + " · workers " + settings.workerCount;
		              const listValue = (name) => root.querySelector('[name="' + name + '"]')?.value.split(/[\\n,]/).map((item) => item.trim()).filter(Boolean) ?? [];
	              const numberValue = (name, fallback) => {
	                const raw = root.querySelector('[name="' + name + '"]')?.value.trim() ?? "";
	                const parsed = Number.parseInt(raw, 10);
	                return Number.isInteger(parsed) ? parsed : fallback;
	              };
	              const currentLaunchSettings = () => ({
	                scope: currentScope(),
	                exclude_folders: listValue("exclude_folders"),
	                exclude_extensions: listValue("exclude_extensions"),
	                batch_size: numberValue("batch_size", 50),
	                worker_count: numberValue("worker_count", 2),
	              });
	              const saveScope = async () => {
	                if (!projectPath || !savedStatus) return;
	                const scope = currentScope();
	                if (scope.mode === "partial" && scope.roots.length === 0) {
	                  savedStatus.textContent = "Choose at least one folder before saving a selected-folder scope.";
	                  return;
	                }
	                const response = await fetch("/dashboard/analysis/launch-settings", {
	                  method: "POST",
	                  headers: { "Content-Type": "application/json" },
	                  body: JSON.stringify({ project_path: projectPath, settings: currentLaunchSettings() }),
	                });
	                if (!response.ok) {
	                  savedStatus.textContent = "Scope save failed.";
	                  return;
	                }
		                const settings = await response.json();
		                savedStatus.textContent = describeScope(settings.scope);
		                if (executionSummary) executionSummary.textContent = describeExecutionSettings(settings);
		              };
		              const textValue = (name) => root.querySelector('[name="' + name + '"]')?.value.trim() ?? "";
		              const currentProviderSettings = () => {
		                const mode = root.querySelector('input[name="provider_mode"]:checked')?.value;
		                const model = textValue("provider_model");
		                if (mode === "env-provider") {
		                  const provider = textValue("provider_name") || "openai";
		                  const baseUrl = textValue("provider_base_url");
		                  return { mode: "env-provider", provider, model, ...(baseUrl ? { baseUrl } : {}) };
		                }
		                if (mode === "opencode-broker") {
		                  return { mode: "opencode-broker", model: model || "openai/gpt-5.5", brokerUrl: textValue("broker_url") || "http://127.0.0.1:9000" };
		                }
		                return { mode: "deterministic" };
		              };
		              const saveProviderSettings = async () => {
		                if (!projectPath || !providerStatus) return;
		                const response = await fetch("/dashboard/analysis/provider-settings", {
		                  method: "POST",
		                  headers: { "Content-Type": "application/json" },
		                  body: JSON.stringify({ project_path: projectPath, settings: currentProviderSettings() }),
		                });
		                if (!response.ok) {
		                  const error = await response.json().catch(() => ({ error: "Provider settings save failed." }));
		                  providerStatus.textContent = error.error || "Provider settings save failed.";
		                  return;
		                }
		                const result = await response.json();
		                providerStatus.textContent = describeProviderSettings(result.settings);
		              };
		              const describeProviderSettings = (settings) => {
		                if (settings.mode === "env-provider") return [settings.mode, settings.provider, settings.model, settings.baseUrl].filter(Boolean).join(" · ");
		                if (settings.mode === "opencode-broker") return [settings.mode, settings.model, settings.brokerUrl].join(" · ");
		                return "deterministic";
		              };
		              const updateProviderFields = () => {
		                const mode = root.querySelector('input[name="provider_mode"]:checked')?.value ?? "deterministic";
		                for (const field of root.querySelectorAll("[data-provider-visible-modes]")) {
		                  const visibleModes = field.dataset.providerVisibleModes.split(" ");
		                  field.hidden = !visibleModes.includes(mode);
		                }
		              };
              root.addEventListener("click", (event) => {
                const mode = root.querySelector('input[name="scope_mode"]:checked')?.value;
                if (event.target.closest('input[name="scope_roots"]')) event.stopPropagation();
                if (mode !== "partial" && event.target.closest("summary")) event.preventDefault();
              }, true);
	              root.addEventListener("change", (event) => {
                const changed = event.target.closest('input[name="scope_roots"]');
                if (changed) cascadeFolderSelection(changed);
                updateScopePreview();
		                updateProviderFields();
	              });
		              root.querySelector("[data-save-scope]")?.addEventListener("click", () => { void saveScope(); });
		              root.querySelector("[data-save-provider]")?.addEventListener("click", () => { void saveProviderSettings(); });
		              updateScopePreview();
		              updateProviderFields();
            })();
          </script>`
}
