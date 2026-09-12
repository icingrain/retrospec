import ky from "ky"
import { z } from "zod"
import type { SavedSpecProviderSettings } from "./provider-settings"

const brokerHealthSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  supports: z.object({
    protocol_versions: z.array(z.number()),
    analysis_types: z.array(z.string()),
    prompt_versions: z.array(z.string()),
  }),
})

export type BrokerHealthStatus =
  | {
      readonly status: "up"
      readonly url: string
      readonly version: string
      readonly messages: readonly string[]
    }
  | {
      readonly status: "down"
      readonly url: string
      readonly messages: readonly string[]
    }
  | {
      readonly status: "not-configured"
      readonly messages: readonly string[]
    }

export async function readBrokerHealth(
  saved: SavedSpecProviderSettings | null,
): Promise<BrokerHealthStatus> {
  if (saved?.settings.mode !== "opencode-broker") {
    return { status: "not-configured", messages: ["Broker mode is not selected."] }
  }

  const url = saved.settings.brokerUrl
  try {
    const body = brokerHealthSchema.parse(
      await ky.get("health", { prefixUrl: url, timeout: 500, retry: { limit: 0 } }).json(),
    )
    return {
      status: "up",
      url,
      version: body.version,
      messages: [`Broker supports ${body.supports.analysis_types.join(", ") || "no"} analysis.`],
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        status: "down",
        url,
        messages: [
          "Broker is unreachable. Start `retrospec opencode-broker` or check broker URL/token.",
        ],
      }
    }
    throw error
  }
}
