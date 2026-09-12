import { Database } from "bun:sqlite"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  ExportFileRecord,
  ProjectPaths,
  RetroExportCategory,
  RetroExportFormat,
  RetroExportType,
  TabularExport,
} from "./types"

const manifestFileName = "manifest.json"
const markdownSotDirectory = ".retrospec/exports/sot-md"
const markdownSotDirectoryName = "sot-md"
const exportTypes: readonly RetroExportType[] = ["csv", "xlsx", "markdown-tree"]

type WorkflowHandoffSource = {
  readonly category: RetroExportCategory
  readonly source_fingerprint: string
}

export type ExportManifest = {
  readonly manifest_version: 1
  readonly export_types: readonly RetroExportType[]
  readonly markdown_sot_directory: string
  readonly files: readonly ExportManifestFile[]
}

export type ExportManifestFile = {
  readonly file_name: string
  readonly format: RetroExportFormat
  readonly category: RetroExportCategory
  readonly input_db_paths: readonly string[]
  readonly source_fingerprint: string | null
  readonly analysis_run_id: string | null
}

export async function writeExportManifest(
  paths: ProjectPaths,
  format: RetroExportFormat,
  tables: readonly TabularExport[],
): Promise<void> {
  const sourceByCategory = await readWorkflowHandoffSources(paths)
  await mkdir(join(paths.exportsDir, markdownSotDirectoryName), { recursive: true })
  const manifest: ExportManifest = {
    manifest_version: 1,
    export_types: exportTypes,
    markdown_sot_directory: markdownSotDirectory,
    files: tables.map((table) => ({
      file_name: `${table.category}.${format}`,
      format,
      category: table.category,
      input_db_paths: [inputDbPath(table.category)],
      source_fingerprint: sourceByCategory.get(table.category) ?? null,
      analysis_run_id: null,
    })),
  }

  await writeFile(
    join(paths.exportsDir, manifestFileName),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

export async function readExportManifest(paths: ProjectPaths): Promise<ExportManifest | null> {
  try {
    const text = await readFile(join(paths.exportsDir, manifestFileName), "utf8")
    return parseExportManifest(JSON.parse(text))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

export function enrichExportRecord(
  record: ExportFileRecord,
  manifest: ExportManifest | null,
): ExportFileRecord {
  const manifestFile = manifest?.files.find((file) => file.file_name === record.file_name)
  if (manifestFile === undefined) {
    return record
  }

  return { ...record, ...manifestFile }
}

async function readWorkflowHandoffSources(
  paths: ProjectPaths,
): Promise<ReadonlyMap<RetroExportCategory, string>> {
  try {
    await access(paths.registryDb)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Map()
    }
    throw error
  }

  const db = new Database(paths.registryDb, { readonly: true })
  try {
    if (workflowHandoffExists(db) === false) {
      return new Map()
    }

    return new Map(
      db
        .query<WorkflowHandoffSource, []>(
          `select category, source_fingerprint
           from workflow_handoff
           where category in ('structure', 'symbols')`,
        )
        .all()
        .map((row) => [row.category, row.source_fingerprint]),
    )
  } finally {
    db.close()
  }
}

function workflowHandoffExists(db: Database): boolean {
  const row = db
    .query<{ readonly name: string }, []>(
      "select name from sqlite_master where type = 'table' and name = 'workflow_handoff'",
    )
    .get()
  return row !== null
}

function inputDbPath(category: RetroExportCategory): string {
  switch (category) {
    case "structure":
      return ".retrospec/retro/structure.db"
    case "symbols":
      return ".retrospec/retro/symbols.db"
    default:
      return assertNever(category)
  }
}

function parseExportManifest(value: unknown): ExportManifest | null {
  if (!isRecord(value) || value["manifest_version"] !== 1) {
    return null
  }
  const files = value["files"]
  if (!Array.isArray(files)) {
    return null
  }

  const parsedFiles: ExportManifestFile[] = []
  for (const file of files) {
    const parsedFile = parseManifestFile(file)
    if (parsedFile === null) {
      return null
    }
    parsedFiles.push(parsedFile)
  }

  if (!isExportTypeArray(value["export_types"])) {
    return null
  }
  const markdownDirectory = value["markdown_sot_directory"]
  if (markdownDirectory !== markdownSotDirectory) {
    return null
  }

  return {
    manifest_version: 1,
    export_types: value["export_types"],
    markdown_sot_directory: markdownDirectory,
    files: parsedFiles,
  }
}

function parseManifestFile(value: unknown): ExportManifestFile | null {
  if (!isRecord(value) || !Array.isArray(value["input_db_paths"])) {
    return null
  }
  const fileName = value["file_name"]
  const format = value["format"]
  const category = value["category"]
  const sourceFingerprint = value["source_fingerprint"]
  const analysisRunId = value["analysis_run_id"]
  if (
    typeof fileName !== "string" ||
    (format !== "csv" && format !== "xlsx") ||
    (category !== "structure" && category !== "symbols") ||
    !isStringArray(value["input_db_paths"]) ||
    !isNullableString(sourceFingerprint) ||
    !isNullableString(analysisRunId)
  ) {
    return null
  }

  return {
    file_name: fileName,
    format,
    category,
    input_db_paths: value["input_db_paths"],
    source_fingerprint: sourceFingerprint,
    analysis_run_id: analysisRunId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStringArray(value: readonly unknown[]): value is readonly string[] {
  return value.every((item) => typeof item === "string")
}

function isExportTypeArray(value: unknown): value is readonly RetroExportType[] {
  return (
    Array.isArray(value) &&
    value.every((item) => item === "csv" || item === "xlsx" || item === "markdown-tree")
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function assertNever(value: never): never {
  throw new Error(`Unexpected export category: ${String(value)}`)
}
