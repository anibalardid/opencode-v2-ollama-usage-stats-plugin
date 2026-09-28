# OpenCode V2 — Ollama Cloud Usage Stats

A sidebar plugin for **OpenCode 2** that shows your **Ollama Cloud** session and
weekly usage, scraped from [ollama.com/settings](https://ollama.com/settings).

```
▼ Ollama Cloud (pro)            45.3%
  Session                       45.3% used
  ████░░░░ 45.3%
  Reset in 7h
  Weekly                        69.5% used
  ██████░░ 69.5%
  Reset in 3d
```

- 🔴 red circle ≥ 80% · 🟡 yellow circle ≥ 50%
- Refreshes every 3 minutes; self-heals after network errors
- Click the header to collapse/expand (state is persisted)

> This is the **OpenCode 2** (`opencode2` / `@opencode/cli`) plugin, using the new
> V2 plugin API. The OpenCode 1 plugin lives in
> [`opencode-ollama-stats-plugin`](https://github.com/anibalardid/opencode-ollama-stats-plugin)
> and uses the older `@opencode-ai/plugin` API. **V1 plugins do not run in V2** —
> the APIs are different; the implementation had to be ported (see
> [How this differs from V1](#how-this-differs-from-v1)).

## Requirements

- **OpenCode 2** — the terminal CLI (`opencode2`, npm package `@opencode/cli`).
  Check with `opencode2 --version` (prints `2.x`).
- Node.js or Bun (only to build the plugin).
- An Ollama Cloud account and a valid `__Secure-session` cookie.

## Install

### From source (recommended while developing)

```bash
git clone git@github.com:anibalardid/opencode-v2-ollama-usage-stats-plugin.git
cd opencode-v2-ollama-usage-stats-plugin
npm install
npm run build
```

Then register the plugin directory in your global OpenCode 2 CLI config
(`~/.config/opencode/cli.json`):

```json
{
  "plugins": ["/absolute/path/to/opencode-v2-ollama-usage-stats-plugin"]
}
```

Restart the OpenCode 2 TUI. You'll see an **Ollama Cloud** section in the sidebar.

Alternatively, drop the built plugin under the global plugins directory
`~/.config/opencode/plugins/ollama-cloud-usage/` (OpenCode discovers it
automatically — no `cli.json` entry needed).

`npm run build` produces `dist/tui.js`, which is the entrypoint exposed through
`package.json` → `exports["./tui"]`.

## Cookie setup

The plugin needs your `__Secure-session` cookie from
[ollama.com/settings](https://ollama.com/settings).

**Option A — env var (recommended):**

```bash
export OLLAMA_USAGE_COOKIE="your-cookie-value"
```

**Option B — config file:**

Create `~/.config/opencode/opencode-quota/ollama-cloud.json`:

```json
{ "cookie": "your-cookie-value" }
```

**Option C — legacy YAML:**

- `~/.config/ollama-usage/config.yaml`
- `~/.ollama-usage/config.yaml`

```yaml
cookie: "your-cookie-value"
```

### How to get the cookie

1. Open [ollama.com/settings](https://ollama.com/settings) and sign in.
2. Open DevTools (`F12`, or `Cmd+Opt+I` on macOS).
3. Go to **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** →
   `ollama.com`.
4. Find `__Secure-session` and copy its **Value** (a long opaque string).
5. Paste it into one of the locations above. Do not share it with anyone.

The cookie expires after a while — when the panel shows an auth error, re-copy
it from DevTools.

## How it works

1. Resolves the cookie from `OLLAMA_USAGE_COOKIE`, then the JSON/YAML config
   files (in order).
2. Fetches `https://ollama.com/settings` with the cookie and parses:
   - **Session usage** — percentage used in the current session window
   - **Weekly usage** — percentage used in the current weekly window
   - **Reset times** — when each window resets (shown as relative time)
   - **Plan tier** — e.g. `pro`
3. Renders the result in the `sidebar.content` slot via
   `context.ui.slot({ append: "sidebar.content", render })`.
4. Refreshes every 3 minutes. On failure it stops the interval and runs a
   **self-healing retry chain** (fast for the first 3 attempts, then at the
   normal cadence forever) so the panel recovers on its own.

### Two resilience details worth knowing

- **IPv4 fallback.** If the machine has no global IPv6 route (e.g. macOS with a
  link-local Tailscale tunnel) and a host publishes `AAAA` records, the runtime
  `fetch` can pick the IPv6 address and fail instead of falling back to IPv4. On
  any fetch error the plugin resolves an `A` record and retries pinned to that
  IPv4 address, preserving the `Host` header and TLS SNI.
- **Never give up on retries.** A bounded retry chain would leave the panel
  stuck on the error state once the network recovers. The chain retries forever
  at the normal cadence.

## OpenCode 2 plugin architecture (reference)

This section documents the platform the plugin targets, so you can build similar
plugins.

### Where plugins live

OpenCode 2 (`opencode2`, npm `@opencode/cli`) uses a **new plugin API**. V1
plugin modules (`default export { id, tui }`) do **not** load in V2.

- **Global client config:** `~/.config/opencode/cli.json` — the terminal client
  owns it; the background service does not load it. (This replaces the V1
  layered `tui.json(c)` files; the first V2 startup migrates supported settings.)
- **Discovered plugin dirs** (same package layout, server + TUI entrypoints
  together):
  - `~/.config/opencode/plugins/<name>/` (global)
  - `<project>/.opencode/plugins/<name>/` (project)
- **Package entrypoint:** the loader reads `exports["./tui"]`. It does **not**
  fall back to `main` or `exports["."]`. If `exports` exists, only `./tui` or
  `./server` resolve.
- **`cli.json` `plugins` entries:** an npm spec, `@scope/pkg@version`, a
  relative/absolute path, a `file://` URL, or an object
  `{ "package": "...", "options": { ... } }`. Prefix with `-` to disable, use
  `*` / `.*` wildcards. Relative paths resolve from the declaring config file.

### Plugin shape

```tsx
// tui.tsx — exposed via package.json exports["./tui"]
import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "acme.cli",
  setup(context) {
    context.ui.toast.show({ message: "loaded", variant: "success" })
    context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <text>{sessionID}</text>,
    })
    return () => { /* cleanup */ }
  },
})
```

`setup(context)` receives `options`, `location`, `app`, `client` (an
`@opencode/client` talking to the connected server, remote included),
`renderer`, `theme`, `data` (typed events + cached collections), `keymap`,
`storage`, and `ui`. It may return a cleanup function.

### Slots

Insert or replace JSX with `context.ui.slot({ <placement>: "<path>", render })`,
where placements are `prepend`, `append`, `before`, `after`, or `replace`.
Available paths:

`app`, `home.footer`, `home.footer.status`, `prompt.footer`,
`prompt.footer.status`, `prompt.footer.file`, `session.composer.top`,
`session.panel`, `sidebar.content`, `sidebar.footer`.

### V1 ↔ V2 differences

| Concern | OpenCode 1 | OpenCode 2 |
|---|---|---|
| Terminal client config | `~/.config/opencode/tui.json(c)` (global + project, layered) | `~/.config/opencode/cli.json` (single, global) |
| Client config override | `OPENCODE_TUI_CONFIG` | `OPENCODE_CLI_CONFIG_CONTENT` |
| Plugin array key | `plugin` | `plugins` |
| Plugin API | `default { id, tui }` · `@opencode-ai/plugin/tui` | `Plugin.define({ id, setup })` · `@opencode/plugin/tui` |
| Sidebar registration | `api.slots.register({ slots: { sidebar_content } })` | `context.ui.slot({ append: "sidebar.content" })` |
| Persistent state | `api.kv.get/set` | `context.storage.store/memory` |
| Events | `api.event.on("session.updated", cb)` | `context.data.on(type, cb)` / `context.data.listen(cb)` |
| Plugin dirs | `.opencode/plugin/`, `plugins/` | `.opencode/plugins/`, `exports["./tui"]` |
| Server config `opencode.json(c)` | `~/.config/opencode/opencode.json(c)` + project | **same locations** (V2 reads V1 format in memory) |
| Skills | `skill(s)/`, `.claude/skills` | **same** discovery |
| Themes (files) | `~/.config/opencode/themes/` | **same** dir; selection moves to `cli.json` |
| DB / cache / state / logs | `~/.local/share/opencode/…` | **same paths** (shared `opencode.db`) |

**Takeaway:** the base config directory and everything under it are shared
between V1 and V2; only the terminal-client config file (`tui.json` ↔
`cli.json`) and the plugin system are version-specific.

To run V2 fully isolated from V1 (separate config, skills, themes, and DB), give
it its own dirs via environment variables:

```bash
OPENCODE_CONFIG_DIR=~/.config/opencode-v2 \
OPENCODE_DB=~/.local/share/opencode-v2/opencode.db \
opencode2
```

Because V1 and V2 otherwise share `~/.local/share/opencode/opencode.db`, running
the V1 background server and the V2 service at the same time can collide
(`UNIQUE constraint failed: event.aggregate_id, event.seq`). Isolating the DB
avoids this.

## How this differs from V1 (port notes)

The scraping logic (cookie resolution, HTML parsing, IPv4 fallback, retry chain)
is carried over unchanged. The plugin *wiring* is new:

- `export default { id, tui }` → `Plugin.define({ id, setup })`
- `api.slots.register({ slots: { sidebar_content } })` →
  `context.ui.slot({ append: "sidebar.content", render })`
- `api.kv.get/set` → `context.storage.store("prefs", { initial })`
- `ctx.theme.current.text / textMuted` → `context.theme.text.base / .muted`
  (warning color: `context.theme.text.feedback.warning.base`)

## Build & development

```bash
npm install
npm run build     # tsup → dist/tui.js + dist/tui.d.ts
npm run dev       # tsup --watch
```

OpenCode loads the **compiled** `dist/tui.js`, not `src/tui.tsx`. Rebuild and
restart the TUI after every source change. Type-check with
`npx tsc --noEmit -p tsconfig.json`.

## Files

| File | Purpose |
|------|---------|
| `src/tui.tsx` | Plugin source (TSX + Solid.js) |
| `package.json` | Manifest; `exports["./tui"]` is the entrypoint |
| `tsup.config.ts` | Build config |
| `tsconfig.json` | TypeScript config |
| `dist/` | Build output (loaded by OpenCode) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sidebar shows `Auth error`/redirect | Cookie expired — re-copy `__Secure-session` |
| `No cookie configured` | No `OLLAMA_USAGE_COOKIE` and no config file found |
| Panel stuck on an error | A stale build; rebuild and restart the TUI (the retry chain now self-heals) |
| Plugin not loading at all | Confirm it's in `cli.json` `plugins` (or under `~/.config/opencode/plugins/`) and that `exports["./tui"]` resolves |
| `Unable to connect` | No global IPv6 route; the built-in IPv4 fallback handles this |

## License

MIT
