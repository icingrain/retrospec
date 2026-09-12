import type { AnalysisLaunchControls } from "./analysis-launch-controls"
import { defaultAnalysisLaunchControls, toLaunchSettingsPayload } from "./analysis-launch-controls"
import { appendJobEvent, inspectJob, updateJob } from "./jobs"
import { readSpecProviderSettings } from "./provider-settings"
import { runRetroInventory } from "./retro/run"
import { globalSpecRateLimitScheduler } from "./spec/rate-limit"
import { runSpecAnalysis } from "./spec/run"
import type { AnalysisScope, JobId, ProjectPaths } from "./types"

export type BuiltInJobManifest = {
  readonly actor: "retro" | "spec" | "archivist"
  readonly category: string
  readonly analysis_scope?: AnalysisScope | undefined
  readonly launch_settings?: AnalysisLaunchControls | undefined
}

export async function runBuiltInCodeInventory(
  paths: ProjectPaths,
  jobId: JobId,
  manifest: BuiltInJobManifest,
): Promise<void> {
  if (manifest.actor !== "retro" || !["structure", "symbols"].includes(manifest.category)) {
    throw new Error("code-inventory capability requires retro structure or symbols category")
  }

  try {
    await appendJobEvent(
      paths,
      jobId,
      "checkpoint",
      JSON.stringify({
        launch_settings: toLaunchSettingsPayload(
          manifest.launch_settings ?? {
            ...defaultAnalysisLaunchControls,
            scope: manifest.analysis_scope ?? defaultAnalysisLaunchControls.scope,
          },
        ),
      }),
    )
    await runRetroInventory(paths.projectRoot, manifest.launch_settings ?? manifest.analysis_scope)
    if (await isCancelled(paths, jobId)) {
      return
    }
    await updateJob(paths, jobId, "completed", 100, "completed")
    await appendJobEvent(paths, jobId, "completed")
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
    if (await isCancelled(paths, jobId)) {
      return
    }
    await updateJob(paths, jobId, "failed", 100, "failed")
    await appendJobEvent(paths, jobId, "failed", errorPayload(error))
  }
}

export async function runBuiltInSpecAnalysis(
  paths: ProjectPaths,
  jobId: JobId,
  manifest: BuiltInJobManifest,
): Promise<void> {
  if (manifest.actor !== "spec" || manifest.category !== "risk") {
    throw new Error("ai-analysis capability requires spec risk category")
  }

  try {
    const reservation = globalSpecRateLimitScheduler.reserve({
      projectPath: paths.projectRoot,
      jobId,
    })
    if (reservation.status === "delayed") {
      await updateJob(paths, jobId, "running", 0, "waiting for global spec rate limit")
      await appendJobEvent(paths, jobId, "blocker", JSON.stringify(reservation))
      await Bun.sleep(reservation.wait_ms)
    }
    if (await isCancelled(paths, jobId)) {
      return
    }
    await appendJobEvent(
      paths,
      jobId,
      "checkpoint",
      JSON.stringify({
        ...reservation,
        launch_settings:
          manifest.launch_settings === undefined
            ? null
            : toLaunchSettingsPayload(manifest.launch_settings),
      }),
    )
    await runSpecAnalysis(paths, manifest.launch_settings ?? manifest.analysis_scope)
    if (await isCancelled(paths, jobId)) {
      return
    }
    await updateJob(paths, jobId, "completed", 100, "completed")
    await appendJobEvent(paths, jobId, "completed")
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
    if (await isCancelled(paths, jobId)) {
      return
    }
    await updateJob(paths, jobId, "failed", 100, "failed")
    await appendJobEvent(paths, jobId, "failed", await specAnalysisErrorPayload(paths, error))
  }
}

async function isCancelled(paths: ProjectPaths, jobId: JobId): Promise<boolean> {
  const detail = await inspectJob(paths, jobId)
  return detail?.snapshot.status === "cancelled"
}

function errorPayload(error: Error): string {
  return JSON.stringify({ error: error.message })
}

async function specAnalysisErrorPayload(paths: ProjectPaths, error: Error): Promise<string> {
  const saved = await readSpecProviderSettings(paths)
  if (saved === null) {
    return errorPayload(error)
  }
  return JSON.stringify({
    error: error.message,
    provider_settings_source: "saved provider settings",
    provider_mode: saved.settings.mode,
  })
}
