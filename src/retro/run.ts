import type { AnalysisLaunchControls } from "../analysis-launch-controls"
import { normalizeAnalysisLaunchControls } from "../analysis-launch-controls"
import type { AnalysisScope } from "../analysis-scope"
import { normalizeAnalysisScope } from "../analysis-scope"
import { extractInventory } from "./extract"
import { writeRetroInventoryFailure } from "./handoff"
import { writeRetroInventory } from "./store"
import { surveySourceTree } from "./survey"

export async function runRetroInventory(
  projectRoot: string | undefined,
  scopeOrControls?: AnalysisScope | AnalysisLaunchControls | undefined,
): Promise<void> {
  if (projectRoot === undefined || projectRoot.length === 0) {
    throw new Error("RETROSPEC_PROJECT_ROOT is required")
  }
  const controls = normalizeAnalysisLaunchControls(
    isLaunchControls(scopeOrControls) ? scopeOrControls : { scope: scopeOrControls },
  )
  const analysisScope = normalizeAnalysisScope(controls.scope)

  try {
    const survey = await surveySourceTree(projectRoot, analysisScope, controls)
    const inventory = await extractInventory(survey)
    await writeRetroInventory(projectRoot, inventory)
  } catch (error) {
    if (error instanceof Error) {
      await writeRetroInventoryFailure(projectRoot, error, analysisScope)
    }
    throw error
  }
}

function isLaunchControls(
  value: AnalysisScope | AnalysisLaunchControls | undefined,
): value is AnalysisLaunchControls {
  return value !== undefined && "batchSize" in value
}
