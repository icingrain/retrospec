import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import {
  readAnalysisLaunchSettings,
  writeAnalysisLaunchSettings,
} from "../src/analysis-launch-settings"
import { projectPaths } from "../src/paths"
import { surveySourceTree } from "../src/retro/survey"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeRetroManifest,
  writeSampleProject,
} from "./phase3-helpers"

describe("Phase 15 analysis launch controls", () => {
  test("Given launch controls When settings are saved Then excludes and execution size are normalized", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    const saved = await writeAnalysisLaunchSettings(paths, {
      scope: { mode: "partial", roots: ["src/native"] },
      excludeFolders: ["generated", "logs/"],
      excludeExtensions: ["ts", ".tsx"],
      batchSize: 25,
      workerCount: 3,
    })

    expect(saved).toMatchObject({
      scope: { mode: "partial", roots: ["src/native"] },
      excludeFolders: ["generated", "logs"],
      excludeExtensions: [".ts", ".tsx"],
      batchSize: 25,
      workerCount: 3,
    })
    expect(await readAnalysisLaunchSettings(paths)).toMatchObject(saved)
  })

  test("Given unsafe launch controls When settings are saved Then project-relative bounds are enforced", async () => {
    const paths = projectPaths(await tempProject())

    await expect(
      writeAnalysisLaunchSettings(paths, {
        scope: { mode: "full", roots: [] },
        excludeFolders: ["../outside"],
        excludeExtensions: ["ts"],
        batchSize: 25,
        workerCount: 3,
      }),
    ).rejects.toThrow("exclude folders must stay inside the project")
  })

  test("Given exclude controls When source tree is surveyed Then excluded folders and extensions are omitted", async () => {
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await writeFile(
      join(projectRoot, "src", "native", "ignored.ts"),
      "export const ignored = true\n",
    )

    const survey = await surveySourceTree(
      projectRoot,
      { mode: "full", roots: [] },
      {
        excludeFolders: ["src/main"],
        excludeExtensions: [".ts"],
      },
    )

    expect(survey.files.map((file) => file.relativePath)).toEqual(["src/native/order.c"])
  })

  test("Given source folders When analysis settings page opens Then exclude and execution controls are visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky
      .get("dashboard/analysis/settings", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain('name="exclude_folders"')
    expect(html).toContain('name="exclude_extensions"')
    expect(html).toContain('name="batch_size"')
    expect(html).toContain('name="worker_count"')
    stopDaemons()
  })

  test("Given launch settings When job is submitted Then execution controls are recorded in the ledger", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const manifestPath = await writeRetroManifest(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "structure",
          manifest_path: manifestPath,
          launch_settings: {
            scope: { mode: "full", roots: [] },
            exclude_folders: ["src/main"],
            exclude_extensions: [".tsx"],
            batch_size: 10,
            worker_count: 2,
          },
        },
      })
      .json<{ readonly job_id: string }>()

    const detail = await ky
      .get(`jobs/${submitted.job_id}`, {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
      })
      .json<{ readonly ledger: readonly { readonly payload: string }[] }>()

    expect(detail.ledger.map((event) => event.payload).join("\n")).toContain('"worker_count":2')
    expect(detail.ledger.map((event) => event.payload).join("\n")).toContain(
      '"exclude_folders":["src/main"]',
    )
    stopDaemons()
  })
})
