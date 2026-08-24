import { describe, expect, it } from 'vitest';
import {
  RECORDER_MASKED_VALUE,
  type RawRecordedClickEvent,
  type RawRecordedDragEvent,
  type RawRecordedTextEvent,
  type RawRecordedPointerEvent,
  type RawRecordedSelectionEvent,
  type RecorderTargetSnapshot,
} from '../src/recorder/event-capture.js';
import { normalizeRecordedEvents } from '../src/recorder/event-to-step.js';
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioStep,
  type ScenarioTargetGroup,
} from '../src/scenario/types.js';
import { validateScenarioDocument } from '../src/scenario/validate.js';
import type { ExtensionResult } from '../src/shared/result.js';

describe('recorder event-to-step normalization', () => {
  it('normalizes clicks into draft click steps with locator candidates', () => {
    const event = click(buttonTarget);
    const draft = expectOk(normalizeRecordedEvents([event]));

    expect(draft.sourceEvents).toEqual([event]);
    expect(draft.document.schemaVersion).toBe(DRAFT_SCENARIO_SCHEMA_VERSION);
    expect(draft.document.steps).toHaveLength(1);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);

    const [step] = draft.document.steps;
    expect(step).toMatchObject({
      id: 'recorded-step-1',
      action: 'click',
    });
    const target = targetGroupFor(step);
    expect(target.strict).toBe(true);
    expect(target.locators.map((locator) => locator.strategy)).toEqual([
      'role',
      'text',
      'css',
      'point',
    ]);
    expect(target.locators[0]).toEqual({
      strategy: 'role',
      role: 'button',
      name: {
        value: 'Sign in',
        match: 'exact',
      },
    });
  });

  it('compresses text event noise into a single fill step and drops the focus click', () => {
    const events = [
      click(emailTarget, 1000),
      text(emailTarget, 'u', 1010),
      text(emailTarget, 'user@example.com', 1020),
      text(emailTarget, 'user@example.com', 1030, 'change'),
    ];

    const draft = expectOk(normalizeRecordedEvents(events));

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'fill',
        input: 'user@example.com',
      }),
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);

    const target = targetGroupFor(draft.document.steps[0]);
    expect(target.locators.map((locator) => locator.strategy)).toEqual(['label', 'css', 'point']);
  });

  it('uses typeInto for text events without form-control context', () => {
    const draft = expectOk(normalizeRecordedEvents([text(editableTarget, 'Saved comment', 1000)]));

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'typeInto',
        input: 'Saved comment',
      }),
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('keeps masked sensitive text and marks it for user confirmation', () => {
    const draft = expectOk(
      normalizeRecordedEvents([
        text(passwordTarget, RECORDER_MASKED_VALUE, 1000, 'input', {
          sensitive: true,
          sensitiveReason: 'password_type',
        }),
      ]),
    );

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'fill',
        input: RECORDER_MASKED_VALUE,
        note: expect.stringContaining('Sensitive input was masked'),
      }),
    ]);
    expect(draft.document.steps[0]).toMatchObject({
      note: expect.stringContaining('password_type'),
    });
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('normalizes pointer selection windows into selectText instead of click', () => {
    const events = [
      pointer('down', paragraphTarget, 1000, { clientX: 20, clientY: 210, buttons: 1 }),
      pointer('move', paragraphTarget, 1010, { clientX: 72, clientY: 210, buttons: 1 }),
      selection(1020, {
        selectedText: 'selectable text',
        activeTarget: paragraphTarget,
        anchorTarget: paragraphTarget,
        focusTarget: paragraphTarget,
      }),
      pointer('up', paragraphTarget, 1030, { clientX: 72, clientY: 210, buttons: 0 }),
      click(paragraphTarget, 1040),
    ];

    const draft = expectOk(normalizeRecordedEvents(events));

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'selectText',
      }),
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);

    const target = targetGroupFor(draft.document.steps[0]);
    expect(target.description).toBe('p#copy "Selectable text block"');
  });

  it('normalizes selection changes that arrive after pointerup but before click', () => {
    const events = [
      pointer('down', paragraphTarget, 1000, { clientX: 20, clientY: 210, buttons: 1 }),
      pointer('up', paragraphTarget, 1010, { clientX: 60, clientY: 210, buttons: 0 }),
      selection(1020, {
        selectedText: 'selected after up',
        activeTarget: paragraphTarget,
      }),
      click(paragraphTarget, 1030),
    ];

    const draft = expectOk(normalizeRecordedEvents(events));

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'selectText',
      }),
    ]);
  });

  it('normalizes drag start and drop evidence into drag steps', () => {
    const draft = expectOk(
      normalizeRecordedEvents([
        drag('start', draggableTarget, 1000, { clientX: 40, clientY: 260 }),
        pointer('move', dropzoneTarget, 1010, { clientX: 160, clientY: 270, buttons: 1 }),
        drag('drop', dropzoneTarget, 1020, { clientX: 160, clientY: 270 }),
      ]),
    );

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'drag',
      }),
    ]);
    const [step] = draft.document.steps;
    expect(step).toMatchObject({
      from: expect.objectContaining({ description: 'div#card "Draggable card"' }),
      to: expect.objectContaining({ description: 'div#dropzone "Drop zone"' }),
    });
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('normalizes small pointer movement without selection into click steps', () => {
    const draft = expectOk(
      normalizeRecordedEvents([
        pointer('down', buttonTarget, 1000, { clientX: 12, clientY: 22, buttons: 1 }),
        pointer('move', buttonTarget, 1010, { clientX: 14, clientY: 24, buttons: 1 }),
        pointer('up', buttonTarget, 1020, { clientX: 15, clientY: 24, buttons: 0 }),
      ]),
    );

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'click',
      }),
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('does not emit unsupported pointerSequence fallback for ambiguous pointer windows', () => {
    const draft = expectOk(
      normalizeRecordedEvents([
        click(buttonTarget, 1000),
        pointer('down', paragraphTarget, 1010, { clientX: 20, clientY: 210, buttons: 1 }),
        pointer('move', paragraphTarget, 1020, { clientX: 90, clientY: 245, buttons: 1 }),
        pointer('up', paragraphTarget, 1030, { clientX: 90, clientY: 245, buttons: 0 }),
      ]),
    );

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'click',
      }),
    ]);
    expect(draft.document.steps).not.toEqual([
      expect.objectContaining({ action: 'pointerSequence' }),
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('keeps mixed normalized steps in event order with stable ids', () => {
    const draft = expectOk(
      normalizeRecordedEvents([
        pointer('down', buttonTarget, 1000, { clientX: 12, clientY: 22, buttons: 1 }),
        pointer('up', buttonTarget, 1010, { clientX: 12, clientY: 22, buttons: 0 }),
        pointer('down', paragraphTarget, 1020, { clientX: 20, clientY: 210, buttons: 1 }),
        selection(1030, {
          selectedText: 'selectable text',
          activeTarget: paragraphTarget,
        }),
        pointer('up', paragraphTarget, 1040, { clientX: 72, clientY: 210, buttons: 0 }),
        drag('start', draggableTarget, 1050, { clientX: 40, clientY: 260 }),
        drag('drop', dropzoneTarget, 1060, { clientX: 160, clientY: 270 }),
      ]),
    );

    expect(draft.document.steps.map((step) => [step.id, step.action])).toEqual([
      ['recorded-step-1', 'click'],
      ['recorded-step-2', 'selectText'],
      ['recorded-step-3', 'drag'],
    ]);
    expect(validateScenarioDocument(draft.document).ok).toBe(true);
  });

  it('reports a recorder error when a target yields no valid locator candidates', () => {
    const result = normalizeRecordedEvents([
      click({
        tagName: 'div',
        rect: {
          x: Number.NaN,
          y: Number.NaN,
          width: Number.NaN,
          height: Number.NaN,
        },
      }),
    ]);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          path: ['events', 0, 'target'],
        },
      ],
    });
  });

  it('returns draft validation issues when normalized output is invalid', () => {
    const result = normalizeRecordedEvents([text(emailTarget, '', 1000)]);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          path: ['steps', 0, 'input'],
        },
      ],
    });
  });
});

const buttonTarget = {
  tagName: 'button',
  id: 'submit',
  role: 'button',
  text: 'Sign in',
  rect: {
    x: 10,
    y: 20,
    width: 100,
    height: 40,
  },
} satisfies RecorderTargetSnapshot;

const emailTarget = {
  tagName: 'input',
  id: 'email',
  inputType: 'email',
  labelText: 'Email',
  name: 'email',
  rect: {
    x: 10,
    y: 80,
    width: 240,
    height: 32,
  },
} satisfies RecorderTargetSnapshot;

const passwordTarget = {
  tagName: 'input',
  id: 'password',
  inputType: 'password',
  labelText: 'Password',
  name: 'password',
  rect: {
    x: 10,
    y: 120,
    width: 240,
    height: 32,
  },
} satisfies RecorderTargetSnapshot;

const editableTarget = {
  tagName: 'div',
  role: 'textbox',
  ariaLabel: 'Comment',
  rect: {
    x: 10,
    y: 160,
    width: 320,
    height: 90,
  },
} satisfies RecorderTargetSnapshot;

const paragraphTarget = {
  tagName: 'p',
  id: 'copy',
  text: 'Selectable text block',
  rect: {
    x: 10,
    y: 200,
    width: 360,
    height: 36,
  },
} satisfies RecorderTargetSnapshot;

const draggableTarget = {
  tagName: 'div',
  id: 'card',
  text: 'Draggable card',
  rect: {
    x: 20,
    y: 250,
    width: 80,
    height: 40,
  },
} satisfies RecorderTargetSnapshot;

const dropzoneTarget = {
  tagName: 'div',
  id: 'dropzone',
  text: 'Drop zone',
  rect: {
    x: 140,
    y: 250,
    width: 120,
    height: 60,
  },
} satisfies RecorderTargetSnapshot;

function click(target: RecorderTargetSnapshot, timestamp = 1000): RawRecordedClickEvent {
  return {
    kind: 'click',
    target,
    timestamp,
    clientX: target.rect.x + 1,
    clientY: target.rect.y + 1,
    button: 0,
  };
}

function text(
  target: RecorderTargetSnapshot,
  value: string,
  timestamp: number,
  source: RawRecordedTextEvent['source'] = 'input',
  sensitive: Pick<RawRecordedTextEvent, 'sensitive' | 'sensitiveReason'> = {
    sensitive: false,
  },
): RawRecordedTextEvent {
  return {
    kind: 'text',
    target,
    source,
    value,
    ...sensitive,
    timestamp,
  };
}

function pointer(
  phase: RawRecordedPointerEvent['phase'],
  target: RecorderTargetSnapshot,
  timestamp: number,
  input: Partial<Pick<RawRecordedPointerEvent, 'clientX' | 'clientY' | 'button' | 'buttons'>> = {},
): RawRecordedPointerEvent {
  return {
    kind: 'pointer',
    phase,
    target,
    timestamp,
    clientX: input.clientX ?? target.rect.x + 1,
    clientY: input.clientY ?? target.rect.y + 1,
    button: input.button ?? 0,
    buttons: input.buttons ?? 0,
    pointerId: 1,
    pointerType: 'mouse',
  };
}

function selection(
  timestamp: number,
  input: Pick<RawRecordedSelectionEvent, 'selectedText'> &
    Partial<Pick<RawRecordedSelectionEvent, 'activeTarget' | 'anchorTarget' | 'focusTarget'>>,
): RawRecordedSelectionEvent {
  return {
    kind: 'selection',
    timestamp,
    selectedText: input.selectedText,
    ...(input.activeTarget === undefined ? {} : { activeTarget: input.activeTarget }),
    ...(input.anchorTarget === undefined ? {} : { anchorTarget: input.anchorTarget }),
    ...(input.focusTarget === undefined ? {} : { focusTarget: input.focusTarget }),
  };
}

function drag(
  phase: RawRecordedDragEvent['phase'],
  target: RecorderTargetSnapshot,
  timestamp: number,
  input: Pick<RawRecordedDragEvent, 'clientX' | 'clientY'>,
): RawRecordedDragEvent {
  return {
    kind: 'drag',
    phase,
    target,
    timestamp,
    clientX: input.clientX,
    clientY: input.clientY,
  };
}

function expectOk<T>(result: ExtensionResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'));
  }
  return result.value;
}

function targetGroupFor(step: ScenarioStep): ScenarioTargetGroup {
  if (!('target' in step)) {
    throw new Error('Step does not have a target.');
  }

  const target = step.target;
  if (!('locators' in target)) {
    throw new Error('Step target is not a target group.');
  }

  return target;
}
