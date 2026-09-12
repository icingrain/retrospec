import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"
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

describe("Phase 3 retro write-path hardening", () => {
  test("Given .retrospec is a symlink When inventory runs Then the job fails without external DB writes", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const externalState = await tempProject()
    await writeSampleProject(projectRoot)
    await mkdir(externalState, { recursive: true })
    await symlink(externalState, join(projectRoot, ".retrospec"), "dir")
    const endpoint = await daemonEndpoint(runtime)
    const manifestPath = await writeRetroManifest(projectRoot)

    const response = await ky.post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      throwHttpErrors: false,
      json: {
        project_path: projectRoot,
        actor: "retro",
        category: "structure",
        manifest_path: manifestPath,
      },
    })

    expect(response.status).toBe(400)
    expect(existsSync(join(externalState, "registry.db"))).toBe(false)
    expect(existsSync(join(externalState, "jobs", "job-state.db"))).toBe(false)
    expect(existsSync(join(externalState, "retro", "structure.db"))).toBe(false)
    expect(existsSync(join(externalState, "retro", "symbols.db"))).toBe(false)
  })
})
