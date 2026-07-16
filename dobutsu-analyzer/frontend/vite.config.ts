import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/ / https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  test: {
    // Pure-logic unit tests only (no DOM needed) — analysis/ and quiz/ modules.
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/analysis/**/*.ts', 'src/quiz/**/*.ts'],
      // Test files and shared test helpers are not production code.
      exclude: ['**/*.test.ts', '**/testkit.ts'],
    },
  },
})
