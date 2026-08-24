import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  fixedExtension: false,
  dts: { sourcemap: true },
  sourcemap: true,
  clean: true,
});
