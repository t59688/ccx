# Architecture review

## v0.7 decision

The CLI now treats Claude Code and Codex CLI as two completely independent configuration domains.

- Main path: `ccx claude ...` and `ccx codex ...`.
- A Claude configuration is stored only under `~/.ccx/agents/claude/<name>/`.
- A Codex configuration is stored only under `~/.ccx/agents/codex/<name>/`.
- Applying a Claude configuration writes only `~/.claude/settings.json` and optional `~/.claude/config.json`.
- Applying a Codex configuration writes only `~/.codex/config.toml` and `~/.codex/auth.json`.
- Legacy combined profile commands are removed from the main CLI flow.

## Apply logic

Write operations are centralized:

- `src/core/apply-claude.ts` applies Claude profiles to native Claude files.
- `src/core/apply-codex.ts` applies Codex profiles to native Codex files.
- `src/core/agent-profiles.ts` loads the selected profile, creates an agent-only backup, and dispatches to the correct apply module.

This prevents accidental cross-writes such as applying one profile to both Claude and Codex.

## i18n

All active command descriptions, prompts, status messages, errors, and summaries are routed through `src/utils/i18n.ts`.

Supported languages:

- `zh-CN`
- `en`

Configured with:

```bash
ccx setting --language zh-CN
ccx setting --language en
```

## Sync

`ccx push` packages only `~/.ccx/agents/`, which contains all independent Claude and Codex configurations. It does not package `state.yaml`, `backups/`, or legacy combined profiles.

`ccx pull` unpacks the encrypted bundle back into the local `~/.ccx` store. Existing files are preserved unless `--overwrite` is provided.
