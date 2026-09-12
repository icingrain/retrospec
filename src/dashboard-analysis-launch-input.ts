import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { readAnalysisLaunchSettings } from "./analysis-launch-settings"
import type {
  DashboardAnalysisLaunchInput,
  DashboardFolderOption,
  DashboardRetroRunOption,
} from "./dashboard-analysis-launch"
import { readBrokerHealth } from "./provider-health"
import { readSpecProviderSettings } from "./provider-settings"
import type { ProjectPaths } from "./types"

type RetroRunRow = {
  readonly retro_run_id: string
  readonly category: string
  readonly scope_mode: "full" | "partial"
  readonly scope_roots_json: string
  readonly completed_at: string | null
}

type ColumnRow = {
  readonly name: string
}

const ignoredDashboardFolders = new Set([".git", ".retrospec", "node_modules"])
const dashboardFolderLimit = 80
const dashboardFolderMaxDepth = 4

const specTemplates = [
  { name: "risk", description: "Risk and migration blocker analysis." },
  { name: "migration", description: "Migration sequencing and dependency planning." },
  { name: "summary", description: "Executive summary for current scope readiness." },
] as const

export async function analysisLaunchInput(
  paths: ProjectPaths,
): Promise<DashboardAnalysisLaunchInput> {
  const providerSettings = await readSpecProviderSettings(paths)
  return {
    folders: await listDashboardFolders(paths.projectRoot),
    retroRuns: readRetroRunOptions(paths),
    specTemplates,
    savedSettings: await readAnalysisLaunchSettings(paths),
    providerSettings,
    brokerHealth: await readBrokerHealth(providerSettings),
  }
}

export function emptyAnalysisLaunch(): DashboardAnalysisLaunchInput {
  return {
    folders: [],
    retroRuns: [],
    specTemplates,
    savedSettings: null,
    providerSettings: null,
    brokerHealth: { status: "not-configured", messages: ["Broker mode is not selected."] },
  }
}

async function listDashboardFolders(
  projectRoot: string,
): Promise<readonly DashboardFolderOption[]> {
  const folders: DashboardFolderOption[] = []
  await collectDashboardFolders(projectRoot, projectRoot, folders, 0)
  return folders
    .toSorted((left, right) => left.path.localeCompare(right.path))
    .slice(0, dashboardFolderLimit)
}

async function collectDashboardFolders(
  projectRoot: string,
  currentPath: string,
  folders: DashboardFolderOption[],
  depth: number,
): Promise<void> {
  if (folders.length >= dashboardFolderLimit || depth >= dashboardFolderMaxDepth) {
    return
  }
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    if (folders.length >= dashboardFolderLimit) {
      return
    }
    if (!entry.isDirectory() || ignoredDashboardFolders.has(entry.name)) {
      continue
    }
    const folderPath = join(currentPath, entry.name)
    const relativePath = relative(projectRoot, folderPath).replaceAll(sep, "/")
    folders.push({ path: relativePath, depth: relativePath.split("/").length - 1 })
    await collectDashboardFolders(projectRoot, folderPath, folders, depth + 1)
  }
}

function readRetroRunOptions(paths: ProjectPaths): readonly DashboardRetroRunOption[] {
  const structureDb = join(paths.stateDir, "retro", "structure.db")
  if (!existsSync(structureDb)) {
    return []
  }
  const db = new Database(structureDb, { readonly: true })
  try {
    const columns = new Set(
      db
        .query<ColumnRow, []>("pragma table_info(retro_runs)")
        .all()
        .map((column) => column.name),
    )
    return db
      .query<RetroRunRow, []>(
        `select retro_run_id, category,
                ${retroRunSelect(columns, "scope_mode", "'full'")},
                ${retroRunSelect(columns, "scope_roots_json", "'[]'")},
                completed_at
         from retro_runs
         where status = 'completed'
         order by completed_at desc`,
      )
      .all()
      .map(toRetroRunOption)
  } finally {
    db.close()
  }
}

function retroRunSelect(columns: ReadonlySet<string>, column: string, fallback: string): string {
  return columns.has(column) ? column : `${fallback} as ${column}`
}

function toRetroRunOption(row: RetroRunRow): DashboardRetroRunOption {
  const roots = parseScopeRoots(row.scope_roots_json)
  return {
    retroRunId: row.retro_run_id,
    category: row.category,
    scope: row.scope_mode === "full" ? { mode: "full", roots: [] } : { mode: "partial", roots },
    completedAt: row.completed_at,
  }
}

function parseScopeRoots(rootsJson: string): readonly string[] {
  const parsed: unknown = JSON.parse(rootsJson)
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.filter((value): value is string => typeof value === "string")
}
