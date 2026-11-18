/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"

// ── Config sources (cookie resolution) ────────────────────────────────────────
// Checked in order. The JSON path matches the V1 plugin so a single cookie file
// works for both OpenCode 1 and OpenCode 2. Resolved lazily (not at module top
// level) so importing the module never touches `process`.
function configPaths() {
  const home = process.env.HOME ?? ""
  return [
    { path: home + "/.config/opencode/opencode-quota/ollama-cloud.json", type: "json" as const },
    { path: home + "/.config/ollama-usage/config.yaml", type: "yaml" as const },
    { path: home + "/.ollama-usage/config.yaml", type: "yaml" as const },
  ]
}

const SETTINGS_URL = "https://ollama.com/settings"
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0"
const SCRAPE_TIMEOUT_MS = 10_000
const REFRESH_INTERVAL_MS = 180_000
const RETRY_DELAYS = [60_000, 60_000, 60_000] as const

// ── Cookie resolution ────────────────────────────────────────────────────────
interface CookieResult {
  cookie: string
  source: string
}

function readYamlCookie(content: string): string | null {
  const stripped = content.replace(/#[^\n]*/g, "")
  const m = stripped.match(/(?:^|\n)\s*cookie\s*:\s*["']?\s*(.+?)\s*["']?\s*(?:\n|$)/)
  return m ? m[1].trim() : null
}

async function resolveCookie(): Promise<{ result?: CookieResult; error?: string }> {
  // 1. Env var (highest priority)
  const env = process.env.OLLAMA_USAGE_COOKIE?.trim()
  if (env) return { result: { cookie: env, source: "OLLAMA_USAGE_COOKIE" } }

  // 2. Config files
  for (const { path, type } of configPaths()) {
    try {
      const fs = await import("fs/promises")
      const content = await fs.readFile(path, "utf-8")

      let cookie: string | null = null
      if (type === "json") {
        const parsed = JSON.parse(content)
        cookie = typeof parsed.cookie === "string" ? parsed.cookie.trim() : null
      } else {
        cookie = readYamlCookie(content)
      }

      if (cookie) return { result: { cookie, source: path } }
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        return { error: `Error reading ${path}: ${err.message}` }
      }
    }
  }

  return { error: "no cookie found" }
}

// ── Scraper ──────────────────────────────────────────────────────────────────
interface UsageData {
  sessionPercent: number
  weeklyPercent: number
  sessionReset?: string
  weeklyReset?: string
  planTier?: string
}

function parseUsageFromHtml(html: string): { data?: UsageData; error?: string } {
  const usageRe = /(\d+(?:\.\d+)?)%\s*used/gi
  const usageMatches = [...html.matchAll(usageRe)]

  if (usageMatches.length === 0) {
    return { error: "No usage data found on settings page" }
  }

  let sessionPct: number | undefined
  let weeklyPct: number | undefined

  for (const match of usageMatches) {
    const pct = parseFloat(match[1])
    if (isNaN(pct)) continue

    const pos = match.index!
    const context = html.slice(Math.max(0, pos - 500), pos).toLowerCase()

    if (context.includes("session")) {
      sessionPct = pct
    } else if (context.includes("weekly")) {
      weeklyPct = pct
    }
  }

  // Fallback to positional if context matching failed
  if (sessionPct === undefined || weeklyPct === undefined) {
    const uniquePcts = [...new Set(usageMatches.map((m) => parseFloat(m[1])).filter((n) => !isNaN(n)))]
    if (sessionPct === undefined) sessionPct = uniquePcts[0] ?? 0
    if (weeklyPct === undefined) weeklyPct = uniquePcts[1] ?? uniquePcts[0] ?? 0
  }

  const timeRe = /class="[^"]*local-time[^"]*"[^>]*data-time="([^"]*)"/g
  const resetTimes = [...html.matchAll(timeRe)].map((m) => m[1])

  const planRe = /class="[^"]*capitalize[^"]*"[^>]*>([^<]*)</
  const planMatch = html.match(planRe)
  const planTier = planMatch ? planMatch[1].trim() : undefined

  return {
    data: {
      sessionPercent: sessionPct,
      weeklyPercent: weeklyPct,
      sessionReset: resetTimes[0],
      weeklyReset: resetTimes[1],
      planTier,
    },
  }
}

// ── Network helpers ──────────────────────────────────────────────────────────
// This machine has no global IPv6 route (only a link-local Tailscale tunnel).
// If a provider publishes AAAA records, the runtime's fetch can pick the IPv6
// address and fail with "Unable to connect" instead of falling back to IPv4.
// On any fetch failure we resolve an A record and retry pinned to that IPv4
// address (Host header + TLS SNI preserved).
async function resolveIPv4(host: string): Promise<string | undefined> {
  const g = globalThis as any
  try {
    if (g.Bun?.dns?.lookup) {
      const res = await g.Bun.dns.lookup(host)
      const a = res?.find?.((r: { family: number; address: string }) => r.family === 4)
      if (a?.address) return a.address
    }
  } catch {}
  try {
    const dns = await import("node:dns/promises")
    const res = await dns.lookup(host, { family: 4 })
    if (res?.address) return res.address
  } catch {}
  return undefined
}

async function fetchWithIPv4Fallback(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    const host = new URL(url).hostname
    const ip = await resolveIPv4(host)
    if (!ip) throw err
    const u = new URL(url)
    const headers = new Headers(init.headers)
    headers.set("Host", host)
    return await fetch(`https://${ip}${u.pathname}${u.search}`, {
      ...init,
      headers,
      // @ts-ignore Bun-specific: keep TLS SNI/hostname verification on the real host
      tls: { serverName: host },
    })
  }
}

async function scrapeUsage(cookie: string): Promise<{ data?: UsageData; error?: string }> {
  try {
    const resp = await fetchWithIPv4Fallback(SETTINGS_URL, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `__Secure-session=${cookie}`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location") || ""
      return { error: `Auth error: redirected to ${loc.slice(0, 60)} — cookie may be expired` }
    }

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` }
    }

    const html = await resp.text()
    return parseUsageFromHtml(html)
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

function heat<T>(pct: number, ok: T, warn: T, bad: T): T {
  if (pct >= 80) return bad
  if (pct >= 50) return warn
  return ok
}

// ── Plugin ───────────────────────────────────────────────────────────────────
type State =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "help" }
  | { kind: "data"; d: UsageData }

export default Plugin.define({
  id: "ollama.cloud.usage",

  setup(context) {
    const [state, setState] = createSignal<State>({ kind: "loading" })

    let timerId: ReturnType<typeof setInterval> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryAttempt = 0
    let disposed = false

    async function refresh(): Promise<void> {
      if (disposed) return

      const resolved = await resolveCookie()
      if (!resolved.result) {
        setState({ kind: "help" })
        return
      }

      const scraped = await scrapeUsage(resolved.result.cookie)
      if (disposed) return

      if (scraped.error) {
        setState({ kind: "error", msg: scraped.error })
        // Stop the normal interval, then run the self-healing retry chain.
        if (timerId) {
          clearInterval(timerId)
          timerId = undefined
        }
        scheduleRetry(retryAttempt)
        retryAttempt++
        return
      }

      retryAttempt = 0
      setState({ kind: "data", d: scraped.data! })
      // Start the normal interval only after the first success.
      if (!timerId) timerId = setInterval(refresh, REFRESH_INTERVAL_MS)
    }

    function scheduleRetry(attempt: number): void {
      if (retryTimer) clearTimeout(retryTimer)
      // Retry fast for the first few attempts, then keep retrying at the normal
      // refresh cadence forever, so the panel self-heals once the network
      // recovers instead of staying stuck on the error state.
      const delay = attempt < RETRY_DELAYS.length ? RETRY_DELAYS[attempt] : REFRESH_INTERVAL_MS
      retryTimer = setTimeout(refresh, delay)
    }

    // Claim the sidebar slot. The render callback reads our signal reactively.
    const unregister = context.ui.slot({
      append: "sidebar.content",
      render: () => {
        const fg = context.theme.text.base
        const mu = context.theme.text.muted
        const s = state()
        if (s.kind !== "data") {
          const text = s.kind === "loading" ? "Ollama: loading…" : s.kind === "help" ? "Ollama: no cookie" : `Ollama: ${s.msg}`
          return <text fg={s.kind === "loading" ? mu : context.theme.text.feedback.warning.base}>{text}</text>
        }
        const rows = [
          { label: "5h", pct: s.d.sessionPercent },
          { label: "7d", pct: s.d.weeklyPercent },
        ]
        return (
          <box flexDirection="row">
            <text fg={fg}>Ollama</text>
            {rows.map((row, i) => (
              <box flexDirection="row">
                <text fg={mu}>{i === 0 ? " " : " · "}</text>
                <text fg={heat(row.pct, context.theme.text.feedback.success.base, context.theme.text.feedback.warning.base, context.theme.text.feedback.error.base)}>●</text>
                <text fg={fg}> {row.label} {Math.round(row.pct)}%</text>
              </box>
            ))}
          </box>
        )
      },
    })

    // Initial fetch — the interval only starts after the first success.
    refresh()

    // Cleanup: runs when the plugin unloads.
    return () => {
      disposed = true
      if (timerId) clearInterval(timerId)
      if (retryTimer) clearTimeout(retryTimer)
      try {
        unregister()
      } catch {}
    }
  },
})
