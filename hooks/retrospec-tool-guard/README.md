# retrospec-tool-guard hook policy

## Purpose

Guard retrospec write boundaries when plugin hooks are available.

This hook is advisory enforcement for plugin mode. MVP daemon-only mode still relies on Appraiser, manifests, and daemon path guards.

## Allowed behavior

- Warn or block direct writes outside approved retrospec surfaces.
- Remind agents that generated scripts must write under `.retrospec/`.
- Remind Archivist that reports must write under `.retrospec/exports/`.
- Remind glossary import flows to use `.retrospec/uploads/` staging.

## Forbidden behavior

- Do not rewrite a manifest to make it pass review.
- Do not submit jobs or execute generated scripts.
- Do not mark jobs, handoffs, or analysis runs completed.
- Do not replace Appraiser or daemon path validation.

## Guard policy

- retro/spec generated scripts: `.retrospec/generated/**`.
- daemon/job outputs: `.retrospec/jobs/**`, `.retrospec/logs/**`, category DB paths under `.retrospec/retro/**`, `.retrospec/spec/**`.
- Archivist outputs: `.retrospec/exports/**`.
- glossary uploads/import: `.retrospec/uploads/**`, `.retrospec/glossary/**` only through approved import flow.

## Manual QA

1. Attempt a generated-script write outside `.retrospec/` and confirm the hook warns or blocks before daemon submission.
2. Attempt an export outside `.retrospec/exports/` and confirm the hook rejects it.
3. Confirm an approved daemon job path still proceeds through Appraiser and Excavator.
