# Browser Extension Guidelines

## Scope

This directory is for the Actorble browser extension GUI shell. Align structure and behavior with `../docs/browser-extension-architecture.md`.

The extension owns browser-specific scenario authoring, validation wiring, migration wiring, compiler wiring, storage, recorder, inspector UI, runtime injection, message routing, run control, and trace display.

The extension does not own `@actorble/browser` runtime semantics such as target resolution, geometry, interactability, input dispatch, settlement, diagnostics, or runtime trace internals.

## Build, Test, And Development Commands

Use pnpm for this package.

- `pnpm install`: install dependencies and run `wxt prepare`.
- `pnpm dev`: run WXT dev mode for Chrome.
- `pnpm build`: build the extension with WXT.
- `pnpm typecheck`: regenerate WXT types and run TypeScript checks.
- `pnpm test`: run Vitest scaffold tests.

## Structure

WXT generates the extension manifest, so there is no source `manifest.json`. Keep global manifest options in `wxt.config.ts` and entrypoint-specific options in `src/entrypoints`.

Use `src/entrypoints/sidepanel` for the WXT side panel entrypoint. It maps to the `side-panel` architecture boundary in the design docs.

Keep placeholder modules short. Add runtime APIs only when implementing a specific behavior.
