import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Emits two static SVG paths for the Geo Map basemap, from Natural Earth 50m
 * (public domain) via world-atlas@2 countries-50m.json:
 *
 *   LAND_PATH    filled land polygons (every country ring)
 *   BORDER_PATH  internal country borders only, as open polylines
 *
 * TopoJSON shares an arc between neighbouring polygons, so an arc used by two or
 * more geometries IS an internal border; one used once is coastline. That is what
 * topojson.mesh does, without pulling in the library.
 */

const SOURCE_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
const OUTPUT = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'src/renderer/components/geo/world-land.ts'
)
const W = 360
const LAT_LIMIT = 60
const H = 2 * LAT_LIMIT
const EPSILON = 0.25
const MIN_BBOX_AREA = 0.6

const response = await fetch(SOURCE_URL)
if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`)
}
const topo = await response.json()
const obj = topo.objects.countries
const { scale, translate } = topo.transform

function decodeArc(arc) {
    let x = 0
    let y = 0
    return arc.map(([dx, dy]) => {
        x += dx
        y += dy
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
    })
}

const arcs = topo.arcs.map(decodeArc)

function ring(indices) {
    const pts = []
    for (const i of indices) {
        const forward = i >= 0
        const arc = arcs[forward ? i : ~i]
        const seq = forward ? arc : [...arc].reverse()
        for (const p of seq.slice(pts.length === 0 ? 0 : 1)) pts.push(p)
    }
    return pts
}

function project([lon, lat]) {
    return [((lon + 180) / 360) * W, ((LAT_LIMIT - lat) / (2 * LAT_LIMIT)) * H]
}

/* Sutherland-Hodgman against one horizontal edge. Closed rings only. */
function clipEdge(pts, edgeY, keepBelow) {
    const inside = (p) => (keepBelow ? p[1] >= edgeY : p[1] <= edgeY)
    const out = []
    for (let i = 0; i < pts.length; i += 1) {
        const cur = pts[i]
        const prev = pts[(i + pts.length - 1) % pts.length]
        if (inside(cur) !== inside(prev)) {
            const t = (edgeY - prev[1]) / (cur[1] - prev[1])
            out.push([prev[0] + t * (cur[0] - prev[0]), edgeY])
        }
        if (inside(cur)) out.push(cur)
    }
    return out
}

function clipRing(pts) {
    const top = clipEdge(pts, 0, true)
    if (top.length === 0) return []
    return clipEdge(top, H, false)
}

/* Open polylines cannot be Sutherland-Hodgman clipped; split into inside runs. */
function clipLine(pts) {
    const runs = []
    let run = []
    for (const p of pts) {
        if (p[1] >= 0 && p[1] <= H) run.push(p)
        else if (run.length > 0) {
            runs.push(run)
            run = []
        }
    }
    if (run.length > 0) runs.push(run)
    return runs.filter((r) => r.length >= 2)
}

const fmt = (n) => Number(n.toFixed(1))

function bboxArea(pts) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
    }
    return (maxX - minX) * (maxY - minY)
}

function perpDist([px, py], [ax, ay], [bx, by]) {
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function simplify(pts, eps) {
    if (pts.length < 3) return pts
    let maxDist = 0
    let index = 0
    for (let i = 1; i < pts.length - 1; i += 1) {
        const dist = perpDist(pts[i], pts[0], pts[pts.length - 1])
        if (dist > maxDist) {
            maxDist = dist
            index = i
        }
    }
    if (maxDist <= eps) return [pts[0], pts[pts.length - 1]]
    return [
        ...simplify(pts.slice(0, index + 1), eps).slice(0, -1),
        ...simplify(pts.slice(index), eps),
    ]
}

function toPath(pts, close) {
    let d = ''
    let prev = null
    for (const p of pts) {
        const x = fmt(p[0])
        const y = fmt(p[1])
        if (prev && prev[0] === x && prev[1] === y) continue
        d += d === '' ? `M${x} ${y}` : `L${x} ${y}`
        prev = [x, y]
    }
    if (d === '') return ''
    return close ? `${d}Z` : d
}

/* ─── Land: every ring of every country ─── */
const landParts = []
for (const geometry of obj.geometries) {
    const polygons = geometry.type === 'MultiPolygon' ? geometry.arcs : [geometry.arcs]
    for (const polygon of polygons) {
        for (const ringIndices of polygon) {
            const raw = clipRing(ring(ringIndices).map(project))
            if (raw.length < 4) continue
            if (bboxArea(raw) < MIN_BBOX_AREA) continue
            const pts = simplify([...raw, raw[0]], EPSILON)
            if (pts.length < 4) continue
            const d = toPath(pts, true)
            if (d) landParts.push(d)
        }
    }
}

/* ─── Borders: arcs shared by two or more countries ─── */
const usage = new Map()
const countUse = (list) => {
    for (const entry of list) {
        if (typeof entry === 'number') {
            const index = entry < 0 ? ~entry : entry
            usage.set(index, (usage.get(index) ?? 0) + 1)
        } else countUse(entry)
    }
}
for (const geometry of obj.geometries) countUse(geometry.arcs)

const borderParts = []
for (const [index, uses] of usage) {
    if (uses < 2) continue
    for (const run of clipLine(arcs[index].map(project))) {
        const pts = simplify(run, EPSILON)
        if (pts.length < 2) continue
        const d = toPath(pts, false)
        if (d) borderParts.push(d)
    }
}

const land = landParts.join('')
const borders = borderParts.join('')

const header = [
    `// Natural Earth 50m (public domain), via world-atlas@2 countries-50m.json.`,
    `// Equirectangular, clipped to +/-${LAT_LIMIT} deg latitude -> viewBox "0 0 ${W} ${H}".`,
    `// Douglas-Peucker simplified (eps ${EPSILON}) and rounded to 1dp. BORDER_PATH holds`,
    `// only internal country borders (arcs shared by 2+ countries), as open polylines.`,
    `// Regenerate with scripts/build-world-land.mjs.`,
].join('\n')

writeFileSync(
    OUTPUT,
    `${header}\nexport const LAND_PATH =\n    '${land}'\n\nexport const BORDER_PATH =\n    '${borders}'\n`
)

console.error(
    `world-land: land ${land.length} chars / ${landParts.length} rings, ` +
        `borders ${borders.length} chars / ${borderParts.length} lines`
)
