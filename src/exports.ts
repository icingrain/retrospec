import { mkdir, readdir, stat } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import {
  type ExportManifestFile,
  enrichExportRecord,
  readExportManifest,
  writeExportManifest,
} from "./export-manifest"
import { readRetroExports } from "./export-query"
import { writeTabularExports } from "./export-writers"
import { readGlossaryReconciliation } from "./glossary"
import type {
  ExportFileRecord,
  GenerateRetroExportsOptions,
  ProjectPaths,
  RetroExportFormat,
  TabularExport,
} from "./types"

const exportFileIdPattern = /^[A-Za-z0-9_-]+$/

export class RetroExportError extends Error {
  readonly name = "RetroExportError"
}

export async function generateRetroExports(
  paths: ProjectPaths,
  options: GenerateRetroExportsOptions,
): Promise<readonly ExportFileRecord[]> {
  await mkdir(paths.exportsDir, { recursive: true })
  const tables = await readRetroExports({
    paths,
    mapError: (message, cause) => new RetroExportError(message, { cause }),
  })
  await writeTabularExports(paths.exportsDir, options.format, tables)
  await writeExportManifest(paths, options.format, tables)
  return listExportFiles(paths)
}

export async function regenerateRetroExports(
  paths: ProjectPaths,
): Promise<readonly ExportFileRecord[]> {
  await mkdir(paths.exportsDir, { recursive: true })
  const manifest = await readExportManifest(paths)
  if (manifest === null) {
    throw new RetroExportError("missing export manifest")
  }

  const tables = await readRetroExports({
    paths,
    mapError: (message, cause) => new RetroExportError(message, { cause }),
  })
  for (const format of manifestFormats(manifest.files)) {
    await writeTabularExports(
      paths.exportsDir,
      format,
      tablesForFormat(tables, manifest.files, format),
    )
  }
  return listExportFiles(paths)
}

export async function listExportFiles(paths: ProjectPaths): Promise<readonly ExportFileRecord[]> {
  const entries = await readExportDirectory(paths.exportsDir)
  const manifest = await readExportManifest(paths)
  const glossary = readGlossaryReconciliation(paths)
  const records = await Promise.all(
    entries.map(async (fileName) => {
      const filePath = join(paths.exportsDir, fileName)
      const fileStat = await stat(filePath)
      const record = {
        file_id: exportFileId(fileName),
        file_name: fileName,
        format: exportFormat(fileName),
        size_bytes: fileStat.size,
        created_at: fileStat.mtime.toISOString(),
        download_url: `/exports/${encodeURIComponent(exportFileId(fileName))}/download`,
      } satisfies ExportFileRecord
      return {
        ...enrichExportRecord(record, manifest),
        glossary_reconciliation: exportGlossarySummary(glossary),
      }
    }),
  )
  return records.sort((left, right) => right.created_at.localeCompare(left.created_at))
}

function exportGlossarySummary(glossary: ReturnType<typeof readGlossaryReconciliation>) {
  return {
    term_count: glossary.term_count,
    entity_match_count: glossary.entity_match_count,
    unmatched_entities: glossary.unmatched_entities,
  }
}

export async function findExportFilePath(
  paths: ProjectPaths,
  fileId: string,
): Promise<string | null> {
  if (!exportFileIdPattern.test(fileId)) {
    return null
  }

  const entries = await readExportDirectory(paths.exportsDir)
  const fileName = entries.find((entry) => exportFileId(entry) === fileId)
  return fileName === undefined ? null : join(paths.exportsDir, fileName)
}

async function readExportDirectory(exportsDir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(exportsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => exportFormat(name) !== "unknown")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

function exportFileId(fileName: string): string {
  const format = exportFormat(fileName)
  if (format === "graphml" || format === "cypher" || format === "mermaid") {
    return `${basename(fileName, extname(fileName))}_${format}`
  }
  return basename(fileName, extname(fileName))
}

function exportFormat(fileName: string): string {
  const extension = extname(fileName).slice(1).toLowerCase()
  if (
    extension === "csv" ||
    extension === "xlsx" ||
    extension === "graphml" ||
    extension === "cypher"
  ) {
    return extension
  }
  return extension === "mmd" ? "mermaid" : "unknown"
}

function manifestFormats(files: readonly ExportManifestFile[]): readonly RetroExportFormat[] {
  return [...new Set(files.map((file) => file.format))]
}

function tablesForFormat(
  tables: readonly TabularExport[],
  files: readonly ExportManifestFile[],
  format: RetroExportFormat,
): readonly TabularExport[] {
  const categories = new Set(
    files.filter((file) => file.format === format).map((file) => file.category),
  )
  return tables.filter((table) => categories.has(table.category))
}
