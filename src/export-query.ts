import { Database } from "bun:sqlite"
import { access } from "node:fs/promises"
import { join } from "node:path"
import type { ProjectPaths, RetroExportCategory, TabularExport } from "./types"

type CellValue = string | number | null
type Row = Record<string, CellValue>

const structureColumns = [
  "entity_id",
  "file_path",
  "language",
  "loc",
  "size_bytes",
  "module_name",
] as const

const symbolColumns = [
  "entity_id",
  "parent_entity_id",
  "symbol_type",
  "name",
  "signature",
  "start_line",
  "end_line",
  "visibility",
  "file_path",
] as const

type ReadRetroExportInput = {
  readonly paths: ProjectPaths
  readonly mapError: (message: string, cause?: unknown) => Error
}

export async function readRetroExports(
  input: ReadRetroExportInput,
): Promise<readonly TabularExport[]> {
  const structureDbPath = join(input.paths.stateDir, "retro", "structure.db")
  const symbolsDbPath = join(input.paths.stateDir, "retro", "symbols.db")
  await requireDatabaseFile(structureDbPath, "structure", input.mapError)
  await requireDatabaseFile(symbolsDbPath, "symbols", input.mapError)

  const db = new Database(":memory:")
  try {
    attachDatabase(db, "structure", structureDbPath)
    attachDatabase(db, "symbols", symbolsDbPath)
    return [readStructureExport(db), readSymbolsExport(db)]
  } catch (error) {
    throw input.mapError(
      "malformed retro database: expected structure.files and symbols.symbols",
      error,
    )
  } finally {
    db.close()
  }
}

async function requireDatabaseFile(
  dbPath: string,
  category: RetroExportCategory,
  mapError: (message: string, cause?: unknown) => Error,
): Promise<void> {
  try {
    await access(dbPath)
  } catch (error) {
    throw mapError(`missing retro database for ${category}: ${dbPath}`, error)
  }
}

function attachDatabase(db: Database, schemaName: RetroExportCategory, dbPath: string): void {
  db.query(`attach database ${sqlString(dbPath)} as ${schemaName}`).run()
}

function readStructureExport(db: Database): TabularExport {
  return {
    category: "structure",
    columns: structureColumns,
    rows: db
      .query<Row, []>(
        `select entity_id, file_path, language, loc, size_bytes, module_name
         from structure.files
         order by file_path, entity_id`,
      )
      .all(),
  }
}

function readSymbolsExport(db: Database): TabularExport {
  return {
    category: "symbols",
    columns: symbolColumns,
    rows: db
      .query<Row, []>(
        `select entity_id, parent_entity_id, symbol_type, name, signature, start_line, end_line, visibility, file_path
         from symbols.symbols
         order by file_path, start_line, entity_id`,
      )
      .all(),
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
