import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const alias = {
    '@shared': resolve(__dirname, 'src/shared'),
    '@renderer': resolve(__dirname, 'src/renderer'),
    '@main': resolve(__dirname, 'src/main'),
}

export default defineConfig({
    resolve: { alias },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: [
                        'src/main/**/*.test.ts',
                        'src/shared/**/*.test.ts',
                        'src/agent/**/*.test.ts',
                        'tests/node/**/*.test.ts',
                    ],
                },
            },
            {
                extends: true,
                esbuild: {
                    jsx: 'automatic',
                    jsxImportSource: 'react',
                },
                test: {
                    name: 'renderer',
                    environment: 'jsdom',
                    globals: true,
                    setupFiles: ['./tests/setup.renderer.ts'],
                    include: [
                        'src/renderer/**/*.test.{ts,tsx}',
                        'tests/renderer/**/*.test.{ts,tsx}',
                    ],
                },
            },
        ],
    },
})
