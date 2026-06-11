# Browser Platform Guidelines

## Scope & Architecture

This directory is for the browser implementation of Actorble. Align implementation work with `../docs/browser-architecture.md` and keep browser behavior consistent with the high-level contracts in `../docs/high-level-architecture.md`.

Browser code should map to the documented components: Actorble Facade, Scenario Runner, Action Orchestrator, Target Resolver, Surface Engine, Geometry Engine, Interactability Engine, Pointer/Gesture engines, Interaction State Store, Visual Layer, and Platform Adapter. Browser-only platform code should stay under `browser/`; shared contracts or utilities should move to a shared top-level package only when another platform needs them.

## Build, Test, and Development Commands

Use pnpm for browser package work. `browser/package.json` declares pnpm `^11.5.2` in `devEngines`.

- `cd browser && pnpm install`: install browser package dependencies.
- `cd browser && pnpm pkg get scripts`: inspect available package scripts.
- `cd browser && pnpm test`: run the Vitest test suite once.
- `cd browser && pnpm test:watch`: run Vitest in watch mode.
- `cd browser && pnpm exec <tool>`: run locally installed tools after they are added.

`browser/package.json` currently defines test scripts only. Add build, lint, or dev scripts before relying on commands such as `pnpm build`, `pnpm lint`, or `pnpm dev`.

## Coding Style & Naming Conventions

The package is ESM (`"type": "module"`), so use `import`/`export`. Prefer TypeScript-style API shapes from the architecture docs. Name modules after their responsibility, for example `action-orchestrator`, `target-resolver`, `geometry-engine`, `dom-adapter`, `event-dispatcher`, and `interaction-state-store`.

Keep browser-specific DOM, event, style, and coordinate logic inside adapter or engine modules. Do not hide browser limitations; expose them through capability or fidelity reporting.

## Browser Implementation Rules

Resolve targets before dispatching input. Separate geometry calculation from interactability checks. Keep pointer coordinates, button state, hover, active, focus, typing, and dragging state explicit; do not rely on incidental DOM side effects as the source of truth.

Treat pseudo-state and visual mirroring as best-effort browser fidelity features, not core correctness. Prefer deterministic event dispatch and observable settlement over timing assumptions.

## Testing Guidelines

Vitest is configured for browser package tests. Favor tests around public API behavior, engine boundaries, DOM adapter behavior, geometry snapshots, event dispatch order, and wait/observation settlement.

Use TDD for behavior changes: write or update the failing Vitest case first, implement the smallest change that makes it pass, then refactor while keeping the suite green. For bug fixes, add a regression test that fails on the original behavior before changing implementation.

Use behavior-focused test names, for example `click resolves target before dispatching pointer events` or `typeInto focuses editable target before input`.
