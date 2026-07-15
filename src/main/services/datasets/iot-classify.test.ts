import { describe, it, expect } from 'vitest'
import { classifyIot } from './iot-classify'

describe('classifyIot', () => {
    it('flags known IoT vendor patterns with a category', () => {
        expect(classifyIot('Nest Labs')).toEqual({ isIot: true, category: 'smart-home' })
        expect(classifyIot('Amazon Technologies Inc.')).toEqual({ isIot: true, category: 'smart-speaker' })
        expect(classifyIot('Ring LLC')).toEqual({ isIot: true, category: 'camera' })
        expect(classifyIot('Roku, Inc')).toEqual({ isIot: true, category: 'media' })
        expect(classifyIot('Philips Hue')).toEqual({ isIot: true, category: 'lighting' })
    })

    it('classifies the IEEE organisation names that IoT brands register under', () => {
        // Signify B.V. is the legal name for Philips Hue
        expect(classifyIot('Signify B.V.')).toEqual({ isIot: true, category: 'lighting' })
        expect(classifyIot('Philips Lighting BV')).toEqual({ isIot: true, category: 'lighting' })
        // Espressif silicon sits inside a huge range of smart devices
        expect(classifyIot('Espressif Inc.')).toEqual({ isIot: true, category: 'iot-device' })
        // Samsung smart appliances/hubs
        expect(classifyIot('Samsung Electronics Co Ltd').isIot).toBe(true)
        // LG smart TVs
        expect(classifyIot('LG Electronics').category).toBe('tv')
        // Sony consoles
        expect(classifyIot('Sony Interactive Entertainment').category).toBe('console')
        // Xiaomi smart-home range
        expect(classifyIot('Xiaomi Communications Co Ltd').isIot).toBe(true)
    })

    it('does NOT classify a generic TP-Link router as IoT (over-broad fix)', () => {
        // Previously any TP-Link device was flagged as a "smart-plug"; a router/switch
        // should not be. Only the Kasa smart-home line qualifies now.
        expect(classifyIot('TP-Link Technologies Co Ltd').isIot).toBe(false)
        expect(classifyIot('D-Link International').isIot).toBe(false)
        expect(classifyIot('Belkin International Inc.').isIot).toBe(false)
    })

    it('still recognises explicit smart-home sub-brands', () => {
        expect(classifyIot('TP-Link Kasa').category).toBe('smart-home')
    })

    it('is case-insensitive', () => {
        expect(classifyIot('WYZE LABS').isIot).toBe(true)
    })

    it('returns non-IoT for unknown vendors', () => {
        expect(classifyIot('Dell Inc.')).toEqual({ isIot: false, category: null })
        expect(classifyIot('Intel Corporate')).toEqual({ isIot: false, category: null })
    })

    it('returns non-IoT for a null vendor', () => {
        expect(classifyIot(null)).toEqual({ isIot: false, category: null })
    })

    it('classifies air conditioners and heat pumps as HVAC', () => {
        expect(classifyIot('Mitsubishi Electric Corporation')).toEqual({ isIot: true, category: 'hvac' })
        expect(classifyIot('Daikin Industries')).toEqual({ isIot: true, category: 'hvac' })
    })

    describe('hostname fallback', () => {
        it('classifies devices whose vendor is unknown but whose name is telling', () => {
            expect(classifyIot(null, 'AMIR-TV.modem')).toEqual({ isIot: true, category: 'tv' })
            expect(classifyIot(null, 'Amir-HomePod')).toEqual({ isIot: true, category: 'smart-speaker' })
            expect(classifyIot(null, 'camera-front')).toEqual({ isIot: true, category: 'camera' })
            expect(classifyIot(null, 'living-room-plug')).toEqual({ isIot: true, category: 'smart-home' })
            expect(classifyIot(null, 'heater-bedroom')).toEqual({ isIot: true, category: 'hvac' })
        })

        it('never misreads a personal device as IoT', () => {
            expect(classifyIot(null, 'Amirs-iPhone-16.modem').isIot).toBe(false)
            expect(classifyIot(null, 'Mac.modem').isIot).toBe(false)
            expect(classifyIot(null, 'THEDDS.modem').isIot).toBe(false)
            expect(classifyIot(null, 'MacBook-Pro').isIot).toBe(false)
            // "clock" must not trip the "lock" rule.
            expect(classifyIot(null, 'clock-radio').isIot).toBe(false)
        })

        it('lets a known vendor outrank the hostname', () => {
            expect(classifyIot('Hikvision', 'living-room-tv')).toEqual({ isIot: true, category: 'camera' })
        })
    })
})
