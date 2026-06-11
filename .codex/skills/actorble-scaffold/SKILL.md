---
name: actorble-scaffold
description: Scaffold Actorble project or package structure from architecture docs and AGENTS.md. Use when Codex is asked to create or update module directories, package metadata, test scaffolding, placeholder docs, or architecture-aligned project structure for Actorble, especially the browser implementation.
---

# Actorble Scaffold

Use this skill to scaffold Actorble structure without prematurely implementing runtime behavior.

## Workflow

1. Ground in the repository before asking questions.
   - Read the relevant `AGENTS.md` files.
   - Inspect package manifests, existing source tree, test setup, and architecture docs.
   - Prefer `rg --files`, `find`, `git status --short`, and targeted `sed` reads.
2. Identify the intended scaffold depth.
   - Use existing user intent if clear.
   - Ask only when the decision changes tracked files materially, such as folder-only vs API stubs vs working implementation.
3. Keep scaffolding architecture-first.
   - Map directories to documented Actorble components.
   - Add placeholders that explain ownership boundaries.
   - Do not add runtime classes, exports, or public API unless explicitly requested.
4. Configure only the minimum supporting tooling.
   - Add or update package scripts only when the scaffold needs verification.
   - Prefer Vitest for browser package smoke tests when tests are requested.
5. Verify the scaffold.
   - Run available smoke tests or targeted checks.
   - Report commands that could not run and why.

For the detailed checklist, read `references/scaffold-checklist.md` before editing files.

## Actorble Defaults

- Treat the repo root architecture docs as the source of truth: `docs/high-level-architecture.md` and `docs/browser-architecture.md`.
- Treat `browser/` as the browser package unless the user specifies another package.
- Use `@actorble/browser` for the browser package identity.
- Use component names consistent with the current Actorble naming, not stale Stuntman names, unless preserving historical docs.
- Respect the active collaboration mode. In Plan Mode, produce a plan only and do not mutate files.
