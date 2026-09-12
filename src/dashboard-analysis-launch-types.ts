import type { AnalysisLaunchControls } from "./analysis-launch-controls"
import type { AnalysisScope } from "./analysis-scope"
import type { BrokerHealthStatus } from "./provider-health"
import type { SavedSpecProviderSettings } from "./provider-settings"

export type DashboardFolderOption = {
  readonly path: string
  readonly depth: number
}

export type DashboardRetroRunOption = {
  readonly retroRunId: string
  readonly category: string
  readonly scope: AnalysisScope
  readonly completedAt: string | null
}

export type DashboardSpecTemplateOption = {
  readonly name: "risk" | "migration" | "summary"
  readonly description: string
}

export type DashboardAnalysisLaunchSettings = AnalysisLaunchControls

export type DashboardAnalysisLaunchInput = {
  readonly folders: readonly DashboardFolderOption[]
  readonly retroRuns: readonly DashboardRetroRunOption[]
  readonly specTemplates: readonly DashboardSpecTemplateOption[]
  readonly savedSettings: DashboardAnalysisLaunchSettings | null
  readonly providerSettings: SavedSpecProviderSettings | null
  readonly brokerHealth: BrokerHealthStatus
}
