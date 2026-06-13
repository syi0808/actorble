import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        actionPlayground: fileURLToPath(
          new URL('action-playground/index.html', import.meta.url),
        ),
      },
    },
  },
})
