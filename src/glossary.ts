import { Database } from "bun:sqlite"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  type GlossaryEntityMatchRecord,
  type GlossaryReconciliationSummary,
  ensureGlossaryStore,
  readGlossaryReconciliation,
  regenerateEntityGlossaryMatches,
} from "./glossary-reconciliation"
import type { ProjectPaths } from "./types"

export type ImportGlossaryRequest = {
  readonly uploadId: string
}

export type ImportGlossaryResponse = {
  readonly upload_id: string
  readonly imported_rows: number
  readonly replaced_rows: number
  readonly glossary_matches: number
}

export type GlossaryTermRecord = {
  readonly term: string
  readonly meaning: string
  readonly source_upload_id: string
  readonly imported_at: string
}

export { readGlossaryReconciliation }
export type { GlossaryEntityMatchRecord, GlossaryReconciliationSummary }

export class GlossaryImportError extends Error {
  readonly name = "GlossaryImportError"
}

export async function importStagedGlossaryCsv(
  paths: ProjectPaths,
  request: ImportGlossaryRequest,
): Promise<ImportGlossaryResponse> {
  const csv = await readFile(join(paths.uploadsDir, request.uploadId, "source.csv"), "utf8")
  const rows = parseGlossaryCsv(csv)
  await mkdir(paths.glossaryDir, { recursive: true })
  let replacedRows = 0
  let matchCount = 0

  const db = new Database(paths.glossaryDb, { create: true })
  try {
    ensureGlossaryStore(db)
    const importedAt = new Date().toISOString()
    const existing = new Set(
      db
        .query<{ readonly term: string }, []>("select term from glossary_terms")
        .all()
        .map((row) => row.term),
    )
    const insert = db.query(
      `insert into glossary_terms (term, meaning, source_upload_id, imported_at)
       values ($term, $meaning, $source_upload_id, $imported_at)
       on conflict(term) do update set
         meaning = excluded.meaning,
         source_upload_id = excluded.source_upload_id,
         imported_at = excluded.imported_at`,
    )
    const recordImport = db.query(
      `insert or replace into glossary_imports (upload_id, imported_rows, replaced_rows, imported_at)
       values (?, ?, ?, ?)`,
    )
    db.transaction(() => {
      for (const row of rows) {
        if (existing.has(row.term)) {
          replacedRows += 1
        }
        insert.run({
          $term: row.term,
          $meaning: row.meaning,
          $source_upload_id: request.uploadId,
          $imported_at: importedAt,
        })
      }
      matchCount = regenerateEntityGlossaryMatches(db, paths.registryDb, importedAt)
      recordImport.run(request.uploadId, rows.length, replacedRows, importedAt)
    })()
  } finally {
    db.close()
  }

  return {
    upload_id: request.uploadId,
    imported_rows: rows.length,
    replaced_rows: replacedRows,
    glossary_matches: matchCount,
  }
}

export function readGlossaryTerms(paths: ProjectPaths): readonly GlossaryTermRecord[] {
  const db = new Database(paths.glossaryDb, { readonly: true })
  try {
    return db
      .query<GlossaryTermRecord, []>(
        `select term, meaning, source_upload_id, imported_at
         from glossary_terms
         order by rowid`,
      )
      .all()
  } finally {
    db.close()
  }
}

function parseGlossaryCsv(csv: string): readonly Pick<GlossaryTermRecord, "term" | "meaning">[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const header = lines[0]
  if (header !== "term,meaning") {
    throw new GlossaryImportError("glossary csv header must be term,meaning")
  }

  return lines.slice(1).map((line) => {
    const [term, meaning, extra] = line.split(",")
    if (term === undefined || meaning === undefined || extra !== undefined) {
      throw new GlossaryImportError("glossary csv rows must contain term and meaning")
    }
    return { term, meaning }
  })
}
