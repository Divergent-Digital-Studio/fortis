import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import ConnectionRow from '@renderer/components/connections/ConnectionRow'
import type { NetworkConnection } from '@shared/types/connection'

function conn(): NetworkConnection {
    return {
        id: 'c1',
        protocol: 'tcp',
        localAddress: '192.0.2.1',
        localPort: 1000,
        remoteAddress: '93.184.216.5',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'proc',
        processId: 1,
        timestamp: Date.now(),
    }
}

beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true })
})

describe('FE-11a ConnectionRow context menu is clamped to the viewport', () => {
    it('does not render the menu beyond the right/bottom edge', () => {
        const { container } = render(<ConnectionRow connection={conn()} isNew={false} />)
        const row = container.querySelector('.connection-row')!

        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { value: 200, configurable: true })
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { value: 120, configurable: true })

        fireEvent.contextMenu(row, { clientX: 790, clientY: 590 })

        const menu = container.querySelector('.connection-row__context-menu') as HTMLElement
        expect(menu).toBeTruthy()

        const left = parseFloat(menu.style.left)
        const top = parseFloat(menu.style.top)

        expect(left + 200).toBeLessThanOrEqual(800)
        expect(top + 120).toBeLessThanOrEqual(600)
    })
})
