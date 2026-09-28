# Install

OpenCode 2 sidebar plugin that shows Ollama Cloud session and weekly usage.

## Prerequisites

- **OpenCode 2** — the terminal CLI. Verify with:
  ```bash
  opencode2 --version   # prints 2.x
  ```
- Node.js or Bun (to build the plugin).
- An Ollama Cloud account with a valid `__Secure-session` cookie.

> This plugin targets **OpenCode 2** only. It uses the new V2 plugin API
> (`@opencode/plugin/tui`, `Plugin.define`, `context.ui.slot`). For OpenCode 1,
> use the separate `opencode-ollama-stats-plugin`.

## Quick install (from source)

```bash
git clone git@github.com:anibalardid/opencode-v2-ollama-usage-stats-plugin.git
cd opencode-v2-ollama-usage-stats-plugin
npm install
npm run build          # emits tui.js at the repo root
```

Then pick one registration mode:

**A. Register as a package path** in `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["/absolute/path/to/opencode-v2-ollama-usage-stats-plugin"]
}
```

**B. Symlink into the plugins directory** (auto-discovered, no config edit):

```bash
ln -s "$(pwd)" ~/.config/opencode/plugins/ollama-cloud-usage
```

Restart the OpenCode 2 TUI. You'll see an **Ollama Cloud** section in the sidebar
of any session.

> If you isolate OpenCode 2 with a custom config dir, use that dir's `cli.json` /
> `plugins/` instead (e.g. `~/.config/opencode-v2/`).

The build emits **`tui.js` at the repository root** on purpose: OpenCode 2
discovers a local plugin *directory* by looking for `tui.ts` / `tui.js` at the
directory root, not via `package.json` `exports`.

## Cookie setup

The plugin needs your `__Secure-session` cookie from
[ollama.com/settings](https://ollama.com/settings).

**Option A — env var (recommended):**

```bash
export OLLAMA_USAGE_COOKIE="your-cookie-value"
```

**Option B — config file:** create
`~/.config/opencode/opencode-quota/ollama-cloud.json`:

```json
{ "cookie": "your-cookie-value" }
```

**Option C — legacy YAML:** create `~/.config/ollama-usage/config.yaml` (or
`~/.ollama-usage/config.yaml`):

```yaml
cookie: "your-cookie-value"
```

### How to get the cookie

1. Open [ollama.com/settings](https://ollama.com/settings) and sign in.
2. Open DevTools (`F12`, or `Cmd+Opt+I` on macOS).
3. **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** →
   `ollama.com`.
4. Find `__Secure-session` and copy its **Value**.
5. Paste it into one of the locations above. Do not share it with anyone.

The cookie expires after a while — when the panel shows an auth error, re-copy
it from DevTools.

## How to update

```bash
cd opencode-v2-ollama-usage-stats-plugin
git pull
npm install
npm run build
# Restart the OpenCode 2 TUI
```

## Uninstall

Remove the entry from `~/.config/opencode/cli.json` (or delete the symlink under
`~/.config/opencode/plugins/`), then delete the folder:

```bash
rm -rf opencode-v2-ollama-usage-stats-plugin
```

## Requirements

- macOS / Linux
- OpenCode 2 (`opencode2`)
- An active Ollama Cloud account with a valid session cookie
