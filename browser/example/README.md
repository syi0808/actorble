# Actorble Browser Example

Runnable browser example for the current `@actorble/browser` vertical slice.

```sh
pnpm example:dev
pnpm example:typecheck
pnpm example:build
```

The example imports from `../src` so it reflects the local source implementation.

- `action-playground/`: GitHub navigation, form filling, and web search task scenarios using `moveTo`, `typeInto`, `click`, custom waits, visual feedback, DOM event logging, and fidelity reporting.

The example intentionally uses only implemented APIs: target resolution through test ids, pointer movement, click, typeInto, custom wait, capabilities, and fidelity.
