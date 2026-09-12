# Agent install and daemon recovery guide

This guide is for users asking an OpenCode agent to install Retrospec or recover a confused daemon state.

## Support scope

The current public release is built for OpenCode workflows. Treat `.opencode/retrospec.jsonc`, repo-local `agents/`, `skills/`, and daemon-first status checks as part of the expected setup.

Claude Code standalone, Codex standalone, and other agent hosts are not directly supported yet.

## Goal

Do not stop after confirming that the package is installed. Verify that `retrospec status .` works from the requested project and reports the current daemon version plus a dashboard URL.

## Basic flow

```bash
npm install -g retrospec-agent
cd /path/to/project
retrospec status .
```

`retrospec status .` tries to auto-start a daemon when no usable daemon exists or when the daemon version does not match the current CLI version. A separate `retrospec daemon` step is optional for normal setup.

For an OpenCode project, also check that `.opencode/retrospec.jsonc`, `agents/`, `skills/`, and `templates/` are present in the package/repo surface.

## Verify

```bash
npm list -g retrospec-agent --depth=0
which retrospec
retrospec status .
```

Confirm:

- `daemon: healthy (<installed-version>)`
- `project: <current project path>`
- `dashboard: http://127.0.0.1:<port>`
- if `retro:` or `spec:` is `unknown`, report the missing endpoint/status evidence

## Recover an old daemon

After an upgrade, an older daemon can keep running with the previous version, a stale port, or another workspace.

```bash
ps aux | grep retrospec
lsof -nP -iTCP:<port> -sTCP:LISTEN
```

Only kill a process after confirming it is a Retrospec daemon.

```bash
kill <old-daemon-pid>
cd /path/to/project
retrospec status .
```

## Notes

- `retrospec --version` may not be available yet; use npm to check the package version.
- Do not describe this release as working the same way in Claude Code, Codex, or other hosts.
- A port such as `127.0.0.1:8000` may belong to another local service; inspect the process and health body before assuming it is Retrospec.
- If multiple daemons are running, dashboard and daemon ports can appear inconsistent.
- Do not run npm publish, create tags, or push git changes unless the user explicitly asks.
