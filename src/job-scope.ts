import {
  type AnalysisLaunchControls,
  normalizeAnalysisLaunchControls,
} from "./analysis-launch-controls"
import { readAnalysisLaunchSettings } from "./analysis-launch-settings"
import { normalizeAnalysisScope } from "./analysis-scope"
import type { AnalysisScope } from "./analysis-scope"
import type { ProjectPaths, SubmitJobRequest } from "./types"

export type JobManifestWithScope = {
  readonly analysis_scope?: AnalysisScope | undefined
}

export class SavedScopeConfirmationRequiredError extends Error {
  readonly scope: AnalysisScope

  constructor(scope: AnalysisScope) {
    super("saved analysis scope requires confirmation")
    this.name = "SavedScopeConfirmationRequiredError"
    this.scope = scope
  }
}

export async function resolveSubmittedAnalysisScope(
  paths: ProjectPaths,
  request: SubmitJobRequest,
  manifest: JobManifestWithScope,
): Promise<AnalysisScope> {
  if (request.scope !== undefined || manifest.analysis_scope !== undefined) {
    return normalizeAnalysisScope(request.scope ?? manifest.analysis_scope)
  }
  if (request.actor !== "spec") {
    return normalizeAnalysisScope(undefined)
  }
  const savedSettings = await readAnalysisLaunchSettings(paths)
  if (savedSettings === null) {
    return normalizeAnalysisScope(undefined)
  }
  if (request.confirm_saved_scope === true) {
    return savedSettings.scope
  }
  throw new SavedScopeConfirmationRequiredError(savedSettings.scope)
}

export async function resolveSubmittedAnalysisLaunchControls(
  paths: ProjectPaths,
  request: SubmitJobRequest,
  manifest: JobManifestWithScope,
): Promise<AnalysisLaunchControls> {
  if (request.launch_settings !== undefined) {
    return normalizeAnalysisLaunchControls(request.launch_settings)
  }
  if (request.scope !== undefined || manifest.analysis_scope !== undefined) {
    return normalizeAnalysisLaunchControls({ scope: request.scope ?? manifest.analysis_scope })
  }
  if (request.actor !== "spec") {
    return normalizeAnalysisLaunchControls()
  }
  const savedSettings = await readAnalysisLaunchSettings(paths)
  if (savedSettings === null) {
    return normalizeAnalysisLaunchControls()
  }
  if (request.confirm_saved_scope === true) {
    return savedSettings
  }
  throw new SavedScopeConfirmationRequiredError(savedSettings.scope)
}
