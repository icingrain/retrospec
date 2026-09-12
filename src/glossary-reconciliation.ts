import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import type { GlossaryTermRecord } from "./glossary"
import type { ProjectPaths } from "./types"

export type GlossaryEntityMatchRecord = {
  readonly entity_id: string
  readonly glossary_type: "term"
  readonly glossary_key: string
  readonly confidence: number
  readonly matched_at: string
}

export type GlossaryReconciliationSummary = {
  readonly term_count: number
  readonly entity_match_count: number
  readonly unmatched_entities: number
  readonly replaced_rows: number
  readonly last_imported_at: string | null
  readonly entity_matches: readonly GlossaryEntityMatchRecord[]
}

export function ensureGlossaryStore(db: Database): void {
  db.exec(`
    create table if not exists glossary_terms (
      term text primary key,
      meaning text not null,
      source_upload_id text not null,
      imported_at text not null
    );

    create table if not exists glossary_imports (
      upload_id text primary key,
      imported_rows integer not null,
      replaced_rows integer not null,
      imported_at text not null
    );

    create table if not exists entity_glossary_matches (
      entity_id text not null,
      glossary_type text not null,
      glossary_key text not null,
      confidence real not null,
      matched_at text not null,
      primary key (entity_id, glossary_type, glossary_key)
    );
  `)
}

export function readGlossaryReconciliation(paths: ProjectPaths): GlossaryReconciliationSummary {
  if (!existsSync(paths.glossaryDb)) {
    return emptyReconciliation()
  }

  const db = new Database(paths.glossaryDb, { create: true })
  try {
    ensureGlossaryStore(db)
    const terms = readTermRows(db)
    const entityCount = readEntityCount(paths.registryDb)
    const entityMatches = readEntityMatches(db)
    const latestImport = readLatestImport(db)
    return {
      term_count: terms.length,
      entity_match_count: entityMatches.length,
      unmatched_entities: Math.max(
        0,
        entityCount - new Set(entityMatches.map((match) => match.entity_id)).size,
      ),
      replaced_rows: latestImport?.replaced_rows ?? 0,
      last_imported_at: latestImport?.imported_at ?? null,
      entity_matches: entityMatches,
    }
  } finally {
    db.close()
  }
}

export function regenerateEntityGlossaryMatches(
  db: Database,
  registryDb: string,
  matchedAt: string,
): number {
  if (!existsSync(registryDb)) {
    return 0
  }

  const terms = readTermRows(db)
  db.exec("delete from entity_glossary_matches")
  const insert = db.query(
    `insert into entity_glossary_matches (entity_id, glossary_type, glossary_key, confidence, matched_at)
     values (?, 'term', ?, ?, ?)`,
  )
  let count = 0
  const registry = new Database(registryDb, { readonly: true })
  try {
    const entities = registry
      .query<
        {
          readonly entity_id: string
          readonly file_path: string
          readonly symbol_name: string | null
        },
        []
      >("select entity_id, file_path, symbol_name from entities")
      .all()
    for (const entity of entities) {
      const haystack = `${entity.file_path} ${entity.symbol_name ?? ""}`.toLowerCase()
      for (const term of terms) {
        if (haystack.includes(term.term.toLowerCase())) {
          insert.run(
            entity.entity_id,
            term.term,
            entity.symbol_name === term.term ? 1 : 0.75,
            matchedAt,
          )
          count += 1
        }
      }
    }
  } finally {
    registry.close()
  }
  return count
}

type GlossaryImportRow = {
  readonly replaced_rows: number
  readonly imported_at: string
}

function emptyReconciliation(): GlossaryReconciliationSummary {
  return {
    term_count: 0,
    entity_match_count: 0,
    unmatched_entities: 0,
    replaced_rows: 0,
    last_imported_at: null,
    entity_matches: [],
  }
}

function readLatestImport(db: Database): GlossaryImportRow | null {
  return db
    .query<GlossaryImportRow, []>(
      `select replaced_rows, imported_at
       from glossary_imports
       order by imported_at desc
       limit 1`,
    )
    .get()
}

function readTermRows(db: Database): readonly GlossaryTermRecord[] {
  return db
    .query<GlossaryTermRecord, []>(
      `select term, meaning, source_upload_id, imported_at
       from glossary_terms
       order by term`,
    )
    .all()
}

function readEntityMatches(db: Database): readonly GlossaryEntityMatchRecord[] {
  return db
    .query<GlossaryEntityMatchRecord, []>(
      `select entity_id, glossary_type, glossary_key, confidence, matched_at
       from entity_glossary_matches
       order by entity_id, glossary_key`,
    )
    .all()
}

function readEntityCount(registryDb: string): number {
  const db = new Database(registryDb, { readonly: true })
  try {
    return (
      db.query<{ readonly count: number }, []>("select count(*) as count from entities").get()
        ?.count ?? 0
    )
  } finally {
    db.close()
  }
}
