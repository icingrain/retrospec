export const retrospecInstallAgentKeys = [
  "retrospec",
  "retro",
  "spec",
  "archivist",
  "curator",
  "surveyor",
  "appraiser",
  "excavator",
] as const

export type RetrospecInstallAgentKey = (typeof retrospecInstallAgentKeys)[number]

export type RetrospecInstallAgentModels = Readonly<Record<RetrospecInstallAgentKey, string>>

export const defaultInstallModel = "openai/gpt-5.5"

export function completeAgentModels(
  values: Partial<Record<RetrospecInstallAgentKey, string>>,
  fallbackModel: string,
): RetrospecInstallAgentModels {
  return {
    retrospec: normalizeOpenCodeModelId(values.retrospec ?? fallbackModel),
    retro: normalizeOpenCodeModelId(values.retro ?? fallbackModel),
    spec: normalizeOpenCodeModelId(values.spec ?? fallbackModel),
    archivist: normalizeOpenCodeModelId(values.archivist ?? fallbackModel),
    curator: normalizeOpenCodeModelId(values.curator ?? fallbackModel),
    surveyor: normalizeOpenCodeModelId(values.surveyor ?? fallbackModel),
    appraiser: normalizeOpenCodeModelId(values.appraiser ?? fallbackModel),
    excavator: normalizeOpenCodeModelId(values.excavator ?? fallbackModel),
  }
}

export function modelsForAll(model: string): RetrospecInstallAgentModels {
  return completeAgentModels({}, model)
}

function normalizeOpenCodeModelId(model: string): string {
  return model.replace(/^([^:/]+):/, "$1/")
}
