#!/usr/bin/env bun
import { runAgentBridgeCommand, runStatus } from "./agent-bridge"
import { runDaemonForever } from "./daemon"
import { runOpencodeBrokerForever } from "./opencode-broker"
import { installRetrospecOpenCodeConfig } from "./opencode-install"

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
      const result = await installRetrospecOpenCodeConfig(process.argv[3] ?? process.cwd())
      console.log(`opencode config: ${result.configPath}`)
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

await main()
