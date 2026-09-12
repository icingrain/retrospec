import { existsSync } from "node:fs"

const defaultHealthcheckIntervalMs = 30_000

export type ProjectWatcherStatus = "watching" | "dead" | "missing"

export type ProjectWatcherRecord = {
  readonly project_path: string
  readonly status: ProjectWatcherStatus
  readonly restart_count: number
  readonly last_healthcheck_at: string | null
}

export type ProjectWatcherSummary = {
  readonly healthcheck_interval_ms: number
  readonly watchers: readonly ProjectWatcherRecord[]
}

export type ProjectWatcherOptions = {
  readonly healthcheckIntervalMs?: number
}

type MutableWatcherRecord = {
  project_path: string
  status: ProjectWatcherStatus
  restart_count: number
  last_healthcheck_at: string | null
}

export class ProjectWatcherManager {
  readonly healthcheckIntervalMs: number
  private readonly watchers = new Map<string, MutableWatcherRecord>()
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(options: ProjectWatcherOptions = {}) {
    this.healthcheckIntervalMs = options.healthcheckIntervalMs ?? defaultHealthcheckIntervalMs
  }

  ensureProject(projectPath: string): void {
    if (this.watchers.has(projectPath)) {
      return
    }
    this.watchers.set(projectPath, {
      project_path: projectPath,
      status: existsSync(projectPath) ? "watching" : "missing",
      restart_count: 0,
      last_healthcheck_at: null,
    })
  }

  markWatcherDead(projectPath: string): void {
    this.ensureProject(projectPath)
    const watcher = this.watchers.get(projectPath)
    if (watcher !== undefined) {
      watcher.status = "dead"
    }
  }

  runHealthcheck(projectPaths: readonly string[]): void {
    const checkedAt = new Date().toISOString()
    for (const projectPath of projectPaths) {
      this.ensureProject(projectPath)
      const watcher = this.watchers.get(projectPath)
      if (watcher === undefined) {
        continue
      }
      watcher.last_healthcheck_at = checkedAt
      if (!existsSync(projectPath)) {
        watcher.status = "missing"
        continue
      }
      if (watcher.status === "dead") {
        watcher.restart_count += 1
      }
      watcher.status = "watching"
    }
  }

  start(projectPaths: () => readonly string[]): void {
    if (this.interval !== null) {
      return
    }
    this.runHealthcheck(projectPaths())
    this.interval = setInterval(
      () => this.runHealthcheck(projectPaths()),
      this.healthcheckIntervalMs,
    )
    this.interval.unref?.()
  }

  stop(): void {
    if (this.interval === null) {
      return
    }
    clearInterval(this.interval)
    this.interval = null
  }

  summary(): ProjectWatcherSummary {
    return {
      healthcheck_interval_ms: this.healthcheckIntervalMs,
      watchers: [...this.watchers.values()].map((watcher) => ({ ...watcher })),
    }
  }
}

export function createProjectWatcherManager(
  options: ProjectWatcherOptions = {},
): ProjectWatcherManager {
  return new ProjectWatcherManager(options)
}
