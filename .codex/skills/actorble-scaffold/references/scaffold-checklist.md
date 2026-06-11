# Actorble Scaffold Checklist

Use this checklist when creating or updating Actorble scaffold structure.

## Discovery

- Read the nearest `AGENTS.md` and any parent `AGENTS.md` that applies.
- Inspect `package.json`, lockfiles, test config, source directories, docs, and current `git status --short`.
- Read the relevant architecture docs before inventing directories or names.
- Identify existing untracked files before creating replacements.

## Structure

- Keep platform implementation under its platform directory, such as `browser/`.
- Map modules to documented boundaries: facade, scenario runner, action orchestrator, target resolver, surface, geometry, interactability, gesture, pointer, state store, platform adapter, visual layer, diagnostics, and capability/fidelity.
- Add placeholders only when the user asks for folder-first scaffolding.
- Prefer `README.md` placeholders for empty module directories because Git does not track empty directories.
- Keep placeholder text short: responsibility, ownership boundary, and what is intentionally not implemented yet.

## Package And Tooling

- Use pnpm for browser package work.
- Add scripts before documenting commands such as `pnpm test`, `pnpm build`, or `pnpm lint`.
- If adding Vitest, include a smoke test that verifies the scaffold itself or the first public behavior.
- Ignore local package-manager stores and build outputs such as `.pnpm-store/`, `node_modules/`, `dist/`, `coverage/`, and `.vite/`.

## Naming

- Prefer Actorble names in new files.
- Preserve old names only when referring to historical source docs or when changing them would hide useful context.
- For browser package identity, prefer `@actorble/browser`.

## Verification

- Run the narrowest available verification command.
- For folder-only scaffold, a scaffold smoke test is enough.
- Check `git status --short` before finishing and call out unrelated or pre-existing changes.
