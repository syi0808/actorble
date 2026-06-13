---
title: Browser
description: Browser implementation docs for Actorble.
sidebar:
  order: 1
---

The browser package lives in `browser/` and uses the package identity `@actorble/browser`.

It wires the Actorble facade to browser-specific modules for target resolution, geometry, interactability checks, pointer and text input, visual feedback, trace collection, and capability reporting.

## Current focus

- Resolve browser targets from locator-like inputs.
- Execute high-level actions through an explicit lifecycle.
- Keep pointer, focus, typing, and visual state observable.
- Report browser capability and fidelity limits instead of hiding them.

## Package commands

Run these from `browser/` when working on the browser package:

```sh
pnpm test
pnpm typecheck
pnpm build
```

See [Getting Started](./getting-started/) for the first local workflow.
