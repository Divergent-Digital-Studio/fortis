/* Intl ships the region names, so the dataset only has to carry ISO codes. */
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

export function countryName(code: string): string {
    try {
        return displayNames.of(code) ?? code
    } catch {
        return code
    }
}
