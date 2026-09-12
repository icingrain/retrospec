import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

async function writeDashboardJobManifest(
  projectRoot: string,
  name: string,
  source: string,
): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "dashboard-shell")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, `${name}.ts`)
  const manifestPath = join(generatedDir, `${name}.json`)
  await writeFile(entrypoint, source)
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [".retrospec/logs/dashboard-shell.log"],
      category: "symbols",
      actor: "retro",
    }),
  )
  return manifestPath
}

describe("dashboard shell", () => {
  test("Given a running daemon When dashboard is opened Then shell HTML is returned", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl })
    const html = await response.text()

    expect(response.headers.get("content-type")).toContain("text/html")
    expect(html).toContain("Retrospec Dashboard")
    expect(html).toContain("Status healthy")
    expect(html).toContain("Projects")
    expect(html).toContain("Jobs")
    expect(html).toContain("Analysis DB")
    expect(html).toContain("Exports")
    expect(html).toContain("Open jobs")
    expect(html).not.toContain("The local daemon is reachable and ready to serve dashboard data.")
  })

  test("Given no registered projects When dashboard is opened Then project empty state is shown", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const html = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl }).text()

    expect(html).toContain("No projects registered")
    expect(html).toContain(
      "Register a project through the Retrospec router to populate this dashboard.",
    )
  })

  test("Given registered projects When dashboard is opened Then project registry data is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })

    const html = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl }).text()

    expect(html).toContain(projectRoot)
    expect(html).toContain("Path")
    expect(html).toContain("Jobs")
    expect(html).toContain("0 active jobs")
    expect(html).toContain("Selected project_path")
    expect(html).toContain("Path available")
  })

  test("Given a registered project path was deleted When dashboard is opened Then warning text is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    await ky.post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectRoot },
    })
    await rm(projectRoot, { recursive: true })

    const html = await ky.get("dashboard", { prefixUrl: endpoint.baseUrl }).text()

    expect(html).toContain("Deleted path")
    expect(html).toContain(
      "The registered path is missing on disk. Retrospec keeps it for review and does not auto-delete it.",
    )
  })

  test("Given a browser favicon request When dashboard assets are requested Then no auth error is returned", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.get("favicon.ico", {
      prefixUrl: endpoint.baseUrl,
      throwHttpErrors: false,
    })

    expect(response.status).toBe(204)
  })

  test("Given a selected project has completed jobs When dashboard overview is opened Then jobs stay behind a launcher", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeDashboardJobManifest(
      projectRoot,
      "complete",
      "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n",
    )

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()
    await ky.post(`jobs/${submitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })

    const html = await ky
      .get("dashboard", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Open jobs")
    expect(html).toContain(`/dashboard/jobs?project_path=${encodeURIComponent(projectRoot)}`)
    expect(html).not.toContain("Recent jobs")
    expect(html).not.toContain(submitted.job_id)
  })

  test("Given a selected project has completed jobs When jobs dashboard is opened Then job rows are visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeDashboardJobManifest(
      projectRoot,
      "complete",
      "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n",
    )

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()
    await ky.post(`jobs/${submitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })

    const html = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Recent jobs")
    expect(html).toContain(submitted.job_id)
    expect(html).toContain("completed")
    expect(html).toContain("symbols")
    expect(html).toContain("retro")
    expect(html).toContain("100%")
    expect(html).toContain("Full project · canonical write scope")
    expect(html).toContain(`job_id=${encodeURIComponent(submitted.job_id)}`)
    expect(html).toContain("Refresh status")
    expect(html).toContain("last refreshed")
    expect(html).toContain("Refresh jobs")
    expect(html).toContain(`/dashboard/jobs?project_path=${encodeURIComponent(projectRoot)}`)
  })

  test("Given a selected job When jobs dashboard is opened Then job detail ledger is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeDashboardJobManifest(
      projectRoot,
      "detail",
      "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n",
    )

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()
    await ky.post(`jobs/${submitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5_000 },
    })

    const html = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot, job_id: submitted.job_id },
      })
      .text()

    expect(html).toContain("Job detail")
    expect(html).toContain("Ledger events")
    expect(html).toContain("submitted")
    expect(html).toContain("started")
    expect(html).toContain("completed")
    expect(html).toContain("Scope")
    expect(html).toContain("Full project · canonical write scope")
    expect(html).toContain(
      "Promotion or replacement actions require explicit confirmation before a partial result can affect full-project canonical output.",
    )
    expect(html).toContain(
      `/dashboard/jobs?project_path=${encodeURIComponent(projectRoot)}&amp;job_id=${encodeURIComponent(submitted.job_id)}`,
    )
  })

  test("Given a selected project has an active job When jobs dashboard is opened Then cancel endpoint is visible", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeDashboardJobManifest(
      projectRoot,
      "long",
      "await Bun.sleep(10_000)\n",
    )

    const submitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "symbols",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()

    const html = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    expect(html).toContain("Cancel job")
    expect(html).toContain(`/jobs/${submitted.job_id}/cancel`)
    expect(html).toContain("Requires bearer token")
  })
})
