export const textSelectionEndpointPocMatrix = Object.freeze([
  {
    surface: 'document-text',
    supported: true,
    endpointModel: 'offset-based',
    strategy: 'selection-api',
    selectedTextRead: 'Selection.toString()',
    collapsedRepresentation: 'anchor and focus target the same text position',
    capability: 'stable-candidate',
  },
  {
    surface: 'input',
    supported: true,
    endpointModel: 'offset-based',
    strategy: 'input-range-api',
    selectedTextRead: 'value.slice(selectionStart, selectionEnd)',
    collapsedRepresentation: 'selectionStart equals selectionEnd',
    capability: 'stable-candidate',
  },
  {
    surface: 'textarea',
    supported: true,
    endpointModel: 'offset-based',
    strategy: 'input-range-api',
    selectedTextRead: 'value.slice(selectionStart, selectionEnd)',
    collapsedRepresentation: 'selectionStart equals selectionEnd',
    capability: 'stable-candidate',
  },
  {
    surface: 'contenteditable',
    supported: true,
    endpointModel: 'offset-based',
    strategy: 'selection-api',
    selectedTextRead: 'Selection.toString()',
    collapsedRepresentation: 'anchor and focus target the same DOM text position',
    capability: 'stable-candidate-for-simple-dom-text',
  },
  {
    surface: 'point-based-endpoint',
    supported: false,
    endpointModel: 'point-based',
    strategy: 'pointer-gesture',
    selectedTextRead: 'read after browser gesture settlement',
    collapsedRepresentation: 'gesture may collapse to caret; geometry policy is required',
    capability: 'geometry-policy-required',
  },
  {
    surface: 'editor-like',
    supported: false,
    endpointModel: 'adapter-required',
    strategy: 'editor-adapter',
    selectedTextRead: 'editor adapter selection snapshot',
    collapsedRepresentation: 'editor adapter caret model',
    capability: 'editor-adapter-required',
  },
  {
    surface: 'iframe-same-origin',
    supported: false,
    endpointModel: 'adapter-required',
    strategy: 'unsupported',
    selectedTextRead: 'frame-local selection snapshot after frame routing exists',
    collapsedRepresentation: 'frame-local endpoint model after routing exists',
    capability: 'frame-routing-required',
  },
  {
    surface: 'iframe-cross-origin',
    supported: false,
    endpointModel: 'adapter-required',
    strategy: 'unsupported',
    selectedTextRead: 'not readable across browser origin boundary',
    collapsedRepresentation: 'not representable without extension/frame cooperation',
    capability: 'cross-origin-frame-unsupported',
  },
  {
    surface: 'open-shadow-root',
    supported: false,
    endpointModel: 'adapter-required',
    strategy: 'unsupported',
    selectedTextRead: 'shadow-root scoped selection behavior requires adapter policy',
    collapsedRepresentation: 'shadow-root scoped endpoint policy required',
    capability: 'shadow-root-policy-required',
  },
  {
    surface: 'closed-shadow-root',
    supported: false,
    endpointModel: 'adapter-required',
    strategy: 'unsupported',
    selectedTextRead: 'not readable from outside the closed shadow boundary',
    collapsedRepresentation: 'not representable from outside the closed shadow boundary',
    capability: 'closed-shadow-root-unsupported',
  },
])

export function applySelectionEndpointRange({ surface, anchor, focus }) {
  const matrixEntry = findMatrixEntry(surface)

  if (!matrixEntry.supported) {
    return { ...matrixEntry, selectedText: '', collapsed: true }
  }

  if (matrixEntry.strategy === 'input-range-api') {
    return applyTextControlSelection(matrixEntry, anchor, focus)
  }

  if (matrixEntry.strategy === 'selection-api') {
    return applyDomSelection(matrixEntry, anchor, focus)
  }

  return { ...matrixEntry, selectedText: '', collapsed: true }
}

export function readSelectionSnapshot(root = document) {
  const selection = root.getSelection()

  if (!selection) {
    return {
      selectedText: '',
      anchorNode: null,
      focusNode: null,
      anchorOffset: 0,
      focusOffset: 0,
      collapsed: true,
    }
  }

  return {
    selectedText: selection.toString(),
    anchorNode: selection.anchorNode,
    focusNode: selection.focusNode,
    anchorOffset: selection.anchorOffset,
    focusOffset: selection.focusOffset,
    collapsed: selection.isCollapsed,
  }
}

function applyTextControlSelection(matrixEntry, anchor, focus) {
  const target = anchor.target
  assertTextControl(target, matrixEntry.surface)

  if (focus.target !== target) {
    throw new TypeError(`${matrixEntry.surface} selection endpoints must target the same control.`)
  }

  target.focus()
  target.setSelectionRange(anchor.offset, focus.offset)

  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start

  return {
    ...matrixEntry,
    selectedText: target.value.slice(start, end),
    anchorOffset: start,
    focusOffset: end,
    collapsed: start === end,
  }
}

function applyDomSelection(matrixEntry, anchor, focus) {
  const ownerDocument = ownerDocumentFor(anchor.target)
  const selection = ownerDocument.getSelection()

  if (!selection) {
    throw new Error(`Selection API is unavailable for ${matrixEntry.surface}.`)
  }

  const range = ownerDocument.createRange()
  range.setStart(anchor.target, anchor.offset)
  range.setEnd(focus.target, focus.offset)
  selection.removeAllRanges()
  selection.addRange(range)

  return {
    ...matrixEntry,
    ...readSelectionSnapshot(ownerDocument),
  }
}

function findMatrixEntry(surface) {
  const entry = textSelectionEndpointPocMatrix.find((candidate) => candidate.surface === surface)

  if (!entry) {
    throw new Error(`Unknown text selection PoC surface: ${surface}.`)
  }

  return entry
}

function assertTextControl(target, label) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    throw new TypeError(`${label} selection requires an input or textarea target.`)
  }

  if (typeof target.setSelectionRange !== 'function') {
    throw new TypeError(`${label} target does not expose setSelectionRange().`)
  }
}

function ownerDocumentFor(node) {
  if (node instanceof Document) {
    return node
  }

  return node.ownerDocument ?? document
}
