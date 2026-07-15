import { describe, it, expect } from 'vitest'
import { EMPTY_BANDWIDTH_SNAPSHOT } from '@shared/types/m3'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { DEFAULT_SETTINGS } from '@shared/types/settings'

describe('m3 foundation', () => {
    it('exposes the empty bandwidth snapshot', () => {
        expect(EMPTY_BANDWIDTH_SNAPSHOT.status).toBe('sampling')
        expect(EMPTY_BANDWIDTH_SNAPSHOT.processes).toEqual([])
    })

    it('registers all m3 channels', () => {
        expect(IPC_CHANNELS.DEFENSE_ACTIONS_GET).toBe('defense:actions-get')
        expect(IPC_CHANNELS.RULES_SAVE).toBe('rules:save')
        expect(IPC_CHANNELS.WEBHOOK_TEST).toBe('webhook:test')
        expect(IPC_CHANNELS.BANDWIDTH_UPDATE).toBe('bandwidth:update')
    })

    it('defaults the new settings off', () => {
        expect(DEFAULT_SETTINGS.defenseEnabled).toBe(false)
        expect(DEFAULT_SETTINGS.webhookEnabled).toBe(false)
        expect(DEFAULT_SETTINGS.webhookUrl).toBe('')
    })
})
