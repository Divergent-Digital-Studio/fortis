import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WifiDevice } from '@shared/types/m1'
import DeviceTooltip from '@renderer/components/devices/DeviceTooltip'

/** Mirrors the constants the component positions against. */
const WIDTH = 272
const HEIGHT = 200
const MARGIN = 8
const CURSOR_GAP = 16

// jsdom lays nothing out, so every box measures 0×0 and the clamp would be a
// no-op. Give the panel a real size, otherwise these tests prove nothing.
beforeAll(() => {
    Element.prototype.getBoundingClientRect = function (): DOMRect {
        const isTooltip = (this as Element).getAttribute?.('role') === 'tooltip'
        const width = isTooltip ? WIDTH : 0
        const height = isTooltip ? HEIGHT : 0
        return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) } as DOMRect
    }
})

function device(overrides: Partial<WifiDevice> = {}): WifiDevice {
    return {
        mac: 'A4B1C2112233',
        ip: '192.168.1.20',
        vendor: 'Nest Labs Inc.',
        hostname: null,
        customName: null,
        firstSeen: 1,
        lastSeen: 2,
        isIot: false,
        iotCategory: null,
        ...overrides,
    }
}

function positionAt(x: number, y: number): { left: string; top: string } {
    const { unmount } = render(
        <DeviceTooltip device={device()} connections={[]} isNew={false} anchorX={x} anchorY={y} />,
    )
    const { left, top } = screen.getByRole('tooltip').style
    unmount()
    return { left, top }
}

describe('DeviceTooltip', () => {
    it('sits below-right of the cursor, clear of the pointer', () => {
        expect(positionAt(300, 200)).toEqual({
            left: `${300 + CURSOR_GAP}px`,
            top: `${200 + CURSOR_GAP}px`,
        })
    })

    it('renders into <body>, clear of the orbit’s clipping ancestors', () => {
        const { container } = render(
            <DeviceTooltip device={device()} connections={[]} isNew={false} anchorX={10} anchorY={10} />,
        )
        expect(container).toBeEmptyDOMElement()
        expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull()
    })

    it('tracks the cursor rather than holding a fixed anchor', () => {
        expect(positionAt(500, 200).left).not.toBe(positionAt(300, 200).left)
    })

    it('stays inside the viewport when the cursor is at the right edge', () => {
        const { left } = positionAt(window.innerWidth, 200)
        expect(Number.parseInt(left, 10)).toBeLessThanOrEqual(window.innerWidth - WIDTH - MARGIN)
    })

    it('stays inside the viewport when the cursor is at the bottom edge', () => {
        const { top } = positionAt(300, window.innerHeight)
        expect(Number.parseInt(top, 10)).toBeLessThanOrEqual(window.innerHeight - HEIGHT - MARGIN)
    })

    it('never places the panel off the top-left of the viewport', () => {
        const { left, top } = positionAt(-500, -500)
        expect(Number.parseInt(left, 10)).toBeGreaterThanOrEqual(MARGIN)
        expect(Number.parseInt(top, 10)).toBeGreaterThanOrEqual(MARGIN)
    })
})
