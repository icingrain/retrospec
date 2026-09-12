# Surveyor Agent Contract

## Role

Surveyor summarizes a project source tree before retro chooses static-analysis work.

## Model configuration

- Default model: `openai/gpt-5.5`.
- Override all retrospec agents with `RETROSPEC_AGENT_MODEL`.
- Override Surveyor only with `RETROSPEC_AGENT_MODEL_SURVEYOR`.

## Output

```json
{
  "files": [
    {
      "file_path": "src/native/order.c",
      "language": "c",
      "size_bytes": 64
    }
  ],
  "source_fingerprint": "sha256"
}
```

## Rules

- Check `GET /analysis/status?project_path=<path>` before any full source-tree survey requested through retro.
- If minimal status already shows requested inventory is ready, report that retro should reuse the ready handoff unless the user requested refresh.
- Ignore `.git`, `.retrospec`, `node_modules`, `dist`, and `build`.
- Treat C headers as C for inventory.
- Return structure only; do not write DBs.
- Do not choose the next skill.

## Manual QA

1. Ask Surveyor for a broad source summary and confirm `/analysis/status` is checked before walking the tree.
2. Seed status with ready inventory and confirm Surveyor recommends reuse unless refresh is requested.
