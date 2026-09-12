# Agent install and daemon recovery guide

이 문서는 사용자가 OpenCode agent에게 Retrospec 설치나 daemon 상태 정리를 맡길 때 참고시키는 짧은 운영 가이드입니다.

현재 공개 버전은 OpenCode에서 바로 사용할 수 있도록 맞춰져 있습니다. 다른 agent host가 이 문서를 읽을 수는 있지만, 설치 확인과 agent routing은 OpenCode의 `agents/`, `skills/`, `.opencode/retrospec.jsonc` 구성을 기준으로 판단합니다.

## 목표

OpenCode agent는 설치 여부만 확인하고 끝내지 말고, 사용자가 지정한 프로젝트에서 실제로 `retrospec status .`가 현재 버전 daemon과 dashboard URL을 보여주는지 확인해야 합니다.

OpenCode가 아닌 환경에서는 Retrospec agent 등록과 hook/config surface가 자동으로 연결된다고 가정하지 말고, 사용자가 OpenCode에서 실행하려는지 먼저 확인합니다.

## 기본 절차

```bash
npm install -g retrospec-agent
cd /path/to/project
retrospec status .
```

`retrospec status .`는 usable daemon이 없거나 CLI 버전과 맞지 않으면 daemon 자동 시작을 시도합니다. 따라서 일반적인 설치 확인은 별도 `retrospec daemon` 실행 없이 status로 시작해도 됩니다.

OpenCode 프로젝트에서는 공개 패키지의 `.opencode/retrospec.jsonc`, `agents/`, `skills/`, `templates/`가 함께 있는지 확인합니다.

## 확인해야 할 것

```bash
npm list -g retrospec-agent --depth=0
which retrospec
retrospec status .
```

상태 출력에서 확인합니다.

- `daemon: healthy (<installed-version>)`
- `project: <current project path>`
- `dashboard: http://127.0.0.1:<port>`
- `retro:` 또는 `spec:` 상태가 `unknown`이면 어떤 endpoint/status evidence가 빠졌는지 확인

## 오래된 daemon 정리

새 버전 설치 후에도 status가 예전 버전, 다른 workspace, 또는 stale port를 가리키면 실행 중인 daemon을 확인합니다.

```bash
ps aux | grep retrospec
lsof -nP -iTCP:<port> -sTCP:LISTEN
```

Retrospec daemon으로 확인된 오래된 프로세스만 종료합니다.

```bash
kill <old-daemon-pid>
cd /path/to/project
retrospec status .
```

## 주의사항

- `retrospec --version`은 현재 지원되지 않을 수 있으므로 npm 설치 버전으로 확인합니다.
- 현재 release는 OpenCode workflow 기준입니다. Claude Code, Codex, 기타 host에서 동일한 agent command가 동작한다고 안내하지 않습니다.
- `127.0.0.1:8000` 같은 포트가 Retrospec이 아닌 다른 Python/API 프로세스일 수 있으니 `/health` 응답의 version/workspace만 보고 단정하지 않습니다.
- 여러 daemon이 떠 있으면 dashboard 포트와 이전에 직접 실행한 daemon 포트가 다를 수 있습니다.
- 사용자가 명시적으로 요청하지 않으면 npm publish, git push, tag 생성은 하지 않습니다.
