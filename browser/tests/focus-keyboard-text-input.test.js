import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserInteractionStateStore } from '../src/state/interaction-state-store/index.js';
import { BrowserEventDispatcher } from '../src/platform/platform-adapter/event-dispatcher/index.js';
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js';
import { cancellationError, element } from '../src/shared/index.js';
import { BrowserFocusEngine, createFocusEngine } from '../src/input/focus-engine/index.js';
import { BrowserKeyboardEngine, createKeyboardEngine } from '../src/input/keyboard-engine/index.js';
import {
  BrowserTextInputEngine,
  createTextInputEngine,
} from '../src/input/text-input-engine/index.js';

function handle(id, target) {
  return {
    id,
    element: target,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: { description: `${target.localName}#${id}` },
  };
}

function createTimeline() {
  let now = 0;

  return {
    now: vi.fn(() => now),
    delay: vi.fn(async (duration, options = {}) => {
      if (options.signal?.aborted) {
        throw cancellationError('timeline.delay', options.signal.reason);
      }

      now += duration;
    }),
    nextFrame: vi.fn(async () => now),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  };
}

function createBlockingTimeline() {
  let now = 0;
  const pendingDelays = [];

  return {
    timeline: {
      now: vi.fn(() => now),
      delay: vi.fn(
        (duration, options = {}) =>
          new Promise((resolve, reject) => {
            if (options.signal?.aborted) {
              reject(cancellationError('timeline.delay', options.signal.reason));
              return;
            }

            const onAbort = () => {
              reject(cancellationError('timeline.delay', options.signal?.reason));
            };

            options.signal?.addEventListener('abort', onAbort, { once: true });
            pendingDelays.push({
              duration,
              resolve: () => {
                options.signal?.removeEventListener('abort', onAbort);
                now += duration;
                resolve();
              },
            });
          }),
      ),
      nextFrame: vi.fn(async () => now),
      settle: vi.fn(async () => {}),
      withTimeout: vi.fn(async (operation) => operation),
    },
    get pendingDelayCount() {
      return pendingDelays.length;
    },
    resolveNextDelay() {
      const pending = pendingDelays.shift();

      if (!pending) {
        throw new Error('No pending delay to resolve.');
      }

      pending.resolve();
    },
  };
}

describe('BrowserFocusEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses a target and syncs platform activeElement into the interaction store', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('name', input);
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserFocusEngine({
      dom: new BrowserDomAdapter(document),
      store,
    });

    await expect(engine.focus(target, { focusVisible: true })).resolves.toEqual({
      active: expect.objectContaining({ id: 'name' }),
      previous: null,
      focusVisible: true,
    });

    expect(document.activeElement).toBe(input);
    expect(store.snapshot()).toMatchObject({
      focused: { id: 'name' },
      focusVisible: true,
    });
  });

  it('reads platform focus as source of truth when reporting focused state', async () => {
    const first = document.createElement('button');
    const second = document.createElement('input');
    document.body.append(first, second);
    const firstTarget = handle('first', first);
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserFocusEngine({
      dom: new BrowserDomAdapter(document),
      store,
    });

    await engine.focus(firstTarget);
    second.focus();

    await expect(engine.getFocused()).resolves.toEqual({
      active: expect.objectContaining({ id: 'active-element' }),
      previous: expect.objectContaining({ id: 'first' }),
      focusVisible: false,
    });
    expect(store.snapshot().focused?.element).toBe(second);
  });

  it('skips negative tabindex controls during sequential tab but allows direct focus', async () => {
    const first = document.createElement('input');
    const skipped = document.createElement('button');
    const next = document.createElement('input');
    skipped.setAttribute('tabindex', '-1');
    document.body.append(first, skipped, next);
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserFocusEngine({
      dom: new BrowserDomAdapter(document),
      store,
    });

    await expect(engine.focus(handle('skipped', skipped))).resolves.toMatchObject({
      active: expect.objectContaining({ element: skipped }),
    });
    expect(document.activeElement).toBe(skipped);

    await engine.focus(handle('first', first));
    await expect(engine.tab()).resolves.toMatchObject({
      active: expect.objectContaining({ element: next }),
      focusVisible: true,
    });
    expect(document.activeElement).toBe(next);
    expect(store.snapshot().focused?.element).toBe(next);
  });

  it('keeps unsupported locator focus explicit until orchestration resolves targets', async () => {
    const engine = createFocusEngine({
      dom: new BrowserDomAdapter(document),
      store: new BrowserInteractionStateStore(),
    });

    await expect(engine.focus(element(document.body))).resolves.toMatchObject({
      active: expect.objectContaining({ element: document.body }),
    });
    await expect(engine.focus({ kind: 'css', selector: 'input' })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { boundary: 'focus-engine', targetKind: 'css' },
    });
  });
});

describe('BrowserKeyboardEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches keyDown, keyUp, and press with modifier state', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const events = [];

    for (const eventName of ['keydown', 'keyup']) {
      input.addEventListener(eventName, (event) => {
        events.push({
          type: event.type,
          key: event.key,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
        });
      });
    }

    const store = new BrowserInteractionStateStore();
    const engine = new BrowserKeyboardEngine({
      dom: new BrowserDomAdapter(document),
      events: new BrowserEventDispatcher(),
      store,
    });

    await expect(engine.keyDown('Control')).resolves.toEqual({
      pressedKeys: ['Control'],
      modifiers: ['Control'],
    });
    await expect(engine.press('Shift+K')).resolves.toEqual({
      pressedKeys: ['Control'],
      modifiers: ['Control'],
    });
    await expect(engine.keyUp('Control')).resolves.toEqual({
      pressedKeys: [],
      modifiers: [],
    });

    expect(events).toEqual([
      { type: 'keydown', key: 'Control', ctrlKey: true, shiftKey: false },
      { type: 'keydown', key: 'Shift', ctrlKey: true, shiftKey: true },
      { type: 'keydown', key: 'K', ctrlKey: true, shiftKey: true },
      { type: 'keyup', key: 'K', ctrlKey: true, shiftKey: true },
      { type: 'keyup', key: 'Shift', ctrlKey: true, shiftKey: false },
      { type: 'keyup', key: 'Control', ctrlKey: false, shiftKey: false },
    ]);
    expect(store.snapshot().focusVisible).toBe(true);
  });

  it('cleans keys pressed by press when cancelled during hold delay', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const controlledTimeline = createBlockingTimeline();
    const controller = new AbortController();
    const events = [];

    for (const eventName of ['keydown', 'keyup']) {
      input.addEventListener(eventName, (event) => {
        events.push({
          type: event.type,
          key: event.key,
          shiftKey: event.shiftKey,
        });
      });
    }

    const engine = new BrowserKeyboardEngine({
      dom: new BrowserDomAdapter(document),
      events: new BrowserEventDispatcher(),
      store: new BrowserInteractionStateStore(),
      timeline: controlledTimeline.timeline,
    });

    const result = engine.press('Shift+K', { delay: 10, signal: controller.signal });

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1);
    });
    expect(engine.getState()).toEqual({
      pressedKeys: ['Shift', 'K'],
      modifiers: ['Shift'],
    });

    controller.abort('user stopped');

    await expect(result).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'keyboard.press', reason: 'user stopped' },
    });
    expect(engine.getState()).toEqual({
      pressedKeys: [],
      modifiers: [],
    });
    expect(events).toEqual([
      { type: 'keydown', key: 'Shift', shiftKey: true },
      { type: 'keydown', key: 'K', shiftKey: true },
      { type: 'keyup', key: 'K', shiftKey: true },
      { type: 'keyup', key: 'Shift', shiftKey: false },
    ]);

    await engine.press('A');
    expect(engine.getState()).toEqual({ pressedKeys: [], modifiers: [] });
    expect(input.value).toBe('');
    expect(events.slice(-2)).toEqual([
      { type: 'keydown', key: 'A', shiftKey: false },
      { type: 'keyup', key: 'A', shiftKey: false },
    ]);
  });

  it('cleans keys pressed by press when hold delay times out', async () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const controlledTimeline = createBlockingTimeline();
    const engine = new BrowserKeyboardEngine({
      dom: new BrowserDomAdapter(document),
      events: new BrowserEventDispatcher(),
      store: new BrowserInteractionStateStore(),
      timeline: controlledTimeline.timeline,
    });

    const result = engine.press('Shift+K', { delay: 10, timeout: 25 });
    const caught = result.catch((error) => error);

    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
    expect(controlledTimeline.pendingDelayCount).toBe(1);
    expect(engine.getState()).toEqual({
      pressedKeys: ['Shift', 'K'],
      modifiers: ['Shift'],
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(caught).resolves.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: { operation: 'keyboard.press', timeout: 25 },
    });
    expect(engine.getState()).toEqual({
      pressedKeys: [],
      modifiers: [],
    });
  });

  it('uses the factory with injectable dependencies', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const engine = createKeyboardEngine({
      dom: new BrowserDomAdapter(document),
      events: new BrowserEventDispatcher(),
      store: new BrowserInteractionStateStore(),
    });

    await expect(engine.press('Escape')).resolves.toEqual({
      pressedKeys: [],
      modifiers: [],
    });
  });
});

describe('BrowserTextInputEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('typeInto focuses the target and appends text through beforeinput/input events', async () => {
    const input = document.createElement('input');
    input.value = 'Hi';
    input.setSelectionRange(input.value.length, input.value.length);
    document.body.append(input);
    const target = handle('message', input);
    const seen = [];

    for (const eventName of ['focus', 'beforeinput', 'input', 'change']) {
      input.addEventListener(eventName, (event) => {
        seen.push({
          type: event.type,
          data: 'data' in event ? event.data : undefined,
          value: input.value,
        });
      });
    }

    const store = new BrowserInteractionStateStore();
    const engine = new BrowserTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
    });

    await expect(engine.typeInto(target, '!')).resolves.toEqual({
      strategy: 'typeInto',
      text: '!',
    });

    expect(input.value).toBe('Hi!');
    expect(seen).toEqual([
      { type: 'focus', data: undefined, value: 'Hi' },
      { type: 'beforeinput', data: '!', value: 'Hi' },
      { type: 'input', data: '!', value: 'Hi!' },
      { type: 'change', data: undefined, value: 'Hi!' },
    ]);
    expect(store.snapshot().typing).toBeNull();
  });

  it('typeInto keeps focus-visible separate from the typing lifecycle', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const store = new BrowserInteractionStateStore();
    const seen = [];
    const engine = new BrowserTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
    });

    input.addEventListener('beforeinput', () => {
      seen.push({
        focused: store.snapshot().focused?.id,
        focusVisible: store.snapshot().focusVisible,
        typing: store.snapshot().typing?.id,
      });
    });

    await expect(engine.typeInto(target, 'A')).resolves.toEqual({
      strategy: 'typeInto',
      text: 'A',
    });

    expect(seen).toEqual([
      {
        focused: 'message',
        focusVisible: false,
        typing: 'message',
      },
    ]);
    expect(store.snapshot()).toMatchObject({
      focused: { id: 'message' },
      focusVisible: false,
      typing: null,
    });
  });

  it('typeInto can use an already-focused target without requesting focus again', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const focus = {
      focus: vi.fn(),
      blur: vi.fn(),
      getFocused: vi.fn(async () => ({
        active: target,
        previous: null,
        focusVisible: false,
      })),
      tab: vi.fn(),
    };
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserTextInputEngine({
      focus,
      events: new BrowserEventDispatcher(),
      store,
    });

    await expect(engine.typeInto(target, 'A', { focusStrategy: 'none' })).resolves.toEqual({
      strategy: 'typeInto',
      text: 'A',
    });

    expect(focus.focus).not.toHaveBeenCalled();
    expect(focus.getFocused).toHaveBeenCalledOnce();
    expect(input.value).toBe('A');
    expect(store.snapshot().typing).toBeNull();
  });

  it('type uses the currently focused editable target without replacing content', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'A';
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
    });

    await expect(engine.type('BC')).resolves.toEqual({
      strategy: 'type',
      text: 'BC',
    });
    expect(textarea.value).toBe('ABC');
  });

  it('typeInto applies delay between grapheme inputs without delaying the first input', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const timeline = createTimeline();
    const seen = [];
    input.addEventListener('beforeinput', (event) => {
      seen.push({ type: event.type, data: event.data, value: input.value });
    });
    input.addEventListener('input', (event) => {
      seen.push({ type: event.type, data: event.data, value: input.value });
    });
    input.addEventListener('change', (event) => {
      seen.push({ type: event.type, value: input.value });
    });

    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store: new BrowserInteractionStateStore(),
      }),
      events: new BrowserEventDispatcher(),
      timeline,
    });

    await expect(engine.typeInto(target, 'abc', { delay: 7 })).resolves.toEqual({
      strategy: 'typeInto',
      text: 'abc',
    });

    expect(timeline.delay).toHaveBeenCalledTimes(2);
    expect(timeline.delay).toHaveBeenNthCalledWith(1, 7, {});
    expect(timeline.delay).toHaveBeenNthCalledWith(2, 7, {});
    expect(input.value).toBe('abc');
    expect(seen).toEqual([
      { type: 'beforeinput', data: 'a', value: '' },
      { type: 'input', data: 'a', value: 'a' },
      { type: 'beforeinput', data: 'b', value: 'a' },
      { type: 'input', data: 'b', value: 'ab' },
      { type: 'beforeinput', data: 'c', value: 'ab' },
      { type: 'input', data: 'c', value: 'abc' },
      { type: 'change', value: 'abc' },
    ]);
  });

  it('type uses delay between grapheme inputs on the focused target', async () => {
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    textarea.focus();
    const timeline = createTimeline();
    const store = new BrowserInteractionStateStore();
    const engine = new BrowserTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
      timeline,
    });

    await expect(engine.type('de', { delay: 3 })).resolves.toEqual({
      strategy: 'type',
      text: 'de',
    });

    expect(timeline.delay).toHaveBeenCalledOnce();
    expect(timeline.delay).toHaveBeenCalledWith(3, {});
    expect(textarea.value).toBe('de');
    expect(store.snapshot().typing).toBeNull();
  });

  it('types multi-codepoint graphemes as single input units', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('emoji', input);
    const inputData = [];
    input.addEventListener('input', (event) => {
      inputData.push(event.data);
    });

    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store: new BrowserInteractionStateStore(),
      }),
      events: new BrowserEventDispatcher(),
      timeline: createTimeline(),
    });

    await engine.typeInto(target, '👨‍👩‍👧‍👦a', { delay: 1 });

    expect(input.value).toBe('👨‍👩‍👧‍👦a');
    expect(inputData).toEqual(['👨‍👩‍👧‍👦', 'a']);
  });

  it('keeps cadence and event order when beforeinput cancels one grapheme', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const timeline = createTimeline();
    const seen = [];

    input.addEventListener('beforeinput', (event) => {
      seen.push({ type: event.type, data: event.data, value: input.value });

      if (event.data === 'b') {
        event.preventDefault();
      }
    });
    input.addEventListener('input', (event) => {
      seen.push({ type: event.type, data: event.data, value: input.value });
    });
    input.addEventListener('change', (event) => {
      seen.push({ type: event.type, value: input.value });
    });

    const store = new BrowserInteractionStateStore();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
      timeline,
    });

    await engine.typeInto(target, 'abc', { delay: 5 });

    expect(timeline.delay).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('ac');
    expect(seen).toEqual([
      { type: 'beforeinput', data: 'a', value: '' },
      { type: 'input', data: 'a', value: 'a' },
      { type: 'beforeinput', data: 'b', value: 'a' },
      { type: 'beforeinput', data: 'c', value: 'a' },
      { type: 'input', data: 'c', value: 'ac' },
      { type: 'change', value: 'ac' },
    ]);
    expect(store.snapshot().typing).toBeNull();
  });

  it('emits keystroke feedback only for committed grapheme input', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const onKeystroke = vi.fn();

    input.addEventListener('beforeinput', (event) => {
      if (event.data === 'b') {
        event.preventDefault();
      }
    });

    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store: new BrowserInteractionStateStore(),
      }),
      events: new BrowserEventDispatcher(),
      timeline: createTimeline(),
      onKeystroke,
    });

    await engine.typeInto(target, 'abc');

    expect(
      onKeystroke.mock.calls.map(([event]) => ({
        strategy: event.strategy,
        targetId: event.target.id,
        text: event.text,
      })),
    ).toEqual([
      { strategy: 'typeInto', targetId: 'message', text: 'a' },
      { strategy: 'typeInto', targetId: 'message', text: 'c' },
    ]);
  });

  it('clears typing state when cancelled during cadence delay', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const controlledTimeline = createBlockingTimeline();
    const controller = new AbortController();
    const store = new BrowserInteractionStateStore();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
      timeline: controlledTimeline.timeline,
    });

    const result = engine.typeInto(target, 'ab', { delay: 10, signal: controller.signal });

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1);
    });
    expect(input.value).toBe('a');
    expect(store.snapshot().typing).toMatchObject({ id: 'message' });

    controller.abort('user stopped');

    await expect(result).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    });
    expect(store.snapshot().typing).toBeNull();
    expect(input.value).toBe('a');

    controlledTimeline.resolveNextDelay();
    await Promise.resolve();
    expect(input.value).toBe('a');

    await engine.typeInto(target, 'c', { delay: 10 });
    expect(input.value).toBe('ac');
    expect(store.snapshot().typing).toBeNull();
  });

  it('clears typing state when cadence times out', async () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('message', input);
    const controlledTimeline = createBlockingTimeline();
    const store = new BrowserInteractionStateStore();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
      timeline: controlledTimeline.timeline,
    });

    const result = engine.typeInto(target, 'ab', { delay: 10, timeout: 25 });

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1);
    });
    expect(input.value).toBe('a');
    expect(store.snapshot().typing).toMatchObject({ id: 'message' });

    const expectation = expect(result).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: { operation: 'text.typeInto', timeout: 25 },
    });

    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    expect(store.snapshot().typing).toBeNull();
  });

  it('finishes empty text without cadence delay or input events', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('empty', input);
    const timeline = createTimeline();
    const seen = [];

    for (const eventName of ['beforeinput', 'input', 'change']) {
      input.addEventListener(eventName, (event) => {
        seen.push(event.type);
      });
    }

    const store = new BrowserInteractionStateStore();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
      timeline,
    });

    await expect(engine.typeInto(target, '', { delay: 20 })).resolves.toEqual({
      strategy: 'typeInto',
      text: '',
    });

    expect(timeline.delay).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    expect(store.snapshot().typing).toBeNull();
  });

  it('fill replaces existing content in one input transaction', async () => {
    const input = document.createElement('input');
    input.value = 'old value';
    document.body.append(input);
    const target = handle('field', input);
    const seen = [];
    input.addEventListener('beforeinput', (event) => {
      seen.push({ type: event.type, data: event.data, inputType: event.inputType });
    });
    input.addEventListener('input', (event) => {
      seen.push({ type: event.type, data: event.data, inputType: event.inputType });
    });
    input.addEventListener('change', (event) => {
      seen.push({ type: event.type });
    });

    const store = new BrowserInteractionStateStore();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store,
      }),
      events: new BrowserEventDispatcher(),
      store,
    });

    await expect(engine.fill(target, 'new value')).resolves.toEqual({
      strategy: 'fill',
      text: 'new value',
    });

    expect(input.value).toBe('new value');
    expect(seen).toEqual([
      { type: 'beforeinput', data: 'new value', inputType: 'insertReplacementText' },
      { type: 'input', data: 'new value', inputType: 'insertReplacementText' },
      { type: 'change' },
    ]);
  });

  it('fill ignores typing cadence delay options', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    const target = handle('field', input);
    const timeline = createTimeline();
    const engine = createTextInputEngine({
      focus: new BrowserFocusEngine({
        dom: new BrowserDomAdapter(document),
        store: new BrowserInteractionStateStore(),
      }),
      events: new BrowserEventDispatcher(),
      timeline,
    });

    await expect(engine.fill(target, 'new value', { delay: 50 })).resolves.toEqual({
      strategy: 'fill',
      text: 'new value',
    });

    expect(input.value).toBe('new value');
    expect(timeline.delay).not.toHaveBeenCalled();
  });
});
