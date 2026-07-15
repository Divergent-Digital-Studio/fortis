export function projectEquirect(lon: number, lat: number): { x: number; y: number } {
    return {
        x: (lon + 180) / 360,
        y: (90 - lat) / 180,
    }
}
