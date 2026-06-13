import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://syi0808.github.io',
  base: '/actorble',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Actorble',
      description:
        'Scenario-based UI control for browser automation and future native platforms.',
      favicon: '/favicon.svg',
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
})
