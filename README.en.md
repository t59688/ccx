# ccx

[中文](README.md)

`ccx` is a CLI for **Claude Code** and **Codex**: manage **live configs**, **presets**, and encrypted GitHub sync.

**Claude and Codex are fully independent.** A Claude preset only applies to Claude; a Codex preset only applies to Codex. No command updates both tools at once.

| Term | Meaning |
|------|---------|
| **Live config** | What the tool reads today: `~/.claude/settings.json`, `~/.codex/config.toml`, etc. |
| **Preset** | Named profile under `~/.ccx/agents/` that you can switch anytime |

Requires Node.js **≥ 20**.

---

## Install

```bash
git clone <repo-url>
cd ccx
npm install
npm run build
npm link
```

Verify:

```bash
ccx --version
```

---

## Quick start

### Run with no args: interactive menu

```bash
ccx
```

Pick Claude/Codex browse, scan live configs, push/pull, settings, and more. Choosing Claude or Codex opens the **browse** UI by default.

### Create a preset in one go

Interactive (prompts step by step):

```bash
ccx claude create
ccx codex create
```

Or pass flags:

```bash
ccx codex create daye \
  --key "sk-xxx" \
  --api-url "https://api.example.com" \
  --model "gpt-5.4" \
  --reasoning-effort "medium"

ccx claude create anyrouter \
  --key "your-token" \
  --api-url "https://api.example.com" \
  --model "claude-sonnet-4-6" \
  --reasoning-model "..." \
  --haiku-model "..." \
  --sonnet-model "..." \
  --opus-model "..."
```

`create` only writes under `~/.ccx/agents/`; it does **not** switch the live config. Run `use` to apply.

### Switch live config in one command

```bash
ccx claude use anyrouter
ccx codex use daye
```

Backs up current live files to `~/.ccx/backups/` first (skip with `--no-backup`). **Restart** Claude Code or Codex after switching.

### Save live config as a preset

```bash
ccx claude save my-claude
ccx codex save my-codex
```

Reads the current live files, stores a preset, and marks it as the active preset.

---

## Common commands

### Browse and manage

```bash
ccx list

ccx claude list | browse | show [name] | edit <name> | diff <name> | remove <name>
ccx codex list  | browse | show [name] | edit <name> | diff <name> | remove <name>
```

`show`, `list`, and `diff` redact keys and tokens.

### Inspect live config

```bash
ccx scan
```

### Language

On first run you may be asked for a language. Or set explicitly:

```bash
ccx setting --language en
ccx setting --language zh-CN
```

### Encrypted GitHub sync

Syncs **all** Claude and Codex presets (not `state.yaml` or `backups/`):

```bash
ccx setting --repo owner/ccx-profiles --token ghp_xxx
ccx push
ccx pull
```

Save live configs before push:

```bash
ccx push --save-current-claude anyrouter --save-current-codex daye
```

Default remote path: `.ccx/profiles.enc.json` (AES-256-GCM).

If the repo is missing, `push` can create it (**private by default**):

```bash
ccx push --repo yourname/ccx-profiles --create-repo --yes
```

Tokens: `--token`, `GITHUB_TOKEN`, `GH_TOKEN`, or saved in `state.yaml`. You are prompted before saving locally (`--save-token` / `ccx setting --token`). Tokens in `state.yaml` are plain text—only on trusted machines.

### Import from cc-switch

If [cc-switch](https://github.com/farion1231/cc-switch) is installed:

```bash
ccx migrate-ccs
```

Reads `~/.cc-switch/cc-switch.db` and lets you pick providers to import.

---

## Layout

```text
~/.ccx/
├── agents/
│   ├── claude/<name>/settings.json, meta.yaml
│   └── codex/<name>/config.toml, auth.json, meta.yaml
├── backups/
└── state.yaml        # language, GitHub repo, token (not synced)
```

Live paths:

```text
Claude Code:  ~/.claude/settings.json
Codex CLI:    ~/.codex/config.toml, ~/.codex/auth.json
```

Codex merge keeps local-only sections such as `mcp_servers` and `projects`.

---

## Safety

- Keys in presets and live files are stored in plain text (same as native tool configs). Unix permissions are tightened where possible.
- GitHub bundles are encrypted with a passphrase-derived AES-256-GCM key.
- `use` backs up live configs by default.

---

## Development

```bash
npm run lint
npm test
npm run build
npm run dev
```

```bash
npm run dev -- claude list
```

---

## Release

Version is taken from `package.json`. Tag push publishes to npm (set `NPM_TOKEN` in the repo):

```bash
npm version patch
git push origin main --follow-tags
```

If the bare name `ccx` is taken on npm, publish as a scoped package (e.g. `@your-scope/ccx`); the CLI binary remains `ccx`.

---

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` and `npm test` before submitting.

---

## License

[MIT](LICENSE)
