import { describe, it, expect } from 'vitest'
import {
    SENSITIVE_SETTING_KEYS,
    SENSITIVE_SETTING_KEYS_SET,
    BLOCKED_API_KEY_FIELDS,
    isSensitiveSettingKey,
} from '@shared/types/settings'
import { sanitizeSettingsForIpc } from '@main/services/encryption'

describe('sensitive keys single source of truth', () => {
    it('exposes the canonical sensitive set', () => {
        expect([...SENSITIVE_SETTING_KEYS]).toEqual([
            'openaiApiKey',
            'anthropicApiKey',
            'licenseKey',
            'remoteAuthToken',
            'pagerDutyRoutingKey',
            'restApiToken',
            'siemToken',
            'threatIntelKey',
        ])
        expect(SENSITIVE_SETTING_KEYS_SET.size).toBe(8)
    })

    it('derives BLOCKED_API_KEY_FIELDS as the sensitive set minus licenseKey', () => {
        expect(BLOCKED_API_KEY_FIELDS).not.toContain('licenseKey')
        expect(BLOCKED_API_KEY_FIELDS).toContain('openaiApiKey')
        expect(BLOCKED_API_KEY_FIELDS).toContain('anthropicApiKey')
        expect(BLOCKED_API_KEY_FIELDS).toContain('remoteAuthToken')
        expect(BLOCKED_API_KEY_FIELDS).toContain('pagerDutyRoutingKey')
        expect(BLOCKED_API_KEY_FIELDS).toContain('restApiToken')
        expect(BLOCKED_API_KEY_FIELDS).toContain('siemToken')
        expect(BLOCKED_API_KEY_FIELDS).toContain('threatIntelKey')
        expect(BLOCKED_API_KEY_FIELDS.length).toBe(7)
    })

    it('type-guards membership', () => {
        expect(isSensitiveSettingKey('openaiApiKey')).toBe(true)
        expect(isSensitiveSettingKey('tier')).toBe(false)
        expect(isSensitiveSettingKey('licenseKey')).toBe(true)
    })

    it('sanitizes every sensitive field via the shared source', () => {
        const input: Record<string, unknown> = {}
        for (const key of SENSITIVE_SETTING_KEYS) input[key] = 'leak-value'
        input['tier'] = 'free'
        input['scanInterval'] = 5000

        const out = sanitizeSettingsForIpc(input)

        for (const key of SENSITIVE_SETTING_KEYS) {
            expect(out[key]).toBe('••••••••')
        }
        expect(out['tier']).toBe('free')
        expect(out['scanInterval']).toBe(5000)
    })

    it('leaves empty sensitive fields untouched', () => {
        const out = sanitizeSettingsForIpc({ openaiApiKey: '', licenseKey: 'x' })
        expect(out['openaiApiKey']).toBe('')
        expect(out['licenseKey']).toBe('••••••••')
    })
})
