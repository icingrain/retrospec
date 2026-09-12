import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { renderDashboardExportsPage } from "../src/dashboard-exports"
import type { ExportManifest } from "../src/export-manifest"
import { RetroExportError, generateRetroExports, listExportFiles } from "../src/exports"
import { projectPaths } from "../src/paths"
import { tempProject } from "./phase3-helpers"
import { listZipCentralDirectoryEntryNames, zipSignature } from "./zip-helpers"

describe("Phase 6 retro exports", () => {
  test("Given structure and symbols DBs When CSV export generation runs Then category CSV files contain headers and rows", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot)

    await generateRetroExports(paths, { format: "csv" })

    const structureCsv = await readFile(join(paths.exportsDir, "structure.csv"), "utf8")
    const symbolsCsv = await readFile(join(paths.exportsDir, "symbols.csv"), "utf8")

    expect(structureCsv).toBe(
      "entity_id,file_path,language,loc,size_bytes,module_name\n" +
        "file_1,src/order.ts,typescript,42,1200,order\n",
    )
    expect(symbolsCsv).toBe(
      "entity_id,parent_entity_id,symbol_type,name,signature,start_line,end_line,visibility,file_path\n" +
        "sym_1,file_1,function,createOrder,createOrder(id: string),4,12,exported,src/order.ts\n",
    )
  })

  test("Given structure and symbols DBs When XLSX export generation runs Then OOXML zip files are listed", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot)

    await generateRetroExports(paths, { format: "xlsx" })

    const structureWorkbook = await Bun.file(join(paths.exportsDir, "structure.xlsx")).arrayBuffer()
    const symbolsWorkbook = await Bun.file(join(paths.exportsDir, "symbols.xlsx")).arrayBuffer()
    const listed = await listExportFiles(paths)
    const structureBytes = new Uint8Array(structureWorkbook)
    const symbolsBytes = new Uint8Array(symbolsWorkbook)
    const structureEntries = listZipCentralDirectoryEntryNames(structureBytes)
    const symbolsEntries = listZipCentralDirectoryEntryNames(symbolsBytes)

    expect(zipSignature(structureBytes)).toBe("PK")
    expect(zipSignature(symbolsBytes)).toBe("PK")
    expect(structureEntries).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ])
    expect(symbolsEntries).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ])
    expect(listed.map((file) => file.format)).toContain("xlsx")
    expect(listed.map((file) => file.file_name)).toContain("structure.xlsx")
    expect(listed.map((file) => file.file_name)).toContain("symbols.xlsx")
  })

  test("Given registry workflow handoffs When CSV export generation runs Then manifest and listing record source metadata", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot)
    await seedWorkflowHandoffs(projectRoot)

    const listed = await generateRetroExports(paths, { format: "csv" })

    const manifest = await readExportManifest(paths.exportsDir)
    const structure = listed.find((file) => file.file_name === "structure.csv")
    const symbols = listed.find((file) => file.file_name === "symbols.csv")

    expect(manifest.manifest_version).toBe(1)
    expect(manifest.export_types).toEqual(["csv", "xlsx", "markdown-tree"])
    expect(manifest.markdown_sot_directory).toBe(".retrospec/exports/sot-md")
    expect(manifest.files).toEqual([
      {
        file_name: "structure.csv",
        format: "csv",
        category: "structure",
        input_db_paths: [".retrospec/retro/structure.db"],
        source_fingerprint: "structure-fingerprint-123",
        analysis_run_id: null,
      },
      {
        file_name: "symbols.csv",
        format: "csv",
        category: "symbols",
        input_db_paths: [".retrospec/retro/symbols.db"],
        source_fingerprint: "symbols-fingerprint-456",
        analysis_run_id: null,
      },
    ])
    expect(structure?.category).toBe("structure")
    expect(structure?.input_db_paths).toEqual([".retrospec/retro/structure.db"])
    expect(structure?.source_fingerprint).toBe("structure-fingerprint-123")
    expect(structure?.analysis_run_id).toBeNull()
    expect(symbols?.category).toBe("symbols")
    expect(symbols?.source_fingerprint).toBe("symbols-fingerprint-456")
  })

  test("Given CSV export generation When Phase 6 manifest is written Then Markdown SOT projection convention is reserved", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot)

    await generateRetroExports(paths, { format: "csv" })

    const manifest = await readExportManifest(paths.exportsDir)
    const sotEntries = await readdir(join(paths.exportsDir, "sot-md"))

    expect(manifest.export_types).toEqual(["csv", "xlsx", "markdown-tree"])
    expect(manifest.markdown_sot_directory).toBe(".retrospec/exports/sot-md")
    expect(sotEntries).toEqual([])
  })

  test("Given exports with manifest metadata When dashboard exports page renders Then metadata is visible", () => {
    const html = renderDashboardExportsPage({
      selectedProjectPath: "/tmp/retrospec-demo",
      exports: [
        {
          file_id: "structure",
          file_name: "structure.csv",
          format: "csv",
          size_bytes: 120,
          created_at: "2026-07-26T00:00:00.000Z",
          download_url: "/exports/structure/download",
          category: "structure",
          input_db_paths: [".retrospec/retro/structure.db"],
          source_fingerprint: "structure-fingerprint-123",
          analysis_run_id: "run_dashboard_1",
        },
      ],
    })

    expect(html).toContain("Category")
    expect(html).toContain("structure")
    expect(html).toContain("Source fingerprint")
    expect(html).toContain("structure-fingerprint-123")
    expect(html).toContain("Analysis run")
    expect(html).toContain("run_dashboard_1")
  })

  test("Given missing retro DBs When export generation runs Then a typed clear failure is raised", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    const action = generateRetroExports(paths, { format: "csv" })

    await expect(action).rejects.toThrow(RetroExportError)
    await expect(action).rejects.toThrow("missing retro database")
  })

  test("Given malformed retro DBs When export generation runs Then a typed clear failure is raised", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    const retroDir = join(projectRoot, ".retrospec", "retro")
    await mkdir(retroDir, { recursive: true })
    new Database(join(retroDir, "structure.db"), { create: true }).close()
    new Database(join(retroDir, "symbols.db"), { create: true }).close()

    const action = generateRetroExports(paths, { format: "csv" })

    await expect(action).rejects.toThrow(RetroExportError)
    await expect(action).rejects.toThrow("malformed retro database")
  })
})

async function readExportManifest(exportsDir: string): Promise<ExportManifest> {
  return JSON.parse(await readFile(join(exportsDir, "manifest.json"), "utf8"))
}

async function seedRetroDbs(projectRoot: string): Promise<void> {
  const retroDir = join(projectRoot, ".retrospec", "retro")
  await mkdir(retroDir, { recursive: true })

  const structureDb = new Database(join(retroDir, "structure.db"), { create: true })
  const symbolsDb = new Database(join(retroDir, "symbols.db"), { create: true })
  try {
    structureDb.exec(`
      create table files (
        entity_id text primary key,
        file_path text not null,
        language text not null,
        loc integer not null,
        size_bytes integer not null,
        module_name text
      );
    `)
    structureDb
      .query(
        `insert into files (entity_id, file_path, language, loc, size_bytes, module_name)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run("file_1", "src/order.ts", "typescript", 42, 1200, "order")

    symbolsDb.exec(`
      create table symbols (
        entity_id text primary key,
        parent_entity_id text,
        symbol_type text not null,
        name text not null,
        signature text,
        start_line integer not null,
        end_line integer not null,
        visibility text,
        file_path text not null
      );
    `)
    symbolsDb
      .query(
        `insert into symbols
         (entity_id, parent_entity_id, symbol_type, name, signature, start_line, end_line, visibility, file_path)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "sym_1",
        "file_1",
        "function",
        "createOrder",
        "createOrder(id: string)",
        4,
        12,
        "exported",
        "src/order.ts",
      )
  } finally {
    structureDb.close()
    symbolsDb.close()
  }
}

async function seedWorkflowHandoffs(projectRoot: string): Promise<void> {
  const paths = projectPaths(projectRoot)
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.exec(`
      create table workflow_handoff (
        category text primary key,
        status text not null,
        completed_at text,
        entity_count integer not null,
        retro_run_id text not null,
        source_fingerprint text not null,
        error_message text,
        updated_at text not null
      );
      insert into workflow_handoff
      (category, status, completed_at, entity_count, retro_run_id, source_fingerprint, error_message, updated_at)
      values
      ('structure', 'ready_for_analysis', '2026-07-26T00:00:00.000Z', 1, 'rrun_structure', 'structure-fingerprint-123', null, '2026-07-26T00:00:00.000Z'),
      ('symbols', 'ready_for_analysis', '2026-07-26T00:00:00.000Z', 1, 'rrun_symbols', 'symbols-fingerprint-456', null, '2026-07-26T00:00:00.000Z');
    `)
  } finally {
    db.close()
  }
}
