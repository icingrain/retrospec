# retrospec-session-start hook policy

## Purpose

Provide a lightweight session-start reminder for retrospec agents.

This hook is enabled by default for OpenCode plugin mode. Daemon health and `/analysis/status` remain authoritative when plugin hooks are unavailable or explicitly disabled.

## Allowed behavior

- Check daemon health or remind the agent to check daemon health.
- Remind the agent to call `/analysis/status` before large DB/API/source analysis.
- Surface the dashboard URL or project status hint when already available.
- Remind the active Retrospec agent to show an `Agent decision: agent=<agent> skill=<skill|none> reason=<reason>` line in the OpenCode conversation before routing, skill work, preview, or job submission.

## Forbidden behavior

- Do not start retro/spec/Archivist analysis.
- Do not submit daemon jobs.
- Do not write `.retrospec/` state.
- Do not mutate `job_snapshot`, `job_ledger`, `workflow_handoff`, or analysis DBs.

## Config surface

- `retrospec.hooks_enabled` controls whether plugin hooks are active.
- `retrospec.disabled_hooks` can disable this hook by name.
- `retrospec.required_policy` includes `agent-decision-openCode-conversation-line` so installed OpenCode configs keep the visible agent/skill/reason reminder discoverable.
- Daemon health and `/analysis/status` remain the source of truth even when this hook is disabled.

## Manual QA

1. Start a retrospec session and confirm the hook only emits health/status guidance.
2. Confirm the first visible agent response includes the `Agent decision` line with agent, skill or none, and reason.
3. Disable the hook and confirm agents still work through daemon API and `/analysis/status`.
4. Confirm no analysis DB, handoff row, or job ledger row changes during the hook.
