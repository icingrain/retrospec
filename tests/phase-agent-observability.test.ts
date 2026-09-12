import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeRetroManifest,
  writeSampleProject,
} from "./phase3-helpers"

afterEach(() => {
  stopDaemons()
})

describe("Phase observability agent decision log", () => {
  test("Given an agent decision When it is recorded Then the daemon returns the job-scoped trace", async () => {
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
        },
      })
      .json<{ readonly job_id: string }>()
    const recorded = await ky
      .post("agent/decisions", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          job_id: submitted.job_id,
          agent: "retro",
          skill: "code-inventory",
          event_type: "skill_selected",
          reason: "requested structure and symbols are missing",
          payload: { category: "structure" },
        },
      })
      .json<{ readonly decision_id: string }>()

    const response = await ky
      .get("agent/decisions", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot, job_id: submitted.job_id },
      })
      .json<{
        readonly decisions: readonly {
          readonly decision_id: string
          readonly agent: string
          readonly skill: string | null
          readonly event_type: string
          readonly reason: string
          readonly payload_json: string
        }[]
      }>()

    expect(response.decisions).toHaveLength(1)
    expect(response.decisions[0]).toMatchObject({
      decision_id: recorded.decision_id,
      agent: "retro",
      skill: "code-inventory",
      event_type: "skill_selected",
      reason: "requested structure and symbols are missing",
      payload_json: '{"category":"structure"}',
    })
  })

  test("Given a selected job has decisions When jobs dashboard opens Then the trace is collapsed with expandable details", async () => {
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
        },
      })
      .json<{ readonly job_id: string }>()
    await ky.post(`jobs/${submitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5000 },
    })
    const secondSubmitted = await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          project_path: projectRoot,
          actor: "retro",
          category: "structure",
          manifest_path: manifestPath,
        },
      })
      .json<{ readonly job_id: string }>()
    await ky.post(`jobs/${secondSubmitted.job_id}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: 5000 },
    })
    await ky.post("agent/decisions", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: projectRoot,
        job_id: secondSubmitted.job_id,
        agent: "retro",
        skill: "code-inventory",
        event_type: "confirmation_previewed",
        reason: "previewed DB writes before final approval",
        payload: { writes: [".retrospec/retro/structure.db"] },
      },
    })

    const listHtml = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot },
      })
      .text()

    const html = await ky
      .get("dashboard/jobs", {
        prefixUrl: endpoint.baseUrl,
        searchParams: { project_path: projectRoot, job_id: secondSubmitted.job_id },
      })
      .text()

    expect(listHtml).toContain("Job detail")
    expect(listHtml).not.toContain('data-gqo-id="daemon-dashboard.job-detail.')
    expect(listHtml).not.toContain("Agent decisions")
    expect(listHtml).not.toContain("previewed DB writes before final approval")
    expect(html).toContain('<details class="detail-disclosure"')
    expect(html).toContain('data-gqo-id="daemon-dashboard.job-detail.')
    expect(html).toContain('class="eyebrow detail-section-label"')
    expect(html).toContain(`href="/dashboard/jobs?project_path=${encodeURIComponent(projectRoot)}"`)
    expect(html.indexOf(`daemon-dashboard.job-row.${secondSubmitted.job_id}`)).toBeLessThan(
      html.indexOf(`daemon-dashboard.job-detail.${secondSubmitted.job_id}`),
    )
    expect(html.indexOf(`daemon-dashboard.job-detail.${secondSubmitted.job_id}`)).toBeLessThan(
      html.indexOf(`daemon-dashboard.job-row.${submitted.job_id}`),
    )
    expect(html).toContain("Agent decisions")
    expect(html).not.toContain('<details class="detail-disclosure" open')
    expect(html).toContain("retro · code-inventory")
    expect(html).toContain("confirmation_previewed")
    expect(html).toContain("previewed DB writes before final approval")
    expect(html).toContain(".retrospec/retro/structure.db")
  })
})
