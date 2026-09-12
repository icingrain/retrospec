import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import type { ProjectPaths, RuntimePaths } from "./types"

export function runtimePaths(homeDir = process.env["RETROSPEC_HOME"] ?? homedir()): RuntimePaths {
  const runtimeDir = join(homeDir, ".retrospec")

  return {
    homeDir,
    runtimeDir,
    portFile: join(runtimeDir, "daemon.port"),
    tokenFile: join(runtimeDir, "daemon.token"),
    projectsDb: join(runtimeDir, "projects.db"),
  }
}

export function projectPaths(projectRoot = process.cwd()): ProjectPaths {
  const resolvedRoot = resolve(projectRoot)
  const stateDir = join(resolvedRoot, ".retrospec")

  return {
    projectRoot: resolvedRoot,
    stateDir,
    registryDb: join(stateDir, "registry.db"),
    jobsDir: join(stateDir, "jobs"),
    jobsDb: join(stateDir, "jobs", "job-state.db"),
    specDir: join(stateDir, "spec"),
    specAnalysisDb: join(stateDir, "spec", "ai_analysis.db"),
    exportsDir: join(stateDir, "exports"),
    uploadsDir: join(stateDir, "uploads"),
    glossaryDir: join(stateDir, "glossary"),
    glossaryDb: join(stateDir, "glossary", "glossary.db"),
  }
}

export async function ensureRuntimeDir(paths: RuntimePaths): Promise<void> {
  await mkdir(paths.runtimeDir, { recursive: true, mode: 0o700 })
}

export async function ensureProjectStateDir(paths: ProjectPaths): Promise<void> {
  await mkdir(paths.stateDir, { recursive: true })
}
