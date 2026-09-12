import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { importStagedGlossaryCsv, readGlossaryTerms } from "../src/glossary"
import { projectPaths } from "../src/paths"
import { stageGlossaryUpload } from "../src/uploads"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 10 glossary import MVP", () => {
  test("Given a staged glossary CSV When it is imported Then glossary DB stores dictionary rows", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    const staged = await stageGlossaryUpload(
      paths,
      new File(["term,meaning\nOrder,Customer order\nInvoice,Billing document\n"], "glossary.csv"),
    )

    const imported = await importStagedGlossaryCsv(paths, { uploadId: staged.upload_id })
    const terms = readGlossaryTerms(paths)

    expect(imported).toMatchObject({ upload_id: staged.upload_id, imported_rows: 2 })
    expect(terms.map((term) => term.term)).toEqual(["Order", "Invoice"])
    expect(terms[0]).toMatchObject({
      meaning: "Customer order",
      source_upload_id: staged.upload_id,
    })

    const db = new Database(paths.glossaryDb, { readonly: true })
    try {
      const count = db
        .query<{ readonly count: number }, []>("select count(*) as count from glossary_terms")
        .get()
      expect(count?.count).toBe(2)
    } finally {
      db.close()
    }
  })

  test("Given a staged glossary upload When import API is called Then imported rows can be queried", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const formData = new FormData()
    formData.append("project_path", projectRoot)
    formData.append("file", new File(["term,meaning\nOrder,Customer order\n"], "glossary.csv"))
    const staged = await ky
      .post("uploads/glossary", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        body: formData,
      })
      .json<{ readonly upload_id: string }>()

    const imported = await ky
      .post("glossary/import", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { project_path: projectRoot, upload_id: staged.upload_id },
      })
      .json<{ readonly imported_rows: number }>()
    const queried = await ky
      .get("glossary/imports", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{ readonly terms: readonly { readonly term: string; readonly meaning: string }[] }>()

    expect(imported.imported_rows).toBe(1)
    expect(queried.terms).toContainEqual(
      expect.objectContaining({ term: "Order", meaning: "Customer order" }),
    )
  })
})
