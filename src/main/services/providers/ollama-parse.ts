export function parseOllamaTags(raw: string): string[] {
    try {
        const data = JSON.parse(raw) as { models?: Array<{ name?: string }> }
        if (!Array.isArray(data.models)) return []
        return data.models
            .map((m) => m.name)
            .filter((n): n is string => typeof n === 'string')
    } catch {
        return []
    }
}

export function parseOllamaChat(raw: string): string | null {
    try {
        const data = JSON.parse(raw) as { message?: { content?: string } }
        return typeof data.message?.content === 'string' ? data.message.content : null
    } catch {
        return null
    }
}
