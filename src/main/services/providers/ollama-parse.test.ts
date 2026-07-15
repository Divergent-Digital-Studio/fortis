import { describe, it, expect } from 'vitest'
import { parseOllamaTags, parseOllamaChat } from './ollama-parse'

describe('parseOllamaTags', () => {
    it('extracts model names', () => {
        const json = JSON.stringify({ models: [{ name: 'llama3:latest' }, { name: 'mistral:7b' }] })
        expect(parseOllamaTags(json)).toEqual(['llama3:latest', 'mistral:7b'])
    })

    it('returns [] for malformed / empty', () => {
        expect(parseOllamaTags('not json')).toEqual([])
        expect(parseOllamaTags('{}')).toEqual([])
        expect(parseOllamaTags(JSON.stringify({ models: [{}, { name: 42 }] }))).toEqual([])
    })
})

describe('parseOllamaChat', () => {
    it('extracts message content', () => {
        const json = JSON.stringify({ message: { role: 'assistant', content: 'hello' } })
        expect(parseOllamaChat(json)).toBe('hello')
    })

    it('returns null for malformed', () => {
        expect(parseOllamaChat('nope')).toBeNull()
        expect(parseOllamaChat(JSON.stringify({ message: {} }))).toBeNull()
    })
})
