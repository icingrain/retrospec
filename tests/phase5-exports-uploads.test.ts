import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase 5 exports and uploads", () => {
  test("Given a selected project When dashboard overview is opened Then exports and glossary pages are linked", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl }).text()

    expect(html).toContain("Open glossary")
    expect(html).toContain("Open exports")
    expect(html).toContain(`/dashboard/uploads?project_path=${encodeURIComponent(projectRoot)}`)
    expect(html).toContain(`/dashboard/exports?project_path=${encodeURIComponent(projectRoot)}`)
    expect(html).not.toContain('href="#"')
  })

  test("Given an export file When exports API and dashboard are opened Then the file can be downloaded", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const exportsDir = join(projectRoot, ".retrospec", "exports")
    await mkdir(exportsDir, { recursive: true })
    await writeFile(
      join(exportsDir, "legacy-symbols-20260720.csv"),
      "entity_id,name\nent_1,OrderService\n",
    )

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const listed = await ky
      .get("exports", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{
        readonly exports: readonly [
          {
            readonly file_id: string
            readonly file_name: string
            readonly format: string
            readonly download_url: string
          },
        ]
      }>()
    const file = listed.exports[0]

    const pageHtml = await ky
      .get("dashboard/exports", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()
    const downloaded = await ky
      .get(file.download_url.replace(/^\//, ""), {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .text()
    const browserDownloaded = await ky
      .get(file.download_url.replace(/^\//, ""), { prefixUrl: endpoint.baseUrl })
      .text()

    expect(file.file_id).toBe("legacy-symbols-20260720")
    expect(file.file_name).toBe("legacy-symbols-20260720.csv")
    expect(file.format).toBe("csv")
    expect(file.download_url).toBe("/exports/legacy-symbols-20260720/download")
    expect(pageHtml).toContain("Download generated exports")
    expect(pageHtml).toContain("legacy-symbols-20260720.csv")
    expect(downloaded).toContain("ent_1,OrderService")
    expect(browserDownloaded).toContain("ent_1,OrderService")
  })

  test("Given a glossary csv upload When uploads API is posted Then file is staged under project uploads", async () => {
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
      .json<{ readonly upload_id: string; readonly status: string; readonly stored_path: string }>()
    const stored = await readFile(join(projectRoot, staged.stored_path), "utf8")
    const pageHtml = await ky
      .get("dashboard/uploads", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(staged.upload_id).toStartWith("upl_")
    expect(staged.status).toBe("staged")
    expect(staged.stored_path).toMatch(/^\.retrospec\/uploads\/upl_.*\/source\.csv$/)
    expect(stored).toContain("Order,Customer order")
    expect(pageHtml).toContain("Stage glossary context files")
    expect(pageHtml).toContain('class="upload-form"')
    expect(pageHtml).toContain('accept=".csv,.xlsx"')
    expect(pageHtml).toContain("POST /uploads/glossary")
  })
})
