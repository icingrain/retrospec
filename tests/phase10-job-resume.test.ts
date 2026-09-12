import { describe, expect, test } from "bun:test"
import { startDaemon } from "../src/daemon"
import { appendJobEvent, createJob, inspectJob, updateJob } from "../src/jobs"
import { ensureRuntimeDir, projectPaths } from "../src/paths"
import { ensureProjectRegistry, registerProject } from "../src/registry"
import { tempProject, tempRuntime } from "./phase3-helpers"

describe("Phase 10 job checkpoint recovery", () => {
  test("Given a running job from a previous daemon When daemon starts Then the orphaned job is failed with recovery evidence", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)
    await ensureRuntimeDir(runtime)
    await ensureProjectRegistry(paths)
    registerProject(runtime, projectRoot)
    const job = await createJob({
      project_path: projectRoot,
      actor: "retro",
      category: "structure",
      manifest_path: `${projectRoot}/.retrospec/generated/retro/job.json`,
    })
    await updateJob(paths, job.job_id, "running", 45, "extracting symbols")
    await appendJobEvent(paths, job.job_id, "started")
    await appendJobEvent(
      paths,
      job.job_id,
      "checkpoint",
      JSON.stringify({ step: "extracting symbols" }),
    )

    const daemon = await startDaemon(runtime)
    daemon.stop()

    const detail = await inspectJob(paths, job.job_id)
    const recoveryEvent = detail?.ledger.find((event) => event.event_type === "failed")

    expect(detail?.snapshot.status).toBe("failed")
    expect(detail?.snapshot.progress_pct).toBe(45)
    expect(detail?.snapshot.current_step).toBe("failed: daemon startup recovery")
    expect(recoveryEvent?.payload).toContain("daemon_startup_recovery")
    expect(recoveryEvent?.payload).toContain("checkpoint")
    expect(recoveryEvent?.payload).toContain("extracting symbols")
  })
})
