---
title: Architecture
description: The browser implementation module map.
sidebar:
  order: 3
---

Actorble browser follows the architecture in `docs/browser-architecture.md` and keeps platform-specific DOM work below `browser/`.

```txt
Actorble Facade
  -> Scenario Runner
  -> Action Orchestrator
  -> Target Resolver
  -> Geometry Engine
  -> Capability / Fidelity
  -> Diagnostics / Trace

Action Orchestrator
  -> Surface Engine
  -> Interactability Engine
  -> Gesture Engine
  -> Focus Engine
  -> Keyboard Engine
  -> Text Input Engine
  -> Wait / Observation Engine

Gesture Engine
  -> Pointer Engine
  -> Pointer Signals

Pointer Signals
  -> Interaction State Store
  -> Visual Layer
  -> Platform Adapter
```

## Boundaries

- `shared` owns primitive types and narrow ports.
- `platform-adapter` owns DOM reads, event dispatch, state application, and style injection.
- `action-orchestrator` coordinates the lifecycle but does not perform raw DOM work directly.
- `interaction-state-store` owns semantic hover, active, focus, typing, and dragging state.
- `visual-layer` mirrors feedback without becoming the source of correctness.
- `diagnostics-trace` records span-based execution context.

## Action lifecycle

A click is treated as a transaction:

```txt
resolve target
validate freshness
ensure surface
compute geometry
run interactability preflight
move pointer
dispatch pointer down/up and click
wait for settlement
cleanup state
record trace outcome
```

This keeps cancellation, retries, stale targets, and diagnostics in one consistent path.
