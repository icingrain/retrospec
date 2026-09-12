import type { AnalysisScope } from "./analysis-scope"
import type {
  DashboardAnalysisLaunchInput,
  DashboardAnalysisLaunchSettings,
  DashboardFolderOption,
} from "./dashboard-analysis-launch-types"

export function renderScopePanel(input: DashboardAnalysisLaunchInput): string {
  const savedScope = input.savedSettings?.scope ?? null
  const fullChecked = savedScope?.mode !== "partial" ? " checked" : ""
  const partialChecked = savedScope?.mode === "partial" ? " checked" : ""
  const savedRoots = new Set(savedScope?.mode === "partial" ? savedScope.roots : [])
  const savedNotice =
    input.savedSettings === null ? "Full project" : savedScopeSummary(input.savedSettings.scope)
  return `<section class="project-option" data-gqo-id="daemon-dashboard.analysis-launch.scope" data-gqo-scope="section" data-gqo-editable="copy layout style">
            <div class="project-header">
              <span class="project-select">Scope selection</span>
              <span class="state-chip" data-state="best-effort">editable</span>
            </div>
	            <fieldset class="launch-fieldset scope-mode-grid">
	              <legend>Run scope</legend>
	              <label class="launch-choice">
	                <input type="radio" name="scope_mode" value="full"${fullChecked}>
	                <span>Full project<small>Root selected. Folder tree controls stay locked for full-project analysis.</small></span>
	              </label>
	              <label class="launch-choice">
	                <input type="radio" name="scope_mode" value="partial"${partialChecked}>
	                <span>Selected folders<small>Enable the accordion tree and choose project-relative folders.</small></span>
	              </label>
		            </fieldset>
		            ${renderFolderTree(input.folders, savedRoots)}
		            ${renderScopeExclusions(input.savedSettings)}
	            <div class="project-fact saved-scope-status" data-scope-status>
	              <span class="fact-label">Saved scope</span>
	              <span class="fact-value mono" data-saved-scope-status>${escapeHtml(savedNotice)}</span>
            </div>
	            <div class="project-warning existing-result-notice" data-partial-warning hidden>This partial run will not replace the full canonical result. Promotion or replacement requires explicit confirmation: replace full canonical with this partial scope.</div>
	            <div class="launch-settings-actions scope-save-actions">
	              <button type="button" class="launch-settings-button" data-save-scope>Save</button>
	            </div>
	          </section>`
}

function renderScopeExclusions(settings: DashboardAnalysisLaunchSettings | null): string {
  return `<fieldset class="launch-fieldset scope-exclusion-settings">
	          <legend>Scope exclusions</legend>
	          <label class="provider-field">
	            <span>Exclude folders</span>
	            <textarea name="exclude_folders" rows="3" placeholder="generated, coverage">${escapeHtml(settings?.excludeFolders.join("\n") ?? "")}</textarea>
	          </label>
	          <label class="provider-field">
	            <span>Exclude extensions</span>
	            <input name="exclude_extensions" value="${escapeHtml(settings?.excludeExtensions.join(", ") ?? "")}" placeholder=".log, .tmp">
	          </label>
	        </fieldset>`
}

function renderFolderTree(
  folders: readonly DashboardFolderOption[],
  savedRoots: ReadonlySet<string>,
): string {
  if (folders.length === 0) {
    return `<div class="project-fact folder-tree">
              <span class="fact-label">Folder tree</span>
              <span class="fact-value">No source folders discovered for this project.</span>
            </div>`
  }
  return `<fieldset class="launch-fieldset folder-tree" data-folder-tree disabled>
            <legend>Folder tree</legend>
            <div class="folder-root-state" data-root-selected>Root selected for Full project.</div>
	            <div class="folder-list" data-folder-list>
	              ${renderFolderNodes(folders, null, savedRoots)}
	            </div>
	          </fieldset>`
}

function renderFolderNodes(
  folders: readonly DashboardFolderOption[],
  parentPath: string | null,
  savedRoots: ReadonlySet<string>,
): string {
  return folders
    .filter((folder) => isDirectChild(folder, parentPath))
    .map((folder) => renderFolderNode(folder, folders, parentPath, savedRoots))
    .join("")
}

function renderFolderNode(
  folder: DashboardFolderOption,
  folders: readonly DashboardFolderOption[],
  parentPath: string | null,
  savedRoots: ReadonlySet<string>,
): string {
  const childNodes = renderFolderNodes(folders, folder.path, savedRoots)
  const parentAttribute =
    parentPath === null ? "" : ` data-folder-parent="${escapeHtml(parentPath)}"`
  const hasChildren = childNodes.length > 0
  const nodeClassName = hasChildren ? "folder-node folder-node-has-children" : "folder-node"
  const disclosure = hasChildren
    ? '<span class="folder-disclosure" aria-hidden="true"></span>'
    : '<span class="folder-disclosure-spacer" aria-hidden="true"></span>'
  return `<details class="${nodeClassName}" data-folder-path="${escapeHtml(folder.path)}"${parentAttribute}>
            <summary class="folder-node-summary">
              ${disclosure}
	              <input type="checkbox" name="scope_roots" value="${escapeHtml(folder.path)}" data-folder-checkbox aria-label="Select ${escapeHtml(folder.path)} and child folders"${savedRoots.has(folder.path) ? " checked" : ""}>
              <span class="mono folder-node-label">${escapeHtml(folder.path)}<small>Project-relative scope root</small></span>
            </summary>
            ${hasChildren ? `<div class="folder-children" data-folder-children>${childNodes}</div>` : ""}
          </details>`
}

function savedScopeSummary(scope: AnalysisScope): string {
  if (scope.mode === "full") {
    return "Full project"
  }
  return scope.roots.join(", ")
}

function isDirectChild(folder: DashboardFolderOption, parentPath: string | null): boolean {
  if (parentPath === null) {
    return folder.depth === 0
  }
  const prefix = `${parentPath}/`
  if (!folder.path.startsWith(prefix)) {
    return false
  }
  return !folder.path.slice(prefix.length).includes("/")
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
