# Actorble Browser Examples

Runnable browser example projects for the current `@actorble/browser` vertical slice.

```sh
pnpm example:dev
pnpm example:typecheck
pnpm example:build
```

Each example imports from `../src` so it reflects the local source implementation.

- `locator-inspector/`: target resolution, inspection, and geometry.
- `action-playground/`: `moveTo`, `typeInto`, `click`, visual feedback, DOM event dispatch, and success-flow action demos.
- `scenario-runner/`: selectable success scenarios, custom wait, trace, capabilities, and fidelity.

The examples intentionally use only implemented APIs: target resolution, inspection, geometry, click, typeInto, scenario run, custom wait, trace, capabilities, and fidelity.
