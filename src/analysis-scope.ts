import { createHash } from "node:crypto"
import { isAbsolute, normalize, relative, sep } from "node:path"

export type AnalysisScope =
  | { readonly mode: "full"; readonly roots: readonly string[] }
  | { readonly mode: "partial"; readonly roots: readonly string[] }

export const fullAnalysisScope: AnalysisScope = { mode: "full", roots: [] }

export function normalizeAnalysisScope(scope?: AnalysisScope | undefined): AnalysisScope {
  if (scope === undefined || scope.mode === "full") {
    return fullAnalysisScope
  }

  const roots = [...new Set(scope.roots.map(normalizeScopeRoot))].toSorted()
  if (roots.length === 0) {
    return fullAnalysisScope
  }
  return { mode: "partial", roots }
}

export function createScopeFingerprint(scope: AnalysisScope): string {
  const hash = createHash("sha256")
  hash.update(scope.mode)
  for (const root of scope.roots) {
    hash.update("\0")
    hash.update(root)
  }
  return hash.digest("hex")
}

export function isPathInScope(relativePath: string, scope: AnalysisScope): boolean {
  if (scope.mode === "full") {
    return true
  }

  return scope.roots.some((root) => {
    const relation = relative(root, relativePath)
    return relation.length === 0 || (!relation.startsWith("..") && !isAbsolute(relation))
  })
}

function normalizeScopeRoot(root: string): string {
  const normalized = normalize(root.trim()).replaceAll(sep, "/")
  if (normalized.length === 0 || normalized === "." || isAbsolute(normalized)) {
    throw new Error("analysis scope roots must be project-relative paths")
  }
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("analysis scope roots must stay inside the project")
  }
  return normalized
}
