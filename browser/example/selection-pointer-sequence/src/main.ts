import '../../shared/styles.css';
import { testId } from '../../../src/index.js';
import { byId } from '../../shared/example-utils.js';
import { mountTaskExample, type TaskExampleContext } from '../../shared/task-example.js';

const documentCopy = 'Document selection text stays stable for replay.';
const textareaCopy = 'Review textarea range before saving.';
const editorCopy = 'Draft editable note for review.';
const pointerSequencePath = {
  down: { xRatio: 0.24, yRatio: 0.46 },
  up: { xRatio: 0.76, yRatio: 0.62 },
} as const;

const stageHtml = `
  <div class="browser-frame selection-surface" data-testid="selection-surface">
    <div class="browser-chrome" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <div class="address-bar">https://editor.example/selection-pointer</div>
    </div>

    <div class="selection-workspace">
      <section class="surface-panel selection-copy-panel">
        <div>
          <p class="eyebrow">Text selection</p>
          <h3>Selectable surfaces</h3>
        </div>
        <p id="document-copy" data-testid="document-copy">${documentCopy}</p>
        <label for="selection-textarea">Editable textarea</label>
        <textarea id="selection-textarea" data-testid="selection-textarea" rows="3">${textareaCopy}</textarea>
        <label for="selection-editor">Editable note</label>
        <div
          class="editable-note"
          id="selection-editor"
          data-testid="selection-editor"
          contenteditable="true"
          role="textbox"
          aria-label="Editable note"
        >${editorCopy}</div>
      </section>

      <section class="surface-panel gesture-panel">
        <div>
          <p class="eyebrow">Pointer intent</p>
          <h3>Click, drag, sequence</h3>
        </div>
        <button
          class="selection-click-target"
          id="selection-click-target"
          data-testid="selection-click-target"
          data-state="idle"
          type="button"
        >
          Confirm click target
        </button>
        <div class="selection-drag-lane">
          <button
            class="selection-drag-source"
            id="selection-drag-source"
            data-testid="selection-drag-source"
            type="button"
          >
            Drag token
          </button>
          <div
            class="selection-drop-target"
            id="selection-drop-target"
            data-testid="selection-drop-target"
            data-state="idle"
          >
            Drop zone
          </div>
        </div>
        <div
          class="pointer-pad"
          id="pointer-pad"
          data-testid="pointer-pad"
          data-state="idle"
        >
          <span>Pointer sequence pad</span>
          <i id="pointer-path-marker" aria-hidden="true"></i>
        </div>
      </section>

      <aside class="surface-panel selection-results-panel">
        <p class="eyebrow">Replay state</p>
        <h3>Verification</h3>
        <div class="outcome-strip" id="selection-status" data-state="idle">Ready</div>
        <dl class="selection-summary">
          <div>
            <dt>Document</dt>
            <dd id="document-selection-output">Waiting</dd>
          </div>
          <div>
            <dt>Textarea</dt>
            <dd id="textarea-selection-output">Waiting</dd>
          </div>
          <div>
            <dt>Editor</dt>
            <dd id="editor-selection-output">Waiting</dd>
          </div>
          <div>
            <dt>Pointer</dt>
            <dd id="pointer-sequence-output">Waiting</dd>
          </div>
        </dl>
      </aside>
    </div>
  </div>
`;

mountTaskExample({
  title: 'Selection and pointer sequence',
  eyebrow: 'Recorder verification',
  summary:
    'Select text across surfaces, distinguish click and drag intent, and replay one cleanup-safe pointer sequence.',
  stageLabel: 'Selection and pointer sequence example',
  stageHtml,
  successMessage: 'Selection scenario complete',
  bindStage,
  run: runSelectionScenario,
  typeFirstField: selectDocumentText,
  clickPrimary: clickSelectionPrimary,
});

function bindStage(context: TaskExampleContext): void {
  const clickTarget = byId<HTMLButtonElement>('selection-click-target');
  const dragSource = byId<HTMLButtonElement>('selection-drag-source');
  const dropTarget = byId<HTMLElement>('selection-drop-target');
  const pointerPad = byId<HTMLElement>('pointer-pad');

  clickTarget.addEventListener('click', () => {
    clickTarget.dataset.state = 'clicked';
  });
  dragSource.addEventListener('pointerdown', () => {
    document.body.dataset.activeSelectionDrag = dragSource.id;
  });
  dragSource.addEventListener('pointerup', clearActiveDrag);
  dragSource.addEventListener('pointercancel', clearActiveDrag);
  dropTarget.addEventListener('pointerup', () => {
    if (document.body.dataset.activeSelectionDrag !== dragSource.id) {
      return;
    }

    dropTarget.dataset.state = 'dropped';
    dropTarget.textContent = 'Dropped';
    clearActiveDrag();
  });
  pointerPad.addEventListener('pointerdown', () => {
    pointerPad.dataset.state = 'pressed';
  });
  pointerPad.addEventListener('pointerup', () => {
    pointerPad.dataset.state = 'complete';
    byId<HTMLElement>('pointer-sequence-output').textContent = 'closed transaction';
  });
  pointerPad.addEventListener('pointercancel', () => {
    pointerPad.dataset.state = 'cancelled';
  });

  context.bindDomEvents('documentCopy', byId<HTMLElement>('document-copy'));
  context.bindDomEvents('textareaCopy', byId<HTMLTextAreaElement>('selection-textarea'));
  context.bindDomEvents('editorCopy', byId<HTMLElement>('selection-editor'));
  context.bindDomEvents('clickTarget', clickTarget);
  context.bindDomEvents('dragSource', dragSource);
  context.bindDomEvents('dropTarget', dropTarget);
  context.bindDomEvents('pointerPad', pointerPad);
}

async function runSelectionScenario(context: TaskExampleContext): Promise<void> {
  await selectDocumentText(context);
  await selectTextareaText(context);
  await selectEditorText(context);
  await clickSelectionPrimary(context);
  await dragSelectionToken(context);
  await runPointerSequence(context);
  await context.actorble().waitFor({
    kind: 'custom',
    predicate: () =>
      document.getElementById('pointer-pad')?.dataset.state === 'complete' &&
      document.getElementById('selection-drop-target')?.dataset.state === 'dropped' &&
      document.getElementById('selection-click-target')?.dataset.state === 'clicked',
  });
  completeSelectionStatus();
}

async function selectDocumentText(context: TaskExampleContext): Promise<void> {
  const target = testId('document-copy');

  await context.actorble().selectText({
    anchor: { target, offset: 9 },
    focus: { target, offset: 23 },
  });
  byId<HTMLElement>('document-selection-output').textContent = selectedDocumentText();
}

async function selectTextareaText(context: TaskExampleContext): Promise<void> {
  const target = testId('selection-textarea');

  await context.actorble().selectText({
    anchor: { target, offset: 7 },
    focus: { target, offset: 21 },
  });
  byId<HTMLElement>('textarea-selection-output').textContent = selectedTextareaText();
}

async function selectEditorText(context: TaskExampleContext): Promise<void> {
  const target = testId('selection-editor');

  await context.actorble().selectText({
    anchor: { target, offset: 6 },
    focus: { target, offset: 19 },
  });
  byId<HTMLElement>('editor-selection-output').textContent = selectedDocumentText();
}

async function clickSelectionPrimary(context: TaskExampleContext): Promise<void> {
  await context.actorble().click(testId('selection-click-target'), {
    pressDwell: 160,
    timeout: 2000,
  });
}

async function dragSelectionToken(context: TaskExampleContext): Promise<void> {
  await context.actorble().drag(testId('selection-drag-source'), testId('selection-drop-target'), {
    duration: 640,
    motion: { kind: 'ease', timing: 'ease-in-out', duration: 640 },
    timeout: 3000,
  });
}

async function runPointerSequence(context: TaskExampleContext): Promise<void> {
  const points = pointerPadPoints();

  await context.actorble().pointerSequence(
    [
      { type: 'move', to: points.down, duration: 240 },
      { type: 'down', button: 'primary' },
      { type: 'pause', duration: 160 },
      { type: 'move', to: points.up, duration: 360 },
      { type: 'up', button: 'primary' },
    ],
    { timeout: 3000 },
  );
}

function pointerPadPoints(): Readonly<{
  down: { x: number; y: number };
  up: { x: number; y: number };
}> {
  const rect = byId<HTMLElement>('pointer-pad').getBoundingClientRect();

  return {
    down: pointInRect(rect, pointerSequencePath.down.xRatio, pointerSequencePath.down.yRatio),
    up: pointInRect(rect, pointerSequencePath.up.xRatio, pointerSequencePath.up.yRatio),
  };
}

function pointInRect(rect: DOMRect, xRatio: number, yRatio: number): { x: number; y: number } {
  return {
    x: Math.round(rect.left + rect.width * xRatio),
    y: Math.round(rect.top + rect.height * yRatio),
  };
}

function selectedDocumentText(): string {
  return document.getSelection()?.toString() ?? '';
}

function selectedTextareaText(): string {
  const textarea = byId<HTMLTextAreaElement>('selection-textarea');

  return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
}

function completeSelectionStatus(): void {
  const status = byId<HTMLElement>('selection-status');

  status.dataset.state = 'complete';
  status.textContent = 'Selection and pointer replay complete';
}

function clearActiveDrag(): void {
  delete document.body.dataset.activeSelectionDrag;
}
