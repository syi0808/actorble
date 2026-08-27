# @actorble/browser

Browser-native interaction choreography for declarative UI scenarios.

> Actorble is in active early development. Public APIs may change before the
> first stable release.

## Install

```sh
pnpm add @actorble/browser
```

`@actorble/browser` is an ESM-only package and requires a browser DOM.

## Quick start

```ts
import { createActorble, css } from '@actorble/browser';

const actorble = createActorble({ feedback: 'cursor' });

await actorble.click(css('#create-project'));
await actorble.typeInto(css('#project-name'), 'Orbit');
await actorble.waitFor({
  kind: 'custom',
  predicate: () => document.body.textContent?.includes('Project created') ?? false,
});

console.log(actorble.getTrace());
actorble.destroy();
```

Add a compact identity label when multiple role-specific cursors need to be
distinguished. The built-in label stays within the visible viewport.

```ts
const admin = createActorble({
  feedback: { cursor: { label: 'Admin' } },
});
```

Actorble resolves targets, checks geometry and interactability, performs input,
tracks interaction state, and waits for the UI to settle. Capability and
fidelity reports expose browser limitations instead of hiding them.

## Development

Use Node.js 22.13 or newer and pnpm 11.5.3. From this directory:

```sh
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
pnpm run release:check
```

`release:check` runs the test and type-check suites, builds from a clean `dist/`,
and previews the npm package contents without publishing.

## Release

After updating `version` in `package.json`, release from a clean `main` branch:

```sh
pnpm run release:check
pnpm publish
```

Publishing requires permission to the `@actorble` npm scope. The package is
configured as public, and `prepublishOnly` reruns tests and type checks before
the registry upload.

The full documentation and architecture are maintained in the
[Actorble repository](https://github.com/syi0808/actorble).

## License

Licensed under either the
[Apache License 2.0](https://github.com/syi0808/actorble/blob/main/LICENSE-APACHE)
or the [MIT License](https://github.com/syi0808/actorble/blob/main/LICENSE-MIT),
at your option.
