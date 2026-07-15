import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts'),
                    'parser-worker-entry': resolve(__dirname, 'src/main/utils/parsers/parser-worker-entry.ts'),
                    agent: resolve(__dirname, 'src/agent/index.ts')
                }
            }
        },
        resolve: {
            alias: {
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts')
                }
            }
        },
        resolve: {
            alias: {
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'src/renderer'),
        plugins: [react()],
        build: {
            minify: 'esbuild',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html')
                },
                output: {
                    manualChunks: {
                        react: ['react', 'react-dom', 'react/jsx-runtime'],
                        recharts: ['recharts'],
                        icons: ['lucide-react']
                    }
                }
            }
        },
        resolve: {
            alias: {
                '@renderer': resolve(__dirname, 'src/renderer'),
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    }
})
