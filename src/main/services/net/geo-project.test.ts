import { describe, it, expect } from 'vitest'
import { projectEquirect } from './geo-project'

describe('projectEquirect', () => {
    it('maps the origin to the box center', () => {
        expect(projectEquirect(0, 0)).toEqual({ x: 0.5, y: 0.5 })
    })

    it('maps the top-left corner of the world to the unit origin', () => {
        expect(projectEquirect(-180, 90)).toEqual({ x: 0, y: 0 })
    })

    it('maps the bottom-right corner of the world to the unit max', () => {
        expect(projectEquirect(180, -90)).toEqual({ x: 1, y: 1 })
    })
})
