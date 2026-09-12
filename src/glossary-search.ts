import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { ensureGlossaryStore } from "./glossary-reconciliation"
import type { ProjectPaths } from "./types"

export type GlossarySearchMatch = {
  readonly term: string
  readonly meaning: string
  readonly entity_id: string | null
  readonly symbol_name: string | null
  readonly confidence: number
  readonly source: "glossary_terms"
}

type TermRow = {
  readonly term: string
  readonly meaning: string
}

type EntityMatchRow = {
  readonly entity_id: string
  readonly symbol_name: string | null
  readonly confidence: number
}

export function searchGlossary(paths: ProjectPaths, term: string): readonly GlossarySearchMatch[] {
  if (!existsSync(paths.glossaryDb)) {
    return []
  }

  const db = new Database(paths.glossaryDb, { create: true })
  try {
    ensureGlossaryStore(db)
    return matchingTerms(db, term).flatMap((row) => matchesForTerm(paths, db, row))
  } finally {
    db.close()
  }
}

function matchingTerms(db: Database, query: string): readonly TermRow[] {
  const normalized = `%${query.trim().toLowerCase()}%`
  return db
    .query<TermRow, [string, string]>(
      `select term, meaning
       from glossary_terms
       where lower(term) like ? or lower(meaning) like ?
       order by term`,
    )
    .all(normalized, normalized)
}

function matchesForTerm(
  paths: ProjectPaths,
  db: Database,
  term: TermRow,
): readonly GlossarySearchMatch[] {
  const entityMatches = readEntityMatches(paths, db, term.term)
  if (entityMatches.length === 0) {
    return [toSearchMatch(term, null)]
  }
  return entityMatches.map((match) => toSearchMatch(term, match))
}

function readEntityMatches(
  paths: ProjectPaths,
  db: Database,
  term: string,
): readonly EntityMatchRow[] {
  if (!existsSync(paths.registryDb)) {
    return []
  }

  const registry = new Database(paths.registryDb, { readonly: true })
  try {
    return db
      .query<Pick<EntityMatchRow, "entity_id" | "confidence">, [string]>(
        `select entity_id, confidence
         from entity_glossary_matches
         where glossary_key = ?
         order by confidence desc, entity_id`,
      )
      .all(term)
      .map((match) => ({
        ...match,
        symbol_name: readEntitySymbolName(registry, match.entity_id),
      }))
  } finally {
    registry.close()
  }
}

function readEntitySymbolName(db: Database, entityId: string): string | null {
  return (
    db
      .query<{ readonly symbol_name: string | null }, [string]>(
        "select symbol_name from entities where entity_id = ?",
      )
      .get(entityId)?.symbol_name ?? null
  )
}

function toSearchMatch(term: TermRow, match: EntityMatchRow | null): GlossarySearchMatch {
  return {
    term: term.term,
    meaning: term.meaning,
    entity_id: match?.entity_id ?? null,
    symbol_name: match?.symbol_name ?? null,
    confidence: match?.confidence ?? 0.5,
    source: "glossary_terms",
  }
}
