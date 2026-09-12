import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import {
  BrokerAnalysisError,
  type BrokerAnalyzer,
  deterministicBrokerAnalyzer,
  emptyBrokerUsage,
  opencodeCliBrokerAnalyzer,
} from "./opencode-broker-analyzer"
import { brokerAnalyzeRequestSchema } from "./opencode-broker-schemas"
import { version } from "./version"

export type OpencodeBrokerOptions = {
  readonly brokerToken?: string
  readonly version?: string
  readonly analyzer?: BrokerAnalyzer
}

export type OpencodeBrokerServer = {
  readonly port: number
  readonly stop: () => void
}

export function createOpencodeBrokerApp(options: OpencodeBrokerOptions = {}): Hono {
  const app = new Hono()
  const analyzer = options.analyzer ?? deterministicBrokerAnalyzer
  const brokerVersion = options.version ?? version

  app.get("/health", (c) =>
    c.json({
      ok: true,
      version: brokerVersion,
      supports: {
        protocol_versions: [1],
        analysis_types: ["risk"],
        prompt_versions: ["risk-v1"],
      },
    }),
  )

  app.post("/spec/analyze", async (c) => {
    if (
      options.brokerToken !== undefined &&
      c.req.header("authorization") !== `Bearer ${options.brokerToken}`
    ) {
      return c.json({ error: "unauthorized" }, 401)
    }

    const rawRequest = await c.req.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) {
        return null
      }
      throw error
    })
    const parsed = brokerAnalyzeRequestSchema.safeParse(rawRequest)
    if (!parsed.success) {
      return c.json({ error: "invalid broker analysis request" }, 400)
    }

    const brokerRunId = createBrokerRunId()
    const result = await Promise.resolve(analyzer(parsed.data)).catch((error: unknown) => {
      if (error instanceof BrokerAnalysisError) {
        return error
      }
      throw error
    })
    if (result instanceof BrokerAnalysisError) {
      return c.json(
        {
          error: result.message,
          broker_run_id: result.brokerRunId,
          partialResult: result.partialResult,
        },
        502,
      )
    }
    return c.json({
      broker_run_id: brokerRunId,
      findings: result.findings,
      usage: result.usage ?? emptyBrokerUsage,
      partialResult: result.partialResult ?? null,
    })
  })

  return app
}

export function startOpencodeBroker(options: OpencodeBrokerOptions = {}): OpencodeBrokerServer {
  const port = Number.parseInt(process.env["RETROSPEC_OPENCODE_BROKER_PORT"] ?? "9000", 10)
  const hostname = process.env["RETROSPEC_OPENCODE_BROKER_HOST"] ?? "127.0.0.1"
  const analyzer =
    options.analyzer ?? ((request) => opencodeCliBrokerAnalyzer(request, createBrokerRunId()))
  const app = createOpencodeBrokerApp({ ...options, analyzer })
  const server = Bun.serve({ hostname, port, fetch: app.fetch })
  const boundPort = server.port
  if (boundPort === undefined) {
    server.stop(true)
    throw new Error("retrospec opencode broker did not receive a listening port")
  }
  return { port: boundPort, stop: () => server.stop(true) }
}

export async function runOpencodeBrokerForever(): Promise<void> {
  const brokerToken = process.env["RETROSPEC_SPEC_BROKER_TOKEN"]
  const options = brokerToken === undefined ? {} : { brokerToken }
  const broker = startOpencodeBroker(options)
  console.log(`retrospec opencode broker listening on 127.0.0.1:${broker.port}`)
  await new Promise<never>(() => {})
}

function createBrokerRunId(): string {
  return `brun_${randomUUID().replaceAll("-", "").slice(0, 16)}`
}
