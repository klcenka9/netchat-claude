import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the TS sources — never compiled copies under dist/ (which would
    // otherwise be picked up and double-run after a build).
    include: ['src/**/*.test.ts'],
    // setupFiles runs before each test file's module graph is imported, so we can
    // point DB_PATH at an isolated temp database before db/client.ts opens it.
    setupFiles: ['./src/test/setup.ts'],
    // Each test file gets its own worker/process, hence its own singleton DB.
    pool: 'forks',
    fileParallelism: true,
  },
});
