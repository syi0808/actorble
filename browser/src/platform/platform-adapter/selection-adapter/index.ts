import { actorbleError } from '../../../shared/index.js';
import type {
  PlatformTextSelectionEndpoint,
  PlatformTextSelectionRange,
  PlatformTextSelectionSnapshot,
  Point,
  SelectionPort,
  TextSelectionSurface,
} from '../../../shared/index.js';

export interface SelectionAdapter extends SelectionPort {}

export class BrowserSelectionAdapter implements SelectionAdapter {
  constructor(readonly root: Document | ShadowRoot = getGlobalDocument()) {}

  readSelection(
    target?: Node | HTMLInputElement | HTMLTextAreaElement,
  ): PlatformTextSelectionSnapshot {
    if (isTextControl(target)) {
      return readTextControlSelection(target);
    }

    if (target !== undefined && isUnsupportedInput(target)) {
      throw unsupportedTextSelection('input selection is not supported for this input type.', {
        surface: 'input',
        reason: 'unsupported-input-type',
        inputType: target.type,
      });
    }

    if (target !== undefined && !isDomSelectionNode(target)) {
      throw unsupportedTextSelection(
        'Selection target must be a DOM node or supported text control.',
        {
          reason: 'unsupported-selection-target',
        },
      );
    }

    assertSupportedSelectionBoundary(target);

    return readDomSelectionSnapshot(selectionForRoot(rootForNode(target) ?? this.root));
  }

  applySelection(range: PlatformTextSelectionRange): PlatformTextSelectionSnapshot {
    const { anchor, focus } = range;

    if (isTextControl(anchor.target) || isTextControl(focus.target)) {
      return applyTextControlSelection(anchor, focus);
    }

    if (isUnsupportedInput(anchor.target) || isUnsupportedInput(focus.target)) {
      const input = isUnsupportedInput(anchor.target)
        ? anchor.target
        : (focus.target as HTMLInputElement);

      throw unsupportedTextSelection('Input selection is not supported for this input type.', {
        surface: 'input',
        reason: 'unsupported-input-type',
        inputType: input.type,
      });
    }

    assertSupportedSelectionBoundary(anchor.target);
    assertSupportedSelectionBoundary(focus.target);

    return applyDomSelection(anchor, focus);
  }

  measureEndpoint(endpoint: PlatformTextSelectionEndpoint): Point | null {
    return measureSelectionEndpoint(endpoint);
  }

  clearSelection(
    target?: Node | HTMLInputElement | HTMLTextAreaElement,
  ): PlatformTextSelectionSnapshot {
    if (isTextControl(target)) {
      const position = target.selectionEnd ?? target.selectionStart ?? 0;
      target.setSelectionRange(position, position);
      return readTextControlSelection(target);
    }

    if (target !== undefined && isUnsupportedInput(target)) {
      throw unsupportedTextSelection('Input selection is not supported for this input type.', {
        surface: 'input',
        reason: 'unsupported-input-type',
        inputType: target.type,
      });
    }

    assertSupportedSelectionBoundary(target);

    const selection = selectionForRoot(rootForNode(target) ?? this.root);
    selection.removeAllRanges();

    return readDomSelectionSnapshot(selection);
  }
}

function measureSelectionEndpoint(endpoint: PlatformTextSelectionEndpoint): Point | null {
  if (isTextControl(endpoint.target)) {
    return measureTextControlEndpoint(endpoint.target, endpoint.offset);
  }

  return measureDomEndpoint(endpoint.target, endpoint.offset);
}

function measureDomEndpoint(target: Node, offset: number): Point | null {
  const ownerDocument = ownerDocumentFor(target);
  const range = ownerDocument.createRange();

  try {
    range.setStart(target, offset);
    range.setEnd(target, offset);

    const rect =
      firstUsableRect(range.getClientRects()) ?? usableRect(range.getBoundingClientRect());

    if (rect) {
      return pointForCaretRect(rect);
    }
  } catch {
    return null;
  } finally {
    range.detach();
  }

  return measureDomEndpointFromAdjacentText(target, offset, ownerDocument);
}

function measureDomEndpointFromAdjacentText(
  target: Node,
  offset: number,
  ownerDocument: Document,
): Point | null {
  if (!(target instanceof Text)) {
    return null;
  }

  if (offset < target.data.length) {
    const nextRect = measureDomTextSegment(target, offset, offset + 1, ownerDocument);

    if (nextRect) {
      return pointForCaretRect(nextRect);
    }
  }

  if (offset > 0) {
    const previousRect = measureDomTextSegment(target, offset - 1, offset, ownerDocument);

    if (previousRect) {
      return pointForTrailingCaretRect(previousRect);
    }
  }

  return null;
}

function measureDomTextSegment(
  target: Text,
  startOffset: number,
  endOffset: number,
  ownerDocument: Document,
): DOMRect | null {
  const range = ownerDocument.createRange();

  try {
    range.setStart(target, startOffset);
    range.setEnd(target, endOffset);

    return firstUsableRect(range.getClientRects()) ?? usableRect(range.getBoundingClientRect());
  } catch {
    return null;
  } finally {
    range.detach();
  }
}

function measureTextControlEndpoint(
  target: HTMLInputElement | HTMLTextAreaElement,
  offset: number,
): Point | null {
  const documentRef = target.ownerDocument;
  const view = documentRef.defaultView ?? globalThis.window;
  const targetRect = target.getBoundingClientRect();

  if (!isUsableRect(targetRect)) {
    return null;
  }

  const mirror = documentRef.createElement('div');
  const marker = documentRef.createElement('span');
  const style = view.getComputedStyle(target);
  const value = target.value;
  const clampedOffset = Math.max(0, Math.min(offset, value.length));
  const before = value.slice(0, clampedOffset);
  const after = value.slice(clampedOffset) || '.';

  copyTextControlMeasurementStyle(mirror, style, target, targetRect);
  mirror.textContent = before;
  marker.textContent = '\u200b';
  mirror.append(marker, documentRef.createTextNode(after));
  documentRef.body.append(mirror);

  try {
    const markerRect = marker.getBoundingClientRect();
    const rect = usableRect(markerRect);

    if (!rect) {
      return null;
    }

    return {
      x: rect.left - target.scrollLeft,
      y: rect.top + rect.height / 2 - target.scrollTop,
    };
  } finally {
    mirror.remove();
  }
}

function copyTextControlMeasurementStyle(
  mirror: HTMLElement,
  style: CSSStyleDeclaration,
  target: HTMLInputElement | HTMLTextAreaElement,
  targetRect: DOMRect,
): void {
  const isTextarea = target instanceof HTMLTextAreaElement;
  const styleProperties = [
    'borderBottomWidth',
    'borderLeftWidth',
    'borderRightWidth',
    'borderTopWidth',
    'boxSizing',
    'fontFamily',
    'fontFeatureSettings',
    'fontKerning',
    'fontSize',
    'fontStretch',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'tabSize',
    'textAlign',
    'textIndent',
    'textTransform',
    'wordSpacing',
  ] as const;

  Object.assign(mirror.style, {
    position: 'fixed',
    left: `${targetRect.left}px`,
    top: `${targetRect.top}px`,
    width: `${targetRect.width}px`,
    minHeight: `${targetRect.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    visibility: 'hidden',
    whiteSpace: isTextarea ? 'pre-wrap' : 'pre',
    wordBreak: isTextarea ? 'break-word' : 'normal',
  });

  for (const property of styleProperties) {
    mirror.style[property] = style[property];
  }
}

function firstUsableRect(rects: DOMRectList): DOMRect | null {
  for (const rect of Array.from(rects)) {
    const usable = usableRect(rect);

    if (usable) {
      return usable;
    }
  }

  return null;
}

function usableRect(rect: DOMRect): DOMRect | null {
  return isUsableRect(rect) ? rect : null;
}

function isUsableRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) && Number.isFinite(rect.top) && (rect.width > 0 || rect.height > 0)
  );
}

function pointForCaretRect(rect: DOMRect): Point {
  return {
    x: rect.left,
    y: rect.top + rect.height / 2,
  };
}

function pointForTrailingCaretRect(rect: DOMRect): Point {
  return {
    x: rect.right,
    y: rect.top + rect.height / 2,
  };
}

export function createSelectionAdapter(root?: Document | ShadowRoot): SelectionAdapter {
  return new BrowserSelectionAdapter(root);
}

function applyTextControlSelection(
  anchor: PlatformTextSelectionEndpoint,
  focus: PlatformTextSelectionEndpoint,
): PlatformTextSelectionSnapshot {
  const target = anchor.target;

  if (!isTextControl(target) || !isTextControl(focus.target)) {
    throw unsupportedTextSelection('Text control selections must use text control endpoints.', {
      reason: 'text-control-endpoint-kind-mismatch',
    });
  }

  if (focus.target !== target) {
    throw unsupportedTextSelection(
      'Text control selection endpoints must target the same control.',
      {
        reason: 'text-control-endpoint-mismatch',
      },
    );
  }

  target.focus();
  target.setSelectionRange(anchor.offset, focus.offset);

  return readTextControlSelection(target);
}

function applyDomSelection(
  anchor: PlatformTextSelectionEndpoint,
  focus: PlatformTextSelectionEndpoint,
): PlatformTextSelectionSnapshot {
  if (ownerDocumentFor(anchor.target) !== ownerDocumentFor(focus.target)) {
    throw unsupportedTextSelection('Selection endpoints must belong to the same document.', {
      reason: 'cross-document-endpoints',
    });
  }

  const ownerDocument = ownerDocumentFor(anchor.target);
  const selection = selectionForRoot(ownerDocument);
  const range = ownerDocument.createRange();

  range.setStart(anchor.target, anchor.offset);
  range.setEnd(focus.target, focus.offset);
  selection.removeAllRanges();
  selection.addRange(range);

  return readDomSelectionSnapshot(selection);
}

function readTextControlSelection(
  target: HTMLInputElement | HTMLTextAreaElement,
): PlatformTextSelectionSnapshot {
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? start;

  return {
    surface: target instanceof HTMLTextAreaElement ? 'textarea' : 'input',
    strategy: 'input-range-api',
    selectedText: target.value.slice(start, end),
    anchorNode: target,
    focusNode: target,
    anchorOffset: start,
    focusOffset: end,
    collapsed: start === end,
  };
}

function readDomSelectionSnapshot(selection: Selection): PlatformTextSelectionSnapshot {
  return {
    surface: surfaceForDomSelection(selection),
    strategy: 'selection-api',
    selectedText: selection.toString(),
    anchorNode: selection.anchorNode,
    focusNode: selection.focusNode,
    anchorOffset: selection.anchorOffset,
    focusOffset: selection.focusOffset,
    collapsed: selection.isCollapsed,
  };
}

function surfaceForDomSelection(selection: Selection): TextSelectionSurface {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;

  if (isInContentEditable(anchor) || isInContentEditable(focus)) {
    return 'contenteditable';
  }

  return 'document-text';
}

function selectionForRoot(root: Document | ShadowRoot): Selection {
  if (isDocument(root)) {
    const selection = root.getSelection();

    if (selection) {
      return selection;
    }
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'Selection API is unavailable for this root.', {
    details: { boundary: 'selection-adapter' },
  });
}

function rootForNode(
  node?: Node | HTMLInputElement | HTMLTextAreaElement,
): Document | ShadowRoot | undefined {
  const root = node?.getRootNode();

  if (isDocument(root) || isShadowRoot(root)) {
    return root;
  }

  return undefined;
}

function ownerDocumentFor(node: Node): Document {
  if (node instanceof Document) {
    return node;
  }

  if (node.ownerDocument) {
    return node.ownerDocument;
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'Selection endpoint has no owner document.', {
    details: { boundary: 'selection-adapter' },
  });
}

function isTextControl(node: unknown): node is HTMLInputElement | HTMLTextAreaElement {
  if (node instanceof HTMLTextAreaElement) {
    return true;
  }

  return node instanceof HTMLInputElement && isSelectableInputType(node);
}

function isUnsupportedInput(node: unknown): node is HTMLInputElement {
  return node instanceof HTMLInputElement && !isSelectableInputType(node);
}

function isSelectableInputType(input: HTMLInputElement): boolean {
  return ['password', 'search', 'tel', 'text', 'url'].includes(input.type);
}

function isDomSelectionNode(node: unknown): node is Node {
  return node instanceof Node;
}

function isInContentEditable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  const editable = element?.closest('[contenteditable]');

  return (
    editable !== undefined &&
    editable !== null &&
    editable.getAttribute('contenteditable') !== 'false'
  );
}

function assertSupportedSelectionBoundary(
  node?: Node | HTMLInputElement | HTMLTextAreaElement,
): void {
  if (isShadowRoot(rootForNode(node))) {
    throw unsupportedTextSelection('Shadow root text selection requires adapter policy.', {
      reason: 'shadow-root-policy-required',
    });
  }
}

function unsupportedTextSelection(message: string, details: Record<string, unknown> = {}): Error {
  return actorbleError('TEXT_SELECTION_UNSUPPORTED', message, {
    details: {
      boundary: 'selection-adapter',
      ...details,
    },
  });
}

function getGlobalDocument(): Document {
  if (globalThis.document) {
    return globalThis.document;
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'No global document is available.');
}

function isDocument(root: unknown): root is Document {
  return root instanceof Document;
}

function isShadowRoot(root: unknown): root is ShadowRoot {
  return root instanceof ShadowRoot;
}
