import { Database } from "bun:sqlite"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { CallConfidenceLabel } from "./call-graph"
import type { ExportFileRecord, ProjectPaths } from "./types"

export const GRAPH_EXPORT_FORMATS = ["graphml", "cypher", "mermaid"] as const

export type GraphExportFormat = (typeof GRAPH_EXPORT_FORMATS)[number]

type CallRow = {
  readonly caller_entity_id: string
  readonly callee_entity_id: string | null
  readonly callee_name: string
  readonly confidence: number
  readonly confidence_label: CallConfidenceLabel
}

type SequenceRow = {
  readonly call_path_json: string
}

type GraphExportInput = {
  readonly calls: readonly CallRow[]
  readonly sequences: readonly (readonly string[])[]
}

export async function generateGraphExport(
  paths: ProjectPaths,
  format: GraphExportFormat,
): Promise<ExportFileRecord> {
  await mkdir(paths.exportsDir, { recursive: true })
  const input = readGraphExportInput(paths)
  const fileName = graphExportFileName(format)
  await writeFile(join(paths.exportsDir, fileName), renderGraphExport(input, format))
  return exportFileRecord(paths, fileName, format)
}

function readGraphExportInput(paths: ProjectPaths): GraphExportInput {
  const db = new Database(callGraphDbPath(paths), { readonly: true })
  try {
    const calls = db
      .query<CallRow, []>(
        `select caller_entity_id, callee_entity_id, callee_name, confidence, confidence_label
         from calls
         order by caller_entity_id, callee_entity_id, callee_name`,
      )
      .all()
    const sequenceRows = db
      .query<SequenceRow, []>("select call_path_json from sequence_candidates order by sequence_id")
      .all()
    return { calls, sequences: sequenceRows.map((row) => parseStringArray(row.call_path_json)) }
  } finally {
    db.close()
  }
}

function parseStringArray(value: string): readonly string[] {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    return []
  }
  return parsed
}

function renderGraphExport(input: GraphExportInput, format: GraphExportFormat): string {
  switch (format) {
    case "graphml":
      return renderGraphml(input.calls)
    case "cypher":
      return renderCypher(input.calls)
    case "mermaid":
      return renderMermaid(input.sequences)
    default:
      return assertNever(format)
  }
}

function renderGraphml(calls: readonly CallRow[]): string {
  const nodes = graphNodes(calls)
    .map((node) => `    <node id="${xmlEscape(node)}"/>`)
    .join("\n")
  const edges = calls
    .filter((call) => call.callee_entity_id !== null)
    .map(
      (call) =>
        `    <edge source="${xmlEscape(call.caller_entity_id)}" target="${xmlEscape(call.callee_entity_id ?? "")}">
      <data key="callee_name">${xmlEscape(call.callee_name)}</data>
      <data key="confidence">${call.confidence}</data>
      <data key="confidence_label">${call.confidence_label}</data>
    </edge>`,
    )
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n  <graph edgedefault="directed">\n${nodes}\n${edges}\n  </graph>\n</graphml>\n`
}

function renderCypher(calls: readonly CallRow[]): string {
  return calls
    .filter((call) => call.callee_entity_id !== null)
    .map(
      (call) =>
        `MERGE (caller:Entity {id: '${cypherEscape(call.caller_entity_id)}'})\n` +
        `MERGE (callee:Entity {id: '${cypherEscape(call.callee_entity_id ?? "")}'})\n` +
        `MERGE (caller)-[:CALLS {confidence: ${call.confidence}, label: '${call.confidence_label}'}]->(callee);`,
    )
    .join("\n")
}

function renderMermaid(sequences: readonly (readonly string[])[]): string {
  const lines = ["sequenceDiagram"]
  for (const sequence of sequences) {
    for (const participant of sequence) {
      lines.push(`  participant ${mermaidId(participant)}`)
    }
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const from = sequence[index]
      const to = sequence[index + 1]
      if (from !== undefined && to !== undefined) {
        lines.push(`  ${mermaidId(from)}->>${mermaidId(to)}: call`)
      }
    }
  }
  return `${lines.join("\n")}\n`
}

function graphNodes(calls: readonly CallRow[]): readonly string[] {
  const nodes = new Set<string>()
  for (const call of calls) {
    nodes.add(call.caller_entity_id)
    if (call.callee_entity_id !== null) {
      nodes.add(call.callee_entity_id)
    }
  }
  return [...nodes].sort()
}

function graphExportFileName(format: GraphExportFormat): string {
  switch (format) {
    case "graphml":
      return "call_graph.graphml"
    case "cypher":
      return "call_graph.cypher"
    case "mermaid":
      return "call_graph.mmd"
    default:
      return assertNever(format)
  }
}

async function exportFileRecord(
  paths: ProjectPaths,
  fileName: string,
  format: GraphExportFormat,
): Promise<ExportFileRecord> {
  const fileStat = await stat(join(paths.exportsDir, fileName))
  return {
    file_id: graphExportFileId(format),
    file_name: fileName,
    format,
    size_bytes: fileStat.size,
    created_at: fileStat.mtime.toISOString(),
    download_url: `/exports/${graphExportFileId(format)}/download`,
  }
}

function graphExportFileId(format: GraphExportFormat): string {
  return `call_graph_${format}`
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function cypherEscape(value: string): string {
  return value.replaceAll("'", "\\'")
}

function mermaidId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, "_")
}

function callGraphDbPath(paths: ProjectPaths): string {
  return join(paths.stateDir, "retro", "call_graph.db")
}

function assertNever(value: never): never {
  throw new Error(`Unexpected graph export format: ${String(value)}`)
}
