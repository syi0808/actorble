---
title: Examples
description: Small examples for the Actorble browser package.
sidebar:
  order: 8
---

## Click a target

```ts
import { createActorble, css } from '@actorble/browser';

const actorble = createActorble();

await actorble.click(css('#save'));

actorble.destroy();
```

## Type into an input

```ts
import { createActorble, css } from '@actorble/browser';

const actorble = createActorble({ feedback: 'cursor' });

await actorble.typeInto(css('#message'), 'Hello from Actorble');

console.log(actorble.getFidelity());
actorble.destroy();
```

## Run a scenario

```ts
import { createActorble, css } from '@actorble/browser';

const actorble = createActorble({ feedback: 'debug' });

await actorble.run({
  steps: [
    { action: 'click', target: css('#project-name') },
    { action: 'typeInto', target: css('#project-name'), input: 'Orbit' },
    { action: 'click', target: css('#create-project') },
  ],
});

console.log(actorble.getTrace());
actorble.destroy();
```

## Inspect execution

```ts
const trace = actorble.getTrace();
const failedSpans = trace.spans.filter((span) => span.status === 'error');
```

Trace data is intentionally available through the facade so failed actions can be reported with concrete execution context.
