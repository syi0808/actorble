# Interaction State Store

Owns semantic browser interaction state: hovered chain, active target, focused target, focus-visible state, typing target, dragging state, selection, and pointer capture.

It should be implemented as a store with slices and state diffs, not as incidental DOM side effects.
