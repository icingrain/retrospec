# code-inventory Generated Job Template

Use this template when retro generates an inventory job.

- The daemon executes `capability: "code-inventory"` through the trusted built-in runner.
- `run.ts` is intentionally inert; it exists only to satisfy the manifest path contract under `.retrospec/generated/`.
- All writes must remain under `.retrospec/`.
- Use `prompt.md` as the planning checklist before Appraiser reviews the manifest.
