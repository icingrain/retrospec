import { readFile, readdir, stat } from "node:fs/promises"
import { extname, isAbsolute, join, relative } from "node:path"
import {
  type AnalysisScope,
  fullAnalysisScope,
  isPathInScope,
  normalizeAnalysisScope,
} from "../analysis-scope"
import { createSourceFingerprint } from "./ids"

const ignoredDirectories = new Set([".git", ".retrospec", "node_modules", "dist", "build"])

const languageByExtension = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascript",
  ".pc": "proc",
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "tsx",
} as const

export type SurveyFile = {
  readonly absolutePath: string
  readonly relativePath: string
  readonly language: string
  readonly sizeBytes: number
  readonly contentHash: string
}

export type SurveyResult = {
  readonly files: readonly SurveyFile[]
  readonly sourceFingerprint: string
  readonly analysisScope: AnalysisScope
}

export type SurveyExclusions = {
  readonly excludeFolders: readonly string[]
  readonly excludeExtensions: readonly string[]
}

export async function surveySourceTree(
  projectRoot: string,
  scope: AnalysisScope = fullAnalysisScope,
  exclusions: SurveyExclusions = { excludeFolders: [], excludeExtensions: [] },
): Promise<SurveyResult> {
  const analysisScope = normalizeAnalysisScope(scope)
  const files = await walk(projectRoot, projectRoot, analysisScope, exclusions)
  const sorted = files.toSorted((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )
  return {
    files: sorted,
    sourceFingerprint: createSourceFingerprint(
      sorted.map((file) => `${file.relativePath}:${file.contentHash}`),
    ),
    analysisScope,
  }
}

async function walk(
  root: string,
  directory: string,
  scope: AnalysisScope,
  exclusions: SurveyExclusions,
): Promise<readonly SurveyFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: SurveyFile[] = []

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    const relativePath = relative(root, absolutePath)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !isFolderExcluded(relativePath, exclusions)) {
        files.push(...(await walk(root, absolutePath, scope, exclusions)))
      }
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (isExtensionExcluded(entry.name, exclusions)) {
      continue
    }

    const language = languageForPath(entry.name)
    if (language === null) {
      continue
    }

    if (!isPathInScope(relativePath, scope)) {
      continue
    }

    const metadata = await stat(absolutePath)
    const content = await readFile(absolutePath)
    files.push({
      absolutePath,
      relativePath,
      language,
      sizeBytes: metadata.size,
      contentHash: createSourceFingerprint([content.toString("base64")]),
    })
  }

  return files
}

function isFolderExcluded(relativePath: string, exclusions: SurveyExclusions): boolean {
  return exclusions.excludeFolders.some((folder) => {
    const relation = relative(folder, relativePath)
    return relation.length === 0 || (!relation.startsWith("..") && !isAbsolute(relation))
  })
}

function isExtensionExcluded(path: string, exclusions: SurveyExclusions): boolean {
  return exclusions.excludeExtensions.includes(extname(path).toLowerCase())
}

function languageForPath(path: string): string | null {
  const extension = extname(path)
  return languageByExtension[extension as keyof typeof languageByExtension] ?? null
}
