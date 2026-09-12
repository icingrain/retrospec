import type { Context } from "hono"
import type { AnalysisScope } from "./analysis-scope"

export function savedScopeConfirmationResponse(c: Context, scope: AnalysisScope): Response {
  return c.json(
    {
      error: "saved analysis scope requires confirmation",
      confirmation: {
        kind: "saved_analysis_scope",
        message:
          "A saved dashboard scope exists. Confirm before running Spec with this saved setting.",
        scope,
      },
    },
    409,
  )
}
