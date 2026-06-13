# Actorble

[![License: Apache-2.0 OR MIT](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](#license)

Actorble is a declarative scenario-based UI controller for choreographing visible, human-like interactions.

## Philosophy

UI control should be explicit, observable, and portable.

Actorble treats interaction as a lifecycle rather than a single event dispatch. A high-level action resolves a target, checks geometry and interactability, performs pointer, keyboard, or text input work, records state changes, and waits for the interface to settle. Platform-specific APIs stay behind adapters, while capability and fidelity reports make implementation limits visible.

## Development Status

Actorble is in active early development.

The current repository is architecture-first. The browser implementation lives under [`browser/`](browser/) and is the only platform implementation with source code today. macOS, Windows, and Linux are planned platform targets, but their implementation directories have not been added yet.

The browser package currently uses the `@actorble/browser` package name.

## Documentation

- [High-level architecture](docs/high-level-architecture.md)
- [Browser architecture](docs/browser-architecture.md)
- [Browser implementation tasks](browser/docs/implementation_tasks.md)
- [Browser package docs](docs/src/content/docs/docs/browser/index.md)

## License

Actorble is dual-licensed under either the [Apache License 2.0](LICENSE-APACHE) or the [MIT License](LICENSE-MIT), at your option.
