# Repository Guidelines

## Project Structure & Module Organization

This repository is architecture-first and is intended to produce libraries and apps for four platforms: macOS, Windows, Linux, and browser. `README.md` gives the short project description. System design lives in `docs/high-level-architecture.md`; browser-specific design lives in `docs/browser-architecture.md`.

Keep platform implementation in explicit directories such as `browser/`, `macos/`, `windows/`, and `linux/`. Shared package code should live in a clearly named top-level source directory such as `src/` once it exists. Platform-specific contributor rules belong in that platform directory's `AGENTS.md`.

## Commit Guidelines

Use conventional commit.
