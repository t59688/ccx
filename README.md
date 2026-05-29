# ccx

`ccx` is a CLI for Claude Code and Codex: **live configs**, **presets**, and encrypted GitHub sync.

The core rule is: **Claude and Codex are completely independent**. A Claude configuration can only be applied to Claude. A Codex configuration can only be applied to Codex. No command applies one profile to both tools at the same time.

## Install from source

```bash
npm install
npm run build
npm link
```

The CLI command is **`ccx`**. Data lives under `~/.ccx/`.

## Storage

```text
~/.ccx/
├── agents/
│   ├── claude/
│   │   ├── anyrouter/
│   │   │   ├── settings.json
│   │   │   └── meta.yaml
│   │   └── other-claude-provider/
│   └── codex/
│       ├── daye/
│       │   ├── config.toml
│       │   ├── auth.json
│       │   └── meta.yaml
│       └── other-codex-provider/
├── backups/
└── state.yaml                        # local only, not uploaded
```

Native files written by `use`:

```text
Claude Code: ~/.claude/settings.json
Codex CLI:   ~/.codex/config.toml and ~/.codex/auth.json
```

`ccx claude use <name>` backs up and writes only Claude files.  
`ccx codex use <name>` backs up and writes only Codex files.

## Create a Codex configuration

Codex creation only asks for the named configuration, key, API address, and model name. Everything else is generated automatically.

```bash
ccx codex create daye \
  --key "sk-222" \
  --api-url "https://icoe.pp.ua" \
  --model "gpt-5.4"
```

Generated `auth.json`:

```json
{
  "OPENAI_API_KEY": "sk-222"
}
```

Generated `config.toml`:

```toml
model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "xhigh"   # optional; set via --reasoning-effort when creating
disable_response_storage = true

[model_providers]
[model_providers.custom]
name = "custom"
base_url = "https://icoe.pp.ua"
wire_api = "responses"
requires_openai_auth = true
```

Apply only Codex:

```bash
ccx codex use daye
```

## Create a Claude configuration

Claude creation only asks for the named configuration, key, API address, and model names. Everything else is generated automatically.

```bash
ccx claude create anyrouter \
  --key "123132" \
  --api-url "http://xxx" \
  --model "xx1" \
  --reasoning-model "xx2" \
  --haiku-model "xx3" \
  --sonnet-model "xx4" \
  --opus-model "xx5"
```

Generated `settings.json`:

```json
{
  "env": {
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "xx5",
    "ANTHROPIC_MODEL": "xx1",
    "ANTHROPIC_REASONING_MODEL": "xx2",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "xx4",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "xx3",
    "ANTHROPIC_BASE_URL": "http://xxx",
    "ANTHROPIC_AUTH_TOKEN": "123132"
  },
  "autoUpdatesChannel": "latest"
}
```

Apply only Claude:

```bash
ccx claude use anyrouter
```

## Browse, list, show, edit, remove

```bash
ccx list

# Claude configurations
ccx claude list
ccx claude browse
ccx claude show anyrouter
ccx claude edit anyrouter
ccx claude remove anyrouter

# Codex configurations
ccx codex list
ccx codex browse
ccx codex show daye
ccx codex edit daye
ccx codex remove daye
```

`show`, `list`, and `diff` redact tokens and keys.

## Save existing native configs

```bash
# Save only current Claude native files into a Claude configuration
ccx claude save current-claude

# Save only current Codex native files into a Codex configuration
ccx codex save current-codex
```

Legacy combined-profile commands such as `ccx use <profile>` are deprecated and intentionally hidden from the main CLI flow.

## Sync all configurations

`push` syncs **all independent Claude configurations and all independent Codex configurations**. It does not sync `state.yaml` or `backups/`.

```bash
ccx setting --repo owner/ccx-profiles --token ghp_xxx

ccx push

ccx pull
```

You can save current native files before pushing:

```bash
ccx push --save-current-claude anyrouter --save-current-codex daye
```

The remote file is an AES-256-GCM encrypted JSON envelope at `.ccx/profiles.enc.json` by default.

## i18n

The CLI supports English and Simplified Chinese.

```bash
ccx setting --language en
ccx setting --language zh-CN
```

## Safety

- Local configuration files contain plaintext keys, same as the native Claude/Codex files. Directory/file permissions are restricted on Unix-like systems.
- GitHub sync is encrypted with a passphrase-derived AES-256-GCM key.
- Before `use`, only the target tool's current native config files are backed up under `~/.ccx/backups/` unless `--no-backup` is passed.
- Codex config merge preserves local-only sections such as `mcp_servers` and `projects` when applying a configuration.

### GitHub repository creation and token handling

`ccx push` syncs all local Claude and Codex configuration stores as one encrypted bundle. If the configured GitHub repository does not exist, the CLI will ask whether to create it. New repositories are **private by default**.

```bash
ccx push --repo yourname/ccx-profiles
# non-interactive: create missing repo as private
ccx push --repo yourname/ccx-profiles --create-repo --yes
# only if you intentionally want a public repo
ccx push --repo yourname/ccx-profiles --create-repo --public-repo
```

If no GitHub token is provided by `--token`, `GITHUB_TOKEN`, `GH_TOKEN`, or saved state, the CLI opens the GitHub token creation page and asks you to paste the token. Use a token with `repo` permission when syncing to private repositories or creating repositories. The CLI does **not** silently store a token. It asks before saving prompted tokens, or you can opt in explicitly:

```bash
ccx push --repo yourname/ccx-profiles --save-token
ccx setting --token ghp_xxx
```

Saved tokens are kept in `~/.ccx/state.yaml` as plain text, so only save a token on machines you trust. The uploaded configuration bundle is still encrypted before it is committed to GitHub.
