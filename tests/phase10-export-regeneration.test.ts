import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { generateRetroExports, regenerateRetroExports } from "../src/exports"
import { projectPaths } from "../src/paths"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 10 export regeneration", () => {
  test("Given an export manifest When exports are regenerated Then the same manifest entries are rewritten", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot, "before")
    await generateRetroExports(paths, { format: "csv" })
    await rm(join(paths.exportsDir, "structure.csv"))
    await seedRetroDbs(projectRoot, "after")

    const regenerated = await regenerateRetroExports(paths)

    const structureCsv = await readFile(join(paths.exportsDir, "structure.csv"), "utf8")
    expect(regenerated.map((file) => file.file_name)).toContain("structure.csv")
    expect(structureCsv).toContain("src/after.ts")
  })

  test("Given generated exports When regenerate API is called Then exports are available through the daemon surface", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot, "api")
    await generateRetroExports(paths, { format: "csv" })
    await rm(join(paths.exportsDir, "symbols.csv"))
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .post("exports/regenerate", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { project_path: projectRoot },
      })
      .json<{ readonly exports: readonly { readonly file_name: string }[] }>()

    expect(response.exports.map((file) => file.file_name)).toContain("symbols.csv")
    expect(await readFile(join(paths.exportsDir, "symbols.csv"), "utf8")).toContain("createOrder")
  })

  test("Given retro databases When generate API is called for xlsx Then xlsx exports are available through the daemon surface", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await seedRetroDbs(projectRoot, "xlsx-api")
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .post("exports/generate", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { project_path: projectRoot, format: "xlsx" },
      })
      .json<{ readonly exports: readonly { readonly file_name: string }[] }>()

    expect(response.exports.map((file) => file.file_name)).toContain("structure.xlsx")
    expect(response.exports.map((file) => file.file_name)).toContain("symbols.xlsx")
    expect(await readFile(join(paths.exportsDir, "manifest.json"), "utf8")).toContain(
      "structure.xlsx",
    )
  })
})

async function seedRetroDbs(projectRoot: string, suffix: string): Promise<void> {
  const retroDir = join(projectRoot, ".retrospec", "retro")
  await mkdir(retroDir, { recursive: true })

  const structureDb = new Database(join(retroDir, "structure.db"), { create: true })
  const symbolsDb = new Database(join(retroDir, "symbols.db"), { create: true })
  try {
    structureDb.exec("drop table if exists files")
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
      .run("file_1", `src/${suffix}.ts`, "typescript", 42, 1200, "order")

    symbolsDb.exec("drop table if exists symbols")
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
        `src/${suffix}.ts`,
      )
  } finally {
    structureDb.close()
    symbolsDb.close()
  }
}
