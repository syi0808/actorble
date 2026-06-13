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

## Package docs

- [Getting Started](./getting-started/) covers the first local workflow.
- [API Surface](./api/) lists facade methods and locator helpers.
- [Advanced API](./advanced-api/) covers low-level target types, engine interfaces, and adapter APIs.
- [Examples](./examples/) shows small end-to-end snippets.

## Package commands

Run these from `browser/` when working on the browser package:

```sh
pnpm test
pnpm typecheck
pnpm build
```

Use the facade first unless you need custom module composition for tests or advanced integration.
