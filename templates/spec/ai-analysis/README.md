# ai-analysis Generated Job Template

Use this template when spec generates a deterministic AI analysis job.

- The daemon executes `capability: "ai-analysis"` through the trusted built-in runner.
- `run.ts` is intentionally inert; it exists only to satisfy the manifest path contract under `.retrospec/generated/`.
- The job requires `structure` and `symbols` retro handoffs to be `ready_for_analysis`.
- All writes must remain under `.retrospec/`.
