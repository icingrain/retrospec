import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { analysisSchemas } from "./retro-schema-analysis"
import {
  RETRO_CATEGORIES,
  type RetroCategory,
  type RetroStoreSchema,
} from "./retro-schema-contract"
import { graphSchemas } from "./retro-schema-graph"
import { inventorySchemas } from "./retro-schema-inventory"
import { assertProjectStatePathSafeSync } from "./state-safety"
import type { ProjectPaths } from "./types"

type ColumnRow = {
  readonly name: string
}

const schemas: Record<RetroCategory, RetroStoreSchema> = {
  ...inventorySchemas,
  ...graphSchemas,
  ...analysisSchemas,
}

export { RETRO_CATEGORIES, type RetroCategory }

export async function ensureRetroCategoryStores(paths: ProjectPaths): Promise<void> {
  assertProjectStatePathSafeSync(paths)
  await mkdir(join(paths.stateDir, "retro"), { recursive: true })
  for (const category of RETRO_CATEGORIES) {
    ensureRetroCategoryStore(paths, category)
  }
}

export function ensureRetroCategoryStore(paths: ProjectPaths, category: RetroCategory): void {
  const schema = schemas[category]
  const dbPath = join(paths.stateDir, "retro", schema.dbName)
  assertProjectStatePathSafeSync(paths)
  mkdirSync(join(paths.stateDir, "retro"), { recursive: true })
  assertProjectStatePathSafeSync(paths, [dbPath])
  const db = new Database(dbPath, { create: true })
  try {
    db.exec(schema.sql)
    ensureMigrations(db, schema.migrations ?? [])
    migrateInventoryPrimaryKeys(db, category)
  } finally {
    db.close()
  }
}

function migrateInventoryPrimaryKeys(db: Database, category: RetroCategory): void {
  if (category === "structure") {
    migratePrimaryKey(db, "files", createFilesTableSql())
    return
  }
  if (category === "symbols") {
    migratePrimaryKey(db, "symbols", createSymbolsTableSql())
  }
}

function migratePrimaryKey(db: Database, table: string, createSql: string): void {
  const columns = db
    .query<ColumnRow & { readonly pk: number }, []>(`pragma table_info(${table})`)
    .all()
  const entityId = columns.find((column) => column.name === "entity_id")
  const runId = columns.find((column) => column.name === "retro_run_id")
  if (entityId?.pk !== 1 || runId?.pk !== 0) {
    return
  }

  db.exec(`
    alter table ${table} rename to ${table}_legacy_entity_pk;
    ${createSql}
    insert or replace into ${table}
    ${legacyInsertSelect(table)};
    drop table ${table}_legacy_entity_pk;
  `)
}

function legacyInsertSelect(table: string): string {
  if (table === "files") {
    return `
      (entity_id, retro_run_id, file_path, language, loc, size_bytes, module_name, content_hash,
       parser_backend, parser_mode, evidence_label, support_level, missing_capability)
      select entity_id, retro_run_id, file_path, language, loc, size_bytes, module_name, content_hash,
             parser_backend, parser_mode, evidence_label, support_level, missing_capability
      from files_legacy_entity_pk`
  }
  return `
    (entity_id, retro_run_id, parent_entity_id, symbol_type, name, signature, start_line, end_line,
     visibility, file_path, parser_backend, parser_mode, evidence_label, support_level, missing_capability)
    select entity_id, retro_run_id, parent_entity_id, symbol_type, name, signature, start_line, end_line,
           visibility, file_path, parser_backend, parser_mode, evidence_label, support_level, missing_capability
    from symbols_legacy_entity_pk`
}

function createFilesTableSql(): string {
  return `create table files (
    entity_id text not null,
    retro_run_id text not null,
    file_path text not null,
    language text not null,
    loc integer not null,
    size_bytes integer not null,
    module_name text,
    content_hash text not null,
    parser_backend text not null,
    parser_mode text not null check (parser_mode in ('ast', 'generic_ast', 'regex', 'config', 'partial')),
    evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
    support_level text not null check (support_level in ('high-confidence', 'best-effort', 'unsupported')),
    missing_capability text,
    primary key (retro_run_id, entity_id)
  );`
}

function createSymbolsTableSql(): string {
  return `create table symbols (
    entity_id text not null,
    retro_run_id text not null,
    parent_entity_id text,
    symbol_type text not null,
    name text not null,
    signature text,
    start_line integer not null,
    end_line integer not null,
    visibility text,
    file_path text not null,
    parser_backend text not null,
    parser_mode text not null check (parser_mode in ('ast', 'generic_ast', 'regex', 'config', 'partial')),
    evidence_label text not null check (evidence_label in ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
    support_level text not null check (support_level in ('high-confidence', 'best-effort', 'unsupported')),
    missing_capability text,
    primary key (retro_run_id, entity_id)
  );`
}

function ensureMigrations(
  db: Database,
  migrations: readonly { readonly table: string; readonly columns: readonly string[] }[],
): void {
  for (const migration of migrations) {
    const existing = new Set(
      db
        .query<ColumnRow, []>(`pragma table_info(${migration.table})`)
        .all()
        .map((column) => column.name),
    )
    for (const definition of migration.columns) {
      const columnName = definition.split(" ")[0]
      if (columnName !== undefined && !existing.has(columnName)) {
        db.exec(`alter table ${migration.table} add column ${definition}`)
      }
    }
  }
}
