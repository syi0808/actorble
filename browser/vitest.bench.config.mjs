import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['benchmarks/**/*.bench.{js,ts}'],
    fileParallelism: false,
  },
  benchmark: {
    includeSamples: false,
  },
});
