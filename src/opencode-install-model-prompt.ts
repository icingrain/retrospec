import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import {
  type RetrospecInstallAgentKey,
  type RetrospecInstallAgentModels,
  completeAgentModels,
  defaultInstallModel,
  modelsForAll,
  retrospecInstallAgentKeys,
} from "./opencode-install-model-values"

export type InstallModelPromptIo = {
  readonly input: NodeJS.ReadableStream
  readonly output: NodeJS.WritableStream
  readonly question?: (prompt: string) => Promise<string>
}

type InstallModelPromptSession = {
  readonly output: NodeJS.WritableStream
  readonly question: (prompt: string) => Promise<string>
  readonly close: () => void
}

export async function selectInstallAgentModels(
  providers: readonly string[],
  fallbackModel: string,
  prompt: InstallModelPromptIo | undefined,
): Promise<RetrospecInstallAgentModels> {
  const session = createPromptSession(prompt)
  try {
    const mode = await askSetupMode(session, providers)
    if (mode === "manual") {
      const sameModel = await askSameModel(session)
      return sameModel
        ? modelsForAll(await askModel(session, "Model (provider/model)", fallbackModel))
        : askManualAgentModels(session, fallbackModel)
    }
    const provider = await askProvider(session, providers)
    const sameModel = await askSameModel(session)
    return sameModel
      ? modelsForAll(
          providerModel(provider, await askModel(session, "Model name", modelName(fallbackModel))),
        )
      : askProviderAgentModels(session, provider, fallbackModel)
  } finally {
    session.close()
  }
}

function createPromptSession(prompt: InstallModelPromptIo | undefined): InstallModelPromptSession {
  if (prompt?.question !== undefined) {
    return { output: prompt.output, question: prompt.question, close: () => {} }
  }
  const io = prompt ?? { input: stdin, output: stdout }
  const rl = createInterface({ input: io.input, output: io.output })
  return { output: io.output, question: (label) => rl.question(label), close: () => rl.close() }
}

async function askSetupMode(
  session: InstallModelPromptSession,
  providers: readonly string[],
): Promise<"manual" | "opencode"> {
  const { output } = session
  output.write("Select Retrospec model setup mode:\n")
  output.write("  1. Enter provider/model manually\n")
  output.write("  2. Choose provider from opencode settings\n")
  const answer = await session.question("Setup mode [1]: ")
  return answer.trim() === "2" && providers.length > 0 ? "opencode" : "manual"
}

async function askProvider(
  session: InstallModelPromptSession,
  providers: readonly string[],
): Promise<string> {
  const { output } = session
  output.write("Select opencode provider:\n")
  for (const [index, provider] of providers.entries()) {
    output.write(`  ${index + 1}. ${provider}\n`)
  }
  const answer = await session.question("Provider [1]: ")
  return providers[parseChoice(answer, providers.length, 0)] ?? providers[0] ?? "openai"
}

async function askSameModel(session: InstallModelPromptSession): Promise<boolean> {
  const answer = await session.question("Use one model for all Retrospec agents? [Y/n]: ")
  return !answer.trim().toLowerCase().startsWith("n")
}

async function askManualAgentModels(
  session: InstallModelPromptSession,
  fallbackModel: string,
): Promise<RetrospecInstallAgentModels> {
  return askAgentModels(
    session,
    (agent) => `${agent} model (provider/model)`,
    () => fallbackModel,
  )
}

async function askProviderAgentModels(
  session: InstallModelPromptSession,
  provider: string,
  fallbackModel: string,
): Promise<RetrospecInstallAgentModels> {
  return askAgentModels(
    session,
    (agent) => `${agent} model name`,
    (model) => providerModel(provider, modelName(model ?? fallbackModel)),
  )
}

async function askAgentModels(
  session: InstallModelPromptSession,
  label: (agent: RetrospecInstallAgentKey) => string,
  normalize: (model: string | undefined) => string,
): Promise<RetrospecInstallAgentModels> {
  const values: Partial<Record<RetrospecInstallAgentKey, string>> = {}
  for (const agent of retrospecInstallAgentKeys) {
    values[agent] = normalize(await askModel(session, label(agent), undefined))
  }
  return completeAgentModels(values, defaultInstallModel)
}

async function askModel(
  session: InstallModelPromptSession,
  label: string,
  fallback: string | undefined,
): Promise<string> {
  const suffix = fallback === undefined ? "" : ` [${fallback}]`
  const answer = (await session.question(`${label}${suffix}: `)).trim()
  return answer.length > 0 ? answer : (fallback ?? defaultInstallModel)
}

function providerModel(provider: string, model: string): string {
  return `${provider}/${model}`
}

function modelName(model: string): string {
  return model.includes("/") ? (model.split("/").at(-1) ?? model) : model
}

function parseChoice(answer: string, count: number, fallbackIndex: number): number {
  const trimmed = answer.trim()
  if (trimmed.length === 0) {
    return fallbackIndex
  }
  const selectedIndex = Number.parseInt(trimmed, 10) - 1
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= count) {
    throw new Error(`invalid selection: ${answer}`)
  }
  return selectedIndex
}
