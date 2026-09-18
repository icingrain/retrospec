import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import {
  readAnalysisLaunchSettings,
  writeAnalysisLaunchSettings,
} from "../src/analysis-launch-settings"
import { type ActiveJobConflictHttpError, submitJobWithDaemon } from "../src/client"
import { createJob, inspectJob, updateJob } from "../src/jobs"
import { projectPaths } from "../src/paths"
import { surveySourceTree } from "../src/retro/survey"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeRetroManifest,
  writeSampleProject,
  writeSpecManifest,
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
      specTemplate: "summary",
    })

    expect(saved).toMatchObject({
      scope: { mode: "partial", roots: ["src/native"] },
      excludeFolders: ["generated", "logs"],
      excludeExtensions: [".ts", ".tsx"],
      batchSize: 25,
      workerCount: 3,
      specTemplate: "summary",
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
    expect(html).toContain('name="spec_template" value="risk" checked')
    stopDaemons()
  })

  test("Given a saved Spec template When analysis settings page opens Then that template is selected", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await writeAnalysisLaunchSettings(projectPaths(projectRoot), { specTemplate: "migration" })
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

    expect(html).toContain('name="spec_template" value="migration" checked')
    expect(html).not.toContain('name="spec_template" value="risk" checked')
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
            spec_template: "summary",
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
    expect(detail.ledger.map((event) => event.payload).join("\n")).toContain(
      '"spec_template":"summary"',
    )
    stopDaemons()
  })

  test("Given an active job conflict When submitting through the daemon client Then replacement is explicit", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    const manifestPath = await writeSpecManifest(projectRoot)
    const paths = projectPaths(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    const active = await createJob({
      project_path: projectRoot,
      actor: "spec",
      category: "risk",
      manifest_path: manifestPath,
    })
    await updateJob(paths, active.job_id, "running", 25, "analyzing")

    await expect(
      submitJobWithDaemon(endpoint, {
        projectPath: projectRoot,
        actor: "spec",
        category: "risk",
        manifestPath,
      }),
    ).rejects.toMatchObject({
      conflict: {
        job_id: active.job_id,
        status: "running",
        write_scope_key: "spec:risk:full",
      },
    } satisfies Partial<ActiveJobConflictHttpError>)

    const replacement = await submitJobWithDaemon(endpoint, {
      projectPath: projectRoot,
      actor: "spec",
      category: "risk",
      manifestPath,
      replaceExisting: true,
    })

    expect(replacement.replaced_job_id).toBe(active.job_id)
    expect((await inspectJob(paths, active.job_id))?.snapshot.status).toBe("cancelled")
    stopDaemons()
  })
})
