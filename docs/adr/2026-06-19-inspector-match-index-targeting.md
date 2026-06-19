# ADR 2026-06-19: Inspector Match Index Targeting

Status: Accepted
Date: 2026-06-19

## Context

The side panel target assignment flow requires users to inspect an element, wait
for locator candidates, and then press `Use` on a unique candidate. This is
slower than the intended authoring interaction: choosing an element should fill
the selected target slot.

Many useful locators are not unique. A role, label, text, test id, or CSS
selector can match multiple elements, but the inspector knows which concrete
element the user selected. The extension needs a way to preserve that selection
without turning the scenario document into transient UI state.

## Decision

Browser locators support a 0-based `matchIndex` field. Runtime target resolution
first resolves and ranks the base locator candidates, then selects the candidate
at `matchIndex`. An out-of-range index behaves like no match.

The browser extension records selected-element evidence during inspector target
assignment. Locator preview compares the selected element against each
candidate's `resolveAll()` matches and returns `selectedMatchIndex` where it can
identify the clicked element. The side panel immediately applies the best ranked
candidate that identifies the selected element.

Target groups may also store browser-specific inspector metadata under
`platform["actorble.browser"].inspector`. This metadata records evidence such as
the selected element's document-order index, candidate id, and selected match
index. Runtime execution semantics come from the locator `matchIndex`; the
platform metadata is diagnostic and authoring context.

If no candidate can be tied back to the selected element, the side panel does
not mutate the draft document and surfaces a locator issue.

## Consequences

Target assignment becomes a single inspect-and-click interaction for common
cases, while still preserving deterministic runtime target resolution when a
locator is ambiguous.

`@actorble/browser` owns the runtime meaning of `matchIndex`, keeping target
resolution semantics inside the runtime package. The extension owns inspector
metadata capture, preview, and target-slot write-back.

Scenario schema, validation, compiler, export, messaging, and tests need to
recognize `matchIndex`. Browser platform metadata becomes a supported platform
extension for target groups; unsupported platform extension namespaces continue
to fail explicitly.

## Alternatives Considered

Keep manual `Use` selection after preview. This was rejected because it keeps
target assignment unnecessarily two-step for the primary builder flow.

Synthesize a unique `:nth-of-type` CSS path instead of adding `matchIndex`. This
was rejected because it turns selection evidence into fragile selector text and
does not improve non-CSS locator semantics.

Store only `platform` metadata and let the compiler interpret it. This was
rejected because runtime target resolution would not understand the locator
intent outside the extension compiler path.

Apply point fallback automatically. This was rejected because the chosen policy
is to avoid mutating the draft when the selected element cannot be tied to a
locator candidate.

## References

- `docs/high-level-architecture.md`
- `docs/browser-extension-architecture.md`
