---
title: Getting Started
description: Start using and developing the Actorble browser package.
sidebar:
  order: 2
---

## Local development

From the repository root:

```sh
cd browser
pnpm install
pnpm test
pnpm build
pnpm run release:check
```

The package is ESM and exports from `browser/src/index.ts` in development and `browser/dist/index.js` after build.
`release:check` validates tests, types, the clean build, and npm tarball contents without publishing.

## Basic browser control

```ts
import { createActorble, css } from '@actorble/browser'

const actorble = createActorble({ feedback: 'cursor' })

await actorble.click(css('#create-project'))
await actorble.typeInto(css('#project-name'), 'Orbit')
await actorble.waitFor({
  kind: 'custom',
  predicate: () => document.body.textContent?.includes('Project created') ?? false,
})

console.log(actorble.getTrace())
actorble.destroy()
```

## What is ready today

The facade currently delegates the core browser path for resolving targets, clicking, typing into a target, running scenarios, waiting, diagnostics, and capability/fidelity reports.

Some public facade methods are still planned shells. Check [API Surface](../api/) before treating a method as production-ready.
