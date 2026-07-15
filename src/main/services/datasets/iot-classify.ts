export interface IotClassification {
    isIot: boolean
    category: string | null
}

/**
 * Vendor-string patterns used to classify a device as IoT.
 *
 * Each pattern is matched against the OUI-resolved vendor string. Order matters
 * only for precedence (first match wins); categories are otherwise independent.
 *
 * Notes:
 *  - Generic networking vendors (TP-Link, D-Link, Belkin, ASUS...) are intentionally
 *    NOT blanket-classified as IoT: most of their OUIs are routers/switches/NICs.
 *    Only their smart-product sub-brands (Kasa, Wemo, TPLink smart-home, ...) qualify.
 *  - Chip makers like Espressif and Tuya are strong IoT signals because their silicon
 *    lives inside countless smart devices.
 *  - Lighting uses the legal organisation names too (Signify = Philips Hue,
 *    Philips Lighting BV), not just the consumer brand.
 */
const IOT_VENDOR_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
    // Smart-home hubs / thermostats / switches
    { pattern: /\b(nest|ecobee|honeywell|wemo|smartthings|tuya|sonoff|kasa|shelly|tado|simplisafe|august home)\b/i, category: 'smart-home' },
    // Smart speakers / media streamers (kept separate from consoles/TVs)
    { pattern: /\b(amazon|echo|sonos|harman|bose|google inc|google home|chromecast|fire tv)\b/i, category: 'smart-speaker' },
    // Cameras / doorbells / NVR
    { pattern: /\b(ring|wyze|arlo|hikvision|dahua|reolink|ezviz|axis commun|foscam|amcrest|vivotek|nest cam)\b/i, category: 'camera' },
    // Smart lighting — covers consumer brand AND the IEEE legal organisation names
    { pattern: /\b(philips hue|philips lighting|signify|lifx|nanoleaf|yeelight)\b/i, category: 'lighting' },
    // Streaming sticks / set-top / media players
    { pattern: /\b(roku|apple tv|nvidia shield|fire tv stick)\b/i, category: 'media' },
    // IoT silicon / modules (ESP8266/ESP32 live inside a huge range of devices)
    { pattern: /\b(espressif|broadlink|murata manufacturing|tuya)\b/i, category: 'iot-device' },
    // Smart TVs (consumer-electronics brands that primarily make displays)
    { pattern: /\b(lg electronics|vizio|tcl|hisense|sharp corp|panasonic)\b/i, category: 'tv' },
    // Game consoles
    { pattern: /\b(nintendo|sony interactive|sony computer)\b/i, category: 'console' },
    // Air conditioners / heat pumps / heaters — the WiFi module is often a
    // third-party board, so the hostname rules below also cover these.
    { pattern: /\b(mitsubishi|daikin|fujitsu general|gree|midea|haier)\b/i, category: 'hvac' },
    // Robot vacuums / appliances
    { pattern: /\b(irobot|ecovacs|roborock|shark|dyson)\b/i, category: 'appliance' },
    // Xiaomi sub-brands span many smart-home devices
    { pattern: /\b(xiaomi|beijing xiaomi)\b/i, category: 'iot-device' },
    // Samsung smart-home/IoT (TV is covered above; this catches appliances/hubs).
    // Kept after the TV/console rules so those take precedence where relevant.
    { pattern: /\bsamsung\b/i, category: 'iot-device' },
    // Google/Nest devices (broad "Google" catch after the speaker rule)
    { pattern: /\bnest labs\b/i, category: 'smart-home' },
]

/**
 * Hostname fallback. Devices with a randomised MAC, or a WiFi module whose OUI
 * belongs to a generic chip maker, still announce a telling name over DHCP —
 * "camera-front", "AMIR-TV", "heater-livingroom".
 *
 * Deliberately narrow: a personal device ("Amirs-iPhone-16") must not match, so
 * these are whole-word patterns rather than loose substrings.
 */
const IOT_HOSTNAME_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
    { pattern: /(^|[^a-z])(cam|cams|camera|cameras|ipcam|webcam|doorbell|nvr|dvr)([^a-z]|$)/i, category: 'camera' },
    { pattern: /(^|[^a-z])(heater|heatpump|aircon|airconditioner|ac unit|hvac|thermostat|climate)([^a-z]|$)/i, category: 'hvac' },
    { pattern: /(^|[^a-z])(plug|socket|outlet|switch|relay|smartplug)([^a-z]|$)/i, category: 'smart-home' },
    { pattern: /(^|[^a-z])(homepod|echo|alexa|sonos|speaker|soundbar)([^a-z]|$)/i, category: 'smart-speaker' },
    { pattern: /(^|[^a-z])(tv|chromecast|roku|firestick|appletv|shield)([^a-z]|$)/i, category: 'tv' },
    { pattern: /(^|[^a-z])(bulb|lamp|light|lights|hue)([^a-z]|$)/i, category: 'lighting' },
    { pattern: /(^|[^a-z])(printer|scanner)([^a-z]|$)/i, category: 'printer' },
    { pattern: /(^|[^a-z])(vacuum|roomba|robot)([^a-z]|$)/i, category: 'appliance' },
    { pattern: /(^|[^a-z])(sensor|doorlock|lock|garage)([^a-z]|$)/i, category: 'smart-home' },
]

/**
 * Classify a device as IoT. The vendor is the stronger signal, so it wins; the
 * hostname is consulted only when the vendor says nothing — which is the common
 * case for randomised MACs and white-label hardware.
 */
export function classifyIot(vendor: string | null, hostname: string | null = null): IotClassification {
    if (vendor !== null) {
        for (const { pattern, category } of IOT_VENDOR_PATTERNS) {
            if (pattern.test(vendor)) {
                return { isIot: true, category }
            }
        }
    }

    if (hostname !== null) {
        for (const { pattern, category } of IOT_HOSTNAME_PATTERNS) {
            if (pattern.test(hostname)) {
                return { isIot: true, category }
            }
        }
    }

    return { isIot: false, category: null }
}
