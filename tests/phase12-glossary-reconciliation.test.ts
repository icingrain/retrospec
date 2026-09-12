import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { generateRetroExports, listExportFiles } from "../src/exports"
import {
  importStagedGlossaryCsv,
  readGlossaryReconciliation,
  readGlossaryTerms,
} from "../src/glossary"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { buildSpecBatchInput } from "../src/spec/input"
import { stageGlossaryUpload } from "../src/uploads"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 12 glossary reconciliation", () => {
  test("Given reduced parser coverage When spec input is built Then preflight marks analysis as limited", async () => {
    const projectRoot = await tempProject()
    await writeGenericAstProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)

    const specInput = await buildSpecBatchInput(paths, ["structure", "symbols"])

    expect(JSON.stringify(specInput.handoffs)).not.toContain("coverageSummaryJson")
    expect(specInput.preflight).toMatchObject({
      status: "limited",
      reviewNeeded: true,
      coverageLanguages: ["typescript"],
      coverageModes: ["generic_ast"],
      parserModes: [{ value: "generic_ast", count: 2 }],
      supportLevels: [{ value: "best-effort", count: 2 }],
      evidenceLabels: [{ value: "INFERRED", count: 2 }],
      missingCapabilities: ["language-specific-reference-pack"],
    })
    expect(specInput.preflight.notes.join(" ")).toContain("reduced parser coverage")
  })

  test("Given glossary reupload When imported Then dictionary conflicts and entity matches are regenerated", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const firstUpload = await stageGlossaryUpload(
      paths,
      new File(["term,meaning\nOrder,Customer order\n"], "glossary.csv"),
    )
    const secondUpload = await stageGlossaryUpload(
      paths,
      new File(
        ["term,meaning\nOrder,Updated order context\nInvoice,Billing document\n"],
        "glossary.csv",
      ),
    )

    await importStagedGlossaryCsv(paths, { uploadId: firstUpload.upload_id })
    const imported = await importStagedGlossaryCsv(paths, { uploadId: secondUpload.upload_id })
    const terms = readGlossaryTerms(paths)
    const reconciliation = readGlossaryReconciliation(paths)
    const specInput = await buildSpecBatchInput(paths, ["structure", "symbols"])

    expect(imported).toMatchObject({
      upload_id: secondUpload.upload_id,
      imported_rows: 2,
      replaced_rows: 1,
      glossary_matches: expect.any(Number),
    })
    expect(terms.find((term) => term.term === "Order")).toMatchObject({
      meaning: "Updated order context",
      source_upload_id: secondUpload.upload_id,
    })
    expect(reconciliation).toMatchObject({
      term_count: 2,
      replaced_rows: 1,
      unmatched_entities: expect.any(Number),
    })
    expect(reconciliation.entity_matches.length).toBeGreaterThan(0)
    expect(specInput.glossaryMatches).toEqual(
      reconciliation.entity_matches.map((match) => ({
        entityId: match.entity_id,
        glossaryType: match.glossary_type,
        glossaryKey: match.glossary_key,
        confidence: match.confidence,
      })),
    )
    expect(specInput.memoryNotes).toEqual([])

    const db = new Database(paths.glossaryDb, { readonly: true })
    try {
      expect(
        db
          .query<{ readonly count: number }, []>(
            "select count(*) as count from entity_glossary_matches",
          )
          .get(),
      ).toEqual({ count: reconciliation.entity_matches.length })
    } finally {
      db.close()
    }
  })

  test("Given reconciled glossary When API dashboard and exports are used Then reconciliation state is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)
    const staged = await stageGlossaryUpload(
      paths,
      new File(["term,meaning\nOrder,Customer order\n"], "glossary.csv"),
    )

    const imported = await ky
      .post("glossary/import", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { project_path: projectRoot, upload_id: staged.upload_id },
      })
      .json<{ readonly glossary_matches: number }>()
    const glossary = await ky
      .get("glossary/imports", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{
        readonly reconciliation: {
          readonly term_count: number
          readonly entity_matches: readonly unknown[]
        }
      }>()
    const pageHtml = await ky
      .get("dashboard/uploads", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    await generateRetroExports(paths, { format: "csv" })
    const exports = await listExportFiles(paths)

    expect(imported.glossary_matches).toBeGreaterThan(0)
    expect(glossary.reconciliation.term_count).toBe(1)
    expect(glossary.reconciliation.entity_matches.length).toBe(imported.glossary_matches)
    expect(pageHtml).toContain("Glossary reconciliation")
    expect(pageHtml).toContain("Matched entities")
    expect(exports[0]?.glossary_reconciliation).toMatchObject({ term_count: 1 })
  })
})

async function writeGenericAstProject(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, "src"), { recursive: true })
  await writeFile(join(projectRoot, "src", "service.ts"), "export const loadUser = () => 1\n")
}
