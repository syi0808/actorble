# Actorble Text Selection And Pointer Sequence Tasks

이 문서는 text selection recorder/runtime 개선과 cleanup-safe pointer replay 구현 태스크를 정의한다.
기준 문서는 `docs/high-level-architecture.md`, `docs/browser-architecture.md`,
`docs/browser-extension-architecture.md`, ADR `docs/adr/2026-06-19-text-selection-and-pointer-sequence.md`다.

목표는 selection을 click이나 drag로 손실하지 않고 `selectText` intent로 다루며,
low-level pointer replay가 필요할 때도 독립 `pointerDown` / `pointerUp` step이 아니라
하나의 cleanup-safe `pointerSequence` transaction으로 실행되게 하는 것이다.

## Dependency Principles

- `selectText` endpoint model은 먼저 PoC로 검증한다. PoC 전에는 shared schema를 안정 API처럼 확정하지 않는다.
- `@actorble/browser`가 runtime semantic을 소유한다. Extension은 capture, normalization, validation wiring, compiler mapping만 소유한다.
- DOM `Selection`, input selection range, editor-specific selection logic은 browser platform adapter 또는 editor adapter 경계 뒤에 둔다.
- Interaction State Store는 selection semantic state를 소유하고, DOM 반영은 platform adapter가 수행한다.
- Action Orchestrator는 `selectText`와 `pointerSequence` lifecycle, timeout, cancellation, cleanup, trace span을 소유한다.
- Pointer Engine의 `down` / `moveTo` / `up` primitive는 내부 장치 primitive다. Portable scenario output은 독립 pointer primitive를 만들지 않는다.
- Recorder는 raw event fidelity를 보존하되, normalizer output은 stable intent를 우선한다.
- Sensitive text 정책은 input value뿐 아니라 selected text에도 적용한다.

## Dependency Map

```txt
browser selection PoC
  -> browser shared contracts
  -> browser platform selection adapter
  -> browser interaction-state selection slice
  -> browser selectText strategy and orchestrator lifecycle
  -> browser pointerSequence transaction lifecycle
  -> browser facade / runner / capability / trace exposure

browser runtime support
  -> shared scenario schema extension
  -> browser-extension compiler support
  -> browser-extension recorder raw event capture
  -> browser-extension event-to-step normalization
  -> browser-extension builder review and target-slot UI
  -> browser example page for controlled verification

extension recorder and schema support
  -> end-to-end manual verification
```

## Task Sequence

### TSPS-01 Selection Endpoint PoC

- Status: [x] Completed
- Briefing: Validate whether one `selectText` endpoint model can represent ordinary document text, `input`, `textarea`, `contenteditable`, editor-like surfaces, iframe, and shadow root boundaries. This task decides what can be stable and what must remain capability-gated.
- Dependencies: Architecture docs and ADR only.
- Completion criteria:
  - PoC records a compatibility matrix for supported surfaces and unsupported boundaries.
  - PoC distinguishes offset-based selection, point-based selection, and adapter-required selection.
  - PoC documents how selected text is read and how collapsed selections are represented.
  - PoC identifies which cases can use Selection API, input range APIs, pointer gesture, or editor adapter.
- Test expectations:
  - Browser package includes behavior-focused tests or fixtures for at least document text, input, textarea, and contenteditable.
  - Unsupported iframe or shadow root cases produce explicit capability notes instead of silent fallback.

### TSPS-02 Runtime Shared Contracts

- Status: [x] Completed
- Briefing: Add runtime contracts for selection endpoints, selection options, pointer sequence steps, capability fields, and error codes without wiring behavior yet.
- Dependencies: TSPS-01.
- Completion criteria:
  - `@actorble/browser` shared types represent `TextSelectionTarget`, `TextSelectionEndpoint`, `SelectTextOptions`, `PointerSequence`, and `PointerSequenceOptions`.
  - Capability report distinguishes `textSelection` from `dragAndDrop`.
  - Error codes include unsupported text selection and incomplete pointer sequence failures.
  - Public contracts do not add independent `pointerDown` / `pointerUp` scenario actions.
- Test expectations:
  - Type-level or unit tests cover contract exports and capability report shape.
  - Existing browser tests continue to pass.

### TSPS-03 Platform Selection Adapter

- Status: [ ] Not started
- Briefing: Implement browser platform selection read/apply/clear operations behind adapter boundaries so engines do not call DOM selection APIs directly.
- Dependencies: TSPS-02.
- Completion criteria:
  - Adapter can read current document selection and input/textarea selection range.
  - Adapter can apply a supported selection range and clear selection.
  - Unsupported targets return actionable errors or capability misses.
  - Selection adapter does not import Action Orchestrator, Gesture Engine, or recorder code.
- Test expectations:
  - Vitest covers read/apply/clear for document text where feasible, input, textarea, and contenteditable.
  - Tests cover unsupported input types that expose value but not selection range.

### TSPS-04 Selection State Slice

- Status: [ ] Not started
- Briefing: Extend Interaction State Store with selection state and diffs so runtime trace and visual/state effects can observe selection changes without owning DOM application.
- Dependencies: TSPS-02.
- Completion criteria:
  - Store snapshot includes active selection target, anchor, focus, and selected text metadata where available.
  - Store accepts explicit selection sync events from platform reads.
  - Pointer cancellation and reset clear selection interaction state when appropriate without clearing platform selection unexpectedly.
  - State effects remain descriptors, not DOM writes.
- Test expectations:
  - Reducer tests cover selection start/change/end/reset and interaction with pointer cancel.
  - Tests confirm state store has no platform adapter concrete imports.

### TSPS-05 `selectText` Runtime Lifecycle

- Status: [ ] Not started
- Briefing: Implement `selectText` as a first-class runtime action with strategy selection, trace, wait/settlement, and cleanup handled by Action Orchestrator.
- Dependencies: TSPS-03, TSPS-04.
- Completion criteria:
  - Facade delegates `selectText` through Action Orchestrator.
  - Orchestrator resolves targets/endpoints, validates freshness, ensures surface, chooses supported strategy, applies selection, syncs state, and records trace.
  - Selection API/input range strategy works for the first supported surface from TSPS-01.
  - Unsupported surfaces fail with `TEXT_SELECTION_UNSUPPORTED` and actionable context.
- Test expectations:
  - TDD tests cover successful `selectText` on the first supported surface, unsupported target failure, stale target handling, and trace events.
  - Browser package `pnpm test` passes.

### TSPS-06 Pointer Sequence Transaction

- Status: [ ] Not started
- Briefing: Add `pointerSequence` as a cleanup-safe low-level replay transaction owned by Action Orchestrator, using existing Pointer/Gesture primitives internally.
- Dependencies: TSPS-02, existing Pointer Engine and Gesture Engine.
- Completion criteria:
  - `pointerSequence` executes move/down/up/pause steps in order and emits trace events.
  - Timeout, cancellation, thrown errors, and incomplete sequences trigger pointer up or pointer cancel cleanup.
  - Public scenario/facade does not expose independent pointer primitive steps as the default path.
  - Pointer state and Interaction State Store are clean after failure or cancellation.
- Test expectations:
  - Tests cover successful sequence, cancellation after down, error during move, timeout during pause, and cleanup idempotency.
  - Tests verify no pressed buttons remain after failed sequence.

### TSPS-07 Runtime Scenario And Capability Integration

- Status: [ ] Not started
- Briefing: Wire `selectText` and `pointerSequence` through runtime scenario runner, action defaults, capability/fidelity reporting, and diagnostics.
- Dependencies: TSPS-05, TSPS-06.
- Completion criteria:
  - Runtime scenario steps can call `selectText` and `pointerSequence` once their contracts are enabled.
  - Run-level action defaults can include selection and pointer sequence options.
  - Capability report exposes text selection strategy and transactional pointer sequence support.
  - Diagnostics include selection and pointer sequence trace events.
- Test expectations:
  - Scenario runner tests cover ordered execution and pause/stop behavior for new actions.
  - Capability tests cover supported and unsupported strategy reports.

### TSPS-08 Schema Draft Actions

- Status: [ ] Not started
- Briefing: Add portable draft schema support only after TSPS-01 proves stable semantics. Add `selectText` first; add `pointerSequence` only if fallback replay must be portable.
- Dependencies: TSPS-01, TSPS-07.
- Completion criteria:
  - Draft schema represents stable `selectText` intent without encoding transient UI state.
  - `pointerSequence`, if included, is a single closed transaction shape, not independent pointer steps.
  - Valid and invalid fixtures cover new action shapes.
  - README documents that `pointerDown` / `pointerUp` are not draft step actions.
- Test expectations:
  - Schema validation tests cover valid `selectText`, invalid endpoints, and unsupported raw pointer primitive steps.
  - If `pointerSequence` is added, validation rejects missing cleanup-relevant structure.

### TSPS-09 Extension Compiler Support

- Status: [ ] Not started
- Briefing: Map new draft actions to `@actorble/browser` runtime actions while keeping runtime semantics inside the browser package.
- Dependencies: TSPS-07, TSPS-08.
- Completion criteria:
  - Compiler maps `selectText` schema action to browser runtime action shape.
  - Compiler maps `pointerSequence` only if schema includes it.
  - Compiler validates capability-sensitive action support and returns actionable errors for unsupported runtime versions or options.
  - Compiler does not decide endpoint semantics or pointer cleanup semantics.
- Test expectations:
  - Extension tests cover compile success for new actions and failure for unsupported runtime capability/options.
  - Existing compiler tests for current step families remain green.

### TSPS-10 Recorder Raw Event Capture

- Status: [ ] Not started
- Briefing: Expand content recorder capture beyond click/input/change so the normalizer can distinguish selection, drag, click, and pointer fallback windows.
- Dependencies: Existing navigation-safe recording buffer, TSPS-08 for final output shape awareness.
- Completion criteria:
  - Content recorder captures pointer down/move/up, selectionchange, dragstart/drop, click, input, and change events with timestamps and target snapshots.
  - Pagehide/stop flushing preserves event order and session correlation.
  - Sensitive selected text is masked or omitted according to recorder policy.
  - Raw capture remains a content host responsibility; background owns the session buffer.
- Test expectations:
  - Extension tests cover event ordering, pagehide flush, selectionchange capture, drag/drop capture, and sensitive selected text handling.

### TSPS-11 Recorder Event Normalization

- Status: [ ] Not started
- Briefing: Normalize raw event windows into stable intent steps using the architecture priority order: text input, selection, drag, click, pointer sequence fallback.
- Dependencies: TSPS-08, TSPS-10.
- Completion criteria:
  - Text input/change still normalizes to `fill` or `typeInto` and drops focus clicks as before.
  - Pointer window plus selectionchange normalizes to `selectText`.
  - Dragstart/drop or clear draggable/drop target evidence normalizes to `drag`.
  - Movement below threshold with no selection change normalizes to `click`.
  - Ambiguous pointer windows use `pointerSequence` only when replay fidelity would otherwise be lost and schema/runtime support it.
- Test expectations:
  - Unit tests cover each normalization branch and event-order edge cases.
  - Regression test proves text selection is not emitted as simple click.

### TSPS-12 Builder Review And Target Slots

- Status: [ ] Not started
- Briefing: Update extension authoring/review flow for `selectText` targets and recorder drafts without making UI state part of the scenario document.
- Dependencies: TSPS-08, TSPS-11.
- Completion criteria:
  - Builder can display, edit, validate, append, replace, export, and discard recorded `selectText` steps.
  - Target slot model supports selection anchor/focus where required.
  - Draft review surfaces sensitive selected text warnings with existing sensitive input policy.
  - UI disables inspector launch for unsupported slots and surfaces locator/endpoint issues.
- Test expectations:
  - Builder model tests cover target slot availability, recorded draft review operations, and validation issue placement.
  - Side panel tests or model tests cover `selectText` draft display and merge behavior.

### TSPS-13 Controlled Example Page

- Status: [ ] Not started
- Briefing: Add a browser example page that intentionally exercises text selection, editable selection, drag-like movement, click disambiguation, and recorder replay verification on deterministic targets.
- Dependencies: TSPS-05, TSPS-07, TSPS-12.
- Completion criteria:
  - `browser/example` includes a new example focused on selection and pointer sequence behavior.
  - Example is linked from the browser example index and follows existing example structure, shared styles, and build conventions.
  - Page includes deterministic selectors or test ids for ordinary text, `textarea`, contenteditable, and controls that distinguish click from selection or drag.
  - Example exposes visible state or status updates that make manual replay verification unambiguous.
  - Example does not import extension internals or encode recorder-specific UI state.
- Test expectations:
  - Run browser example typecheck/build commands after adding the page.
  - Add smoke coverage if the existing browser example smoke framework can cover the new page without broad harness changes.
  - Document manual steps for selecting text and confirming replay-visible state.

### TSPS-14 End-To-End Verification

- Status: [ ] Not started
- Briefing: Verify the first real workflow from browser action through extension recording and replay on a controlled page.
- Dependencies: TSPS-05, TSPS-07, TSPS-09, TSPS-11, TSPS-12, TSPS-13.
- Completion criteria:
  - Manual scenario records a text selection on the controlled example page and does not produce a click-only draft.
  - Recorded draft can be reviewed, saved/exported, compiled, and replayed.
  - Runtime trace shows `selectText` or `pointerSequence` with cleanup-safe lifecycle events.
  - Unsupported surfaces produce capability or validation errors rather than misleading steps.
- Test expectations:
  - Run `cd browser && pnpm test`.
  - Run `cd browser-extension && pnpm test`.
  - Run typecheck/build commands for any package whose public contracts or schema changed.
  - Document manual verification notes in the task completion update.

## First Vertical Slice

The first vertical slice is intentionally smaller than the full recorder workflow:

```txt
TSPS-01 PoC result
-> TSPS-02 shared contracts
-> TSPS-03 platform selection adapter
-> TSPS-04 selection state slice
-> TSPS-05 selectText lifecycle
-> facade call selects text in a textarea and records trace/state
```

This slice proves the runtime module graph before schema, compiler, and recorder output are expanded.
After this slice passes, add schema/compiler support and then recorder normalization.

## Execution Checklist

- [ ] Confirm TSPS-01 PoC outcome before starting schema changes.
- [ ] Keep `selectText` separate from drag/drop in capability, trace, and tests.
- [ ] Do not introduce independent portable `pointerDown` or `pointerUp` steps.
- [ ] Add failing tests before implementation for every task that changes behavior.
- [ ] Keep extension compiler free of runtime semantic decisions.
- [ ] Preserve navigation-safe recorder buffering and tab/frame/run correlation.
- [ ] Apply sensitive data policy to selected text.
- [ ] Use the controlled example page for manual recorder/replay verification.
- [ ] Update this document's task statuses only when repository evidence proves completion.
