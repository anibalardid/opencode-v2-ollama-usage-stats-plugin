# OpenCode V2 — Ollama Cloud Usage Stats

A sidebar plugin for **OpenCode 2** that shows your **Ollama Cloud** session and
weekly usage, scraped from [ollama.com/settings](https://ollama.com/settings).

```
▼ Ollama Cloud (pro)             7.0%
  Session                      7.0% used
  ░░░░░░░░ 7.0%
  Reset in 2h
  Weekly                       1.4% used
  ░░░░░░░░ 1.4%
  Reset in 6d
```

- 🔴 red circle ≥ 80% · 🟡 yellow circle ≥ 50%
- Refreshes every 3 minutes; self-heals after network errors
- Click the header to collapse/expand (state is persisted)

> This is the **OpenCode 2** (`opencode2` / `@opencode/cli`) plugin, built on the
> new V2 plugin API. The OpenCode 1 plugin lives in
> [`opencode-ollama-stats-plugin`](https://github.com/anibalardid/opencode-ollama-stats-plugin)
> and uses the older `@opencode-ai/plugin` API. **V1 plugins do not run in V2** —
> the implementation had to be ported (see [Port notes](#port-notes-v1--v2)).

Verified against OpenCode **2.0.18**.

## Requirements

- **OpenCode 2** — the terminal CLI (`opencode2`, npm package `@opencode/cli`).
  Check with `opencode2 --version` (prints `2.x`).
- Node.js or Bun (only to build the plugin).
- An Ollama Cloud account and a valid `__Secure-session` cookie.

## Install

OpenCode 2 loads TUI plugins from two places:

- **A plugin directory** under the OpenCode config dir — auto-discovered, no
  config edit. Because this plugin's built `tui.js` sits at the repo root, the
  repo directory itself *is* a valid plugin directory.
- **An entry in `cli.json`** — a path or package registered explicitly.

The default config dir is `~/.config/opencode/`. If you isolate OpenCode 2 (see
[Isolating OpenCode 2](#isolating-opencode-2-from-v1)) it is
`~/.config/opencode-v2/` instead — swap it into the paths below.

### 1. Build

```bash
git clone git@github.com:anibalardid/opencode-v2-ollama-usage-stats-plugin.git
cd opencode-v2-ollama-usage-stats-plugin
npm install
npm run build
```

`npm run build` emits **`tui.js` at the repository root** (see
[Discovery gotcha](#discovery-gotcha) for why).

### 2. Register it (pick one)

**Option A — symlink the repo into the plugins directory** (auto-discovered, no
config edit):

```bash
ln -s "$(pwd)" ~/.config/opencode/plugins/ollama-cloud-usage
# isolated setup uses: ~/.config/opencode-v2/plugins/ollama-cloud-usage
```

The directory name is free-form — it does not have to match the plugin id.
A symlink means future `npm run build` output is picked up with no re-copy.

**Option B — register the path in `cli.json`:**

```jsonc
// ~/.config/opencode/cli.json  (or ~/.config/opencode-v2/cli.json)
{
  "plugins": ["/absolute/path/to/opencode-v2-ollama-usage-stats-plugin"]
}
```

**Option C — copy the built dir** instead of symlinking:

```bash
mkdir -p ~/.config/opencode/plugins/ollama-cloud-usage
cp package.json tui.js ~/.config/opencode/plugins/ollama-cloud-usage/
```

Re-copy after every rebuild (a symlink avoids this step).

Restart the OpenCode 2 TUI. You'll see an **Ollama Cloud** section in the sidebar
of any session.

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

**Option C — legacy YAML:** `~/.config/ollama-usage/config.yaml` or
`~/.ollama-usage/config.yaml`:

```yaml
cookie: "your-cookie-value"
```

### How to get the cookie

1. Open [ollama.com/settings](https://ollama.com/settings) and sign in.
2. Open DevTools (`F12`, or `Cmd+Opt+I` on macOS).
3. **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** →
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
- **Never give up on retries.** A bounded retry chain would leave the panel stuck
  on the error state once the network recovers. The chain retries forever at the
  normal cadence.

## OpenCode 2 plugin architecture (reference)

This section documents the platform the plugin targets, so you can build similar
plugins.

### Where plugins live and how they are discovered

OpenCode 2 (`opencode2`, npm `@opencode/cli`) uses a **new plugin API**. V1
plugin modules (`default export { id, tui }`) do **not** load in V2.

- **Global client config:** `~/.config/opencode/cli.json` — the terminal client
  owns it; the background service does not load it. (This replaces the V1
  layered `tui.json(c)` files; the first V2 startup migrates supported settings.)
- **Discovered plugin directories:**
  - `~/.config/opencode/plugins/<name>/` (global)
  - `<project>/.opencode/plugins/<name>/` (project)
- **Configured packages** via the `plugins` array in `cli.json` (or a TUI
  component declared in `opencode.json(c)`): an npm spec, `@scope/pkg@version`, a
  relative/absolute path, a `file://` URL, or an object
  `{ "package": "...", "options": { ... } }`. Prefix with `-` to disable, use
  `*` / `.*` wildcards. Relative paths resolve from the declaring config file.

#### Discovery gotcha

For a **discovered directory**, V2 looks for `tui.ts` / `tui.js` at the
directory **root** — it does **not** follow `package.json` `exports["./tui"]`.
A package layout that only exposes `./tui` pointing at `./dist/tui.js` loads
when the path is registered in `cli.json`, but a directory dropped into
`plugins/` will be skipped. Keeping `tui.js` at the root works for **both**
modes, which is why this repo builds to the root.

### Plugin shape

```tsx
// tui.tsx — built to tui.js at the repo root
import { Plugin } from "@opencode/plugin/tui"   // resolved at runtime

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

The module contract: the default export must be `{ id: string, setup: fn }` (the
loader rejects anything else with `Invalid V2 TUI plugin module`). A module
cannot export both `server` and `tui`.

### Slots

Insert or replace JSX with `context.ui.slot({ <placement>: "<path>", render })`,
where placements are `prepend`, `append`, `before`, `after`, or `replace`.
Available paths:

`app`, `home.footer`, `home.footer.status`, `prompt.footer`,
`prompt.footer.status`, `prompt.footer.file`, `session.composer.top`,
`session.panel`, `sidebar.content`, `sidebar.footer`.

`sidebar.content` is only rendered **inside a session** (not on the home screen).

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
| Plugin dirs | `.opencode/plugin/`, `plugins/` | `.opencode/plugins/` (root `tui.js`) |
| Server config `opencode.json(c)` | `~/.config/opencode/opencode.json(c)` + project | **same locations** (V2 reads V1 format in memory) |
| Skills | `skill(s)/`, `.claude/skills` | **same** discovery |
| Themes (files) | `~/.config/opencode/themes/` | **same** dir; selection moves to `cli.json` |
| DB / cache / state / logs | `~/.local/share/opencode/…` | **same paths** (shared `opencode.db`) |

**Takeaway:** the base config directory and everything under it are shared
between V1 and V2; only the terminal-client config file (`tui.json` ↔
`cli.json`) and the plugin system are version-specific.

### Port notes (V1 → V2)

The scraping logic (cookie resolution, HTML parsing, IPv4 fallback, retry chain)
is carried over unchanged. The wiring is new:

- `export default { id, tui }` → `Plugin.define({ id, setup })`
- `api.slots.register({ slots: { sidebar_content } })` →
  `context.ui.slot({ append: "sidebar.content", render })`
- `api.kv.get/set` → `context.storage.store("prefs", { initial })`
- `ctx.theme.current.text / textMuted` → `context.theme.text.base / .muted`
  (warning color: `context.theme.text.feedback.warning.base`)
- `api.lifecycle.onDispose` → the cleanup function returned by `setup`

## Isolating OpenCode 2 from V1

Because V1 and V2 share the base dirs (and the DB), a V2 TUI auto-discovers the
V1 home `~/.config/opencode/plugins/` and tries to load every V1 module → a wall
of `failed to load plugin` warnings ("N plugins failed"). To isolate V2 without
touching V1:

1. **Own config dir:** `~/.config/opencode-v2/` with a minimal `cli.json`, an
   `opencode.json` (`{"share":"disabled"}`), and a `plugins/` dir holding only
   V2-native plugins. `OPENCODE_CONFIG_DIR` makes V2 use it; **V1 ignores
   `OPENCODE_CONFIG_DIR`**, so it's a V2-only lever. Add to `~/.zshrc`:
   ```sh
   export OPENCODE_CONFIG_DIR="$HOME/.config/opencode-v2"
   ```
2. **Own DB:** `~/.config/opencode-v2/service.json` supports an `env` map:
   ```json
   { "env": { "OPENCODE_DB": "/Users/<you>/.local/share/opencode-v2/opencode.db" } }
   ```
   (Also writable with `opencode2 service set env OPENCODE_DB <path>`.) Both V1
   and V2 honor `OPENCODE_DB`, so never export it globally.
3. **Launch:** `OPENCODE_CONFIG_DIR=~/.config/opencode-v2 opencode2 --standalone`.
   `--standalone` runs a private server so the TUI doesn't connect to the shared
   background service (whose plugin list is the *shared* config with all the V1
   failures).

## Development pitfalls (learned the hard way)

- **No `process.env` at module top level.** Accessing `process` while the module
  is evaluated breaks plugin initialization silently (the plugin is discovered
  but `setup` never runs and nothing renders). Read env inside `setup` or lazily
  inside functions. (`configPaths()` in `src/tui.tsx` shows the pattern.)
- **Build to the repo root as `tui.js`.** See
  [Discovery gotcha](#discovery-gotcha).
- **`node --input-type=module -e "import('./tui.js')..."` with a stubbed
  runtime throws `No renderer found`** when you call `render()` — expected; a
  real render needs OpenTUI. Validate the `{ id, setup }` contract via import,
  then test the panel in a real TUI.
- **Restart the TUI after every rebuild** — the running instance keeps the old
  module in memory.
- **Don't gate the build on DTS errors from dead code** — an unreachable `try`
  block can fail `tsup`'s declaration build; keep the source clean.
- **Use `--standalone` when testing an isolated config** — otherwise the TUI
  connects to the shared background service and reflects *its* plugin list.

## Build & development

```bash
npm install
npm run build     # tsup → tui.js + tui.d.ts at the repo root
npm run dev       # tsup --watch
npx tsc --noEmit -p tsconfig.json   # type-check
```

OpenCode loads the **built** `tui.js`, not `src/tui.tsx`. Rebuild and restart
the TUI after every source change.

## Files

| File | Purpose |
|------|---------|
| `src/tui.tsx` | Plugin source (TSX + Solid.js) |
| `tui.js` | Built entrypoint, emitted at the repo root (loaded by OpenCode) |
| `package.json` | Manifest; `main`/`exports` point at `tui.js` |
| `tsup.config.ts` | Build config (outputs to the root) |
| `tsconfig.json` | TypeScript config |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Panel never appears, no error | `process` accessed at module top level → lazy-load env; rebuild + restart |
| Directory in `plugins/` is skipped | `tui.js` not at the dir root → rebuild to the root |
| Sidebar shows `Auth error`/redirect | Cookie expired — re-copy `__Secure-session` |
| `No cookie configured` | No `OLLAMA_USAGE_COOKIE` and no config file found |
| `N plugins failed` badge | V1 plugins being discovered by V2 → isolate the config dir |
| `Unable to connect` | No global IPv6 route; the built-in IPv4 fallback handles this |

## License

MIT
