import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ExportFileRecord, ProjectPaths } from "./types"

export type ExportPreview = {
  readonly title: string
  readonly summary: string
  readonly source: string
  readonly facts: readonly string[]
}

export type DashboardExportFile = ExportFileRecord & {
  readonly preview?: ExportPreview
}

type GraphPreviewFormat = "graphml" | "cypher" | "mermaid"

const previewMaxCharacters = 2_400

export async function attachExportPreviews(
  paths: ProjectPaths,
  files: readonly ExportFileRecord[],
): Promise<readonly DashboardExportFile[]> {
  return Promise.all(files.map((file) => attachPreview(paths, file)))
}

async function attachPreview(
  paths: ProjectPaths,
  file: ExportFileRecord,
): Promise<DashboardExportFile> {
  if (!isGraphPreviewFormat(file.format)) {
    return file
  }
  const source = await readFile(join(paths.exportsDir, file.file_name), "utf8")
  return { ...file, preview: previewFor(file.format, source) }
}

function isGraphPreviewFormat(format: string): format is GraphPreviewFormat {
  return format === "graphml" || format === "cypher" || format === "mermaid"
}

function previewFor(format: GraphPreviewFormat, source: string): ExportPreview {
  switch (format) {
    case "graphml":
      return {
        title: "GraphML preview",
        summary: "Check the XML shape here, then open the file in Gephi or yEd for layout work.",
        source: previewSource(source),
        facts: graphmlFacts(source),
      }
    case "cypher":
      return {
        title: "Cypher import preview",
        summary: "Copy or download this script for Neo4j import.",
        source: previewSource(source),
        facts: [`${countOccurrences(source, "MERGE (caller")} call relationships`],
      }
    case "mermaid":
      return {
        title: "Mermaid sequence preview",
        summary: "A read-only sequence diagram source generated from sequence_candidates.",
        source: previewSource(source),
        facts: mermaidFacts(source),
      }
    default:
      return assertNever(format)
  }
}

function previewSource(source: string): string {
  return source.length > previewMaxCharacters
    ? `${source.slice(0, previewMaxCharacters)}\n... truncated for dashboard preview`
    : source
}

function graphmlFacts(source: string): readonly string[] {
  return [
    `${countOccurrences(source, "<node ")} nodes`,
    `${countOccurrences(source, "<edge ")} edges`,
  ]
}

function mermaidFacts(source: string): readonly string[] {
  return source
    .split("\n")
    .filter((line) => line.includes("->>"))
    .map((line) => line.trim())
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function assertNever(value: never): never {
  throw new Error(`Unexpected dashboard export format: ${String(value)}`)
}
