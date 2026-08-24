# Actorble Browser Extension

Actorble browser extension is the browser GUI shell for authoring, recording, running, and inspecting Actorble scenarios.

This package intentionally sits above `@actorble/browser`. It owns extension UI, scenario document handling, recorder and inspector workflows, message routing, storage, and run control. The runtime package owns browser control semantics.

## WXT Layout

WXT generates `manifest.json` from `wxt.config.ts` and files under `src/entrypoints`, so this package does not keep a source `manifest.json`.

```txt
browser-extension/
  wxt.config.ts
  src/
    entrypoints/
      popup/
      sidepanel/
      background/
      content/
    scenario/
    recorder/
    inspector/
    storage/
    messaging/
    trace/
```

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`

## Boundaries

Scenario documents remain portable JSON artifacts owned by `../schemas/scenario`. The extension validates, migrates, compiles, stores, imports, and exports those documents for the browser GUI workflow.

Compiled runtime scenarios are sent to content script runtime hosts that call `@actorble/browser`. The extension should not reimplement pointer, keyboard, target resolution, geometry, interactability, settlement, or runtime trace behavior.
