import '../../shared/styles.css';
import './styles.css';
import { stable, testId } from '../../../src/index.js';
import { byId } from '../../shared/example-utils.js';
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js';

type ScrollSample = Readonly<{ surface: 'panel' | 'viewport'; at: number }>;

type NestedRevealSmokeState = {
  trackScroll: boolean;
  scrollOrder: ScrollSample[];
  panelScrollTop: number;
  viewportScrollY: number;
  pointerInsideTarget: boolean;
  motionStartedAt: number | null;
  motionEndedAt: number | null;
  stableCompletedAt: number | null;
  alreadyVisibleChanged: boolean | null;
  oversizedFullyVisible: boolean | null;
  timedAbortCode: string | null;
  timedAbortPosition: number | null;
  timedStoppedPosition: number | null;
  recoverySucceeded: boolean;
  revealTraceEvents: string[];
  capabilities: Record<string, unknown>;
};

declare global {
  interface Window {
    __actorbleNestedReveal?: NestedRevealSmokeState;
  }
}

const stageHtml = `
  <div class="reveal-lab" data-testid="nested-reveal-surface">
    <header class="reveal-lab-header">
      <div>
        <p class="eyebrow">Runtime proving ground</p>
        <h3>Nested reveal / observed stability</h3>
      </div>
      <code>viewport → panel → input → async result</code>
    </header>

    <div class="reveal-page-spacer" aria-hidden="true">Outer viewport travel</div>

    <section class="reveal-panel-shell" id="reveal-panel-shell">
      <div class="reveal-panel-heading">
        <strong>Deployment workspace</strong>
        <span>Nested scroll surface</span>
      </div>
      <div class="nested-scroll-panel" id="nested-scroll-panel" data-testid="nested-scroll-panel">
        <div class="panel-spacer" aria-hidden="true">Panel travel / 620px</div>
        <section class="target-workbench" id="target-workbench">
          <label for="nested-target">Project name</label>
          <input
            id="nested-target"
            data-testid="nested-target"
            autocomplete="off"
            placeholder="Scenema"
          />
          <div class="async-result" id="async-result" data-testid="async-result" data-state="idle">
            <strong>Preparing project</strong>
            <span>Waiting for typed input</span>
          </div>
        </section>
        <div class="oversized-target" id="oversized-target" data-testid="oversized-target">
          Oversized verification surface — full visibility is intentionally impossible.
        </div>
      </div>
    </section>
  </div>
`;

let activeState = createSmokeState();

window.addEventListener('scroll', () => recordScroll('viewport'), { passive: true });

mountTaskExample({
  title: 'Nested reveal lab',
  eyebrow: 'Deterministic surfaces',
  summary:
    'Reveal a nested input, interact with fresh geometry, and wait for real visual stability.',
  stageLabel: 'Nested reveal and stability example',
  stageHtml,
  successMessage: 'Nested reveal scenario complete',
  actionLabels: {
    run: 'Run vertical slice',
    typeFirst: 'Reveal target',
    clickPrimary: 'Abort and recover',
  },
  actionSuccessMessages: {
    typeFirst: 'Target revealed',
    clickPrimary: 'Abort recovery complete',
  },
  bindStage,
  run: runVerticalSlice,
  typeFirstField: revealTargetOnly,
  clickPrimary: runAbortRecoveryOnly,
});

function bindStage(context: TaskExampleContext): void {
  activeState = createSmokeState();
  window.__actorbleNestedReveal = activeState;

  const panel = byId<HTMLElement>('nested-scroll-panel');
  const input = byId<HTMLInputElement>('nested-target');
  const result = byId<HTMLElement>('async-result');

  panel.addEventListener('scroll', () => recordScroll('panel'), { passive: true });
  input.addEventListener('pointerdown', (event) => {
    const rect = input.getBoundingClientRect();
    activeState.pointerInsideTarget =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
  });
  input.addEventListener('change', () => startResultMotion(result, input.value));
  result.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') {
      activeState.motionEndedAt = performance.now();
      result.dataset.motion = 'ended';
    }
  });

  context.bindDomEvents('nestedInput', input);
}

async function runVerticalSlice(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble();
  const panel = byId<HTMLElement>('nested-scroll-panel');

  activeState.trackScroll = false;
  window.scrollTo(0, 0);
  panel.scrollTo(0, 0);
  activeState.scrollOrder.splice(0);
  await nextFrame();
  activeState.scrollOrder.splice(0);
  activeState.trackScroll = true;

  await actorble.reveal(testId('nested-target'), {
    block: 'center',
    inline: 'nearest',
    safeArea: { top: 72, right: 24, bottom: 96, left: 24 },
    motion: { kind: 'instant' },
    settle: 'scroll-stable',
    timeout: 5000,
  });

  activeState.panelScrollTop = panel.scrollTop;
  activeState.viewportScrollY = window.scrollY;

  await actorble.moveTo(testId('nested-target'), { timeout: 2500 });
  await actorble.click(testId('nested-target'), { timeout: 2500 });
  await actorble.typeInto(testId('nested-target'), 'Scenema', {
    ...clickFocusTyping(28, 5000),
  });
  await actorble.waitFor(
    stable(testId('async-result'), {
      quietMs: 100,
      stableFrames: 3,
      threshold: 0.25,
    }),
    { timeout: 5000 },
  );
  activeState.stableCompletedAt = performance.now();

  const alreadyVisible = await actorble.reveal(testId('nested-target'), {
    block: 'nearest',
    settle: 'none',
  });
  activeState.alreadyVisibleChanged = alreadyVisible.changed;

  const oversized = await actorble.reveal(testId('oversized-target'), {
    visibility: 'full',
    block: 'center',
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
    settle: 'scroll-stable',
    timeout: 5000,
  });
  activeState.oversizedFullyVisible = oversized.fullyVisible;

  await runAbortRecovery(context);
  captureDiagnostics(context);
}

async function revealTargetOnly(context: TaskExampleContext): Promise<void> {
  const result = await context.actorble().reveal(testId('nested-target'), {
    block: 'center',
    settle: 'scroll-stable',
  });
  activeState.panelScrollTop = byId<HTMLElement>('nested-scroll-panel').scrollTop;
  activeState.viewportScrollY = window.scrollY;
  activeState.alreadyVisibleChanged = result.changed;
}

async function runAbortRecoveryOnly(context: TaskExampleContext): Promise<void> {
  await runAbortRecovery(context);
  captureDiagnostics(context);
}

async function runAbortRecovery(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble();
  const panel = byId<HTMLElement>('nested-scroll-panel');

  window.scrollTo(0, 0);
  panel.scrollTo(0, 0);
  await nextFrame();

  const controller = new AbortController();
  const running = actorble.reveal(testId('nested-target'), {
    block: 'center',
    motion: { kind: 'timed', duration: 900, timing: 'ease-in-out' },
    settle: 'none',
    signal: controller.signal,
    timeout: 3000,
  });
  window.setTimeout(() => controller.abort('smoke interruption'), 96);

  try {
    await running;
  } catch (error) {
    activeState.timedAbortCode = errorCode(error);
  }

  activeState.timedAbortPosition = panel.scrollTop + window.scrollY;
  await delay(180);
  activeState.timedStoppedPosition = panel.scrollTop + window.scrollY;

  await actorble.reveal(testId('nested-target'), {
    block: 'center',
    motion: { kind: 'instant' },
    settle: 'scroll-stable',
    timeout: 5000,
  });
  await actorble.moveTo(testId('nested-target'), { timeout: 2500 });
  activeState.recoverySucceeded = true;
}

function startResultMotion(result: HTMLElement, value: string): void {
  result.dataset.state = 'idle';
  result.dataset.motion = 'running';
  result.innerHTML = `<strong>Project ${escapeText(value || 'Untitled')} created</strong><span>Observing layout and mutation quiet windows</span>`;
  result.getBoundingClientRect();
  activeState.motionStartedAt = performance.now();

  requestAnimationFrame(() => {
    result.dataset.state = 'moving';
  });
}

function recordScroll(surface: ScrollSample['surface']): void {
  if (!activeState.trackScroll) {
    return;
  }

  const previous = activeState.scrollOrder.at(-1);
  if (previous?.surface !== surface) {
    activeState.scrollOrder.push({ surface, at: performance.now() });
  }
}

function captureDiagnostics(context: TaskExampleContext): void {
  const actorble = context.actorble();
  activeState.revealTraceEvents = actorble
    .getTrace()
    .events.map((event) => event.name)
    .filter((name) => name.startsWith('reveal:') || name.startsWith('stability:'));
  activeState.capabilities = { ...actorble.getCapabilities() };
}

function createSmokeState(): NestedRevealSmokeState {
  return {
    trackScroll: true,
    scrollOrder: [],
    panelScrollTop: 0,
    viewportScrollY: 0,
    pointerInsideTarget: false,
    motionStartedAt: null,
    motionEndedAt: null,
    stableCompletedAt: null,
    alreadyVisibleChanged: null,
    oversizedFullyVisible: null,
    timedAbortCode: null,
    timedAbortPosition: null,
    timedStoppedPosition: null,
    recoverySucceeded: false,
    revealTraceEvents: [],
    capabilities: {},
  };
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(duration: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function escapeText(value: string): string {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}
