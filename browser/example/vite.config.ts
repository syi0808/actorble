import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        githubExplorer: fileURLToPath(new URL('github-explorer/index.html', import.meta.url)),
        formFilling: fileURLToPath(new URL('form-filling/index.html', import.meta.url)),
        appointmentScheduler: fileURLToPath(
          new URL('appointment-scheduler/index.html', import.meta.url),
        ),
        webSearch: fileURLToPath(new URL('web-search/index.html', import.meta.url)),
        selectionPointerSequence: fileURLToPath(
          new URL('selection-pointer-sequence/index.html', import.meta.url),
        ),
        researchClipping: fileURLToPath(new URL('research-clipping/index.html', import.meta.url)),
        nestedRevealStability: fileURLToPath(
          new URL('nested-reveal-stability/index.html', import.meta.url),
        ),
      },
    },
  },
});
