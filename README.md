# ccx

[English](README.en.md)

`ccx` 是 Claude Code 与 Codex CLI 的命令行工具：管理**生效配置**、**预设**，并支持加密同步到 GitHub。

**核心原则：Claude 与 Codex 完全独立。** Claude 预设只能用于 Claude，Codex 预设只能用于 Codex；没有任何命令会同时改写两个工具。

| 概念 | 含义 |
|------|------|
| **生效配置** | 工具实际读取的文件：`~/.claude/settings.json`、`~/.codex/config.toml` 等 |
| **预设** | 保存在 `~/.ccx/agents/` 下的命名配置，可随时切换 |

需要 Node.js **≥ 20**。

---

## 安装

```bash
git clone <repo-url>
cd ccx
npm install
npm run build
npm link
```

验证：

```bash
ccx --version
```

---

## 快速上手

### 直接运行：交互菜单

不带参数启动会进入主菜单：

```bash
ccx
```

可选择 Claude / Codex 浏览预设、扫描当前生效配置、推送/拉取、设置等。进入 Claude 或 Codex 后默认进入 **browse** 交互界面。

### 一键创建预设

交互式（逐步提问，可留空跳过非必填项）：

```bash
ccx claude create
ccx codex create
```

也可指定名称并用参数一次性填写：

```bash
# Codex：名称、Key、API 地址、模型
ccx codex create daye \
  --key "sk-xxx" \
  --api-url "https://api.example.com" \
  --model "gpt-5.4" \
  --reasoning-effort "medium"

# Claude：名称、Key、API 地址、各模型名
ccx claude create anyrouter \
  --key "your-token" \
  --api-url "https://api.example.com" \
  --model "claude-sonnet-4-6" \
  --reasoning-model "..." \
  --haiku-model "..." \
  --sonnet-model "..." \
  --opus-model "..."
```

`create` 只写入预设目录，**不会**自动切换到生效配置。要立刻使用请执行 `use`。

### 一键切换生效配置

```bash
ccx claude use anyrouter
ccx codex use daye
```

切换前会自动备份当前生效文件到 `~/.ccx/backups/`（可用 `--no-backup` 跳过）。切换后请**重启**对应的 Claude Code 或 Codex CLI。

### 从当前生效配置保存为预设

已在工具里配好 API，想存成预设：

```bash
ccx claude save my-claude
ccx codex save my-codex
```

`save` 会读取当前生效文件并写入预设，同时将该预设记为「当前启用」。

---

## 常用命令

### 浏览与管理

```bash
ccx list                    # 列出全部 Claude + Codex 预设

ccx claude list             # 仅 Claude
ccx claude browse           # 交互：使用 / 查看 / 编辑 / 对比 / 删除
ccx claude show [name]      # 查看预设（省略名则用当前启用或选择）
ccx claude edit <name>      # 编辑（会回显当前值）
ccx claude diff <name>      # 与当前生效配置对比
ccx claude remove <name>    # 删除预设

ccx codex list
ccx codex browse
ccx codex show [name]
ccx codex edit <name>
ccx codex diff <name>
ccx codex remove <name>
```

`show`、`list`、`diff` 会对 Key / Token 做脱敏显示。

### 查看当前生效配置

```bash
ccx scan
```

### 语言

首次运行若无 `state.yaml` 会询问语言。也可手动设置：

```bash
ccx setting --language zh-CN
ccx setting --language en
```

### GitHub 加密同步

同步**所有** Claude 与 Codex 预设（不含 `state.yaml`、`backups/`）：

```bash
# 配置仓库与 Token
ccx setting --repo owner/ccx-profiles --token ghp_xxx

ccx push    # 上传（AES-256-GCM 加密）
ccx pull    # 下载并合并到本地
```

推送前顺便保存当前生效配置：

```bash
ccx push --save-current-claude anyrouter --save-current-codex daye
```

远程默认路径：`.ccx/profiles.enc.json`。

**仓库不存在时**：`push` 会询问是否创建，**默认私有**。非交互示例：

```bash
ccx push --repo yourname/ccx-profiles --create-repo --yes
```

**Token**：可通过 `--token`、`GITHUB_TOKEN`、`GH_TOKEN` 或 `state.yaml` 中已保存的值提供；否则会打开 GitHub 创建 Token 页面。保存到本机前会确认（或使用 `--save-token` / `ccx setting --token`）。`state.yaml` 中的 Token 为明文，仅在可信机器上保存。

### 从 cc-switch 导入

若本机安装了 [cc-switch](https://github.com/farion1231/cc-switch)，可从其 SQLite 数据库导入预设：

```bash
ccx migrate-ccs
```

读取 `~/.cc-switch/cc-switch.db`，勾选要导入的供应商。

---

## 目录结构

```text
~/.ccx/
├── agents/
│   ├── claude/<预设名>/settings.json, meta.yaml
│   └── codex/<预设名>/config.toml, auth.json, meta.yaml
├── backups/          # use 前的生效配置备份
└── state.yaml        # 语言、GitHub 仓库、Token 等（不同步到 GitHub）
```

写入的生效路径：

```text
Claude Code:  ~/.claude/settings.json
Codex CLI:    ~/.codex/config.toml、~/.codex/auth.json
```

Codex 合并时会保留本地的 `mcp_servers`、`projects` 等 ccx 未管理的字段。

---

## 安全说明

- 本地预设与生效配置中的 Key 均为明文（与各工具原生行为一致）；Unix 上会限制目录权限。
- GitHub 上的同步包经口令派生的 AES-256-GCM 加密。
- `use` 默认备份，避免切换覆盖后无法恢复。

---

## 开发

```bash
npm run lint      # 类型检查
npm test          # 单元测试
npm run build     # 编译到 dist/
npm run dev       # tsx 直接运行源码
```

从源码调试：

```bash
npm run dev -- claude list
```

---

## 发布

版本号以 `package.json` 为准。打 tag 触发 CI 发布到 npm（需在仓库配置 `NPM_TOKEN`）：

```bash
npm version patch
git push origin main --follow-tags
```

npm 包名若与已有包冲突，请使用 scoped 名称（如 `@your-scope/ccx`），CLI 命令仍为 `ccx`。

---

## 贡献

欢迎 Issue 与 Pull Request。提交前请确保 `npm run lint` 与 `npm test` 通过。

---

## 许可证

[MIT](LICENSE)
