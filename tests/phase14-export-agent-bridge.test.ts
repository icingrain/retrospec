import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { runtimePaths } from "../src/paths"
import type { RuntimePaths } from "../src/types"

const daemons: DaemonServer[] = []

afterEach(() => {
  for (const daemon of daemons.splice(0)) {
    daemon.stop()
  }
})

async function tempRuntime(): Promise<RuntimePaths> {
  return runtimePaths(await mkdtemp(join(tmpdir(), "retrospec-runtime-")))
}

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "retrospec-project-"))
}

async function runCli(
  runtime: RuntimePaths,
  args: readonly string[],
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  const processHandle = Bun.spawn([process.execPath, "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, RETROSPEC_HOME: runtime.homeDir },
    stdout: "pipe",
  })

  const [stdout, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    processHandle.exited,
  ])

  return { exitCode, stdout }
}

async function seedRetroExportDbs(projectRoot: string): Promise<void> {
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
      .run("file_1", "src/export-cli.ts", "typescript", 24, 640, "export-cli")

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
        "exportViaCli",
        "exportViaCli(): void",
        3,
        9,
        "exported",
        "src/export-cli.ts",
      )
  } finally {
    structureDb.close()
    symbolsDb.close()
  }
}

describe("Phase 14 export agent bridge", () => {
  test("Given retro databases When exports generate runs Then agent-readable xlsx exports are created", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    daemons.push(await startDaemon(runtime))
    await seedRetroExportDbs(projectRoot)

    const result = await runCli(runtime, [
      "exports",
      "generate",
      "--project",
      projectRoot,
      "--format",
      "xlsx",
      "--json",
    ])
    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.exports.map((file: { readonly file_name: string }) => file.file_name)).toContain(
      "structure.xlsx",
    )
    expect(parsed.exports.map((file: { readonly file_name: string }) => file.file_name)).toContain(
      "symbols.xlsx",
    )
    expect(
      await readFile(join(projectRoot, ".retrospec", "exports", "manifest.json"), "utf8"),
    ).toContain("symbols.xlsx")
  })
})
