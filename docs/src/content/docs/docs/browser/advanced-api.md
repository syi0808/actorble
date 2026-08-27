---
title: Advanced API
description: Advanced target types, engine interfaces, and adapter APIs for @actorble/browser.
sidebar:
  order: 7
---

This page covers low-level exports from `@actorble/browser`. Use these APIs when composing custom modules, testing subsystem behavior, or replacing browser platform boundaries.

For normal browser control, start with [API Surface](../api/).

## TargetLike

```ts
type TargetLike = Locator | TargetHandle | Element;
```

Most facade and orchestrator methods accept `TargetLike`.

## TargetHandle

```ts
type TargetHandle = {
  id: string;
  element: Element;
  locator?: Locator;
  resolvedAt: TimestampMs;
  root: Document | ShadowRoot;
  surfaceId?: string;
  validity: TargetValidity;
  debug: TargetDebugInfo;
};
```

`TargetHandle` is a resolved target snapshot. Revalidate stale handles through the resolver before using them in low-level modules.

## TargetInspection

```ts
type TargetInspection = {
  target: TargetHandle;
  debug: TargetDebugInfo;
  validity: TargetValidity;
};
```

Returned by `inspect()`.

## GeometrySnapshot

```ts
type GeometrySnapshot = {
  target: TargetHandle;
  rect: Rect;
  visibleRect: Rect | null;
  center: Point;
  clickablePoint: ClickablePointResult;
  coordinateSpace: CoordinateSpace;
  computedAt: number;
};
```

## InteractabilityReport

```ts
type InteractabilityReport = {
  target: TargetHandle;
  visible: boolean;
  visibilityRatio?: number;
  enabled: boolean;
  editable?: boolean;
  focusable?: boolean;
  receivesPointerEvents: boolean;
  occludedBy?: TargetDebugInfo;
  canClick: boolean;
  canFocus: boolean;
  canType?: boolean;
  blockingReasons: readonly InteractabilityReason[];
  forceBypassedReasons: readonly InteractabilityReason[];
  unforceableReasons: readonly InteractabilityReason[];
};
```

## TargetResolver

```ts
interface TargetResolver {
  resolve(locator: Locator, options?: ResolveOptions): Promise<TargetHandle>;
  resolveAll(locator: Locator, options?: ResolveOptions): Promise<readonly TargetHandle[]>;
  exists(locator: Locator, options?: ResolveOptions): Promise<boolean>;
  inspect(target: TargetLike): Promise<TargetInspection>;
  validate(target: TargetHandle): Promise<TargetHandle>;
}
```

Exports:

```ts
class BrowserTargetResolver implements TargetResolver
function createTargetResolver(options?: TargetResolverOptions): TargetResolver
```

## GeometryEngine

```ts
interface GeometryEngine {
  snapshot(target: TargetLike): Promise<GeometrySnapshot>;
  getBoundingRect(target: TargetHandle): Rect;
  getVisibleRect(target: TargetHandle): Rect | null;
  getCenter(target: TargetHandle): Point;
  getClickablePoint(target: TargetHandle): ClickablePointResult;
}
```

Exports:

```ts
class BrowserGeometryEngine implements GeometryEngine
function createGeometryEngine(options?: GeometryEngineOptions): GeometryEngine
```

## SurfaceEngine

```ts
interface SurfaceEngine {
  getSurfaceFor(target: TargetHandle): SurfaceSnapshot;
  getScrollableAncestors(target: TargetHandle): readonly Element[];
  ensureVisible(target: TargetHandle, options?: RevealOptions): Promise<void>;
  reveal(target: TargetHandle, options?: RevealOptions): Promise<RevealResult>;
  scrollTo(position: ScrollPosition, options?: ScrollOptions): Promise<ScrollResult>;
  scrollBy(delta: ScrollDelta, options?: ScrollOptions): Promise<ScrollResult>;
  mapPoint(point: Point, from: CoordinateSpace, to: CoordinateSpace): Point;
}
```

Exports:

```ts
class BrowserSurfaceEngine implements SurfaceEngine
function createSurfaceEngine(options?: SurfaceEngineOptions): SurfaceEngine
```

## InteractabilityEngine

```ts
interface InteractabilityEngine {
  inspect(target: TargetHandle, geometry: GeometrySnapshot): Promise<InteractabilityReport>;
  canClick(
    target: TargetHandle,
    geometry: GeometrySnapshot,
    options?: ClickOptions,
  ): Promise<InteractabilityReport>;
  canFocus(target: TargetHandle, options?: FocusOptions): Promise<InteractabilityReport>;
  canType(target: TargetHandle): Promise<InteractabilityReport>;
}
```

Exports:

```ts
class BrowserInteractabilityEngine implements InteractabilityEngine
function createInteractabilityEngine(options?: InteractabilityEngineOptions): InteractabilityEngine
```

## ActionOrchestrator

```ts
interface ActionOrchestrator {
  moveTo(target: TargetLike, options?: MoveOptions): Promise<void>;
  click(target: TargetLike, options?: ClickOptions): Promise<void>;
  clickCurrent(options?: ClickCurrentOptions): Promise<void>;
  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void>;
  focus(target: TargetLike, options?: FocusOptions): Promise<void>;
  type(text: string, options?: TypeOptions): Promise<void>;
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void>;
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void>;
  press(keys: string, options?: PressOptions): Promise<void>;
  reveal(target: TargetLike, options?: RevealOptions): Promise<RevealResult>;
  scrollTo(position: ScrollPosition, options?: ScrollOptions): Promise<ScrollResult>;
  scrollBy(delta: ScrollDelta, options?: ScrollOptions): Promise<ScrollResult>;
  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void>;
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>;
  geometry(target: TargetLike): Promise<GeometrySnapshot>;
}
```

Exports:

```ts
class BrowserActionOrchestrator implements ActionOrchestrator
function createActionOrchestrator(options?: ActionOrchestratorOptions): ActionOrchestrator
```

The facade only exposes orchestrator methods that are wired today. Some lower-level orchestrator methods are still extension points.

## GestureEngine

```ts
interface GestureEngine {
  click(target: TargetHandle, point: Point, options?: GestureClickOptions): Promise<GestureResult>;
  doubleClick(
    target: TargetHandle,
    point: Point,
    options?: GestureClickOptions,
  ): Promise<GestureResult>;
  hover(point: Point, options?: MoveOptions): Promise<GestureResult>;
  drag(from: Point, to: Point, options?: DragOptions): Promise<GestureResult>;
  cancel(): Promise<GestureResult>;
}
```

Exports:

```ts
class BrowserGestureEngine implements GestureEngine
function createGestureEngine(options?: GestureEngineOptions): GestureEngine
```

## PointerEngine

```ts
interface PointerEngine {
  getState(): PointerState;
  moveTo(point: Point, options?: MoveOptions): Promise<PointerState>;
  down(button?: PointerButtonName): Promise<PointerState>;
  up(button?: PointerButtonName): Promise<PointerState>;
  cancel(): Promise<PointerState>;
}
```

Exports:

```ts
class BrowserPointerEngine implements PointerEngine
function createPointerEngine(options?: PointerEngineOptions): PointerEngine
```

## FocusEngine

```ts
interface FocusEngine {
  focus(target: TargetLike, options?: FocusOptions): Promise<FocusSnapshot>;
  blur(target?: TargetLike): Promise<FocusSnapshot>;
  getFocused(): Promise<FocusSnapshot>;
  tab(options?: FocusOptions): Promise<FocusSnapshot>;
}
```

Exports:

```ts
class BrowserFocusEngine implements FocusEngine
function createFocusEngine(options?: FocusEngineOptions): FocusEngine
```

## KeyboardEngine

```ts
interface KeyboardEngine {
  getState(): KeyboardState;
  keyDown(key: string, options?: PressOptions): Promise<KeyboardState>;
  keyUp(key: string, options?: PressOptions): Promise<KeyboardState>;
  press(keys: string, options?: PressOptions): Promise<KeyboardState>;
}
```

Exports:

```ts
class BrowserKeyboardEngine implements KeyboardEngine
function createKeyboardEngine(options?: KeyboardEngineOptions): KeyboardEngine
```

## TextInputEngine

```ts
interface TextInputEngine {
  type(text: string, options?: TypeOptions): Promise<TextInputResult>;
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<TextInputResult>;
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<TextInputResult>;
}
```

Exports:

```ts
class BrowserTextInputEngine implements TextInputEngine
function createTextInputEngine(options?: TextInputEngineOptions): TextInputEngine
```

## ScenarioRunner

```ts
interface ScenarioRunner {
  run(scenario: Scenario, options?: RunOptions): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  getSnapshot(): ScenarioRunSnapshot;
}
```

Exports:

```ts
class BrowserScenarioRunner implements ScenarioRunner
function createScenarioRunner(options?: ScenarioRunnerOptions): ScenarioRunner
```

## WaitObservationEngine

`WaitStrategy` accepts `none`, `next-frame`, and `interaction-stable`. The deprecated `settled`
alias remains accepted during the compatibility window and resolves to `interaction-stable` before
execution and diagnostics.

```ts
interface WaitObservationEngine {
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>;
  settle(strategy?: WaitStrategy, options?: WaitOptions): Promise<WaitResult | null>;
  invalidateGeometry(reason: string): void;
}
```

Exports:

```ts
class BrowserWaitObservationEngine implements WaitObservationEngine
function createWaitObservationEngine(options?: WaitObservationEngineOptions): WaitObservationEngine
```

## TimelineEngine

```ts
interface TimelineEngine extends Clock {
  delay(duration: DurationMs, options?: CancellationOptions): Promise<void>;
  nextFrame(options?: CancellationOptions): Promise<TimestampMs>;
  settle(strategy?: WaitStrategy, options?: CancellationOptions): Promise<void>;
  withTimeout<TValue>(
    operation: Promise<TValue>,
    timeout: DurationMs,
    options?: CancellationOptions,
  ): Promise<TValue>;
}
```

Exports:

```ts
class BrowserTimelineEngine implements TimelineEngine
function createTimelineEngine(): TimelineEngine
```

## VisualLayer

```ts
interface VisualLayer {
  showCursor(request: CursorVisualInput): void;
  highlightTarget(request: HighlightRequest): void;
  showClick(point: Point): void;
  showFocus(request: FocusVisualRequest): void;
  showTyping(request: TypingVisualRequest): void;
  showKeystroke(request: KeystrokeVisualRequest): void;
  clearFeedback(): void;
  hide(): void;
  destroy(): void;
}

type CursorVisualRequest = {
  point: Point;
  cursor?: string;
  kind?: CursorVisualKind;
  label?: string;
  pressed?: boolean;
};
```

`label` contains normalized cursor identity metadata. Injected visual layers may render it differently, but they remain responsible for non-interactive behavior and hit-test isolation.

Exports:

```ts
class BrowserVisualLayer implements VisualLayer
class NoopVisualLayer implements VisualLayer
function createVisualLayer(options?: VisualLayerOptions): VisualLayer
```

## Diagnostics trace

```ts
interface TraceCollector extends SpanRecorder, TraceReader, TraceEventSubscriber {}

interface SpanRecorder {
  startSpan(name: string, attributes?: ActorbleErrorDetails): TraceSpanHandle;
  appendEvent(name: DebugEventName, data?: unknown): void;
  attachSnapshot(name: string, data: unknown): void;
  warn(message: string, details?: ActorbleErrorDetails): void;
}

interface TraceReader {
  getTrace(): Trace;
}

interface TraceEventSubscriber {
  on(name: DebugEventName, listener: ActorbleListener<TraceEvent>): void;
  off(name: DebugEventName, listener: ActorbleListener<TraceEvent>): void;
}

type TraceEvent = {
  name: DebugEventName;
  at: TimestampMs;
  spanId?: string;
  data?: unknown;
};
```

Exports:

```ts
class BrowserDiagnosticsTrace implements TraceCollector
function createDiagnosticsTrace(options?: DiagnosticsTraceOptions): TraceCollector
```

Trace event subscriptions are exact-name subscriptions for future events only. They do not replay `getTrace().events`; callers should use `off()` or facade `destroy()` cleanup to release listeners.

Reveal diagnostics use the `reveal:start` through `reveal:complete` event family. Observed stability
uses `stability:start` through `stability:complete`. Their payloads contain policies, surface IDs,
counts, outcomes, and numeric geometry or offset summaries; they never retain raw DOM nodes, target
content, mutation records, error messages, or cancellation reasons. Timeout snapshots duplicate the
latest scalar summary, while the thrown timeout error remains authoritative when trace retention
evicts events or snapshots.

## CapabilityFidelityReporter

```ts
interface CapabilityFidelityReporter {
  getCapabilities(): CapabilityReport;
  getFidelity(): FidelityReport;
}
```

Exports:

```ts
class BrowserCapabilityFidelityReporter implements CapabilityFidelityReporter
function createCapabilityFidelityReporter(
  options?: CapabilityFidelityReporterOptions,
): CapabilityFidelityReporter
```

## InteractionStateStore

```ts
interface InteractionStateStore {
  snapshot(): InteractionStateSnapshot;
  dispatch(event: InteractionStateEvent): InteractionStateDiff;
  applyPointerSignal(signal: PointerSignal): InteractionStateDiff;
  setFocused(target: TargetHandle | null, focusVisible?: boolean): InteractionStateDiff;
  setTyping(target: TargetHandle | null): InteractionStateDiff;
  reset(): InteractionStateDiff;
  subscribe(listener: ActorbleListener<InteractionStateDiff>): Disposable;
}
```

Exports:

```ts
class BrowserInteractionStateStore implements InteractionStateStore
function createInteractionStateStore(): InteractionStateStore
```

## PointerSignalBus

```ts
interface PointerSignalBus {
  emit(signal: PointerSignal): void;
  subscribe(listener: ActorbleListener<PointerSignal>): Disposable;
}
```

Exports:

```ts
class BrowserPointerSignalBus implements PointerSignalBus
function createPointerSignalBus(): PointerSignalBus
```

## PointerVisualTracker

```ts
interface PointerVisualTracker extends Disposable {
  setMode(mode: PointerVisualMode): void;
  refresh(reason?: string): Promise<void>;
  clear(): void;
  getSnapshot(): PointerVisualSnapshot;
}
```

Exports:

```ts
class BrowserPointerVisualTracker implements PointerVisualTracker
class NoopPointerVisualTracker implements PointerVisualTracker
function createPointerVisualTracker(options?: PointerVisualTrackerOptions): PointerVisualTracker
```

## LayoutInvalidationTracker

```ts
interface LayoutInvalidationTracker extends Disposable {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  markDirty(reason: LayoutInvalidationReason): void;
  subscribe(listener: LayoutInvalidationListener): Disposable;
}
```

Exports:

```ts
class BrowserLayoutInvalidationTracker implements LayoutInvalidationTracker
class NoopLayoutInvalidationTracker implements LayoutInvalidationTracker
function createLayoutInvalidationTracker(
  options?: LayoutInvalidationTrackerOptions,
): LayoutInvalidationTracker
```

## PseudoStateMirror

```ts
interface PseudoStateMirror extends StateApplyPort {
  apply(request: PseudoStateMirrorRequest): void;
  clear(target?: TargetHandle): void;
}
```

Exports:

```ts
class BrowserPseudoStateMirror implements PseudoStateMirror
function createPseudoStateMirror(): PseudoStateMirror
```

## Platform adapters

The platform adapter exports low-level ports and browser-backed implementations.

```ts
interface DomPort extends DomReadPort, DomWritePort {}

interface EventDispatchPort {
  dispatchPointerEvent(event: PointerEventDescriptor): boolean;
  dispatchMouseEvent(event: MouseEventDescriptor): boolean;
  dispatchKeyboardEvent(event: KeyboardEventDescriptor): boolean;
  dispatchTextInputEvent(event: TextInputEventDescriptor): boolean;
}

interface StateApplyPort {
  applyStateEffects(effects: readonly StateEffect[]): void;
  cleanup(): void;
}

interface StylePort {
  injectStyle(injection: StyleInjection): Disposable;
  removeStyle(id: string): void;
}
```

Exports:

```ts
class BrowserDomAdapter implements DomAdapter
function createDomAdapter(root?: Document | ShadowRoot): DomAdapter

class BrowserEventDispatcher implements EventDispatcher
function createEventDispatcher(): EventDispatcher

class BrowserStateApplier implements StateApplier
function createStateApplier(): StateApplier

class BrowserStyleAdapter implements StyleAdapter
function createStyleAdapter(root?: Document | ShadowRoot): StyleAdapter

class BrowserPlatformAdapterShell implements BrowserPlatformAdapter
```

Use platform adapters when replacing browser DOM access, event dispatch, pseudo-state application, or style injection.
