import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { bootstrapProjectRegistry } from "../src/registry"
import { ensureRetroCategoryStores } from "../src/retro-schema"
import {
  createRetroRunMetadata,
  writeIncompleteHandoff,
  writeReadyHandoff,
} from "../src/retro/handoff"
import { writeRetroInventory } from "../src/retro/store"
import { tempProject } from "./phase3-helpers"
import {
  type HandoffStatusRow,
  columns,
  notNullColumns,
  pathExists,
  seedOldCallGraphDb,
  seedOldStructureDb,
  upgradeCallGraph,
  upgradeInventory,
} from "./phase8-retro-schema-fixtures"

describe("Phase 8 retro DB schema contract", () => {
  test("Given a new project When retro category stores bootstrap Then every category DB exposes the agreed tables and columns", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await ensureRetroCategoryStores(paths)

    expect(columns(join(paths.stateDir, "retro", "structure.db"), "files")).toEqual([
      "entity_id",
      "retro_run_id",
      "file_path",
      "language",
      "loc",
      "size_bytes",
      "module_name",
      "content_hash",
      "parser_backend",
      "parser_mode",
      "evidence_label",
      "support_level",
      "missing_capability",
    ])
    expect(columns(join(paths.stateDir, "retro", "symbols.db"), "symbols")).toContain(
      "parser_backend",
    )
    expect(columns(join(paths.stateDir, "retro", "call_graph.db"), "calls")).toEqual([
      "call_id",
      "retro_run_id",
      "caller_entity_id",
      "callee_entity_id",
      "callee_name",
      "file_path",
      "line",
      "confidence",
      "confidence_label",
      "evidence_label",
      "parser_backend",
      "resolution_status",
      "reason",
    ])
    expect(columns(join(paths.stateDir, "retro", "dependency.db"), "dependencies")).toContain(
      "dependency_type",
    )
    expect(columns(join(paths.stateDir, "retro", "sql.db"), "sql_units")).toContain(
      "statement_text",
    )
    expect(columns(join(paths.stateDir, "retro", "sql.db"), "sql_tables")).toContain("object_name")
    expect(columns(join(paths.stateDir, "retro", "sql.db"), "sql_columns")).toContain("column_name")
    expect(columns(join(paths.stateDir, "retro", "complexity.db"), "complexity_metrics")).toEqual([
      "metric_id",
      "retro_run_id",
      "entity_id",
      "entity_source_category",
      "file_path",
      "symbol_name",
      "metric_scope",
      "start_line",
      "end_line",
      "loc",
      "cyclomatic_complexity",
      "cognitive_complexity",
      "branch_count",
      "nesting_depth",
      "confidence",
      "evidence_label",
      "parser_backend",
      "reason",
    ])
    expect(
      notNullColumns(join(paths.stateDir, "retro", "complexity.db"), "complexity_metrics"),
    ).toEqual(expect.arrayContaining(["entity_id", "entity_source_category"]))
    expect(columns(join(paths.stateDir, "retro", "security.db"), "security_findings")).toContain(
      "severity",
    )
    expect(columns(join(paths.stateDir, "retro", "data_flow.db"), "data_flows")).toContain(
      "path_json",
    )
    expect(columns(join(paths.stateDir, "retro", "other.db"), "fallback_evidence")).toContain(
      "fallback_id",
    )
  })

  test("Given a new registry When bootstrap runs Then workflow handoff stores parser coverage metadata", async () => {
    const paths = projectPaths(await tempProject())

    bootstrapProjectRegistry(paths)

    expect(columns(paths.registryDb, "workflow_handoff")).toEqual([
      "category",
      "status",
      "completed_at",
      "entity_count",
      "retro_run_id",
      "source_fingerprint",
      "parser_backend",
      "support_level",
      "evidence_label",
      "missing_capability",
      "coverage_summary_json",
      "error_message",
      "updated_at",
    ])
  })

  test("Given ready and incomplete handoffs When writers run Then parser coverage metadata is persisted", async () => {
    const paths = projectPaths(await tempProject())
    bootstrapProjectRegistry(paths)
    const db = new Database(paths.registryDb, { create: true })
    const run = createRetroRunMetadata("phase8-fingerprint")

    try {
      writeReadyHandoff(db, {
        category: "structure",
        entityCount: 2,
        run,
        evidence: {
          parserBackend: "tree-sitter-java",
          supportLevel: "high-confidence",
          evidenceLabel: "EXTRACTED",
          missingCapability: null,
          coverageSummaryJson: '{"files":2}',
        },
      })
      writeIncompleteHandoff(db, {
        category: "complexity",
        entityCount: 1,
        run,
        evidence: {
          parserBackend: "basic",
          supportLevel: "best-effort",
          evidenceLabel: "INFERRED",
          missingCapability: "function-body-ast",
          coverageSummaryJson: '{"metrics":1}',
        },
      })

      const rows = db
        .query<HandoffStatusRow, []>(
          `select category, status, parser_backend, support_level, evidence_label,
                  missing_capability, coverage_summary_json
           from workflow_handoff
           order by category`,
        )
        .all()

      expect(rows).toEqual([
        {
          category: "complexity",
          status: "incomplete",
          parser_backend: "basic",
          support_level: "best-effort",
          evidence_label: "INFERRED",
          missing_capability: "function-body-ast",
          coverage_summary_json: '{"metrics":1}',
        },
        {
          category: "structure",
          status: "ready_for_analysis",
          parser_backend: "tree-sitter-java",
          support_level: "high-confidence",
          evidence_label: "EXTRACTED",
          missing_capability: null,
          coverage_summary_json: '{"files":2}',
        },
      ])
    } finally {
      db.close()
    }
  })

  test("Given Phase 3 shaped retro DBs When current writers run Then category stores are migrated before inserts", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedOldStructureDb(paths.stateDir)
    await seedOldCallGraphDb(paths.stateDir)

    await writeRetroInventory(projectRoot, upgradeInventory)
    await writeCallGraph(paths, upgradeCallGraph)

    expect(columns(join(paths.stateDir, "retro", "structure.db"), "files")).toContain(
      "parser_backend",
    )
    expect(columns(join(paths.stateDir, "retro", "call_graph.db"), "calls")).toContain("call_id")
  })

  test("Given a symlinked retro state path When category stores bootstrap Then writes are refused", async () => {
    const projectRoot = await tempProject()
    const outsideRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await symlink(outsideRoot, paths.stateDir)

    await expect(ensureRetroCategoryStores(paths)).rejects.toThrow(
      "refusing to write through symlink",
    )
    expect(await pathExists(join(outsideRoot, "retro"))).toBe(false)
  })

  test("Given a symlinked category DB leaf When category stores bootstrap Then writes are refused", async () => {
    const projectRoot = await tempProject()
    const outsideRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await mkdir(join(paths.stateDir, "retro"), { recursive: true })
    await symlink(join(outsideRoot, "structure.db"), join(paths.stateDir, "retro", "structure.db"))

    await expect(ensureRetroCategoryStores(paths)).rejects.toThrow(
      "refusing to write through symlink",
    )
  })
})
