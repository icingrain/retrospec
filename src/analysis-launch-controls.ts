import { isAbsolute, normalize, sep } from "node:path"
import { fullAnalysisScope, normalizeAnalysisScope } from "./analysis-scope"
import type { AnalysisScope } from "./analysis-scope"

export type AnalysisLaunchControls = {
  readonly scope: AnalysisScope
  readonly excludeFolders: readonly string[]
  readonly excludeExtensions: readonly string[]
  readonly batchSize: number
  readonly workerCount: number
}

export type AnalysisLaunchControlsInput = {
  readonly scope?: AnalysisScope | undefined
  readonly excludeFolders?: readonly string[] | undefined
  readonly excludeExtensions?: readonly string[] | undefined
  readonly batchSize?: number | undefined
  readonly workerCount?: number | undefined
}

export const defaultAnalysisLaunchControls: AnalysisLaunchControls = {
  scope: fullAnalysisScope,
  excludeFolders: [],
  excludeExtensions: [],
  batchSize: 50,
  workerCount: 2,
}

export function normalizeAnalysisLaunchControls(
  input: AnalysisLaunchControlsInput = {},
): AnalysisLaunchControls {
  return {
    scope: normalizeAnalysisScope(input.scope),
    excludeFolders: normalizeExcludeFolders(input.excludeFolders ?? []),
    excludeExtensions: normalizeExcludeExtensions(input.excludeExtensions ?? []),
    batchSize: normalizeBoundedInteger(input.batchSize ?? defaultAnalysisLaunchControls.batchSize),
    workerCount: normalizeBoundedInteger(
      input.workerCount ?? defaultAnalysisLaunchControls.workerCount,
    ),
  }
}

export function toLaunchSettingsPayload(controls: AnalysisLaunchControls): {
  readonly scope: AnalysisScope
  readonly exclude_folders: readonly string[]
  readonly exclude_extensions: readonly string[]
  readonly batch_size: number
  readonly worker_count: number
} {
  return {
    scope: controls.scope,
    exclude_folders: controls.excludeFolders,
    exclude_extensions: controls.excludeExtensions,
    batch_size: controls.batchSize,
    worker_count: controls.workerCount,
  }
}

function normalizeExcludeFolders(folders: readonly string[]): readonly string[] {
  return [...new Set(folders.map(normalizeExcludeFolder))].toSorted()
}

function normalizeExcludeFolder(folder: string): string {
  const normalized = normalize(folder.trim()).replaceAll(sep, "/").replace(/\/$/, "")
  if (normalized.length === 0 || normalized === "." || isAbsolute(normalized)) {
    throw new Error("exclude folders must be project-relative paths")
  }
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("exclude folders must stay inside the project")
  }
  return normalized
}

function normalizeExcludeExtensions(extensions: readonly string[]): readonly string[] {
  return [...new Set(extensions.map(normalizeExcludeExtension))].toSorted()
}

function normalizeExcludeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.includes("/") || trimmed === ".") {
    throw new Error("exclude extensions must be file extensions")
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`
}

function normalizeBoundedInteger(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new Error("batch and worker settings must be bounded positive integers")
  }
  return value
}
