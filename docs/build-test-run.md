# Build / test / run

Stack: **TypeScript + vitest + pnpm + ESM, run via `tsx` (no build step)** — see
`docs/adr/0004`. Design: `docs/design/release-adoption-substrate.md`.

- Install: `pnpm install`
- Test: `pnpm test` (vitest run; `pnpm test:watch` for watch mode)
- Typecheck: `pnpm typecheck` (`tsc --noEmit` — there is no emit/build step)
- Run a source file directly: `pnpm tsx <file.ts>`

No `dist`/bundler: sources run directly via `tsx`, identically locally and in CI.
`pnpm-workspace.yaml` allowlists esbuild's build script (vitest/tsx dependency).
