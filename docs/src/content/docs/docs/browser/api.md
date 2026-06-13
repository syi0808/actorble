---
title: API Surface
description: Current and planned public API for @actorble/browser.
sidebar:
  order: 4
---

The public package barrel is `browser/src/index.ts`. The browser facade exports `Actorble` and `createActorble`.

## Current facade entrypoints

| Area | Methods |
| --- | --- |
| Target lookup | `resolve`, `resolveAll`, `exists`, `inspect` |
| Geometry | `geometry` |
| Core actions | `moveTo`, `click`, `typeInto` |
| Waiting and scenarios | `waitFor`, `run`, `pause`, `resume`, `stop` |
| Reports | `getCapabilities`, `getFidelity`, `getTrace` |
| Lifecycle | `destroy` |

## Planned facade shells

These methods exist on the facade shape but still return a not-implemented path in the current source:

- `clickCurrent`
- `doubleClick`
- `focus`
- `type`
- `fill`
- `press`
- `scrollTo`
- `drag`
- `on`
- `off`

## Locator helper

The current examples use the CSS locator helper:

```ts
import { css } from '@actorble/browser'

await actorble.click(css('#save'))
```

Additional locator and browser fidelity work is tracked in `browser/docs/implementation_tasks.md`.
