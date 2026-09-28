import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/tui.tsx"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@opencode/plugin",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
  ],
})
