import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IPC_CHANNELS } from '@shared/types/ipc'

const PRELOAD_SOURCE = readFileSync(resolve(__dirname, '../../src/preload/index.ts'), 'utf8')

const M2_CHANNELS = [
    IPC_CHANNELS.REPORTS_GET,
    IPC_CHANNELS.REPORT_GENERATE,
    IPC_CHANNELS.REPORT_EXPORT,
    IPC_CHANNELS.REPORTS_UPDATE,
    IPC_CHANNELS.AI_PAYLOAD_GET,
    IPC_CHANNELS.FLOW_GET,
    IPC_CHANNELS.FLOW_UPDATE,
    IPC_CHANNELS.OLLAMA_MODELS,
]

const M2_API_METHODS = [
    'getReports',
    'generateReport',
    'exportReport',
    'onReportsUpdate',
    'getAiPayload',
    'getFlowGraph',
    'onFlowUpdate',
    'discoverOllamaModels',
]

describe('M2 preload contract', () => {
    it('declares every M2 channel constant uniquely', () => {
        const values = Object.values(IPC_CHANNELS)
        expect(new Set(values).size).toBe(values.length)
        for (const channel of M2_CHANNELS) {
            expect(values).toContain(channel)
        }
    })

    it('exposes every M2 channel through the preload bridge', () => {
        for (const channel of M2_CHANNELS) {
            const constName = Object.keys(IPC_CHANNELS).find(
                (key) => IPC_CHANNELS[key as keyof typeof IPC_CHANNELS] === channel,
            )
            expect(constName, `channel ${channel} should have a constant`).toBeDefined()
            expect(PRELOAD_SOURCE).toContain(`IPC_CHANNELS.${constName}`)
        }
    })

    it('exposes every M2 FortisAPI method in the preload bridge', () => {
        for (const method of M2_API_METHODS) {
            expect(PRELOAD_SOURCE).toContain(`${method}:`)
        }
    })
})
