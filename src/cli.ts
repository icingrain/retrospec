#!/usr/bin/env bun
import { runAgentBridgeCommand, runStatus } from "./agent-bridge"
import { runDaemonForever } from "./daemon"
import { runOpencodeBrokerForever } from "./opencode-broker"
import { installRetrospecOpenCodeConfig } from "./opencode-install"

type InstallCliOptions = {
  readonly projectRoot: string
  readonly model?: string
  readonly selectModel: boolean
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] ?? "status"

  if (await runAgentBridgeCommand(args)) {
    return
  }

  switch (command) {
    case "daemon":
      await runDaemonForever()
      return
    case "opencode-broker":
      await runOpencodeBrokerForever()
      return
    case "status": {
      await runStatus(args.slice(1))
      return
    }
    case "install": {
      const options = parseInstallOptions(args.slice(1))
      const selectModel = options.selectModel || isInteractiveInstall()
      const installOptions = {
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(selectModel ? { selectModel } : {}),
      }
      const result = await installRetrospecOpenCodeConfig(
        options.projectRoot,
        process.env,
        installOptions,
      )
      console.log(`opencode config: ${result.configPath}`)
      console.log(`agent model: ${result.agentModel}`)
      console.log(`added agents: ${result.addedAgents.join(", ")}`)
      return
    }
    case "help":
    case "--help":
    case "-h":
      console.log(
        "Usage: retrospec [status [project-root] [--json]|analysis status --project <path> --json|exports generate|regenerate --project <path> [--format csv|xlsx] --json|job submit|inspect|await|cancel|generated validate|install|daemon|opencode-broker|help]",
      )
      return
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(2)
  }
}

function parseInstallOptions(args: readonly string[]): InstallCliOptions {
  let projectRoot = process.cwd()
  let model: string | undefined
  let selectModel = false

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined) {
      continue
    }
    if (token === "--model") {
      model = requireInstallValue(args, index, token)
      index += 1
      continue
    }
    if (token === "--select-model") {
      selectModel = true
      continue
    }
    if (!token.startsWith("--") && projectRoot === process.cwd()) {
      projectRoot = token
      continue
    }
    throw new Error(`Unknown install option: ${token}`)
  }

  return { projectRoot, selectModel, ...(model === undefined ? {} : { model }) }
}

function isInteractiveInstall(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

function requireInstallValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

await main()
