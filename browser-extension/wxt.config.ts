import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Actorble',
    short_name: 'Actorble',
    description: 'Browser extension GUI shell for Actorble scenarios.',
    permissions: ['storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
