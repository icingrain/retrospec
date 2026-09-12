import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fullAnalysisScope, normalizeAnalysisScope } from "../analysis-scope"
import { projectPaths } from "../paths"
import { ensureProjectRegistry } from "../registry"
import { ensureRetroCategoryStore } from "../retro-schema"
import type { ProjectPaths, RetroInventory } from "../types"
import {
  type RetroEvidenceMetadata,
  type RetroRunMetadata,
  createRetroRunMetadata,
  writeReadyHandoff,
  writeRetroRun,
} from "./handoff"

const inventoryEvidence: RetroEvidenceMetadata = {
  parserBackend: "mixed-parser-substrate",
  supportLevel: "best-effort",
  evidenceLabel: "INFERRED",
  missingCapability: null,
  coverageSummaryJson: "{}",
}

export async function writeRetroInventory(
  projectRoot: string,
  inventory: RetroInventory,
): Promise<void> {
  const paths = projectPaths(projectRoot)
  const scope = normalizeAnalysisScope(inventory.analysisScope ?? fullAnalysisScope)
  const run = createRetroRunMetadata(inventory.sourceFingerprint, scope)
  await ensureProjectRegistry(paths)
  await mkdir(join(paths.stateDir, "retro"), { recursive: true })
  writeStructureDb(paths, inventory, run)
  writeSymbolsDb(paths, inventory, run)
  if (scope.mode === "full") {
    writeRegistry(paths, inventory, run)
  }
}

function writeStructureDb(
  paths: ProjectPaths,
  inventory: RetroInventory,
  run: RetroRunMetadata,
): void {
  ensureRetroCategoryStore(paths, "structure")
  const dbPath = join(paths.stateDir, "retro", "structure.db")
  const db = new Database(dbPath, { create: true })
  try {
    writeRetroRun(db, {
      category: "structure",
      sourceRoot: paths.projectRoot,
      run,
      evidence: evidenceForInventory(inventory),
    })
    if (run.analysisScope.mode === "full") {
      db.exec(
        "delete from files where retro_run_id in (select retro_run_id from retro_runs where scope_mode = 'full')",
      )
    }
    const insert = db.query(
      `insert or replace into files
       (entity_id, retro_run_id, file_path, language, loc, size_bytes, module_name, content_hash,
        parser_backend, parser_mode, evidence_label, support_level, missing_capability)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const file of inventory.files) {
      const evidence = file.evidence ?? defaultRowEvidence()
      insert.run(
        file.entity_id,
        run.runId,
        file.file_path,
        file.language,
        file.loc,
        file.size_bytes,
        file.module_name,
        file.content_hash,
        evidence.parserBackend,
        evidence.parserMode,
        evidence.evidenceLabel,
        evidence.supportLevel,
        evidence.missingCapability,
      )
    }
  } finally {
    db.close()
  }
}

function writeSymbolsDb(
  paths: ProjectPaths,
  inventory: RetroInventory,
  run: RetroRunMetadata,
): void {
  ensureRetroCategoryStore(paths, "symbols")
  const dbPath = join(paths.stateDir, "retro", "symbols.db")
  const db = new Database(dbPath, { create: true })
  try {
    writeRetroRun(db, {
      category: "symbols",
      sourceRoot: paths.projectRoot,
      run,
      evidence: evidenceForInventory(inventory),
    })
    if (run.analysisScope.mode === "full") {
      db.exec(
        "delete from symbols where retro_run_id in (select retro_run_id from retro_runs where scope_mode = 'full')",
      )
    }
    const insert = db.query(
      `insert or replace into symbols
       (entity_id, retro_run_id, parent_entity_id, symbol_type, name, signature, start_line, end_line,
        visibility, file_path, parser_backend, parser_mode, evidence_label, support_level, missing_capability)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const symbol of inventory.symbols) {
      const evidence = symbol.evidence ?? defaultRowEvidence()
      insert.run(
        symbol.entity_id,
        run.runId,
        symbol.parent_entity_id,
        symbol.symbol_type,
        symbol.name,
        symbol.signature,
        symbol.start_line,
        symbol.end_line,
        symbol.visibility,
        symbol.file_path,
        evidence.parserBackend,
        evidence.parserMode,
        evidence.evidenceLabel,
        evidence.supportLevel,
        evidence.missingCapability,
      )
    }
  } finally {
    db.close()
  }
}

function writeRegistry(
  paths: ProjectPaths,
  inventory: RetroInventory,
  run: RetroRunMetadata,
): void {
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.exec("delete from entities where source_category in ('structure', 'symbols')")
    const entityInsert = db.query(
      `insert into entities
       (entity_id, entity_type, file_path, symbol_name, signature, source_category, content_hash,
        start_line, end_line, evidence_label, parser_backend, parser_mode, support_level, missing_capability,
        created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(entity_id) do update set updated_at = excluded.updated_at`,
    )
    for (const file of inventory.files) {
      const evidence = file.evidence ?? defaultRowEvidence()
      entityInsert.run(
        file.entity_id,
        "file",
        file.file_path,
        null,
        null,
        "structure",
        file.content_hash,
        null,
        null,
        evidence.evidenceLabel,
        evidence.parserBackend,
        evidence.parserMode,
        evidence.supportLevel,
        evidence.missingCapability,
        run.now,
        run.now,
      )
    }
    for (const symbol of inventory.symbols) {
      const evidence = symbol.evidence ?? defaultRowEvidence()
      entityInsert.run(
        symbol.entity_id,
        symbol.symbol_type,
        symbol.file_path,
        symbol.name,
        symbol.signature,
        "symbols",
        null,
        symbol.start_line,
        symbol.end_line,
        evidence.evidenceLabel,
        evidence.parserBackend,
        evidence.parserMode,
        evidence.supportLevel,
        evidence.missingCapability,
        run.now,
        run.now,
      )
    }

    writeReadyHandoff(db, {
      category: "structure",
      entityCount: inventory.files.length,
      run,
      evidence: evidenceForInventory(inventory),
    })
    writeReadyHandoff(db, {
      category: "symbols",
      entityCount: inventory.symbols.length,
      run,
      evidence: evidenceForInventory(inventory),
    })
  } finally {
    db.close()
  }
}

function evidenceForInventory(inventory: RetroInventory): RetroEvidenceMetadata {
  return {
    ...inventoryEvidence,
    coverageSummaryJson: inventory.coverageSummaryJson ?? inventoryEvidence.coverageSummaryJson,
  }
}

function defaultRowEvidence() {
  return {
    parserBackend: "builtin-regex",
    parserMode: "regex" as const,
    supportLevel: "high-confidence" as const,
    evidenceLabel: "EXTRACTED" as const,
    missingCapability: null,
  }
}
