import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useMapTransform, { MAX_ZOOM } from '@renderer/hooks/useMapTransform'

const WIDTH = 360
const HEIGHT = 120

/* At zoom z the map spans z*WIDTH, so x must stay within [-WIDTH*(z-1), 0] to keep
   the viewport covered. Anything outside means blank space slid into view. */
function coversViewport(zoom: number, x: number, y: number): boolean {
    return (
        x <= 0 &&
        y <= 0 &&
        x >= -WIDTH * (zoom - 1) - 1e-9 &&
        y >= -HEIGHT * (zoom - 1) - 1e-9
    )
}

describe('useMapTransform', () => {
    it('starts at identity', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        expect(result.current.transform).toEqual({ zoom: 1, x: 0, y: 0 })
    })

    it('cannot pan away from the viewport at zoom 1', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(1))
        const { zoom, x, y } = result.current.transform
        expect(zoom).toBe(1)
        expect({ x, y }).toEqual({ x: 0, y: 0 })
    })

    it('keeps the viewport covered after zooming in', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(4))
        const { zoom, x, y } = result.current.transform
        expect(zoom).toBe(4)
        expect(coversViewport(zoom, x, y)).toBe(true)
    })

    it('clamps zoom to the maximum', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(1000))
        expect(result.current.transform.zoom).toBe(MAX_ZOOM)
    })

    it('never zooms below 1', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(0.01))
        expect(result.current.transform.zoom).toBe(1)
    })

    it('reset returns to identity after zooming', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(6))
        act(() => result.current.reset())
        expect(result.current.transform).toEqual({ zoom: 1, x: 0, y: 0 })
    })

    it('zooming back out restores full coverage', () => {
        const { result } = renderHook(() => useMapTransform(WIDTH, HEIGHT))
        act(() => result.current.zoomBy(8))
        act(() => result.current.zoomBy(1 / 8))
        const { zoom, x, y } = result.current.transform
        expect(zoom).toBeCloseTo(1)
        expect(coversViewport(zoom, x, y)).toBe(true)
    })
})
