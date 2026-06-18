# Actorble Browser Extension Implementation Tasks

이 문서는 `browser-extension/` 패키지의 구현 태스크를 정의한다. 기준 문서는
`../docs/browser-extension-architecture.md`이며, 이 패키지는 Actorble browser GUI
shell로서 scenario authoring, validation, migration, compiler, storage, recorder,
inspector, message routing, run control, trace display를 소유한다.

`@actorble/browser` runtime semantic은 이 패키지에서 재구현하지 않는다.

## Dependency Principles

- WXT entrypoint는 composition boundary다. feature module의 core logic은
  `src/scenario`, `src/messaging`, `src/storage`, `src/trace`, `src/inspector`,
  `src/recorder`, `src/builder`에 둔다.
- Scenario document는 `../schemas/scenario`의 portable JSON artifact다. extension은
  validate, migrate, compile, store, import, export만 수행한다.
- Compiled runtime scenario는 content script host에서만 `@actorble/browser`로
  실행한다. background service worker는 Actorble action을 직접 실행하지 않는다.
- Target resolution, geometry, interactability, input dispatch, wait/settlement,
  runtime trace semantic은 `@actorble/browser` 책임으로 남긴다.
- Message는 recording, inspection, execution이 같은 tab에서 시간차로 일어날 수
  있음을 전제로 `tabId`, `frameId`, `scenarioId`, `runId` correlation을 보존한다.
- `frameId`는 known frame에만 포함한다. top frame을 가정해 모든 command에
  `frameId: 0`을 붙이지 않는다.
- Browser API, DOM event capture, overlay host, storage API 접근은 narrow adapter나
  entrypoint boundary 뒤에 둔다.
- Recorder는 sensitive data handling을 명시적으로 다룬다. password value를
  조용히 저장하지 않고 masking 또는 omission을 허용한다.

## Dependency Map

```txt
wxt.config.ts
  -> src/entrypoints/*

src/entrypoints/popup
  -> messaging contracts
  -> background commands
  -> short-lived run/record/panel controls

src/entrypoints/sidepanel
  -> scenario workflow builder composition
  -> storage repository
  -> target slot inspector and locator preview
  -> recorded draft review
  -> trace display

src/entrypoints/background
  -> messaging contracts
  -> storage repository
  -> tab/frame routing
  -> content readiness and permission checks
  -> navigation-safe recording event buffers

src/entrypoints/content
  -> messaging contracts
  -> @actorble/browser runtime host
  -> recorder event capture
  -> inspector overlay host
  -> trace/status stream

src/scenario/validate
  -> ../schemas/scenario/draft/scenario.schema.json

src/scenario/migrate
  -> scenario document version model

src/scenario/compile-to-browser-runtime
  -> scenario validate/migrate result
  -> @actorble/browser public locator/scenario types

src/storage
  -> browser extension storage API
  -> scenario document records

src/messaging
  -> message contracts and correlation metadata only

src/trace
  -> runtime status and trace event ingestion/display model

src/builder
  -> scenario document authoring session
  -> step operations
  -> target slot model
  -> validation write-back

src/inspector
  -> messaging
  -> locator synthesis/preview
  -> content overlay host

src/recorder
  -> content page event capture
  -> locator synthesis
  -> event-to-step normalization
  -> scenario document draft output
```

## Task Sequence

### T0 WXT Package And Boundary Scaffold

- Status: [x] Completed
- Briefing: WXT package, TypeScript, Vitest, entrypoint shell, and architecture
  boundary placeholders are already present. This task is recorded so future work
  has a clear dependency root.
- Dependencies: None.
- Completion criteria:
  - `package.json` has pnpm scripts for `dev`, `build`, `typecheck`, and `test`.
  - `wxt.config.ts` owns generated manifest settings and no source
    `manifest.json` exists.
  - `src/entrypoints/popup`, `sidepanel`, `background`, and `content` exist.
  - Placeholder modules exist for scenario, recorder, inspector, storage,
    messaging, and trace boundaries.
- Test expectations:
  - `pnpm test` includes a scaffold test for WXT entrypoints and extension
    boundaries.

### T1 Scenario Document Validation And Migration

- Status: [x] Completed
- Briefing: Add extension-side scenario document validation against the draft
  schema and migration wiring. Keep schema ownership in `../schemas/scenario`.
- Dependencies: T0.
- Completion criteria:
  - Validation accepts `actorble.scenario.draft` documents that match the draft
    schema and rejects malformed documents with field-level actionable errors.
  - Migration wiring returns draft documents unchanged and rejects unsupported
    versions without guessing.
  - Validation and migration expose stable result types for UI, compiler, and
    import flows.
- Test expectations:
  - Vitest covers valid draft example JSON, missing required fields, unsupported
    schema version, invalid locator shape, and invalid step shape.
  - `pnpm typecheck` passes.

### T2 Browser Runtime Compiler

- Status: [x] Completed
- Briefing: Compile portable scenario documents into `@actorble/browser`
  runtime scenarios. The compiler converts intent; it does not execute actions
  or recreate runtime semantics.
- Dependencies: T1.
- Completion criteria:
  - Draft locators map to `@actorble/browser` locator objects for `css`, `role`,
    `text`, `label`, `testId`, and `point`.
  - Draft steps map to runtime scenario steps for `click`, `moveTo`,
    `clickCurrent`, `doubleClick`, `focus`, `type`, `typeInto`, `fill`, `press`,
    `scrollTo`, `drag`, `waitFor`, and `delay`.
  - Default timeout and pacing are preserved in runtime options where supported.
  - Step ids are preserved for trace correlation.
  - Unsupported platform extensions, unsupported options, and unsupported schema
    versions fail with actionable compiler errors.
- Test expectations:
  - Vitest covers the browser login example, each locator strategy, each step
    family, default propagation, step id preservation, and unsupported inputs.
- Implementation note:
  - Current `@actorble/browser` runtime scenario targets accept a single
    `TargetLike`, so draft target groups compile to their first locator.
    Fallback locator and group-level `strict` semantics should be preserved
    when the runtime scenario shape can represent them.

### T3 Message Contracts And Correlation Metadata

- Status: [x] Completed
- Briefing: Define typed extension messages for scenario, recorder, inspector,
  trace, and runtime status channels before entrypoints depend on ad hoc message
  shapes.
- Dependencies: T1.
- Completion criteria:
  - Message contracts exist for `scenario:validate`, `scenario:compile`,
    `scenario:run`, `scenario:pause`, `scenario:resume`, `scenario:stop`,
    `record:start`, `record:stop`, `inspector:start`, `inspector:stop`,
    `trace:event`, and `runtime:status`.
  - Runtime-oriented messages carry correlation metadata where applicable:
    `tabId`, `frameId`, `scenarioId`, and `runId`.
  - Helpers validate message kind and narrow payload types at boundaries.
- Test expectations:
  - Vitest covers message creation, message narrowing, missing correlation
    fields, and rejection of unknown message kinds.

### T4 Background Orchestration Shell

- Status: [x] Completed
- Briefing: Wire the background service worker as the extension-level
  coordinator for tab/frame routing, command handling, storage access, content
  readiness, session metadata, and permission checks.
- Dependencies: T3.
- Completion criteria:
  - Background routes scenario, recorder, inspector, status, and trace messages
    without directly importing or constructing `Actorble`.
  - Active tab lookup and content script readiness are represented in command
    results.
  - Run and record session metadata are tracked by correlation ids.
  - Unsupported pages and missing permissions return clear UI-facing errors.
- Test expectations:
  - Vitest with mocked browser APIs covers active tab routing, missing tab,
    content-not-ready, unsupported page, and run/session metadata updates.

### T5 Content Runtime Host

- Status: [x] Completed
- Briefing: Add the content script host that owns page-facing runtime lifecycle:
  create an `Actorble` instance, run compiled scenarios, and stream status/trace
  back to extension UI.
- Dependencies: T2, T3.
- Completion criteria:
  - Content script handles `scenario:run`, `scenario:pause`, `scenario:resume`,
    and `scenario:stop`.
  - Compiled runtime scenario is passed to `Actorble.run(...)`.
  - Status transitions are emitted as `runtime:status` with `runId`.
  - Runtime trace/debug events are forwarded as `trace:event` without changing
    their semantic shape.
  - Runtime host cleanup prevents stale runs from leaking into later sessions.
- Test expectations:
  - Vitest covers run success, run failure, pause/resume/stop delegation, trace
    forwarding, stale run rejection, and cleanup using a mocked Actorble facade.

### T6 First Vertical Slice: Imported Scenario Run

- Status: [x] Completed
- Briefing: Build the smallest user-visible path that proves the architecture:
  import JSON in the extension UI, validate, compile, run on the active tab, and
  display status/trace feedback.
- Dependencies: T2, T4, T5.
- Completion criteria:
  - Side panel can accept pasted or imported scenario JSON.
  - UI shows validation or compiler errors before any run message is sent.
  - Valid documents run on the active tab through background and content
    routing.
  - UI shows current run status and at least the latest trace/failure event.
- Test expectations:
  - Vitest covers UI command dispatch and validation error rendering where
    practical.
  - Manual verification runs the draft browser login example against an allowed
    local page.
  - `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.

### T7 Scenario Storage And Import/Export

- Status: [x] Completed
- Briefing: Store scenario documents as extension-owned records. Do not store
  compiled runtime scenarios because compiled output is platform-specific and
  disposable.
- Dependencies: T1, T3, T4.
- Completion criteria:
  - `ScenarioRecord` includes `id`, `name`, `schemaVersion`, `document`,
    `createdAt`, `updatedAt`, and `lastRun`.
  - Repository operations support list, get, save, rename/update, delete, import
    JSON, and export JSON.
  - Storage uses browser extension storage API first; sync or remote storage is
    left as a future adapter, not a document model change.
  - Save updates preserve the portable scenario document shape.
- Test expectations:
  - Vitest with mocked storage covers create, update, list ordering, delete,
    import validation failure, export output, and `lastRun` update.

### T8 Popup Run Controls

- Status: [x] Completed
- Briefing: Implement popup as a short-lived control surface. It should not own
  full scenario authoring.
- Dependencies: T3, T4, T7.
- Completion criteria:
  - Popup displays current tab readiness and last run status.
  - Popup can start/stop recording, run selected scenario, pause/resume/stop the
    current run, and open the side panel.
  - Popup actions disable or show pending state while commands are in flight.
  - Command failures surface concise user-facing errors.
- Test expectations:
  - Vitest covers command payloads and popup state rendering with mocked
    background responses.
  - `pnpm typecheck` passes.

### T9 Side Panel Scenario List And Editor Shell

- Status: [x] Completed
- Briefing: Expand side panel into the primary authoring surface for scenario
  list, step list, lightweight editing, validation feedback, import/export, and
  per-step dry-run entrypoints.
- Dependencies: T6, T7.
- Completion criteria:
  - Side panel lists saved scenarios and selected scenario metadata.
  - Step list displays action, target summary, input summary, and validation
    status.
  - Basic editing supports document-level JSON editing or structured fields
    without losing unsupported document properties.
  - Per-step dry run sends a single compiled step through the same run routing
    path with a distinct run id.
  - Import/export actions share storage and validation behavior from T7.
- Test expectations:
  - Vitest covers scenario selection, validation error display, edited document
    save flow, and dry-run command payloads.

### T10 Trace Display

- Status: [x] Completed
- Briefing: Build extension-owned trace ingestion and display for run status and
  failure detail while preserving runtime trace semantics from `@actorble/browser`.
- Dependencies: T3, T5, T6.
- Completion criteria:
  - Trace events are grouped by `runId` and associated scenario/step ids when
    present.
  - UI displays current status, latest event, failure details, and completed run
    summary.
  - Trace storage is bounded for extension UI use and does not become the
    runtime diagnostic source of truth.
- Test expectations:
  - Vitest covers event ingestion order, run grouping, failure rendering model,
    and bounded history behavior.

### T11 Inspector Target Picker

- Status: [x] Completed
- Briefing: Add target picker orchestration between side panel and content
  script. The inspector coordinates overlay and selection; runtime target
  resolution remains in `@actorble/browser`.
- Dependencies: T3, T4, T5.
- Completion criteria:
  - Side panel can start and stop target inspection for the active tab.
  - Content script shows a hover highlight overlay and returns selected element
    information through a correlation-friendly message.
  - Inspector handles cancellation, navigation/content loss, and unsupported
    pages.
  - Overlay cleanup is guaranteed on stop or selection.
- Test expectations:
  - Vitest covers inspector session state, start/stop messages, cancellation,
    and selected-target payload normalization with mocked content responses.
  - Manual verification confirms overlay cleanup on selection and stop.

### T12 Locator Preview

- Status: [x] Completed
- Briefing: Preview locator candidates from selected targets so users can choose
  stable target definitions before writing them into scenario documents.
- Dependencies: T2, T11.
- Completion criteria:
  - Locator candidate list ranks available strategies such as role, label,
    testId, text, css, and point.
  - Preview shows match count and strictness for each candidate by delegating
    actual match checks through the runtime/content boundary.
  - Selected locator writes into the current scenario document without breaking
    validation.
  - Ambiguous and zero-match previews are visible to the user.
- Test expectations:
  - Vitest covers candidate ranking inputs, preview result formatting, strict
    target write-back, and validation after write-back.

### T13 Recorder Event Capture

- Status: [x] Completed
- Briefing: Capture browser page events during recording inside the content
  script boundary and prepare raw events for normalization.
- Dependencies: T3, T4, T5.
- Completion criteria:
  - Recording can start and stop for a correlated tab/frame session.
  - Captured event types cover the first useful authoring flow: click and text
    input/fill.
  - Raw events include enough context for locator synthesis without storing
    unnecessary page data.
  - Sensitive input detection marks password or secret-like fields before any
    draft step stores text.
  - Event listeners are removed reliably on stop, navigation, or content loss.
- Test expectations:
  - Vitest covers event capture lifecycle, listener cleanup, sensitive field
    marking, and raw event payload shape.
  - Manual verification confirms password values are not silently stored.

### T14 Event-To-Step Normalization

- Status: [x] Completed
- Briefing: Convert raw recorded browser events into stable scenario draft steps.
  Prefer user intent steps such as `click` and `fill` over low-level browser
  events.
- Dependencies: T1, T12, T13.
- Completion criteria:
  - Click event sequences normalize into `click` steps with locator candidates.
  - Text input sequences normalize into `fill` or `typeInto` steps according to
    captured context.
  - Repeated noisy events are compressed without losing user-visible intent.
  - Sensitive text can be masked, omitted, or marked for user confirmation.
  - Output is a valid draft scenario document or reports specific normalization
    errors.
- Test expectations:
  - Vitest covers click normalization, text sequence compression, sensitive text
    handling, invalid locator candidates, and draft validation of output.

### T15 Recorder Workflow Integration

- Status: [x] Completed
- Briefing: Connect recorder controls, content capture, event normalization, and
  side panel review into one draft authoring workflow.
- Dependencies: T8, T9, T13, T14.
- Completion criteria:
  - Popup or side panel can start and stop recording.
  - Stopping a recording returns a draft scenario document to the side panel.
  - Draft output is validated, displayed for review, and can be saved or
    exported.
  - Recording status and errors are visible in popup and side panel.
  - Existing run and inspector sessions cannot silently conflict with recording.
- Test expectations:
  - Vitest covers record start/stop command flow, draft handoff, conflict
    handling, validation failure, and save/export from recorded drafts.

### T16 TypeScript Code Export

- Status: [x] Completed
- Briefing: Export scenario documents to browser-oriented TypeScript code
  artifacts for users who want to move from GUI authoring to source-controlled
  Actorble scripts.
- Dependencies: T2, T7, T9.
- Completion criteria:
  - Exported code imports public `@actorble/browser` APIs and represents the
    compiled scenario intent clearly.
  - Export preserves scenario name, step ids, action order, locator intent, and
    relevant options.
  - Unsupported document features fail with actionable export errors.
  - Export does not change stored scenario documents.
- Test expectations:
  - Vitest covers export of the browser login example, locator/action coverage,
    unsupported feature errors, and deterministic output formatting.

### T17 Optional DevTools Trace Panel

- Status: [x] Completed
- Briefing: Add an optional advanced debugging panel after the first usable
  extension is stable. This task is not part of the minimum usable extension.
- Dependencies: T10, T12.
- Completion criteria:
  - DevTools panel displays full trace inspection, locator diagnostics, runtime
    capability report, and frame/surface debugging information.
  - Panel subscribes to existing trace/status channels rather than introducing a
    separate runtime trace source.
  - Feature can be omitted from production builds if WXT/browser support makes it
    costly.
- Test expectations:
  - Vitest covers panel data model and subscriptions where practical.
  - Manual verification confirms trace and capability data match side panel
    runtime state.

### T18 Content Readiness And Frame Correlation

- Status: [x] Completed
- Briefing: Replace implicit `frameId: 0` routing with explicit content
  readiness and known-frame correlation. This removes a common cause of
  record/run/inspect commands silently targeting the wrong frame.
- Dependencies: T3, T4, T5, T11, T13.
- Completion criteria:
  - Content scripts emit or answer `content:ready` with tab/frame capability
    metadata where the browser API permits it.
  - Background resolves active-tab readiness without blindly adding
    `frameId: 0`.
  - Run, record, inspector, and locator preview commands include `frameId` only
    when the frame is known.
  - Unsupported pages, missing content scripts, and cross-origin frame limits
    surface as user-facing states.
- Test expectations:
  - Vitest covers active-tab readiness, omitted frame id routing, known frame
    routing, content-not-ready, and unsupported page errors.
  - `pnpm typecheck` passes.

### T19 Builder Authoring Session And Step Operations

- Status: [x] Completed
- Briefing: Introduce `src/builder` as the testable model for scenario workflow
  authoring. It owns draft state and structured scenario document edits instead
  of treating JSON textareas as the primary editor.
- Dependencies: T1, T7, T9.
- Completion criteria:
  - Authoring session tracks selected scenario, draft document, dirty state,
    selected step, selected target slot, validation issues, run state, and
    record state.
  - Builder operations support create/select scenario, add, insert, duplicate,
    delete, reorder, and update step action families.
  - Step operations produce portable scenario documents and do not store
    builder UI state inside scenario documents.
  - Validation runs after mutating operations and preserves actionable paths.
- Test expectations:
  - Vitest covers session initialization, dirty state, each step operation,
    action-specific default step creation, validation write-back, and unchanged
    metadata preservation.

### T20 Side Panel Workflow Builder UI

- Status: [x] Completed
- Briefing: Replace the scattered side panel sections with a workflow builder
  composed around the authoring session. The UI should make the common path:
  add action, set target/input/options, validate, dry-run, and save.
- Dependencies: T10, T18, T19.
- Completion criteria:
  - Side panel renders scenario list, step timeline/list, selected-step
    structured editor, target slot controls, validation, run feedback, and
    trace feedback as one workflow.
  - Raw JSON editing is no longer the primary editor; import/export and repair
    remain available as secondary flows.
  - Per-step dry run uses the selected step from the authoring session and the
    same background/content routing as full scenario run.
  - Buttons and pending states are derived from session state, not duplicated
    across unrelated feature objects.
- Test expectations:
  - Vitest covers rendered view models for empty session, saved scenario,
    unsaved draft, invalid step, pending run, and dry-run command payload.
  - `pnpm build` passes.

### T21 Target Slot Inspector Integration

- Status: [ ] Not started
- Briefing: Integrate inspector and locator preview into target assignment.
  Target picking should start from a selected target slot and write back to that
  exact slot after locator preview.
- Dependencies: T11, T12, T18, T19, T20.
- Completion criteria:
  - Builder exposes target slots for step target, drag from, drag to,
    waitFor target, and scrollTo target.
  - Inspector start messages carry enough correlation to recover the selected
    target slot in side panel state.
  - Locator preview writes the selected locator into the correlated target slot,
    not only the top-level selected step target.
  - Inspector launch is disabled for actions without a writable target slot.
- Test expectations:
  - Vitest covers target slot discovery, inspector session correlation,
    selected target normalization, locator preview, write-back for every target
    slot, and disabled launch for targetless actions.

### T22 Navigation-Safe Recorder Event Buffer

- Status: [ ] Not started
- Briefing: Move recording event ownership from content-script memory to a
  background-owned session buffer. This makes browser usage recording survive
  normal page navigation and frame reload.
- Dependencies: T3, T4, T13, T14, T18.
- Completion criteria:
  - `record:start` creates a background session and tells eligible content
    scripts to capture.
  - Content capture flushes incremental `record:event` messages with
    correlation metadata.
  - `pagehide` or navigation flushes pending events before content cleanup.
  - `record:stop` normalizes buffered events into a draft scenario.
  - Empty recordings return an explicit empty recording state instead of invalid
    empty scenario JSON.
- Test expectations:
  - Vitest covers record event ingestion order, pagehide flush, navigation
    continuity, mismatched session rejection, empty recording state, and
    normalization failure reporting.

### T23 Recorded Draft Review And Merge

- Status: [ ] Not started
- Briefing: Treat recorder output as a builder review input. A recorded draft
  should not silently overwrite the selected scenario.
- Dependencies: T19, T20, T22.
- Completion criteria:
  - Side panel opens recorded drafts in builder review with source event count
    and validation status.
  - User can replace the current draft, append recorded steps, discard the
    recording, save as a new scenario, or export.
  - Sensitive recorded inputs require visible confirmation before save.
  - Popup record stop can hand off a draft to side panel by draft id.
- Test expectations:
  - Vitest covers replace, append, discard, save-as-new, export, sensitive input
    confirmation, and popup-to-side-panel draft handoff.

### T24 Workflow Verification Harness

- Status: [ ] Not started
- Briefing: Add verification that exercises the extension as a workflow rather
  than only isolated message models.
- Dependencies: T18, T20, T21, T23.
- Completion criteria:
  - A browser-targeted verification path runs against an allowed local page or
    a deterministic fixture page.
  - Verification covers add action, pick target, dry-run step, record a short
    interaction, review draft, save, and run scenario.
  - Existing unit tests remain focused on feature modules and adapters.
- Test expectations:
  - `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
  - Manual or automated browser verification captures failures for routing,
    inspector write-back, recorder draft review, and run feedback.

## First Vertical Slice

The completed initial vertical slice is T1 through T6:

```txt
draft scenario JSON
-> validate and migrate
-> compile to @actorble/browser Scenario
-> send scenario:run with tabId/frameId/scenarioId/runId
-> background routes to active tab content script
-> content host calls Actorble.run(...)
-> runtime:status and trace:event stream back
-> side panel displays status and latest trace/failure detail
```

Acceptance criteria:

- A user can paste or import the draft browser login scenario JSON.
- Invalid JSON or invalid draft documents show validation errors before run.
- Valid draft documents compile without UI state dependencies.
- The active tab content host executes the compiled runtime scenario through
  `@actorble/browser`.
- The UI displays at least running, completed, and failed statuses with `runId`
  correlation.

## Redesign Vertical Slice

The first redesign slice is T18 through T21:

```txt
content readiness without implicit frameId
-> builder authoring session
-> add a click step
-> select the step target slot
-> inspector selects an element
-> locator preview returns candidates
-> chosen locator writes into the target slot
-> step validates
-> dry-run sends one compiled step through background/content routing
```

Acceptance criteria:

- A user can create a new draft scenario without importing JSON.
- A user can add a target-bearing action and set its target with inspector.
- Inspector is not a detached tool in the primary flow; it is launched from a
  concrete target slot.
- The dry-run path does not depend on `frameId: 0` unless the frame is known.
- Validation and trace feedback appear in the same builder workflow.

## Execution Checklist

- Before each task, add or update focused Vitest coverage for the behavior being
  implemented.
- Keep entrypoint code thin; move testable logic into feature modules.
- Do not import `@actorble/browser` runtime internals. Use its public package
  exports only.
- Do not add a source `manifest.json`; update `wxt.config.ts` or entrypoint
  configuration instead.
- Store scenario documents, not compiled runtime scenarios.
- Preserve `scenarioId`, `runId`, `tabId`, and `frameId` through async message
  paths where applicable.
- Include `frameId` only for known frame correlations.
- Treat unsupported pages, missing permissions, cross-origin frame limits, and
  content-script readiness as user-visible states.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before marking an
  implementation task completed.
