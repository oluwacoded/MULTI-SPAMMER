---
name: db schema changes & stale declarations
description: Why api-server tsc reports "no exported member" after editing lib/db schema, and the rebuild step.
---

# Editing `lib/db` schema → rebuild declarations

`lib/db` is a TypeScript **composite** project (`composite: true`, `emitDeclarationOnly: true`, `outDir: dist`). Consumers like `artifacts/api-server` reference it via project references, so `tsc -p` resolves `@workspace/db` through the prebuilt `lib/db/dist/*.d.ts`, NOT the live `src`.

**Symptom:** After adding a new table/export to `lib/db/src/schema/*` and wiring it in `schema/index.ts`, `pnpm --filter @workspace/api-server run typecheck` fails with `Module '"@workspace/db"' has no exported member '...'` even though the source is correct. The runtime (esbuild) still works because it bundles from src.

**Fix:** Rebuild lib declarations with `pnpm -w run typecheck:libs` (which is `tsc --build`). The `api-spec` codegen script already runs this after orval, so running codegen also refreshes them.

**Why:** stale `dist/*.d.ts` are what tsc reads for referenced composite projects.
**How to apply:** any time you change a `lib/*` package's exported surface, run `tsc --build` (or codegen) before trusting consumer typechecks.
