# Text Selection Endpoint PoC

TSPS-01 validates the first `selectText` endpoint model before Actorble treats
it as a stable browser runtime API. The PoC intentionally stays in browser tests
and docs: it does not add a public `selectText` facade, shared scenario schema,
or exported selection contract.

## Endpoint Result

An offset-based endpoint model is a stable candidate for ordinary document text,
text-like `input`, `textarea`, and simple `contenteditable` content:

```ts
type TextSelectionEndpointCandidate = {
  target: Node | HTMLInputElement | HTMLTextAreaElement
  offset: number
}
```

The same high-level `anchor` / `focus` intent can be applied by different
surface strategies. DOM text and simple contenteditable use `Selection` and
`Range`. Inputs and textareas use `selectionStart`, `selectionEnd`, and
`setSelectionRange`.

Point-based endpoints are not stable yet. They need geometry policy, caret
position support, scroll/frame coordinate policy, and a decision on when pointer
gesture replay is acceptable. Editor-like surfaces need an editor adapter
because their selection model may not match the DOM text-node model.

## Compatibility Matrix

| Surface | Endpoint class | Strategy | Result |
| --- | --- | --- | --- |
| Ordinary document text | offset-based | Selection API | Supported candidate. Selected text is read with `Selection.toString()`. Collapsed selection is equal anchor/focus offsets. |
| `input` text | offset-based | Input range API | Supported candidate for inputs that expose `setSelectionRange`. Selected text is `value.slice(selectionStart, selectionEnd)`. |
| `textarea` text | offset-based | Input range API | Supported candidate. Newlines are counted as offsets in the textarea value. |
| Simple `contenteditable` | offset-based | Selection API | Supported candidate for DOM text nodes. Rich editor abstractions still need adapters. |
| Point-based endpoint | point-based | Pointer gesture | Capability-gated. Needs geometry and caret-position policy before becoming stable. |
| Editor-like surface | adapter-required | Editor adapter | Capability-gated. Requires editor-specific read/apply/clear adapter. |
| Same-origin iframe | adapter-required | Unsupported in TSPS-01 | Capability-gated until frame routing and frame-local selection ownership exist. |
| Cross-origin iframe | adapter-required | Unsupported | Not readable or applicable across browser origin boundaries without extension/frame cooperation. |
| Open shadow root | adapter-required | Unsupported in TSPS-01 | Needs shadow-root selection policy and adapter routing. |
| Closed shadow root | adapter-required | Unsupported | Not readable or applicable from outside the closed shadow boundary. |

## Read And Collapse Semantics

- Document text and simple contenteditable read selected text from
  `Selection.toString()`.
- `input` and `textarea` read selected text from the element value slice between
  `selectionStart` and `selectionEnd`.
- Collapsed selections are represented as empty selected text with equal
  anchor/focus offsets for the selected surface.
- Unsupported surfaces must report explicit capability notes instead of falling
  back to click or drag behavior.

## Tests

The PoC is covered by `browser/tests/text-selection-endpoint-poc.test.js` and
`browser/tests/fixtures/text-selection-endpoint-poc.js`.

Coverage includes:

- jsdom behavior checks for document text, `input`, `textarea`, and simple
  `contenteditable`.
- Chromium confirmation through Playwright for the same supported surfaces.
- explicit matrix entries for unsupported iframe, shadow root, editor-like, and
  point-based endpoints.
