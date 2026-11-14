import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests unitaires des modules purs du processus principal (aucune dépendance à Electron).
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
})
