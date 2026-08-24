import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const browserSource = fileURLToPath(new URL('../browser/src/index.ts', import.meta.url));

export default defineConfig({
  site: 'https://syi0808.github.io',
  base: '/actorble',
  trailingSlash: 'always',
  vite: {
    resolve: {
      alias: {
        '@actorble/browser-source': browserSource,
      },
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
  },
  integrations: [
    starlight({
      title: 'Actorble',
      description: 'Scenario-based UI control for browser automation and future native platforms.',
      favicon: '/favicon.svg',
      logo: {
        dark: './src/assets/actorble-wordmark.svg',
        light: './src/assets/actorble-wordmark-light.svg',
        alt: '',
        replacesTitle: true,
      },
      customCss: ['./src/styles/starlight.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/syi0808/actorble',
        },
      ],
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'Docs Home', slug: 'docs' },
            { label: 'Browser', slug: 'docs/browser' },
          ],
        },
        {
          label: 'Browser',
          items: [
            { label: 'Getting Started', slug: 'docs/browser/getting-started' },
            { label: 'Architecture', slug: 'docs/browser/architecture' },
            { label: 'API Surface', slug: 'docs/browser/api' },
            { label: 'Advanced API', slug: 'docs/browser/advanced-api' },
            { label: 'Examples', slug: 'docs/browser/examples' },
          ],
        },
        {
          label: 'Future Platforms',
          items: [
            { label: 'macOS', slug: 'docs/macos' },
            { label: 'Windows', slug: 'docs/windows' },
            { label: 'Linux', slug: 'docs/linux' },
          ],
        },
      ],
    }),
  ],
});
