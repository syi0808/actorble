# Actorble Browser Examples

Runnable browser examples for the current `@actorble/browser` vertical slice.

```sh
pnpm example:dev
pnpm example:typecheck
pnpm example:build
```

Each example imports from `../src` so it reflects the local source implementation.

- `github-explorer/`: repository search, issue tab navigation, and issue inspection.
- `form-filling/`: click-focused form entry, checkbox interaction, and submit handling.
- `appointment-scheduler/`: patient search, appointment drafting, calendar drag scheduling, and confirmation.
- `web-search/`: search query entry, result loading, and result preview opening.
- `selection-pointer-sequence/`: text selection, editable selection, click/drag disambiguation, and cleanup-safe pointer sequence replay.

The examples intentionally use only implemented APIs: target resolution through test ids, pointer movement, click, clickCurrent, doubleClick, type, typeInto, fill, press, drag, selectText, pointerSequence, custom wait, capabilities, and fidelity.

Manual selection replay check:

1. Open `selection-pointer-sequence/`.
2. Run the scenario from the controls panel.
3. Confirm the verification panel shows `selection text`, `textarea range`, `editable note`, and `closed transaction`.
4. Confirm the DOM event log includes click, drag pointer events, and pointer pad down/up entries.
