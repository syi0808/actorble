import { BrowserDiagnosticsTrace } from '../../diagnostics/diagnostics-trace/index.js';
import { BrowserFocusEngine } from '../../input/focus-engine/index.js';
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js';
import { BrowserGestureEngine } from '../../input/gesture-engine/index.js';
import { BrowserInteractabilityEngine } from '../../targeting/interactability-engine/index.js';
import { BrowserInteractionStateStore } from '../../state/interaction-state-store/index.js';
import { BrowserKeyboardEngine } from '../../input/keyboard-engine/index.js';
import { BrowserPointerEngine, type PointerEngine } from '../../input/pointer-engine/index.js';
import { BrowserPointerSignalBus } from '../../input/pointer-signals/index.js';
import {
  BrowserDomAdapter,
  BrowserEventDispatcher,
  BrowserSelectionAdapter,
  BrowserStateApplier,
  BrowserStyleAdapter,
  type TextInputMutationPort,
} from '../../platform/platform-adapter/index.js';
import { BrowserPointerVisualTracker } from '../../visual/pointer-visual-tracker/index.js';
import { BrowserPseudoStateMirror } from '../../visual/pseudo-state-mirror/index.js';
import { createFrameGeometrySurfaceCache } from '../../targeting/frame-geometry-surface-cache/index.js';
import { BrowserSurfaceEngine } from '../../targeting/surface-engine/index.js';
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js';
import { BrowserTextInputEngine } from '../../input/text-input-engine/index.js';
import { BrowserTimelineEngine } from '../timeline-engine/index.js';
import { NoopVisualLayer } from '../../visual/visual-layer/index.js';
import { BrowserWaitObservationEngine } from '../wait-observation-engine/index.js';
import {
  BROWSER_OPTION_DEFAULTS,
  normalizeStabilityPolicy,
  resolveBrowserFeedbackOptions,
} from '../../options/index.js';
import {
  ActorbleError,
  actorbleError,
  cancellationError,
  element as elementLocator,
  timeoutError,
} from '../../shared/index.js';
import type { SpanRecorder, TraceSpanHandle } from '../../diagnostics/diagnostics-trace/index.js';
import type { FocusEngine } from '../../input/focus-engine/index.js';
import type {
  CancellationOptions,
  ClickCurrentOptions,
  ClickOptions,
  DomPort,
  Disposable,
  DurationMs,
  EventDispatchPort,
  ActorblePointerOptions,
  ActionRevealPolicy,
  ActionWaitPolicy,
  ActorbleErrorDetails,
  DragOptions,
  FillOptions,
  FocusOptions,
  Locator,
  MoveOptions,
  OperationOptions,
  PressOptions,
  Point,
  PointerButtonName,
  PointerSequence,
  PointerSequenceOptions,
  PlatformTextSelectionEndpoint,
  PlatformTextSelectionRange,
  PlatformTextSelectionSnapshot,
  RevealOptions,
  RevealResult,
  ScrollDelta,
  ScrollOptions,
  ScrollPosition,
  ScrollResult,
  SelectTextOptions,
  SelectionPort,
  StateApplyPort,
  StateEffect,
  TargetDebugInfo,
  TargetHandle,
  TargetLike,
  TargetValidity,
  TextSelectionEndpoint,
  TextSelectionTarget,
  TypeOptions,
  TypeIntoOptions,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js';
import type { BrowserFeedbackInput, ResolvedBrowserFeedbackOptions } from '../../options/index.js';
import type { GeometryEngine, GeometrySnapshot } from '../../targeting/geometry-engine/index.js';
import type { GestureEngine } from '../../input/gesture-engine/index.js';
import type { KeyboardEngine, KeyboardState } from '../../input/keyboard-engine/index.js';
import type {
  InteractabilityEngine,
  InteractabilityReport,
} from '../../targeting/interactability-engine/index.js';
import type {
  InteractionStateDiff,
  InteractionStateStore,
} from '../../state/interaction-state-store/index.js';
import {
  createLayoutInvalidationTracker,
  NoopLayoutInvalidationTracker,
  type LayoutInvalidationEvent,
  type LayoutInvalidationTracker,
} from '../../targeting/layout-invalidation-tracker/index.js';
import type { PointerVisualTracker } from '../../visual/pointer-visual-tracker/index.js';
import type { PointerSignal, PointerSignalBus } from '../../input/pointer-signals/index.js';
import type { SurfaceEngine } from '../../targeting/surface-engine/index.js';
import type { TargetResolver } from '../../targeting/target-resolver/index.js';
import type { TextInputEngine } from '../../input/text-input-engine/index.js';
import type { TimelineEngine } from '../timeline-engine/index.js';
import type { VisualLayer } from '../../visual/visual-layer/index.js';
import type { WaitObservationEngine, WaitResult } from '../wait-observation-engine/index.js';

export type ActionName =
  | 'moveTo'
  | 'click'
  | 'clickCurrent'
  | 'doubleClick'
  | 'focus'
  | 'type'
  | 'typeInto'
  | 'fill'
  | 'press'
  | 'reveal'
  | 'scrollTo'
  | 'scrollBy'
  | 'drag'
  | 'selectText'
  | 'pointerSequence'
  | 'waitFor';

export type ActionTransaction = Readonly<{
  name: ActionName;
  target?: TargetLike;
  startedAt: number;
}>;

export interface ActionOrchestrator {
  moveTo(target: TargetLike, options?: MoveOptions): Promise<void>;
  click(target: TargetLike, options?: ClickOptions): Promise<void>;
  clickCurrent(options?: ClickCurrentOptions): Promise<void>;
  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void>;
  focus(target: TargetLike, options?: FocusOptions): Promise<void>;
  type(text: string, options?: TypeOptions): Promise<void>;
  typeInto(target: TargetLike, text: string, options?: TypeIntoOptions): Promise<void>;
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void>;
  press(keys: string, options?: PressOptions): Promise<void>;
  reveal(target: TargetLike, options?: RevealOptions): Promise<RevealResult>;
  scrollTo(position: ScrollPosition, options?: ScrollOptions): Promise<ScrollResult>;
  scrollBy(delta: ScrollDelta, options?: ScrollOptions): Promise<ScrollResult>;
  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void>;
  selectText(targetOrRange: TextSelectionTarget, options?: SelectTextOptions): Promise<void>;
  pointerSequence(sequence: PointerSequence, options?: PointerSequenceOptions): Promise<void>;
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>;
  geometry(target: TargetLike): Promise<GeometrySnapshot>;
  dispose?(): void;
}

export type ActionOrchestratorOptions = Readonly<{
  dom?: DomPort;
  events?: EventDispatchPort & Partial<TextInputMutationPort>;
  focus?: FocusEngine;
  geometry?: GeometryEngine;
  gesture?: GestureEngine;
  interactability?: InteractabilityEngine;
  keyboard?: KeyboardEngine;
  resolver?: TargetResolver;
  selection?: SelectionPort;
  signals?: PointerSignalBus;
  state?: StateApplyPort;
  store?: InteractionStateStore;
  surface?: SurfaceEngine;
  text?: TextInputEngine;
  layoutInvalidation?: LayoutInvalidationTracker;
  timeline?: TimelineEngine;
  trace?: SpanRecorder;
  visual?: VisualLayer;
  visualFeedback?: BrowserFeedbackInput;
  pointer?: ActorblePointerOptions;
  pointerVisual?: PointerVisualTracker;
  wait?: WaitObservationEngine;
}>;

type ActionPhase =
  | 'resolve'
  | 'validate'
  | 'reveal'
  | 'geometry'
  | 'preflight'
  | 'perform'
  | 'wait'
  | 'cleanup';

type PointerPerformAction = Extract<
  ActionName,
  | 'moveTo'
  | 'click'
  | 'doubleClick'
  | 'clickCurrent'
  | 'typeInto'
  | 'drag'
  | 'selectText'
  | 'pointerSequence'
>;

type ClickDispatchState = {
  button: PointerButtonName;
  downAllowed: boolean;
  upAllowed: boolean;
  downSeen: boolean;
  upSeen: boolean;
  activationCount: number;
  lastActivationPoint: Point | null;
};

type CursorVisualState = {
  target: TargetHandle | null;
  point: Point;
  cursor?: string;
  pressed: boolean;
};

type PointerHitSnapshot = {
  target: TargetHandle | null;
  hoverChain: readonly TargetHandle[];
};

type CurrentPointerContext = {
  target: TargetHandle;
  point: Point;
  source: 'hovered-target' | 'hit-test';
};

type PointerSignalContext = {
  target: TargetHandle;
  commandId: number;
  drag?: DragSignalContext;
};

type PointerSignalContextOptions = Readonly<{
  anchorAfterSuccess?: boolean;
}>;

type TargetPointTrackingAction = 'moveTo' | 'click' | 'typeInto' | 'doubleClick' | 'drag';

type TargetPointTracker = Readonly<{
  currentPoint(): Point;
  resolveEndpoint(currentPoint: Point): Promise<Point>;
  dispose(): void;
}>;

type TargetPointTrackerOptions = Readonly<{
  reveal?: ActionRevealPolicy;
  signal?: OperationOptions['signal'];
}>;

type DragSignalContext = {
  source: TargetHandle;
  destination: TargetHandle;
  active: boolean;
};

type ResolvedTextSelectionRange = Readonly<{
  primaryTarget: TargetHandle;
  secondaryTarget?: TargetHandle;
  range: PlatformTextSelectionRange;
}>;

type SelectionVisualTrajectoryPoint = Readonly<{
  point: Point;
  selectionProgress: number;
}>;

const emptyPointerHit: PointerHitSnapshot = {
  target: null,
  hoverChain: [],
};

export class BrowserActionOrchestrator implements ActionOrchestrator {
  readonly #dom: DomPort;
  readonly #events: EventDispatchPort;
  readonly #focus: FocusEngine;
  readonly #geometry: GeometryEngine;
  readonly #gesture: GestureEngine;
  readonly #interactability: InteractabilityEngine;
  readonly #keyboard: KeyboardEngine;
  readonly #pointer: PointerEngine;
  readonly #resolver: TargetResolver;
  readonly #selection: SelectionPort;
  readonly #state: StateApplyPort;
  readonly #store: InteractionStateStore;
  readonly #surface: SurfaceEngine;
  readonly #text: TextInputEngine;
  readonly #timeline: TimelineEngine;
  readonly #trace: SpanRecorder;
  readonly #visual: VisualLayer;
  readonly #visualFeedback: ResolvedBrowserFeedbackOptions;
  readonly #pointerVisual: PointerVisualTracker;
  readonly #wait: WaitObservationEngine;
  readonly #layoutInvalidation: LayoutInvalidationTracker;
  readonly #pointerHitReconciliationSubscription: Disposable;
  #signalContext: PointerSignalContext | null = null;
  #clickDispatchState: ClickDispatchState | null = null;
  readonly #cursorPressedButtons = new Set<PointerButtonName>();
  readonly #pressedPointerTargets = new Map<PointerButtonName, TargetHandle>();
  #cursorVisualState: CursorVisualState | null = null;
  #currentPointerPoint: Point | null = null;
  #nextPointerCommandId = 1;
  #nextPointerHitTargetId = 1;
  readonly #pointerHitTargets = new WeakMap<Element, TargetHandle>();

  constructor(options: ActionOrchestratorOptions = {}) {
    const trace = options.trace ?? new BrowserDiagnosticsTrace();
    const dom = options.dom ?? new BrowserDomAdapter();
    const timeline = options.timeline ?? new BrowserTimelineEngine();
    const layoutInvalidation =
      options.layoutInvalidation ?? createActionLayoutInvalidationTracker(dom, timeline);
    const store = options.store ?? new BrowserInteractionStateStore();
    const events = options.events ?? new BrowserEventDispatcher();
    const state =
      options.state ??
      new BrowserPseudoStateMirror({
        state: new BrowserStateApplier(),
        style: new BrowserStyleAdapter(dom.getRoot()),
        trace,
      });
    const signals = options.signals ?? new BrowserPointerSignalBus();
    const pointer = new BrowserPointerEngine({
      signals,
      timeline,
      initialPosition: options.pointer?.initialPosition,
    });
    const geometrySurfaceCache = createFrameGeometrySurfaceCache({
      layoutInvalidation,
      timeline,
    });
    let geometry = options.geometry;
    const surface =
      options.surface ??
      new BrowserSurfaceEngine({
        dom,
        cache: geometrySurfaceCache,
        trace,
      });
    geometry ??= new BrowserGeometryEngine({
      dom,
      surface,
      cache: geometrySurfaceCache,
      clock: timeline,
    });
    const focus = options.focus ?? new BrowserFocusEngine({ dom, store });

    this.#dom = dom;
    this.#trace = trace;
    this.#events = events;
    this.#focus = focus;
    this.#geometry = geometry;
    this.#pointer = pointer;
    this.#gesture =
      options.gesture ??
      new BrowserGestureEngine({
        pointer,
        timeline,
      });
    this.#interactability =
      options.interactability ?? new BrowserInteractabilityEngine({ dom, geometry });
    this.#keyboard =
      options.keyboard ?? new BrowserKeyboardEngine({ dom, events, store, timeline });
    this.#resolver = options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline });
    this.#selection = options.selection ?? new BrowserSelectionAdapter(dom.getRoot());
    this.#state = state;
    this.#store = store;
    this.#surface = surface;
    this.#timeline = timeline;
    this.#layoutInvalidation = layoutInvalidation;
    this.#pointerHitReconciliationSubscription = layoutInvalidation.subscribe((event) => {
      this.#reconcilePointerHit(event);
    });
    this.#visual = options.visual ?? new NoopVisualLayer();
    this.#visualFeedback =
      options.visualFeedback === undefined
        ? resolveBrowserFeedbackOptions('debug')
        : resolveBrowserFeedbackOptions(options.visualFeedback);
    this.#pointerVisual =
      options.pointerVisual ??
      new BrowserPointerVisualTracker({
        geometry,
        layoutInvalidation,
        trace,
        onUpdate: (update) => {
          this.#renderPointerCursor(update.point, update.target, update.pressed);
        },
        onStale: () => {
          this.#cursorPressedButtons.clear();
          this.#cursorVisualState = null;
          if (this.#visualFeedback.enabled && this.#visualFeedback.cursor) {
            this.#tryVisual('hide', () => this.#visual.hide());
          }
        },
      });
    this.#text =
      options.text ??
      new BrowserTextInputEngine({
        focus,
        events,
        store,
        dom,
        timeline,
        onKeystroke: (event) => {
          if (!this.#visualFeedback.enabled || !this.#visualFeedback.keystrokeOverlay) {
            return;
          }

          this.#tryVisual('showKeystroke', () =>
            this.#visual.showKeystroke({
              target: event.target,
              text: event.text,
              textVisibility: this.#visualFeedback.textVisibility,
            }),
          );
        },
      });
    this.#wait =
      options.wait ??
      new BrowserWaitObservationEngine({
        dom,
        resolver: this.#resolver,
        geometry,
        interactability: this.#interactability,
        layoutInvalidation,
        timeline,
        trace,
      });

    signals.subscribe((signal) => {
      this.#applyPointerSignal(signal);
    });
    store.subscribe((diff) => {
      this.#applyInteractionStateEffects(diff.effects);
    });
  }

  async moveTo(target: TargetLike, options: MoveOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('moveTo', options);
    options = scope.options(options);
    const span = this.#startActionSpan('moveTo', target, options);
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let performStarted = false;

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);
      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      const point = clickablePointOrThrow('moveTo', handle, snapshot);
      this.#showTargetHighlight(handle, snapshot);

      phase = 'perform';
      performStarted = true;
      const commandId = this.#createPointerCommandId();
      const moveTarget = handle;
      await this.#withPointerPerformTimeout(
        'moveTo',
        pointerMovementOptions(options),
        (performOptions) => {
          const pointTracker = this.#createTargetPointTracker('moveTo', moveTarget, point, span, {
            reveal: options.reveal,
            signal: performOptions.signal,
          });

          return this.#withSignalTarget(moveTarget, commandId, async () => {
            try {
              return await this.#gesture.hover(point, {
                ...performOptions,
                resolveEndpoint: pointTracker.resolveEndpoint,
              });
            } finally {
              pointTracker.dispose();
            }
          });
        },
      );
      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'moveTo',
        completed: true,
        targetId: handle.id,
        output: { point },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'moveTo');
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'moveTo',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
      this.#clearPointerContext();
    }
  }

  async click(target: TargetLike, options: ClickOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('click', options);
    options = scope.options(options);
    const span = this.#startActionSpan('click', target, options);
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let performStarted = false;

    this.#clickDispatchState = createClickDispatchState(options);

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);
      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      const point = clickablePointOrThrow('click', handle, snapshot);
      this.#showTargetHighlight(handle, snapshot);

      phase = 'preflight';
      const report = await this.#interactability.canClick(handle, snapshot, options);
      assertCanClick('click', handle, report);
      this.#warnForceBypass('click', handle, report);

      phase = 'perform';
      performStarted = true;
      const clickTarget = handle;
      let dispatchPoint = point;
      const commandId = this.#createPointerCommandId();
      const result = await this.#withPointerPerformTimeout(
        'click',
        clickGestureOptions(options),
        (performOptions) => {
          const pointTracker = this.#createTargetPointTracker('click', clickTarget, point, span, {
            reveal: options.reveal,
            signal: performOptions.signal,
          });

          return this.#withSignalTarget(
            clickTarget,
            commandId,
            async () => {
              try {
                return await this.#gesture.click(clickTarget, point, {
                  ...performOptions,
                  resolveEndpoint: pointTracker.resolveEndpoint,
                  refreshPointBeforeDown: async (currentPoint) => {
                    dispatchPoint = await this.#refreshClickPointBeforeDown(
                      'click',
                      clickTarget,
                      currentPoint,
                      options,
                      span,
                    );
                    return dispatchPoint;
                  },
                });
              } finally {
                pointTracker.dispose();
              }
            },
            { anchorAfterSuccess: false },
          );
        },
      );
      const dispatchState = this.#clickDispatchState;
      const activationDispatchCount = dispatchState?.activationCount ?? 0;
      const activationDispatched = activationDispatchCount > 0;
      const outputPoint = dispatchState?.lastActivationPoint ?? dispatchPoint;

      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'click',
        completed: true,
        targetId: handle.id,
        output: {
          point: outputPoint,
          gestureCompleted: result.completed,
          activationDispatched,
          activationDispatchCount,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span);
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'click',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
      this.#clickDispatchState = null;
      this.#clearPointerContext();
    }
  }

  async clickCurrent(options: ClickCurrentOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('clickCurrent', options);
    options = scope.options(options);
    const span = this.#startActionSpan('clickCurrent', undefined, options);
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let point: Point | undefined;
    let performStarted = false;

    this.#clickDispatchState = createClickDispatchState(options);

    try {
      const current = this.#currentPointerContextOrThrow(span);
      const currentPoint = current.point;

      point = currentPoint;
      phase = 'validate';
      handle = this.#validateCurrentPointerTarget(current.target, span);

      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      this.#showTargetHighlight(handle, snapshot);

      phase = 'preflight';
      const report = await this.#interactability.canClick(handle, snapshot, options);
      assertCanClick('clickCurrent', handle, report);

      phase = 'perform';
      performStarted = true;
      const clickTarget = handle;
      const commandId = this.#createPointerCommandId();
      const result = await this.#withPointerPerformTimeout(
        'clickCurrent',
        clickGestureOptions(options),
        (performOptions) =>
          this.#withSignalTarget(
            clickTarget,
            commandId,
            () =>
              this.#gesture.click(clickTarget, currentPoint, {
                ...performOptions,
                refreshPointBeforeDown: async () => {
                  this.#validateCurrentPointerTarget(clickTarget, span);
                  const freshSnapshot = await this.#geometry.snapshot(clickTarget);
                  const freshReport = await this.#interactability.canClick(
                    clickTarget,
                    freshSnapshot,
                    options,
                  );

                  assertCanClick('clickCurrent', clickTarget, freshReport);
                  return currentPoint;
                },
              }),
            { anchorAfterSuccess: false },
          ),
      );
      const dispatchState = this.#clickDispatchState;
      const activationDispatchCount = dispatchState?.activationCount ?? 0;
      const activationDispatched = activationDispatchCount > 0;
      const outputPoint = dispatchState?.lastActivationPoint ?? point;

      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'clickCurrent',
        completed: true,
        targetId: handle.id,
        output: {
          point: outputPoint,
          currentSource: current.source,
          gestureCompleted: result.completed,
          activationDispatched,
          activationDispatchCount,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'clickCurrent');
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'clickCurrent',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
      this.#clickDispatchState = null;
      this.#clearPointerContext();
    }
  }

  async doubleClick(target: TargetLike, options: ClickOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('doubleClick', options);
    options = scope.options(options);
    const span = this.#startActionSpan('doubleClick', target, options);
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let performStarted = false;

    this.#clickDispatchState = createClickDispatchState(options);

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);
      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      const point = clickablePointOrThrow('doubleClick', handle, snapshot);
      this.#showTargetHighlight(handle, snapshot);

      phase = 'preflight';
      const report = await this.#interactability.canClick(handle, snapshot, options);
      assertCanClick('doubleClick', handle, report);
      this.#warnForceBypass('doubleClick', handle, report);

      phase = 'perform';
      performStarted = true;
      const clickTarget = handle;
      let dispatchPoint = point;
      const commandId = this.#createPointerCommandId();
      const result = await this.#withPointerPerformTimeout(
        'doubleClick',
        clickGestureOptions(options),
        (performOptions) => {
          const pointTracker = this.#createTargetPointTracker(
            'doubleClick',
            clickTarget,
            point,
            span,
            { reveal: options.reveal, signal: performOptions.signal },
          );

          return this.#withSignalTarget(
            clickTarget,
            commandId,
            async () => {
              try {
                return await this.#gesture.doubleClick(clickTarget, point, {
                  ...performOptions,
                  resolveEndpoint: pointTracker.resolveEndpoint,
                  refreshPointBeforeDown: async (currentPoint) => {
                    dispatchPoint = await this.#refreshClickPointBeforeDown(
                      'doubleClick',
                      clickTarget,
                      currentPoint,
                      options,
                      span,
                    );
                    return dispatchPoint;
                  },
                });
              } finally {
                pointTracker.dispose();
              }
            },
            { anchorAfterSuccess: false },
          );
        },
      );
      const dispatchState = this.#clickDispatchState;
      const activationDispatchCount = dispatchState?.activationCount ?? 0;
      const outputPoint = dispatchState?.lastActivationPoint ?? dispatchPoint;

      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'doubleClick',
        completed: true,
        targetId: handle.id,
        output: {
          point: outputPoint,
          gestureCompleted: result.completed,
          activationDispatchCount,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'doubleClick');
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'doubleClick',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
      this.#clickDispatchState = null;
      this.#clearPointerContext();
    }
  }

  async focus(target: TargetLike, options: FocusOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('focus', options);
    options = scope.options(options);
    const span = this.#startActionSpan('focus', target, options);
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let focusStarted = false;

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);

      phase = 'preflight';
      const report = await this.#interactability.canFocus(handle, options);
      assertCanFocus(handle, report);

      phase = 'perform';
      focusStarted = true;
      const snapshot = await this.#focus.focus(handle, options);

      phase = 'wait';
      await this.#waitAfterAction(options, handle);
      this.#clearVisualFeedback();

      span.end({
        action: 'focus',
        completed: true,
        targetId: handle.id,
        output: {
          focusedTargetId: snapshot.active?.id ?? null,
          previousTargetId: snapshot.previous?.id ?? null,
          focusVisible: snapshot.focusVisible,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (focusStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedFocus(span);
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'focus',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
    }
  }

  async type(text: string, options: TypeOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('type', options);
    options = scope.options(options);
    const span = this.#startActionSpan('type', undefined, {
      ...options,
      textLength: Array.from(text).length,
    });
    let phase: ActionPhase = 'perform';

    try {
      await this.#text.type(text, typeOptions(options));

      phase = 'wait';
      await this.#waitAfterAction(options);
      this.#clearVisualFeedback();

      span.end({
        action: 'type',
        completed: true,
        output: {
          textLength: Array.from(text).length,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      this.#cleanupFailedType(span);
      throw this.#finishActionFailure(span, error, {
        action: 'type',
        phase: failurePhase,
      });
    } finally {
      scope.dispose();
    }
  }

  async typeInto(target: TargetLike, text: string, options: TypeIntoOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('typeInto', options);
    options = scope.options(options);
    const span = this.#startActionSpan('typeInto', target, {
      ...options,
      textLength: Array.from(text).length,
    });
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;
    let clickFocusNeedsCleanup = false;

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);
      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      this.#showTargetHighlight(handle, snapshot);
      phase = 'preflight';
      const report = await this.#interactability.canType(handle);
      assertCanType('typeInto', handle, report);

      phase = 'perform';
      const typeTarget = handle;
      const focusStrategy = typeFocusStrategy(options);
      let clickFocusOutput: object = {};

      if (focusStrategy === 'click') {
        const point = clickablePointOrThrow('typeInto', typeTarget, snapshot);
        const clickOptions = typeFocusClickOptions(options);
        let dispatchPoint = point;

        this.#clickDispatchState = createClickDispatchState(clickOptions);
        clickFocusNeedsCleanup = true;

        const commandId = this.#createPointerCommandId();
        const result = await this.#withPointerPerformTimeout(
          'typeInto',
          clickGestureOptions(clickOptions),
          (performOptions) => {
            const pointTracker = this.#createTargetPointTracker(
              'typeInto',
              typeTarget,
              point,
              span,
              { reveal: options.reveal, signal: performOptions.signal },
            );

            return this.#withSignalTarget(
              typeTarget,
              commandId,
              async () => {
                try {
                  return await this.#gesture.click(typeTarget, point, {
                    ...performOptions,
                    resolveEndpoint: pointTracker.resolveEndpoint,
                    refreshPointBeforeDown: async (currentPoint) => {
                      dispatchPoint = await this.#refreshClickPointBeforeDown(
                        'typeInto',
                        typeTarget,
                        currentPoint,
                        clickOptions,
                        span,
                      );
                      return dispatchPoint;
                    },
                  });
                } finally {
                  pointTracker.dispose();
                }
              },
              { anchorAfterSuccess: false },
            );
          },
        );

        clickFocusNeedsCleanup = false;

        const activationDispatched = (this.#clickDispatchState?.activationCount ?? 0) > 0;

        let focused = await this.#focus.getFocused();

        if (!focused.active || !this.#isFocusedTargetForTyping(typeTarget, focused.active)) {
          await this.#focus.focus(typeTarget);
          focused = await this.#focus.getFocused();
        }

        const focusedTarget = this.#assertClickFocusAcquired(typeTarget, focused.active);

        await this.#delayAfterClickFocus(options);

        clickFocusOutput = {
          focusPoint: dispatchPoint,
          focusedTargetId: focusedTarget.id,
          gestureCompleted: result.completed,
          activationDispatched,
        };
      }

      this.#showTypingFeedback(typeTarget, true);
      try {
        await this.#text.typeInto(
          typeTarget,
          text,
          typeOptions(options, textFocusStrategyFor(focusStrategy)),
        );
      } finally {
        this.#showTypingFeedback(typeTarget, false);
      }
      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'typeInto',
        completed: true,
        targetId: handle.id,
        output: {
          textLength: Array.from(text).length,
          focusStrategy,
          ...clickFocusOutput,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (clickFocusNeedsCleanup) {
        await this.#cleanupFailedPerform(span, 'typeInto');
      } else {
        this.#clearVisualFeedback();
      }
      throw this.#finishActionFailure(span, error, {
        action: 'typeInto',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
      this.#clickDispatchState = null;
      this.#clearPointerContext();
    }
  }

  async fill(target: TargetLike, text: string, options: FillOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('fill', options);
    options = scope.options(options);
    const span = this.#startActionSpan('fill', target, {
      ...options,
      textLength: Array.from(text).length,
    });
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;

    try {
      handle = await this.#resolveTarget(target, options);
      phase = 'reveal';
      await this.#revealTarget(handle, options);
      phase = 'geometry';
      const snapshot = await this.#geometry.snapshot(handle);
      this.#showTargetHighlight(handle, snapshot);
      phase = 'preflight';
      const report = await this.#interactability.canType(handle);
      assertCanType('fill', handle, report);

      phase = 'perform';
      this.#showTypingFeedback(handle, true);
      try {
        await this.#text.fill(handle, text, fillOptions(options));
      } finally {
        this.#showTypingFeedback(handle, false);
      }

      phase = 'wait';
      await this.#waitAfterAction(options, handle);

      span.end({
        action: 'fill',
        completed: true,
        targetId: handle.id,
        output: {
          textLength: Array.from(text).length,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      this.#cleanupFailedType(span, 'fill');
      throw this.#finishActionFailure(span, error, {
        action: 'fill',
        phase: failurePhase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
    }
  }

  async press(keys: string, options: PressOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('press', options);
    options = scope.options(options);
    const span = this.#startActionSpan('press', undefined, {
      ...options,
      keys,
    });
    let phase: ActionPhase = 'perform';
    const initialKeyboardState = this.#keyboard.getState();

    try {
      const state = await this.#keyboard.press(keys, pressOptions(options));

      phase = 'wait';
      await this.#waitAfterAction(options);
      this.#clearVisualFeedback();

      span.end({
        action: 'press',
        completed: true,
        output: {
          keys,
          pressedKeys: state.pressedKeys,
          modifiers: state.modifiers,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      await this.#cleanupFailedPress(span, initialKeyboardState);
      throw this.#finishActionFailure(span, error, {
        action: 'press',
        phase: failurePhase,
      });
    } finally {
      scope.dispose();
    }
  }

  async reveal(target: TargetLike, options: RevealOptions = {}): Promise<RevealResult> {
    const scope = createActionExecutionScope('reveal', options);
    options = scope.options(options);
    const span = this.#startActionSpan('reveal', target, summarizeRevealOptions(options));
    let phase: ActionPhase = 'resolve';
    let handle: TargetHandle | undefined;

    try {
      const resolved = isTargetHandle(target)
        ? target
        : await this.#resolver.resolve(toLocator(target), operationOptions(options));
      handle = resolved;
      phase = 'validate';
      handle = await this.#resolver.validate(resolved);
      phase = 'perform';
      const result = await this.#surface.reveal(handle, options);

      this.#wait.invalidateGeometry('scroll');
      span.event('reveal:complete', summarizeRevealResult(result));
      span.end({ action: 'reveal', completed: true, targetId: handle.id });
      return result;
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action: 'reveal',
        phase,
        targetId: handle?.id,
      });
    } finally {
      scope.dispose();
    }
  }

  async scrollTo(position: ScrollPosition, options: ScrollOptions = {}): Promise<ScrollResult> {
    return this.#performExplicitScroll('scrollTo', position, options);
  }

  async scrollBy(delta: ScrollDelta, options: ScrollOptions = {}): Promise<ScrollResult> {
    return this.#performExplicitScroll('scrollBy', delta, options);
  }

  async #performExplicitScroll(
    action: 'scrollTo' | 'scrollBy',
    vector: ScrollPosition | ScrollDelta,
    options: ScrollOptions,
  ): Promise<ScrollResult> {
    const span = this.#startActionSpan(action, undefined, {
      ...summarizeScrollOptions(options),
      input: vector,
    });
    const phase: ActionPhase = 'perform';

    try {
      const result =
        action === 'scrollTo'
          ? await this.#surface.scrollTo(vector, options)
          : await this.#surface.scrollBy(vector, options);

      this.#recordScrollDiagnostics(span, action, vector, options, result);

      span.end({
        action,
        completed: true,
        output: { changed: result.changed, before: result.before, after: result.after },
      });
      return result;
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action,
        phase,
      });
    }
  }

  async drag(from: TargetLike, to: TargetLike, options: DragOptions = {}): Promise<void> {
    const scope = createActionExecutionScope('drag', options);
    options = scope.options(options);
    const span = this.#startActionSpan('drag', from, {
      ...options,
      to: summarizeTarget(to),
    });
    let phase: ActionPhase = 'resolve';
    let source: TargetHandle | undefined;
    let destination: TargetHandle | undefined;
    let performStarted = false;

    try {
      source = await this.#resolveTarget(from, options);
      phase = 'reveal';
      await this.#revealTarget(source, options);

      phase = 'resolve';
      destination = await this.#resolveTarget(to, options);
      phase = 'reveal';
      await this.#revealTarget(destination, options);
      phase = 'geometry';
      const sourceSnapshot = await this.#geometry.snapshot(source);
      const sourcePoint = clickablePointOrThrow('drag', source, sourceSnapshot);
      this.#showTargetHighlight(source, sourceSnapshot);
      const destinationSnapshot = await this.#geometry.snapshot(destination);
      const destinationPoint = clickablePointOrThrow('drag', destination, destinationSnapshot);
      this.#showTargetHighlight(destination, destinationSnapshot);

      phase = 'preflight';
      const sourceReport = await this.#interactability.canClick(source, sourceSnapshot, options);
      assertCanClick('drag', source, sourceReport);
      this.#warnForceBypass('drag', source, sourceReport);
      const destinationReport = await this.#interactability.canClick(
        destination,
        destinationSnapshot,
        options,
      );
      assertCanClick('drag', destination, destinationReport);
      this.#warnForceBypass('drag', destination, destinationReport);

      const freshSource = await this.#refreshDragEndpointBeforeDispatch(
        'source',
        source,
        sourcePoint,
        options,
        span,
      );
      const freshDestination = await this.#refreshDragEndpointBeforeDispatch(
        'destination',
        destination,
        destinationPoint,
        options,
        span,
      );
      const freshSourceReport = await this.#interactability.canClick(
        source,
        freshSource.snapshot,
        options,
      );
      assertCanClick('drag', source, freshSourceReport);
      this.#warnForceBypass('drag', source, freshSourceReport);
      const freshDestinationReport = await this.#interactability.canClick(
        destination,
        freshDestination.snapshot,
        options,
      );
      assertCanClick('drag', destination, freshDestinationReport);
      this.#warnForceBypass('drag', destination, freshDestinationReport);

      phase = 'perform';
      performStarted = true;
      const commandId = this.#createPointerCommandId();

      span.event('pointer:synthetic-drag', {
        action: 'drag',
        capability: 'pointer-gesture',
        nativeDnD: false,
        sourceTargetId: source.id,
        destinationTargetId: destination.id,
        sourcePoint: freshSource.point,
        destinationPoint: freshDestination.point,
      });

      const dragSource = source;
      const dragDestination = destination;
      let outputSourcePoint = freshSource.point;
      let outputDestinationPoint = freshDestination.point;
      const result = await this.#withPointerPerformTimeout(
        'drag',
        pointerMovementOptions(options),
        (performOptions) => {
          const sourcePointTracker = this.#createTargetPointTracker(
            'drag',
            dragSource,
            freshSource.point,
            span,
            { reveal: options.reveal, signal: performOptions.signal },
          );
          const destinationPointTracker = this.#createTargetPointTracker(
            'drag',
            dragDestination,
            freshDestination.point,
            span,
            { reveal: options.reveal, signal: performOptions.signal },
          );

          return this.#withDragSignalTarget(dragSource, dragDestination, commandId, async () => {
            try {
              const dragResult = await this.#gesture.drag(
                freshSource.point,
                freshDestination.point,
                {
                  ...performOptions,
                  resolveFromEndpoint: sourcePointTracker.resolveEndpoint,
                  resolveToEndpoint: destinationPointTracker.resolveEndpoint,
                },
              );

              outputSourcePoint = sourcePointTracker.currentPoint();
              outputDestinationPoint = destinationPointTracker.currentPoint();

              return dragResult;
            } finally {
              sourcePointTracker.dispose();
              destinationPointTracker.dispose();
            }
          });
        },
      );

      phase = 'wait';
      await this.#waitAfterAction(options, source);

      span.end({
        action: 'drag',
        completed: true,
        targetId: source.id,
        output: {
          sourceTargetId: source.id,
          destinationTargetId: destination.id,
          sourcePoint: outputSourcePoint,
          destinationPoint: outputDestinationPoint,
          capability: 'pointer-gesture',
          nativeDnD: false,
          gestureCompleted: result.completed,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'drag');
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'drag',
        phase: failurePhase,
        targetId: source?.id,
      });
    } finally {
      scope.dispose();
      this.#clearPointerContext();
    }
  }

  async selectText(
    targetOrRange: TextSelectionTarget,
    options: SelectTextOptions = {},
  ): Promise<void> {
    const scope = createActionExecutionScope('selectText', options);
    options = scope.options(options);
    const span = this.#startActionSpan('selectText', selectionTraceTarget(targetOrRange), options);
    let phase: ActionPhase = 'resolve';
    let primaryTarget: TargetHandle | undefined;
    let range: ResolvedTextSelectionRange | undefined;
    let performStarted = false;

    try {
      range = await this.#resolveTextSelectionRange(targetOrRange, options);
      primaryTarget = range.primaryTarget;

      phase = 'reveal';
      await this.#revealTarget(primaryTarget, options);

      if (range.secondaryTarget && range.secondaryTarget.id !== primaryTarget.id) {
        await this.#revealTarget(range.secondaryTarget, options);
      }

      phase = 'perform';
      const animated = shouldAnimateTextSelection(options);
      performStarted = animated;
      const snapshot = animated
        ? await this.#performTextSelectionGesture(range, options, span)
        : this.#selection.applySelection(range.range);

      this.#store.dispatch({
        type: 'selection:synced',
        target: primaryTarget,
        snapshot,
      });

      span.event('selection:applied', selectionTraceMetadata(range, snapshot));

      phase = 'wait';
      await this.#waitAfterAction(options, primaryTarget);

      span.end({
        action: 'selectText',
        completed: true,
        targetId: primaryTarget.id,
        targetIds: uniqueTargetIds([primaryTarget, range.secondaryTarget]),
        output: selectionTraceOutput(snapshot),
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'selectText');
      } else {
        this.#clearVisualFeedback();
      }

      throw this.#finishActionFailure(span, error, {
        action: 'selectText',
        phase: failurePhase,
        targetId: primaryTarget?.id,
      });
    } finally {
      scope.dispose();
      this.#clearPointerContext();
    }
  }

  async pointerSequence(
    sequence: PointerSequence,
    options: PointerSequenceOptions = {},
  ): Promise<void> {
    const scope = createActionExecutionScope('pointerSequence', options);
    options = scope.options(options);
    const metadata = pointerSequenceTraceMetadata(sequence);
    const span = this.#startActionSpan('pointerSequence', undefined, {
      ...options,
      ...metadata,
    });
    let phase: ActionPhase = 'perform';
    let performStarted = false;

    try {
      span.event('pointer-sequence:started', metadata);
      performStarted = true;

      const result = await this.#withPointerPerformTimeout(
        'pointerSequence',
        operationOptions(options),
        async (performOptions) => {
          return this.#gesture.pointerSequence(sequence, performOptions);
        },
      );

      span.event('pointer-sequence:completed', {
        stepCount: sequence.length,
        gestureCompleted: result.completed,
      });

      phase = 'wait';
      await this.#waitAfterAction(options);

      span.end({
        action: 'pointerSequence',
        completed: true,
        output: {
          stepCount: sequence.length,
          gestureCompleted: result.completed,
        },
      });
    } catch (error) {
      const failurePhase = phase;

      if (performStarted) {
        phase = 'cleanup';
        await this.#cleanupFailedPerform(span, 'pointerSequence');
      } else {
        this.#clearVisualFeedback();
      }

      span.event('pointer-sequence:failed', {
        stepCount: sequence.length,
        phase: failurePhase,
        error: describeUnknownError(error),
      });

      throw this.#finishActionFailure(span, error, {
        action: 'pointerSequence',
        phase: failurePhase,
      });
    } finally {
      scope.dispose();
      this.#clearPointerContext();
    }
  }

  async waitFor(condition: WaitCondition, options: WaitOptions = {}): Promise<WaitResult> {
    const span = this.#startActionSpan('waitFor', undefined, {
      conditionKind: condition.kind,
      ...options,
    });
    const phase: ActionPhase = 'wait';

    try {
      const result = await this.#wait.waitFor(condition, operationOptions(options));

      span.end({
        action: 'waitFor',
        completed: true,
        output: {
          conditionKind: condition.kind,
          satisfied: result.satisfied,
          strategy: result.strategy,
        },
      });

      return result;
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action: 'waitFor',
        phase,
      });
    }
  }

  geometry(target: TargetLike): Promise<GeometrySnapshot> {
    return this.#geometry.snapshot(target);
  }

  dispose(): void {
    this.#pointerHitReconciliationSubscription.dispose();
    this.#pointerVisual.dispose();
    this.#surface.dispose?.();
  }

  async #revealTarget(
    target: TargetHandle,
    options: OperationOptions & Readonly<{ reveal?: ActionRevealPolicy }>,
  ): Promise<RevealResult | undefined> {
    if (options.reveal === false) {
      return undefined;
    }

    const configured =
      typeof options.reveal === 'object' && options.reveal !== null ? options.reveal : {};
    const result = await this.#surface.reveal(target, {
      ...BROWSER_OPTION_DEFAULTS.reveal,
      ...configured,
      ...operationOptions(options),
    });

    if (result.changed) {
      this.#wait.invalidateGeometry('scroll');
    }

    return result;
  }

  async #waitAfterAction(
    options: OperationOptions & Readonly<{ wait?: ActionWaitPolicy }>,
    target?: TargetHandle,
  ): Promise<void> {
    const policy = options.wait ?? 'interaction-stable';

    if (typeof policy === 'object') {
      await this.#wait.waitFor(policy, operationOptions(options));
      return;
    }

    const resolvedPolicy = normalizeStabilityPolicy(policy);

    if (resolvedPolicy === 'visual-stable') {
      await this.#wait.settle(resolvedPolicy, operationOptions(options), target);
      return;
    }

    await this.#wait.settle(resolvedPolicy, operationOptions(options));
  }

  #startActionSpan(
    action: ActionName,
    target: TargetLike | undefined,
    input: object,
  ): TraceSpanHandle {
    return this.#trace.startSpan(`action.${action}`, {
      action,
      input: {
        target: target === undefined ? undefined : summarizeTarget(target),
        options: summarizeOptions(input),
      },
    });
  }

  async #resolveTarget(target: TargetLike, options: OperationOptions): Promise<TargetHandle> {
    const resolved = isTargetHandle(target)
      ? target
      : await this.#resolver.resolve(toLocator(target), operationOptions(options));

    return this.#resolver.validate(resolved);
  }

  async #resolveTextSelectionRange(
    targetOrRange: TextSelectionTarget,
    options: OperationOptions,
  ): Promise<ResolvedTextSelectionRange> {
    if (isTextSelectionRangeTarget(targetOrRange)) {
      const anchor = await this.#resolveTextSelectionEndpoint(targetOrRange.anchor, options);
      const focus = await this.#resolveTextSelectionEndpoint(targetOrRange.focus, options);

      return {
        primaryTarget: anchor.handle,
        secondaryTarget: focus.handle,
        range: {
          anchor: anchor.endpoint,
          focus: focus.endpoint,
        },
      };
    }

    const handle = await this.#resolveTarget(targetOrRange, options);
    const range = fullTextSelectionRangeForHandle(handle);

    return {
      primaryTarget: handle,
      range,
    };
  }

  async #resolveTextSelectionEndpoint(
    endpoint: TextSelectionEndpoint,
    options: OperationOptions,
  ): Promise<Readonly<{ handle: TargetHandle; endpoint: PlatformTextSelectionEndpoint }>> {
    if (endpoint.point !== undefined) {
      throw actorbleError(
        'TEXT_SELECTION_UNSUPPORTED',
        'Point-based text selection endpoints are not supported yet.',
        {
          details: {
            action: 'selectText',
            reason: 'point-endpoints-not-yet-supported',
          },
        },
      );
    }

    if (endpoint.offset === undefined) {
      throw actorbleError(
        'TEXT_SELECTION_UNSUPPORTED',
        'Text selection endpoints require an offset.',
        {
          details: {
            action: 'selectText',
            reason: 'offset-required',
          },
        },
      );
    }

    const handle = await this.#resolveTarget(endpoint.target, options);

    return {
      handle,
      endpoint: platformEndpointForHandleOffset(handle, endpoint.offset),
    };
  }

  async #performTextSelectionGesture(
    range: ResolvedTextSelectionRange,
    options: SelectTextOptions,
    span: TraceSpanHandle,
  ): Promise<PlatformTextSelectionSnapshot> {
    const anchorPoint = await this.#selectionEndpointPoint(range.range.anchor, range.primaryTarget);
    const focusPoint = await this.#selectionEndpointPoint(
      range.range.focus,
      range.secondaryTarget ?? range.primaryTarget,
    );
    const visualTrajectory = textSelectionVisualTrajectoryForRange(
      range.range,
      (endpoint) => this.#selection.measureEndpoint?.(endpoint) ?? null,
      anchorPoint,
      focusPoint,
    );
    const signals = new BrowserPointerSignalBus();
    const pointer = new BrowserPointerEngine({
      signals,
      timeline: this.#timeline,
      initialPosition: this.#currentPointerPoint ?? anchorPoint,
    });
    let pressed = false;
    let lastPoint = clonePoint(anchorPoint);
    let lastSnapshot: PlatformTextSelectionSnapshot | undefined;
    const selectionGestureStateAtProgress = (
      progress: number,
      fallbackPoint: Point,
    ): Readonly<{
      point: Point;
      range: PlatformTextSelectionRange;
      target: TargetHandle;
    }> => {
      const trajectoryState = stateAtSelectionVisualTrajectoryProgress(visualTrajectory, progress);
      const selectionProgress = trajectoryState?.selectionProgress ?? progress;
      const selectionRange = textSelectionRangeAtProgress(range.range, selectionProgress);
      const endpoint = progress <= 0 ? selectionRange.anchor : selectionRange.focus;
      const measuredPoint = this.#selection.measureEndpoint?.(endpoint);
      const target = targetForSelectionEndpoint(endpoint, range);

      return {
        point: clonePoint(trajectoryState?.point ?? measuredPoint ?? fallbackPoint),
        range: selectionRange,
        target,
      };
    };
    const applyRange = (selectionRange: PlatformTextSelectionRange): void => {
      lastSnapshot = this.#selection.applySelection(selectionRange);
    };
    const dispatchSelectionSignal = (signal: PointerSignal): void => {
      if (signal.type === 'pointer:cancelled') {
        this.#cursorPressedButtons.clear();
        this.#showTextSelectionCursor(lastPoint, range.primaryTarget, false);
        this.#events.dispatchPointerEvent({
          type: 'pointercancel',
          target: range.primaryTarget.element,
          point: lastPoint,
          buttons: [],
        });
        return;
      }

      const progress = progressBetweenPoints(anchorPoint, focusPoint, signal.point);
      const gestureState = selectionGestureStateAtProgress(progress, signal.point);
      const eventPoint = gestureState.point;
      const dispatchTarget = gestureState.target;

      this.#currentPointerPoint = clonePoint(eventPoint);
      lastPoint = clonePoint(eventPoint);

      switch (signal.type) {
        case 'pointer:moved':
          this.#showTextSelectionCursor(eventPoint, dispatchTarget, pressed);
          this.#events.dispatchPointerEvent({
            type: 'pointermove',
            target: dispatchTarget.element,
            point: eventPoint,
            buttons: pressed ? ['primary'] : [],
          });
          if (pressed) {
            applyRange(gestureState.range);
          }
          break;
        case 'pointer:down':
          pressed = true;
          this.#cursorPressedButtons.add(signal.button);
          this.#showTextSelectionCursor(eventPoint, dispatchTarget, true);
          this.#events.dispatchPointerEvent({
            type: 'pointerdown',
            target: dispatchTarget.element,
            point: eventPoint,
            button: signal.button,
            buttons: [signal.button],
          });
          applyRange(gestureState.range);
          break;
        case 'pointer:up':
          pressed = false;
          this.#cursorPressedButtons.delete(signal.button);
          applyRange(gestureState.range);
          this.#showTextSelectionCursor(eventPoint, dispatchTarget, false);
          this.#events.dispatchPointerEvent({
            type: 'pointerup',
            target: dispatchTarget.element,
            point: eventPoint,
            button: signal.button,
            buttons: [],
          });
          break;
      }
    };
    const subscription = signals.subscribe(dispatchSelectionSignal);

    span.event('selection-gesture:started', {
      action: 'selectText',
      anchorPoint,
      focusPoint,
      animated: true,
    });

    try {
      await this.#withPointerPerformTimeout(
        'selectText',
        pointerMovementOptions(options),
        async (performOptions) => {
          await pointer.moveTo(anchorPoint, { ...operationOptions(performOptions), duration: 0 });
          await pointer.down('primary');
          await pointer.moveTo(focusPoint, performOptions);
          await pointer.up('primary');
        },
      );
    } catch (error) {
      if (pressed) {
        await pointer.cancel();
      }

      throw error;
    } finally {
      subscription.dispose();
      this.#cursorPressedButtons.clear();
    }

    this.#pointer.syncPosition(lastPoint);

    span.event('selection-gesture:completed', {
      action: 'selectText',
      anchorPoint,
      focusPoint,
    });

    return lastSnapshot ?? this.#selection.applySelection(range.range);
  }

  async #selectionEndpointPoint(
    endpoint: PlatformTextSelectionEndpoint,
    target: TargetHandle,
  ): Promise<Point> {
    const measured = this.#selection.measureEndpoint?.(endpoint);

    if (measured) {
      return measured;
    }

    const snapshot = await this.#geometry.snapshot(target);

    if (snapshot.clickablePoint.ok) {
      return clonePoint(snapshot.clickablePoint.point);
    }

    return clonePoint(snapshot.center);
  }

  #currentPointerContextOrThrow(span: TraceSpanHandle): CurrentPointerContext {
    const state = this.#store.snapshot();
    const point = this.#currentPointerPoint ? clonePoint(this.#currentPointerPoint) : null;
    const hoveredTarget = state.hovered[0] ?? null;

    if (point && hoveredTarget) {
      span.event('current-target:resolved', {
        action: 'clickCurrent',
        source: 'hovered-target',
        point,
        targetId: hoveredTarget.id,
        hoveredCount: state.hovered.length,
      });

      return {
        target: hoveredTarget,
        point,
        source: 'hovered-target',
      };
    }

    if (point) {
      const hit = this.#resolvePointerHit(point, null);

      if (hit.target) {
        span.event('current-target:resolved', {
          action: 'clickCurrent',
          source: 'hit-test',
          point,
          targetId: hit.target.id,
          hoveredCount: state.hovered.length,
        });

        return {
          target: hit.target,
          point,
          source: 'hit-test',
        };
      }
    }

    throw actorbleError(
      'TARGET_NOT_FOUND',
      'clickCurrent requires a current pointer target or point.',
      {
        details: {
          action: 'clickCurrent',
          capability: 'current-pointer-target',
          hasCurrentPoint: point !== null,
          hoveredCount: state.hovered.length,
          ...(point === null ? {} : { point }),
        },
      },
    );
  }

  #validateCurrentPointerTarget(target: TargetHandle, span: TraceSpanHandle): TargetHandle {
    const validity = this.#currentPointerTargetValidity(target);

    span.event('current-target:validate', {
      action: 'clickCurrent',
      targetId: target.id,
      validity,
      locatorKind: target.locator?.kind,
    });

    if (validity === 'live') {
      return target;
    }

    throw actorbleError(
      validity === 'stale' ? 'TARGET_STALE' : 'TARGET_DETACHED',
      `Current pointer target ${target.id} is ${validity}.`,
      {
        details: {
          action: 'clickCurrent',
          targetId: target.id,
          validity,
          locatorKind: target.locator?.kind,
        },
      },
    );
  }

  #currentPointerTargetValidity(target: TargetHandle): TargetValidity {
    if (target.validity === 'detached') {
      return 'detached';
    }

    if (target.validity === 'stale') {
      return 'stale';
    }

    if (
      !this.#dom.isConnected(target.element) ||
      !this.#dom.contains(this.#dom.getRoot(), target.element)
    ) {
      return target.locator !== undefined && target.locator.kind !== 'element'
        ? 'stale'
        : 'detached';
    }

    return 'live';
  }

  #createPointerCommandId(): number {
    const commandId = this.#nextPointerCommandId;

    this.#nextPointerCommandId += 1;

    return commandId;
  }

  async #withSignalTarget<TValue>(
    target: TargetHandle,
    commandId: number,
    operation: () => Promise<TValue>,
    options: PointerSignalContextOptions = {},
  ): Promise<TValue> {
    return this.#withSignalContext({ target, commandId }, operation, options);
  }

  async #withDragSignalTarget<TValue>(
    source: TargetHandle,
    destination: TargetHandle,
    commandId: number,
    operation: () => Promise<TValue>,
    options: PointerSignalContextOptions = {},
  ): Promise<TValue> {
    return this.#withSignalContext(
      {
        target: source,
        commandId,
        drag: {
          source,
          destination,
          active: false,
        },
      },
      operation,
      options,
    );
  }

  async #withSignalContext<TValue>(
    context: PointerSignalContext,
    operation: () => Promise<TValue>,
    options: PointerSignalContextOptions,
  ): Promise<TValue> {
    const previousContext = this.#signalContext;

    this.#signalContext = context;

    try {
      const result = await operation();

      if (options.anchorAfterSuccess !== false) this.#keepPointerAtViewportPoint();

      return result;
    } finally {
      this.#signalContext = previousContext;
    }
  }

  #withPointerPerformTimeout<TValue, TOptions extends OperationOptions>(
    action: PointerPerformAction,
    options: TOptions,
    operation: (options: TOptions) => Promise<TValue>,
  ): Promise<TValue> {
    return this.#withPointerLayoutTracking(() =>
      this.#withPointerPerformTimeoutOnly(action, options, operation),
    );
  }

  #withPointerPerformTimeoutOnly<TValue, TOptions extends OperationOptions>(
    action: PointerPerformAction,
    options: TOptions,
    operation: (options: TOptions) => Promise<TValue>,
  ): Promise<TValue> {
    if (options.timeout === undefined) {
      return operation(options);
    }

    const operationName = `action.${action}`;
    const timeout = normalizeDuration(options.timeout);
    const timeoutFailure = timeoutError(operationName, timeout, {
      details: { action, phase: 'perform' },
    });
    const controller = new AbortController();
    const externalSignal = options.signal;

    return new Promise<TValue>((resolve, reject) => {
      let timerId: ReturnType<typeof setTimeout> | null = null;
      let finished = false;

      const cleanup = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }

        externalSignal?.removeEventListener('abort', onExternalAbort);
      };

      const complete = (value: TValue) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        resolve(value);
      };

      const fail = (error: unknown) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        reject(error);
      };

      const onExternalAbort = () => {
        controller.abort(externalSignal?.reason);
        fail(cancellationError(operationName, externalSignal?.reason));
      };

      if (externalSignal?.aborted) {
        fail(cancellationError(operationName, externalSignal.reason));
        return;
      }

      externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
      timerId = setTimeout(() => {
        controller.abort(timeoutFailure);
        fail(timeoutFailure);
      }, timeout);

      Promise.resolve()
        .then(() => operation({ ...options, signal: controller.signal } as TOptions))
        .then(complete, (error: unknown) => {
          fail(
            normalizePointerPerformError(error, operationName, timeout, controller.signal.reason),
          );
        });
    });
  }

  async #withPointerLayoutTracking<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    const wasRunning = this.#layoutInvalidation.isRunning();

    if (!wasRunning) {
      this.#layoutInvalidation.start();
    }

    try {
      return await operation();
    } finally {
      if (!wasRunning) {
        this.#layoutInvalidation.stop();
      }
    }
  }

  #createTargetPointTracker(
    action: TargetPointTrackingAction,
    target: TargetHandle,
    initialPoint: Point,
    span: TraceSpanHandle,
    options: TargetPointTrackerOptions,
  ): TargetPointTracker {
    let currentPoint = clonePoint(initialPoint);
    let dirtyEvent: LayoutInvalidationEvent | null = null;
    const subscription = this.#layoutInvalidation.subscribe((event) => {
      dirtyEvent = event;
    });

    return {
      currentPoint: () => clonePoint(currentPoint),
      resolveEndpoint: async () => {
        const event = dirtyEvent;

        if (!event) {
          return clonePoint(currentPoint);
        }

        dirtyEvent = null;
        const previousPoint = clonePoint(currentPoint);

        try {
          if (event.reasons.includes('scroll') && options.reveal !== false) {
            const revealResult = await this.#revealTarget(target, options);

            span.event('surface:recovery-reveal', {
              action,
              targetId: target.id,
              changed: revealResult?.changed ?? false,
              fullyVisible: revealResult?.fullyVisible,
              visibilityRatio: revealResult?.visibilityRatio,
              reason: event.reason,
              reasons: event.reasons,
              coalesced: event.coalesced,
            });
          }

          const snapshot = await this.#geometry.snapshot(target);
          const freshPoint = clickablePointOrThrow(action, target, snapshot);

          currentPoint = clonePoint(freshPoint);
          span.event('pointer:endpoint-refresh', {
            action,
            targetId: target.id,
            previousPoint,
            freshPoint,
            changed: !samePoint(previousPoint, freshPoint),
            reason: event.reason,
            reasons: event.reasons,
            coalesced: event.coalesced,
            computedAt: snapshot.computedAt,
          });
        } catch (error) {
          this.#trace.warn('Pointer endpoint refresh failed.', {
            action,
            targetId: target.id,
            reason: event.reason,
            error: describeUnknownError(error),
          });
        }

        return clonePoint(currentPoint);
      },
      dispose: () => {
        subscription.dispose();
      },
    };
  }

  async #refreshClickPointBeforeDown(
    action: Extract<ActionName, 'click' | 'typeInto' | 'doubleClick'>,
    target: TargetHandle,
    initialPoint: Point,
    options: ClickOptions,
    span: TraceSpanHandle,
  ): Promise<Point> {
    const snapshot = await this.#geometry.snapshot(target);
    const freshPoint = clickablePointOrThrow(action, target, snapshot);

    span.event('pointer:fresh-geometry', {
      action,
      targetId: target.id,
      initialPoint,
      freshPoint,
      changed: !samePoint(initialPoint, freshPoint),
      computedAt: snapshot.computedAt,
    });

    const report = await this.#interactability.canClick(target, snapshot, options);
    assertCanClick(action, target, report);
    this.#warnForceBypass(action, target, report);

    return freshPoint;
  }

  async #refreshDragEndpointBeforeDispatch(
    endpoint: 'source' | 'destination',
    target: TargetHandle,
    initialPoint: Point,
    options: DragOptions,
    span: TraceSpanHandle,
  ): Promise<Readonly<{ point: Point; snapshot: GeometrySnapshot }>> {
    const snapshot = await this.#geometry.snapshot(target);
    const freshPoint = clickablePointOrThrow('drag', target, snapshot);

    span.event('pointer:fresh-geometry', {
      action: 'drag',
      endpoint,
      targetId: target.id,
      initialPoint,
      freshPoint,
      changed: !samePoint(initialPoint, freshPoint),
      computedAt: snapshot.computedAt,
    });

    return { point: freshPoint, snapshot };
  }

  #applyPointerSignal(signal: PointerSignal): void {
    if (signal.type !== 'pointer:cancelled') {
      this.#currentPointerPoint = clonePoint(signal.point);
    }

    const context = this.#signalContext;
    const preferredTarget = this.#preferredPointerHitTarget(signal, context);
    const pointerHit =
      signal.type === 'pointer:cancelled'
        ? emptyPointerHit
        : this.#resolvePointerHit(signal.point, preferredTarget);
    const eventTarget = this.#eventTargetForPointerSignal(signal, context, pointerHit);
    const diff = this.#dispatchPointerInteractionState(signal, eventTarget, pointerHit);

    this.#state.applyStateEffects(diff.effects);

    if (signal.type === 'pointer:cancelled') {
      this.#closePointerDispatchState();
      this.#cursorPressedButtons.clear();
      this.#restorePressedCursorVisual();
      this.#clearPointerVisualMode();
      return;
    }

    if (!eventTarget) {
      return;
    }

    switch (signal.type) {
      case 'pointer:moved': {
        const pressed = this.#hasPressedCursorButtons();
        if (context) {
          this.#moveDragState(context, pointerHit.target ?? eventTarget);
        }
        this.#showPointerCursor(
          signal.point,
          eventTarget,
          pressed,
          pointerHit.target ?? eventTarget,
        );
        this.#events.dispatchPointerEvent({
          type: 'pointermove',
          target: eventTarget.element,
          point: signal.point,
          buttons: this.#pressedPointerButtons(),
        });
        break;
      }
      case 'pointer:down': {
        this.#pressedPointerTargets.set(signal.button, eventTarget);
        this.#cursorPressedButtons.add(signal.button);
        this.#showPointerCursor(
          signal.point,
          eventTarget,
          this.#hasPressedCursorButtons(),
          pointerHit.target ?? eventTarget,
        );
        if (context) {
          this.#startDragState(context);
        }
        const allowed = this.#events.dispatchPointerEvent({
          type: 'pointerdown',
          target: eventTarget.element,
          point: signal.point,
          button: signal.button,
          buttons: [signal.button],
        });

        if (this.#clickDispatchState) {
          this.#clickDispatchState.button = signal.button;
          this.#clickDispatchState.downSeen = true;
          this.#clickDispatchState.upSeen = false;
          this.#clickDispatchState.downAllowed = allowed;
          this.#clickDispatchState.upAllowed = true;
        }

        break;
      }
      case 'pointer:up': {
        this.#pressedPointerTargets.delete(signal.button);
        this.#cursorPressedButtons.delete(signal.button);
        this.#showPointerCursor(
          signal.point,
          eventTarget,
          this.#hasPressedCursorButtons(),
          pointerHit.target ?? eventTarget,
        );
        const allowed = this.#events.dispatchPointerEvent({
          type: 'pointerup',
          target: eventTarget.element,
          point: signal.point,
          button: signal.button,
          buttons: [],
        });

        if (this.#clickDispatchState) {
          this.#clickDispatchState.button = signal.button;
          this.#clickDispatchState.upSeen = true;
          this.#clickDispatchState.upAllowed &&= allowed;
          this.#dispatchActivationClick(eventTarget, signal.point);
          this.#showClickFeedback(signal.point);
        }

        if (context) {
          this.#endDragState(context);
        }
        break;
      }
    }
  }

  #preferredPointerHitTarget(
    signal: PointerSignal,
    context: PointerSignalContext | null,
  ): TargetHandle | null {
    if (!context || signal.type === 'pointer:cancelled') {
      return null;
    }

    if (!context.drag) {
      return context.target;
    }

    return context.drag.active ? context.drag.destination : context.drag.source;
  }

  #eventTargetForPointerSignal(
    signal: PointerSignal,
    context: PointerSignalContext | null,
    pointerHit: PointerHitSnapshot,
  ): TargetHandle | null {
    if (signal.type === 'pointer:cancelled') {
      return null;
    }

    if (!context) {
      return pointerHit.target;
    }

    if (!context.drag) {
      return context.target;
    }

    if (signal.type === 'pointer:down') {
      return context.drag.source;
    }

    if (signal.type === 'pointer:moved' && !context.drag.active) {
      return context.drag.source;
    }

    return pointerHit.target ?? context.drag.destination;
  }

  #startDragState(context: PointerSignalContext): void {
    if (!context.drag || context.drag.active) {
      return;
    }

    context.drag.active = true;
    const diff = this.#store.dispatch({
      type: 'dragging:started',
      source: context.drag.source,
    });

    this.#state.applyStateEffects(diff.effects);
  }

  #moveDragState(context: PointerSignalContext, target: TargetHandle | null): void {
    if (!context.drag?.active) {
      return;
    }

    const diff = this.#store.dispatch({
      type: 'dragging:moved',
      target,
    });

    this.#state.applyStateEffects(diff.effects);
  }

  #endDragState(context: PointerSignalContext): void {
    if (!context.drag?.active) {
      return;
    }

    context.drag.active = false;
    const diff = this.#store.dispatch({ type: 'dragging:ended' });

    this.#state.applyStateEffects(diff.effects);
  }

  #dispatchPointerInteractionState(
    signal: PointerSignal,
    target: TargetHandle | null,
    pointerHit: PointerHitSnapshot,
  ): InteractionStateDiff {
    if (signal.type === 'pointer:moved') {
      return this.#store.dispatch({ ...signal, hoverChain: pointerHit.hoverChain });
    }

    if (target && signal.type !== 'pointer:cancelled') {
      return this.#store.dispatch({ ...signal, hitTarget: target });
    }

    return this.#store.applyPointerSignal(signal);
  }

  #resolvePointerHit(point: Point, preferredTarget: TargetHandle | null): PointerHitSnapshot {
    try {
      const element = this.#dom.elementFromPoint(point, { ignoreActorbleInternal: true });

      if (!element || !this.#isPointerHitElementInScope(element)) {
        return emptyPointerHit;
      }

      const hoverChain = this.#hoverChainFor(element, preferredTarget);

      return {
        target: hoverChain[0] ?? null,
        hoverChain,
      };
    } catch (error) {
      this.#trace.warn('Pointer hit-test failed.', {
        point,
        error: describeUnknownError(error),
      });

      return emptyPointerHit;
    }
  }

  #reconcilePointerHit(event: LayoutInvalidationEvent): void {
    const point = this.#currentPointerPoint;

    if (!point) {
      return;
    }

    const pointerHit = this.#resolvePointerHit(point, null);
    const diff = this.#store.dispatch({
      type: 'pointer:hit-reconciled',
      point,
      hoverChain: pointerHit.hoverChain,
      reason: event.reason,
    });

    this.#state.applyStateEffects(diff.effects);

    if (this.#signalContext?.drag?.active) {
      this.#moveDragState(this.#signalContext, pointerHit.target);
    }

    if (!this.#visualFeedback.enabled || !this.#visualFeedback.cursor) {
      return;
    }

    if (pointerHit.target) {
      this.#showPointerCursor(point, pointerHit.target, this.#hasPressedCursorButtons());
      return;
    }

    this.#showPointerCursorWithoutTarget(point, this.#hasPressedCursorButtons());
  }

  #hoverChainFor(element: Element, preferredTarget: TargetHandle | null): readonly TargetHandle[] {
    const hoverChain: TargetHandle[] = [];
    const visited = new Set<Element>();
    let current: Element | null = element;

    while (current && !visited.has(current)) {
      visited.add(current);

      if (!this.#isPointerHitElementInScope(current)) {
        break;
      }

      if (current !== element && this.#isDocumentShellElement(current)) {
        break;
      }

      hoverChain.push(this.#targetForPointerHitElement(current, preferredTarget));
      current = this.#dom.getParentElement(current);
    }

    return hoverChain;
  }

  #targetForPointerHitElement(
    element: Element,
    preferredTarget: TargetHandle | null,
  ): TargetHandle {
    if (preferredTarget?.element === element) {
      return preferredTarget;
    }

    const cached = this.#pointerHitTargets.get(element);

    if (cached) {
      return cached;
    }

    const target: TargetHandle = {
      id: `pointer-hit-${this.#nextPointerHitTargetId++}`,
      element,
      locator: elementLocator(element),
      resolvedAt: this.#timeline.now(),
      root: this.#dom.getRoot(),
      validity: 'live',
      debug: this.#dom.describeElement(element),
    };

    this.#pointerHitTargets.set(element, target);

    return target;
  }

  #isPointerHitElementInScope(element: Element): boolean {
    return this.#dom.isConnected(element) && this.#dom.contains(this.#dom.getRoot(), element);
  }

  #isDocumentShellElement(element: Element): boolean {
    const parent = this.#dom.getParentElement(element);

    if (!parent) {
      return false;
    }

    return this.#dom.getParentElement(parent) === null;
  }

  #dispatchActivationClick(target: TargetHandle, point: Point): boolean {
    const dispatchState = this.#clickDispatchState;

    if (!dispatchState) {
      return false;
    }

    if (
      !dispatchState.downSeen ||
      !dispatchState.upSeen ||
      !dispatchState.downAllowed ||
      !dispatchState.upAllowed
    ) {
      resetPendingClickDispatch(dispatchState);
      return false;
    }

    this.#events.dispatchMouseEvent({
      type: 'click',
      target: target.element,
      point,
      button: dispatchState.button,
      buttons: [],
      detail: dispatchState.activationCount + 1,
    });
    dispatchState.activationCount += 1;
    dispatchState.lastActivationPoint = { x: point.x, y: point.y };
    resetPendingClickDispatch(dispatchState);

    return true;
  }

  #closePointerDispatchState(): void {
    const cancellationTarget = this.#pressedPointerTargets.values().next().value as
      | TargetHandle
      | undefined;
    const point = this.#currentPointerPoint ? clonePoint(this.#currentPointerPoint) : null;

    this.#pressedPointerTargets.clear();
    if (this.#signalContext?.drag) {
      this.#signalContext.drag.active = false;
    }
    if (this.#clickDispatchState) {
      resetPendingClickDispatch(this.#clickDispatchState);
    }

    if (!cancellationTarget || !point) {
      return;
    }

    this.#events.dispatchPointerEvent({
      type: 'pointercancel',
      target: cancellationTarget.element,
      point,
      buttons: [],
    });
  }

  async #cleanupFailedPerform(span: TraceSpanHandle, action: ActionName = 'click'): Promise<void> {
    try {
      await this.#gesture.cancel();
    } catch (error) {
      this.#trace.warn('Action gesture cleanup failed.', {
        action,
        error: describeUnknownError(error),
      });
    }

    this.#closePointerDispatchState();

    try {
      const diff = this.#store.reset();
      this.#state.applyStateEffects(diff.effects);
      this.#state.cleanup();
    } catch (error) {
      span.event('action:cleanup-failed', { error: describeUnknownError(error) });
      this.#trace.warn('Action state cleanup failed.', {
        action,
        error: describeUnknownError(error),
      });
    }

    this.#cursorPressedButtons.clear();
    this.#restorePressedCursorVisual();
    this.#clearPointerVisualMode();
    this.#clearVisualFeedback();
  }

  async #cleanupFailedFocus(span: TraceSpanHandle): Promise<void> {
    try {
      const diff = this.#store.reset();
      this.#state.applyStateEffects(diff.effects);
      this.#state.cleanup();
    } catch (error) {
      span.event('action:cleanup-failed', { error: describeUnknownError(error) });
      this.#trace.warn('Action state cleanup failed.', {
        action: 'focus',
        error: describeUnknownError(error),
      });
    }

    this.#clearVisualFeedback();
  }

  #cleanupFailedType(
    span: TraceSpanHandle,
    action: Extract<ActionName, 'type' | 'fill'> = 'type',
  ): void {
    try {
      this.#store.setTyping(null);
    } catch (error) {
      span.event('action:cleanup-failed', { error: describeUnknownError(error) });
      this.#trace.warn('Action typing cleanup failed.', {
        action,
        error: describeUnknownError(error),
      });
    }

    this.#clearVisualFeedback();
  }

  async #cleanupFailedPress(
    span: TraceSpanHandle,
    initialKeyboardState: KeyboardState,
  ): Promise<void> {
    try {
      const initiallyPressed = new Set(initialKeyboardState.pressedKeys);
      const pressedDuringAction = this.#keyboard
        .getState()
        .pressedKeys.filter((key) => !initiallyPressed.has(key));

      for (const key of [...pressedDuringAction].reverse()) {
        await this.#keyboard.keyUp(key);
      }
    } catch (error) {
      span.event('action:cleanup-failed', { error: describeUnknownError(error) });
      this.#trace.warn('Action keyboard cleanup failed.', {
        action: 'press',
        error: describeUnknownError(error),
      });
    }

    this.#clearVisualFeedback();
  }

  #finishActionFailure(
    span: TraceSpanHandle,
    error: unknown,
    context: Readonly<{
      action: ActionName;
      phase: ActionPhase;
      targetId?: string;
    }>,
  ): ActorbleError {
    const normalized = normalizeActionError(error, context);

    span.event('action:failure', {
      ...context,
      code: normalized.code,
      details:
        normalized.code === 'ACTION_CANCELLED'
          ? sanitizedCancellationDetails(normalized.details)
          : normalized.details,
    });

    if (normalized.code === 'ACTION_CANCELLED') {
      span.cancel(cancellationReasonKind(normalized.details?.reason));
      return normalized;
    }

    span.error(normalized, context);
    return normalized;
  }

  #warnForceBypass(
    action: Extract<ActionName, 'click' | 'typeInto' | 'doubleClick' | 'drag'>,
    target: TargetHandle,
    report: InteractabilityReport,
  ): void {
    if (report.forceBypassedReasons.length === 0) {
      return;
    }

    const message =
      action === 'drag'
        ? 'Pointer action force bypassed interactability blockers.'
        : 'Click force bypassed interactability blockers.';

    this.#trace.warn(message, {
      action,
      targetId: target.id,
      reasons: report.forceBypassedReasons,
    });
  }

  #assertClickFocusAcquired(
    target: TargetHandle,
    focusedTarget: TargetHandle | null,
  ): TargetHandle {
    if (focusedTarget && this.#isFocusedTargetForTyping(target, focusedTarget)) {
      return focusedTarget;
    }

    throw actorbleError(
      'INTERACTABILITY_FAILED',
      'typeInto click focus did not focus the target.',
      {
        details: {
          action: 'typeInto',
          focusStrategy: 'click',
          targetId: target.id,
          focusedTargetId: focusedTarget?.id,
          focusedDescription: focusedTarget?.debug.description,
        },
      },
    );
  }

  #isFocusedTargetForTyping(target: TargetHandle, focusedTarget: TargetHandle): boolean {
    if (focusedTarget.element === target.element) {
      return true;
    }

    try {
      return this.#dom.contains(target.element, focusedTarget.element);
    } catch (error) {
      this.#trace.warn('Focus target containment check failed.', {
        targetId: target.id,
        focusedTargetId: focusedTarget.id,
        error: describeUnknownError(error),
      });

      return false;
    }
  }

  async #delayAfterClickFocus(options: TypeOptions): Promise<void> {
    const delay = options.afterFocusDelay;

    if (delay === undefined || !Number.isFinite(delay) || delay <= 0) {
      return;
    }

    await this.#timeline.delay(delay, cancellationOptions(options));
  }

  #showTargetHighlight(target: TargetHandle, geometry: GeometrySnapshot): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.targetHighlight) {
      return;
    }

    this.#tryVisual('highlightTarget', () =>
      this.#visual.highlightTarget({
        target,
        rect: geometry.rect,
      }),
    );
  }

  #showPointerCursor(
    point: Point,
    target: TargetHandle,
    pressed = this.#hasPressedCursorButtons(),
    cursorTarget: TargetHandle = target,
  ): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.cursor) {
      return;
    }

    const visualPoint = this.#renderPointerCursor(point, cursorTarget, pressed);

    this.#setPointerVisualMode({
      kind: 'freePoint',
      point: visualPoint,
      pressed,
    });
  }

  #showTextSelectionCursor(point: Point, target: TargetHandle, pressed: boolean): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.cursor) {
      return;
    }

    const visualPoint = clonePoint(point);

    this.#tryVisual('showCursor', () =>
      this.#visual.showCursor({
        point: visualPoint,
        cursor: 'text',
        pressed,
      }),
    );
    this.#cursorVisualState = {
      target,
      point: visualPoint,
      cursor: 'text',
      pressed,
    };
    this.#setPointerVisualMode({
      kind: 'freePoint',
      point: visualPoint,
      pressed,
    });
  }

  #keepPointerAtViewportPoint(): void {
    const state = this.#cursorVisualState;

    if (!state || !this.#visualFeedback.enabled || !this.#visualFeedback.cursor) {
      return;
    }

    try {
      if (this.#pointerVisual.getSnapshot().mode?.kind !== 'targetAnchor') {
        return;
      }
    } catch (error) {
      this.#trace.warn('Pointer visual tracker snapshot failed.', {
        error: describeUnknownError(error),
      });
      return;
    }

    this.#setPointerVisualMode({
      kind: 'freePoint',
      point: state.point,
      pressed: state.pressed,
    });
  }

  #showPointerCursorWithoutTarget(point: Point, pressed = this.#hasPressedCursorButtons()): void {
    const visualPoint = clonePoint(point);

    this.#tryVisual('showCursor', () =>
      this.#visual.showCursor({
        point: visualPoint,
        pressed,
      }),
    );
    this.#cursorVisualState = {
      target: null,
      point: visualPoint,
      pressed,
    };
    this.#setPointerVisualMode({
      kind: 'freePoint',
      point: visualPoint,
      pressed,
    });
  }

  #renderPointerCursor(
    point: Point,
    target: TargetHandle,
    pressed = this.#hasPressedCursorButtons(),
  ): Point {
    const cursor = this.#resolveCursor(target);
    const visualPoint = { x: point.x, y: point.y };

    this.#tryVisual('showCursor', () =>
      this.#visual.showCursor(
        cursor === undefined
          ? { point: visualPoint, pressed }
          : { point: visualPoint, cursor, pressed },
      ),
    );
    this.#cursorVisualState = {
      target,
      point: visualPoint,
      ...(cursor === undefined ? {} : { cursor }),
      pressed,
    };

    return visualPoint;
  }

  #restorePressedCursorVisual(): void {
    const state = this.#cursorVisualState;

    if (!state?.pressed) {
      return;
    }

    if (state.target) {
      this.#renderPointerCursor(state.point, state.target, false);
    } else {
      this.#showPointerCursorWithoutTarget(state.point, false);
    }
  }

  #hasPressedCursorButtons(): boolean {
    return this.#cursorPressedButtons.size > 0;
  }

  #pressedPointerButtons(): readonly PointerButtonName[] {
    return [...this.#cursorPressedButtons];
  }

  #resolveCursor(target: TargetHandle): string | undefined {
    try {
      return resolveCursorForTarget(this.#dom, target.element);
    } catch (error) {
      this.#trace.warn('Cursor style resolution failed.', {
        targetId: target.id,
        error: describeUnknownError(error),
      });

      return undefined;
    }
  }

  #applyInteractionStateEffects(effects: readonly StateEffect[]): void {
    const effectsToApply = effects.filter(isFocusOrTypingStateEffect);

    if (effectsToApply.length === 0) {
      return;
    }

    this.#state.applyStateEffects(effectsToApply);
    this.#applyVisualStateEffects(effectsToApply);
  }

  #applyVisualStateEffects(effects: readonly StateEffect[]): void {
    if (!this.#visualFeedback.enabled) {
      return;
    }

    const focusEffects = effects.filter((effect) => effect.kind === 'focus');

    for (const effect of effects) {
      switch (effect.kind) {
        case 'focus':
        case 'focus-visible':
          if (!this.#visualFeedback.focusOverlay) {
            break;
          }

          if (
            effect.kind === 'focus-visible' &&
            focusEffects.some(
              (focusEffect) =>
                focusEffect.active === effect.active &&
                focusEffect.target?.id === effect.target?.id,
            )
          ) {
            break;
          }

          this.#tryVisual('showFocus', () =>
            this.#visual.showFocus({
              target: effect.target,
              active: effect.active,
            }),
          );
          break;
        case 'typing':
          {
            if (!this.#visualFeedback.typingIndicator) {
              break;
            }

            const target = effect.target;

            if (!target) {
              break;
            }

            this.#tryVisual('showTyping', () =>
              this.#visual.showTyping({
                target,
                active: effect.active,
              }),
            );
          }
          break;
      }
    }
  }

  #showClickFeedback(point: Point): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.clickFeedback) {
      return;
    }

    this.#tryVisual('showClick', () => this.#visual.showClick(point));
  }

  #showTypingFeedback(target: TargetHandle, active: boolean): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.typingIndicator) {
      return;
    }

    this.#tryVisual('showTyping', () =>
      this.#visual.showTyping({
        target,
        active,
      }),
    );
  }

  #clearVisualFeedback(): void {
    if (!this.#visualFeedback.enabled) {
      return;
    }

    this.#tryVisual('clearFeedback', () => this.#visual.clearFeedback());
  }

  #tryVisual(effect: string, operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.#trace.warn('Visual layer update failed.', {
        effect,
        error: describeUnknownError(error),
      });
    }
  }

  #setPointerVisualMode(mode: Parameters<PointerVisualTracker['setMode']>[0]): void {
    try {
      this.#pointerVisual.setMode(mode);
    } catch (error) {
      this.#trace.warn('Pointer visual tracker update failed.', {
        mode: mode.kind,
        error: describeUnknownError(error),
      });
    }
  }

  #clearPointerVisualMode(): void {
    try {
      this.#pointerVisual.clear();
    } catch (error) {
      this.#trace.warn('Pointer visual tracker cleanup failed.', {
        error: describeUnknownError(error),
      });
    }
  }

  #clearPointerContext(): void {
    this.#signalContext = null;
  }

  #recordScrollDiagnostics(
    span: TraceSpanHandle,
    action: 'scrollTo' | 'scrollBy',
    input: ScrollPosition | ScrollDelta,
    options: ScrollOptions,
    result: ScrollResult,
  ): void {
    this.#wait.invalidateGeometry('scroll');
    span.event('surface:scrolled', {
      action,
      input,
      motion: options.motion?.kind,
      settle: summarizeScrollSettle(options.settle),
      changed: result.changed,
      before: result.before,
      after: result.after,
    });
  }
}

function sanitizedCancellationDetails(
  details: ActorbleErrorDetails | undefined,
): ActorbleErrorDetails | undefined {
  if (details === undefined) return undefined;
  return {
    ...(typeof details.operation === 'string' ? { operation: details.operation } : {}),
    reasonKind: cancellationReasonKind(details.reason),
  };
}

function cancellationReasonKind(reason: unknown): string {
  if (reason === undefined) return 'unspecified';
  if (reason instanceof ActorbleError) return `actorble-error:${reason.code}`;
  if (reason instanceof Error) return 'error';
  return typeof reason;
}

export function createActionOrchestrator(
  options: ActionOrchestratorOptions = {},
): ActionOrchestrator {
  return new BrowserActionOrchestrator(options);
}

function createClickDispatchState(options: ClickOptions): ClickDispatchState {
  return {
    button: options.button ?? 'primary',
    downAllowed: true,
    upAllowed: true,
    downSeen: false,
    upSeen: false,
    activationCount: 0,
    lastActivationPoint: null,
  };
}

function resetPendingClickDispatch(dispatchState: ClickDispatchState): void {
  dispatchState.downAllowed = true;
  dispatchState.upAllowed = true;
  dispatchState.downSeen = false;
  dispatchState.upSeen = false;
}

function createActionLayoutInvalidationTracker(
  dom: DomPort,
  timeline: TimelineEngine,
): LayoutInvalidationTracker {
  return typeof dom.observeLayoutInvalidations === 'function'
    ? createLayoutInvalidationTracker({ dom, timeline })
    : new NoopLayoutInvalidationTracker();
}

function resolveCursorForTarget(dom: DomPort, element: Element): string | undefined {
  return resolveCursorFromAncestors(dom, element) ?? semanticCursorFallback(dom, element);
}

function resolveCursorFromAncestors(dom: DomPort, element: Element): string | undefined {
  let current: Element | null = element;
  const visited = new Set<Element>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const cursor = normalizeCursorValue(dom.getComputedStyle(current).cursor);

    if (cursor && !isIndirectCursorValue(cursor)) {
      return cursor;
    }

    current = dom.getParentElement(current);
  }

  return undefined;
}

function semanticCursorFallback(dom: DomPort, element: Element): string | undefined {
  return isEditableTextTarget(dom.describeElement(element)) ? 'text' : undefined;
}

function normalizeCursorValue(cursor: string): string | undefined {
  const normalized = cursor.trim();

  return normalized ? normalized : undefined;
}

function isIndirectCursorValue(cursor: string): boolean {
  const normalized = cursor.toLowerCase();

  return indirectCursorValues.has(normalized);
}

const indirectCursorValues = new Set([
  'auto',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
]);

type CursorAttributeMap = Readonly<Record<string, string>>;

const textCursorEditableInputTypes = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);

function isEditableTextTarget(debug: TargetDebugInfo): boolean {
  const attributes = normalizeCursorAttributes(debug.attributes);

  if (
    hasCursorAttribute(attributes, 'disabled') ||
    attributes['aria-disabled'] === 'true' ||
    hasCursorAttribute(attributes, 'inert') ||
    hasCursorAttribute(attributes, 'readonly')
  ) {
    return false;
  }

  if (hasCursorAttribute(attributes, 'contenteditable')) {
    return attributes.contenteditable !== 'false';
  }

  const tagName = cursorTagNameFor(debug);

  if (tagName === 'textarea') {
    return true;
  }

  if (tagName !== 'input') {
    return false;
  }

  return textCursorEditableInputTypes.has((attributes.type ?? '').toLowerCase());
}

function normalizeCursorAttributes(attributes: TargetDebugInfo['attributes']): CursorAttributeMap {
  if (!attributes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function hasCursorAttribute(attributes: CursorAttributeMap, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(attributes, name);
}

function cursorTagNameFor(debug: TargetDebugInfo): string | undefined {
  return debug.description?.match(/^[a-z0-9-]+/i)?.[0]?.toLowerCase();
}

function clickablePointOrThrow(
  action: 'moveTo' | 'click' | 'typeInto' | 'doubleClick' | 'drag',
  target: TargetHandle,
  geometry: GeometrySnapshot,
): Point {
  if (geometry.clickablePoint.ok) {
    return geometry.clickablePoint.point;
  }

  throw actorbleError(
    'INTERACTABILITY_FAILED',
    `Action Orchestrator ${action} could not find a clickable point.`,
    {
      details: {
        action,
        targetId: target.id,
        reason: geometry.clickablePoint.reason,
      },
    },
  );
}

function fullTextSelectionRangeForHandle(handle: TargetHandle): PlatformTextSelectionRange {
  const target = handle.element;
  const endOffset = textSelectionLengthForElement(target);

  return {
    anchor: platformEndpointForHandleOffset(handle, 0),
    focus: platformEndpointForHandleOffset(handle, endOffset),
  };
}

function platformEndpointForHandleOffset(
  handle: TargetHandle,
  offset: number,
): PlatformTextSelectionEndpoint {
  assertValidTextSelectionOffset(offset);

  const target = handle.element;

  if (isTextControlElement(target)) {
    return { target, offset };
  }

  return textNodeEndpointForElementOffset(target, offset);
}

function textSelectionLengthForElement(element: Element): number {
  if (isTextControlElement(element)) {
    return element.value.length;
  }

  return element.textContent?.length ?? 0;
}

function textNodeEndpointForElementOffset(
  element: Element,
  offset: number,
): PlatformTextSelectionEndpoint {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  let lastTextNode: Text | null = null;

  while (node) {
    const textNode = node as Text;
    const length = textNode.data.length;

    lastTextNode = textNode;

    if (remaining <= length) {
      return { target: textNode, offset: remaining };
    }

    remaining -= length;
    node = walker.nextNode();
  }

  if (lastTextNode && remaining === 0) {
    return { target: lastTextNode, offset: lastTextNode.data.length };
  }

  throw actorbleError(
    'TEXT_SELECTION_UNSUPPORTED',
    'Text selection offset is outside the target text content.',
    {
      details: {
        action: 'selectText',
        reason: 'offset-out-of-range',
        targetId: handleIdForElement(element),
        offset,
        textLength: element.textContent?.length ?? 0,
      },
    },
  );
}

function assertValidTextSelectionOffset(offset: number): void {
  if (Number.isInteger(offset) && offset >= 0) {
    return;
  }

  throw actorbleError('TEXT_SELECTION_UNSUPPORTED', 'Text selection offset is invalid.', {
    details: {
      action: 'selectText',
      reason: 'invalid-offset',
      offset,
    },
  });
}

function isTextControlElement(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function isTextSelectionRangeTarget(
  target: TextSelectionTarget,
): target is Readonly<{ anchor: TextSelectionEndpoint; focus: TextSelectionEndpoint }> {
  return typeof target === 'object' && target !== null && 'anchor' in target && 'focus' in target;
}

function selectionTraceTarget(target: TextSelectionTarget): TargetLike | undefined {
  if (isTextSelectionRangeTarget(target)) {
    return target.anchor.target;
  }

  return target;
}

function selectionTraceMetadata(
  range: ResolvedTextSelectionRange,
  snapshot: PlatformTextSelectionSnapshot,
): Readonly<Record<string, unknown>> {
  return {
    action: 'selectText',
    targetIds: uniqueTargetIds([range.primaryTarget, range.secondaryTarget]),
    ...selectionTraceOutput(snapshot),
  };
}

function selectionTraceOutput(
  snapshot: PlatformTextSelectionSnapshot,
): Readonly<Record<string, unknown>> {
  return {
    surface: snapshot.surface,
    strategy: snapshot.strategy,
    collapsed: snapshot.collapsed,
    selectedTextLength: snapshot.selectedText.length,
  };
}

function pointerSequenceTraceMetadata(
  sequence: PointerSequence,
): Readonly<{ stepCount: number; stepTypes: readonly PointerSequence[number]['type'][] }> {
  return {
    stepCount: sequence.length,
    stepTypes: sequence.map((step) => step.type),
  };
}

function uniqueTargetIds(targets: readonly (TargetHandle | undefined)[]): string[] {
  return [
    ...new Set(
      targets
        .filter((target): target is TargetHandle => Boolean(target))
        .map((target) => target.id),
    ),
  ];
}

function handleIdForElement(element: Element): string | undefined {
  return element.id || undefined;
}

function summarizeRevealOptions(options: RevealOptions): Record<string, unknown> {
  return {
    ...(options.visibility === undefined ? {} : { visibility: options.visibility }),
    ...(options.block === undefined ? {} : { block: options.block }),
    ...(options.inline === undefined ? {} : { inline: options.inline }),
    ...(options.container === undefined ? {} : { container: options.container }),
    ...(options.safeArea === undefined ? {} : { safeArea: options.safeArea }),
    ...(options.offset === undefined ? {} : { offset: options.offset }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    ...(options.settle === undefined ? {} : { settle: summarizeScrollSettle(options.settle) }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  };
}

function summarizeScrollOptions(options: ScrollOptions): Record<string, unknown> {
  return {
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    ...(options.settle === undefined ? {} : { settle: summarizeScrollSettle(options.settle) }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  };
}

function summarizeScrollSettle(settle: ScrollOptions['settle'] | RevealOptions['settle']): unknown {
  return settle;
}

function summarizeRevealResult(result: RevealResult): Record<string, unknown> {
  return {
    changed: result.changed,
    before: result.before,
    after: result.after,
    fullyVisible: result.fullyVisible,
    visibilityRatio: result.visibilityRatio,
    steps: result.steps.map((step) => ({
      surfaceId: step.surfaceId,
      from: step.from,
      intendedTo: step.intendedTo,
      to: step.to,
      axes: step.axes,
    })),
  };
}

function assertCanClick(
  action: Extract<ActionName, 'click' | 'clickCurrent' | 'typeInto' | 'doubleClick' | 'drag'>,
  target: TargetHandle,
  report: InteractabilityReport,
): void {
  if (report.canClick) {
    return;
  }

  throw actorbleError('INTERACTABILITY_FAILED', 'Target is not clickable.', {
    details: {
      action,
      targetId: target.id,
      blockingReasons: report.blockingReasons,
      forceBypassedReasons: report.forceBypassedReasons,
      unforceableReasons: report.unforceableReasons,
    },
  });
}

function assertCanType(
  action: Extract<ActionName, 'typeInto' | 'fill'>,
  target: TargetHandle,
  report: InteractabilityReport,
): void {
  if (report.canType === true) {
    return;
  }

  throw actorbleError('INTERACTABILITY_FAILED', 'Target is not typeable.', {
    details: {
      action,
      targetId: target.id,
      blockingReasons: report.blockingReasons,
      unforceableReasons: report.unforceableReasons,
    },
  });
}

function assertCanFocus(target: TargetHandle, report: InteractabilityReport): void {
  if (report.canFocus) {
    return;
  }

  throw actorbleError('INTERACTABILITY_FAILED', 'Target is not focusable.', {
    details: {
      action: 'focus',
      targetId: target.id,
      blockingReasons: report.blockingReasons,
      unforceableReasons: report.unforceableReasons,
    },
  });
}

function samePoint(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y;
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function normalizeDuration(duration: DurationMs): DurationMs {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return duration;
}

type ActionExecutionScope = Readonly<{
  options<TOptions extends OperationOptions>(options: TOptions): TOptions;
  dispose(): void;
}>;

function createActionExecutionScope(
  action: ActionName,
  options: OperationOptions,
): ActionExecutionScope {
  if (options.timeout === undefined) {
    return {
      options<TOptions extends OperationOptions>(input: TOptions): TOptions {
        return input;
      },
      dispose() {},
    };
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  const timeout = normalizeDuration(options.timeout);
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const onExternalAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(externalSignal?.reason);
    }
  };

  if (externalSignal?.aborted) {
    onExternalAbort();
  } else {
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  }

  timerId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(
        timeoutError(`action.${action}`, timeout, {
          details: { action },
        }),
      );
    }
  }, timeout);

  return {
    options<TOptions extends OperationOptions>(input: TOptions): TOptions {
      return { ...input, signal: controller.signal } as TOptions;
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

function normalizeActionError(
  error: unknown,
  context: Readonly<{
    action: ActionName;
    phase: ActionPhase;
    targetId?: string;
  }>,
): ActorbleError {
  if (error instanceof ActorbleError) {
    const reason = error.details?.reason;
    if (
      error.code === 'ACTION_CANCELLED' &&
      reason instanceof ActorbleError &&
      reason.code === 'ACTION_TIMEOUT'
    ) {
      return reason;
    }
    return error;
  }

  return actorbleError('PLATFORM_UNSUPPORTED', `Action ${context.action} failed.`, {
    cause: error,
    details: context,
  });
}

function normalizePointerPerformError(
  error: unknown,
  operation: string,
  timeout: DurationMs,
  abortReason?: unknown,
): unknown {
  if (abortReason instanceof ActorbleError && abortReason.code === 'ACTION_TIMEOUT') {
    return abortReason;
  }

  if (!(error instanceof ActorbleError)) {
    return error;
  }

  if (error.code === 'ACTION_CANCELLED') {
    const reason = abortReason ?? error.details?.reason;

    if (reason instanceof ActorbleError && reason.code === 'ACTION_TIMEOUT') {
      return reason;
    }

    return error;
  }

  if (error.code === 'ACTION_TIMEOUT' && error.details?.operation !== operation) {
    return timeoutError(operation, timeout, {
      cause: error,
      details: { operation },
    });
  }

  return error;
}

function operationOptions(options: OperationOptions): WaitOptions {
  return {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}

function shouldAnimateTextSelection(options: SelectTextOptions): boolean {
  return options.motion !== undefined || normalizeDuration(options.duration ?? 0) > 0;
}

function textSelectionRangeAtProgress(
  range: PlatformTextSelectionRange,
  progress: number,
): PlatformTextSelectionRange {
  const clampedProgress = clampProgress(progress);

  if (clampedProgress >= 1) {
    return range;
  }

  if (range.anchor.target !== range.focus.target) {
    const focus = domTextSelectionEndpointAtProgress(range, clampedProgress);

    return focus ? { anchor: range.anchor, focus } : { anchor: range.anchor, focus: range.anchor };
  }

  const anchorOffset = range.anchor.offset;
  const focusOffset = range.focus.offset;
  const nextOffset = Math.round(anchorOffset + (focusOffset - anchorOffset) * clampedProgress);

  return {
    anchor: range.anchor,
    focus: {
      target: range.focus.target,
      offset: nextOffset,
    },
  };
}

function domTextSelectionEndpointAtProgress(
  range: PlatformTextSelectionRange,
  progress: number,
): PlatformTextSelectionEndpoint | null {
  if (!(range.anchor.target instanceof Text) || !(range.focus.target instanceof Text)) {
    return null;
  }

  const ownerDocument = range.anchor.target.ownerDocument;

  if (!ownerDocument || range.focus.target.ownerDocument !== ownerDocument) {
    return null;
  }

  const domRange = ownerDocument.createRange();

  try {
    domRange.setStart(range.anchor.target, range.anchor.offset);
    domRange.setEnd(range.focus.target, range.focus.offset);

    if (domRange.collapsed && !sameTextSelectionEndpoint(range.anchor, range.focus)) {
      return null;
    }

    const textDistance = Math.round(domRange.toString().length * progress);

    return domTextSelectionEndpointAtDistance(
      domRange,
      range.anchor,
      range.focus,
      textDistance,
      ownerDocument,
    );
  } catch {
    return null;
  } finally {
    domRange.detach();
  }
}

function domTextSelectionEndpointAtDistance(
  domRange: Range,
  anchor: PlatformTextSelectionEndpoint,
  focus: PlatformTextSelectionEndpoint,
  textDistance: number,
  ownerDocument: Document,
): PlatformTextSelectionEndpoint | null {
  if (textDistance <= 0) {
    return anchor;
  }

  const walker = ownerDocument.createTreeWalker(
    domRange.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );
  let remaining = textDistance;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;

    if (domRange.intersectsNode(textNode)) {
      const startOffset = textNode === anchor.target ? anchor.offset : 0;
      const endOffset = textNode === focus.target ? focus.offset : textNode.data.length;
      const segmentLength = Math.max(0, endOffset - startOffset);

      if (remaining <= segmentLength) {
        return {
          target: textNode,
          offset: startOffset + remaining,
        };
      }

      remaining -= segmentLength;
    }

    node = walker.nextNode();
  }

  return focus;
}

function sameTextSelectionEndpoint(
  first: PlatformTextSelectionEndpoint,
  second: PlatformTextSelectionEndpoint,
): boolean {
  return first.target === second.target && first.offset === second.offset;
}

function textSelectionVisualTrajectoryForRange(
  range: PlatformTextSelectionRange,
  measureEndpoint: (endpoint: PlatformTextSelectionEndpoint) => Point | null,
  anchorPoint: Point,
  focusPoint: Point,
): readonly SelectionVisualTrajectoryPoint[] {
  const sameTargetTrajectory = sameTargetSelectionVisualTrajectory(
    range,
    measureEndpoint,
    anchorPoint,
    focusPoint,
  );

  if (sameTargetTrajectory.length > 1) {
    return sameTargetTrajectory;
  }

  const domTrajectory = domTextSelectionVisualTrajectory(
    range,
    measureEndpoint,
    anchorPoint,
    focusPoint,
  );

  return domTrajectory.length > 1
    ? domTrajectory
    : [
        { point: clonePoint(anchorPoint), selectionProgress: 0 },
        { point: clonePoint(focusPoint), selectionProgress: 1 },
      ];
}

function sameTargetSelectionVisualTrajectory(
  range: PlatformTextSelectionRange,
  measureEndpoint: (endpoint: PlatformTextSelectionEndpoint) => Point | null,
  anchorPoint: Point,
  focusPoint: Point,
): readonly SelectionVisualTrajectoryPoint[] {
  if (range.anchor.target !== range.focus.target) {
    return [];
  }

  const offsetDistance = range.focus.offset - range.anchor.offset;
  const offsetSteps = Math.abs(offsetDistance);

  if (offsetSteps === 0) {
    return [{ point: clonePoint(anchorPoint), selectionProgress: 0 }];
  }

  const direction = Math.sign(offsetDistance);
  const trajectory: SelectionVisualTrajectoryPoint[] = [];

  for (let step = 0; step <= offsetSteps; step += 1) {
    const offset = range.anchor.offset + direction * step;
    const measured =
      step === 0
        ? anchorPoint
        : step === offsetSteps
          ? focusPoint
          : measureEndpoint({ target: range.anchor.target, offset });

    appendTrajectoryPoint(trajectory, measured, step / offsetSteps);
  }

  return trajectory;
}

function domTextSelectionVisualTrajectory(
  range: PlatformTextSelectionRange,
  measureEndpoint: (endpoint: PlatformTextSelectionEndpoint) => Point | null,
  anchorPoint: Point,
  focusPoint: Point,
): readonly SelectionVisualTrajectoryPoint[] {
  if (!(range.anchor.target instanceof Text) || !(range.focus.target instanceof Text)) {
    return [];
  }

  const ownerDocument = range.anchor.target.ownerDocument;

  if (!ownerDocument || range.focus.target.ownerDocument !== ownerDocument) {
    return [];
  }

  const domRange = ownerDocument.createRange();

  try {
    domRange.setStart(range.anchor.target, range.anchor.offset);
    domRange.setEnd(range.focus.target, range.focus.offset);

    if (domRange.collapsed && !sameTextSelectionEndpoint(range.anchor, range.focus)) {
      return [];
    }

    const textLength = domRange.toString().length;

    if (textLength <= 0) {
      return [{ point: clonePoint(anchorPoint), selectionProgress: 0 }];
    }

    const trajectory: SelectionVisualTrajectoryPoint[] = [];

    for (let distance = 0; distance <= textLength; distance += 1) {
      const endpoint =
        distance === 0
          ? range.anchor
          : distance === textLength
            ? range.focus
            : domTextSelectionEndpointAtDistance(
                domRange,
                range.anchor,
                range.focus,
                distance,
                ownerDocument,
              );
      const measured =
        distance === 0
          ? anchorPoint
          : distance === textLength
            ? focusPoint
            : endpoint
              ? measureEndpoint(endpoint)
              : null;

      appendTrajectoryPoint(trajectory, measured, distance / textLength);
    }

    return trajectory;
  } catch {
    return [];
  } finally {
    domRange.detach();
  }
}

function appendTrajectoryPoint(
  trajectory: SelectionVisualTrajectoryPoint[],
  point: Point | null,
  selectionProgress: number,
): void {
  if (!point) {
    return;
  }

  const cloned = clonePoint(point);
  const previous = trajectory.at(-1);

  if (!previous || !samePoint(previous.point, cloned)) {
    trajectory.push({
      point: cloned,
      selectionProgress: clampProgress(selectionProgress),
    });
  }
}

function stateAtSelectionVisualTrajectoryProgress(
  trajectory: readonly SelectionVisualTrajectoryPoint[],
  progress: number,
): SelectionVisualTrajectoryPoint | null {
  if (trajectory.length === 0) {
    return null;
  }

  if (trajectory.length === 1) {
    return {
      point: clonePoint(trajectory[0].point),
      selectionProgress: trajectory[0].selectionProgress,
    };
  }

  const distances = trajectorySegmentDistances(trajectory);
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);

  if (totalDistance === 0) {
    return {
      point: clonePoint(trajectory[0].point),
      selectionProgress: trajectory[0].selectionProgress,
    };
  }

  const targetDistance = clampProgress(progress) * totalDistance;
  let consumedDistance = 0;

  for (let index = 1; index < trajectory.length; index += 1) {
    const segmentDistance = distances[index - 1];

    if (segmentDistance === 0) {
      continue;
    }

    if (targetDistance <= consumedDistance + segmentDistance) {
      return interpolateTrajectoryPoint(
        trajectory[index - 1],
        trajectory[index],
        (targetDistance - consumedDistance) / segmentDistance,
      );
    }

    consumedDistance += segmentDistance;
  }

  const final = trajectory[trajectory.length - 1];

  return {
    point: clonePoint(final.point),
    selectionProgress: final.selectionProgress,
  };
}

function trajectorySegmentDistances(
  trajectory: readonly SelectionVisualTrajectoryPoint[],
): readonly number[] {
  const distances: number[] = [];

  for (let index = 1; index < trajectory.length; index += 1) {
    distances.push(distanceBetweenPoints(trajectory[index - 1].point, trajectory[index].point));
  }

  return distances;
}

function distanceBetweenPoints(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function interpolateTrajectoryPoint(
  from: SelectionVisualTrajectoryPoint,
  to: SelectionVisualTrajectoryPoint,
  progress: number,
): SelectionVisualTrajectoryPoint {
  const clampedProgress = clampProgress(progress);

  return {
    point: {
      x: from.point.x + (to.point.x - from.point.x) * clampedProgress,
      y: from.point.y + (to.point.y - from.point.y) * clampedProgress,
    },
    selectionProgress:
      from.selectionProgress + (to.selectionProgress - from.selectionProgress) * clampedProgress,
  };
}

function targetForSelectionEndpoint(
  endpoint: PlatformTextSelectionEndpoint,
  range: ResolvedTextSelectionRange,
): TargetHandle {
  if (range.secondaryTarget && selectionEndpointBelongsToTarget(endpoint, range.secondaryTarget)) {
    return range.secondaryTarget;
  }

  return range.primaryTarget;
}

function selectionEndpointBelongsToTarget(
  endpoint: PlatformTextSelectionEndpoint,
  target: TargetHandle,
): boolean {
  return endpoint.target === target.element || target.element.contains(endpoint.target);
}

function progressBetweenPoints(from: Point, to: Point, point: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return 1;
  }

  const progress = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;

  return clampProgress(progress);
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress));
}

function cancellationOptions(options: OperationOptions): CancellationOptions {
  return options.signal === undefined ? {} : { signal: options.signal };
}

function pointerMovementOptions(
  options: MoveOptions | DragOptions | SelectTextOptions,
): MoveOptions {
  return {
    ...operationOptions(options),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
  };
}

function clickGestureOptions(options: ClickOptions): ClickOptions {
  return {
    ...pointerMovementOptions(options),
    ...(options.button === undefined ? {} : { button: options.button }),
    ...(options.clickCount === undefined ? {} : { clickCount: options.clickCount }),
    ...(options.pressDwell === undefined ? {} : { pressDwell: options.pressDwell }),
  };
}

function typeOptions(
  options: TypeOptions,
  focusStrategy?: Extract<TypeOptions['focusStrategy'], 'none'>,
): TypeOptions {
  const normalized = {
    ...operationOptions(options),
    ...(options.delay === undefined ? {} : { delay: options.delay }),
  };

  return focusStrategy === undefined ? normalized : { ...normalized, focusStrategy };
}

function fillOptions(options: FillOptions): FillOptions {
  return {
    ...operationOptions(options),
    ...(options.clear === undefined ? {} : { clear: options.clear }),
  };
}

function pressOptions(options: PressOptions): PressOptions {
  return {
    ...operationOptions(options),
    ...(options.delay === undefined ? {} : { delay: options.delay }),
  };
}

function typeFocusStrategy(options: TypeOptions): NonNullable<TypeOptions['focusStrategy']> {
  if (options.focusStrategy === 'click' || options.focusStrategy === 'none') {
    return options.focusStrategy;
  }

  return 'programmatic';
}

function textFocusStrategyFor(
  focusStrategy: NonNullable<TypeOptions['focusStrategy']>,
): Extract<TypeOptions['focusStrategy'], 'none'> | undefined {
  return focusStrategy === 'click' || focusStrategy === 'none' ? 'none' : undefined;
}

function typeFocusClickOptions(options: TypeOptions): ClickOptions {
  return {
    ...operationOptions(options),
    ...options.focusClick,
  };
}

function toLocator(target: TargetLike): Locator {
  if (isLocator(target)) {
    return target;
  }

  return elementLocator(target as Element);
}

function isTargetHandle(target: TargetLike): target is TargetHandle {
  return (
    typeof target === 'object' &&
    target !== null &&
    'id' in target &&
    'element' in target &&
    'resolvedAt' in target &&
    'debug' in target
  );
}

function isLocator(target: TargetLike): target is Locator {
  return typeof target === 'object' && target !== null && 'kind' in target;
}

function isFocusOrTypingStateEffect(effect: StateEffect): boolean {
  return effect.kind === 'focus' || effect.kind === 'focus-visible' || effect.kind === 'typing';
}

function summarizeTarget(target: TargetLike): Readonly<Record<string, unknown>> {
  if (isTargetHandle(target)) {
    return {
      kind: 'handle',
      targetId: target.id,
      debug: target.debug,
    };
  }

  if (isLocator(target)) {
    return {
      kind: 'locator',
      locatorKind: target.kind,
    };
  }

  return { kind: 'element' };
}

function summarizeOptions(options: object): Readonly<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'signal') {
      summary[key] = '[AbortSignal]';
      continue;
    }

    summary[key] = key === 'wait' && value === 'settled' ? 'interaction-stable' : value;
  }

  return summary;
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
