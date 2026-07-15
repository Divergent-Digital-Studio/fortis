import type { FortisAPI } from './ipc'

declare global {
    interface Window {
        fortis: FortisAPI
    }
}
