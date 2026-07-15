import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { execFileSync } from 'child_process'
import { writeFile, mkdir, rm } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RES = join(ROOT, 'resources')
const SRC = join(RES, 'logo-source.png')

// The source render sits on a white page, and its rounded square has slightly
// uneven corners. Clip to a true rounded rect a touch rounder than the widest
// corner, so no white survives anywhere on the edge.
const RADIUS = 236
const cornerMask = Buffer.from(
    `<svg width="1024" height="1024"><rect width="1024" height="1024" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
)

// The source render faces left; the eagle should look left-to-right.
const squared = await sharp(SRC).trim({ threshold: 20 }).flop().resize(1024, 1024, { fit: 'cover' }).ensureAlpha().raw().toBuffer()

// Repaint the leftover white page navy first: the mask's anti-aliased edge
// samples whatever is underneath, and white there reads as a bright fringe.
const NAVY = [13, 18, 62]
for (let o = 0; o < squared.length; o += 4) {
    const r = squared[o], g = squared[o + 1], b = squared[o + 2]
    if ((r + g + b) / 3 > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 60) {
        [squared[o], squared[o + 1], squared[o + 2]] = NAVY
    }
}

const master = await sharp(squared, { raw: { width: 1024, height: 1024, channels: 4 } })
    .composite([{ input: cornerMask, blend: 'dest-in' }])
    .png()
    .toBuffer()
await writeFile(join(RES, 'icon.png'), master)

for (const s of [16, 32, 48, 64, 128, 256, 512]) {
    await sharp(master).resize(s, s).png().toFile(join(RES, 'icons', `${s}x${s}.png`))
}

await writeFile(join(RES, 'icon.ico'), await pngToIco([256, 128, 64, 48, 32, 16].map((s) => join(RES, 'icons', `${s}x${s}.png`))))

const iconset = join(RES, 'icon.iconset')
await rm(iconset, { recursive: true, force: true })
await mkdir(iconset, { recursive: true })
for (const [name, s] of [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
]) {
    await sharp(master).resize(s, s).png().toFile(join(iconset, name))
}
execFileSync('iconutil', ['-c', 'icns', '-o', join(RES, 'icon.icns'), iconset])
await rm(iconset, { recursive: true, force: true })

const { data, info } = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

const mask = Buffer.alloc(W * H * 4)
for (let p = 0; p < W * H; p++) {
    const o = p * 4
    const r = data[o], g = data[o + 1], b = data[o + 2]
    mask[o] = mask[o + 1] = mask[o + 2] = 255
    mask[o + 3] = b - r > 60 && (r + g + b) / 3 > 60 ? 255 : 0
}

// Dilate so the head's thin interior outlines close up, then flood from the
// border: whatever the flood cannot reach is the solid head. No erode — the
// extra pixels scale to well under one pixel at menu-bar size.
const dilated = await sharp(mask, { raw: { width: W, height: H, channels: 4 } }).blur(7).raw().toBuffer()

const outside = new Uint8Array(W * H)
const stack = []
for (let x = 0; x < W; x++) { stack.push(x, x + (H - 1) * W) }
for (let y = 0; y < H; y++) { stack.push(y * W, W - 1 + y * W) }
while (stack.length) {
    const p = stack.pop()
    if (outside[p] || dilated[p * 4 + 3] > 2) continue
    outside[p] = 1
    const x = p % W, y = (p / W) | 0
    if (x > 0) stack.push(p - 1)
    if (x < W - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - W)
    if (y < H - 1) stack.push(p + W)
}

// The eye outline runs into the brow line, so the fill swallows it. Punch it
// back as a disk — without an eye the head reads as a blob at 18px.
const EYE = { x: 1024 - 456, y: 388, r: 62 }

const silhouette = Buffer.alloc(W * H * 4)
for (let p = 0; p < W * H; p++) {
    const o = p * 4
    const dx = (p % W) - EYE.x, dy = ((p / W) | 0) - EYE.y
    silhouette[o] = silhouette[o + 1] = silhouette[o + 2] = 255
    silhouette[o + 3] = outside[p] || dx * dx + dy * dy < EYE.r * EYE.r ? 0 : 255
}

const glyph = await sharp(silhouette, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(968, 968, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 28, bottom: 28, left: 28, right: 28, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

for (const [state, alpha] of [['active', 1], ['paused', 0.35]]) {
    for (const [suffix, size] of [['', 18], ['@2x', 36]]) {
        await sharp(glyph)
            .resize(size, size)
            .composite([{
                input: Buffer.from([255, 255, 255, Math.round(alpha * 255)]),
                raw: { width: 1, height: 1, channels: 4 },
                tile: true,
                blend: 'dest-in',
            }])
            .png()
            .toFile(join(RES, 'tray', `tray-${state}Template${suffix}.png`))
    }
}

await mkdir(join(ROOT, 'src/renderer/assets'), { recursive: true })
await sharp(master).resize(128, 128).png().toFile(join(ROOT, 'src/renderer/assets/logo.png'))

const assertOpaque = async (file, min, max) => {
    const { data: px, info: meta } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let on = 0
    for (let i = 3; i < px.length; i += 4) if (px[i] > 128) on++
    const ratio = on / (meta.width * meta.height)
    if (ratio < min || ratio > max) throw new Error(`${file}: coverage ${ratio.toFixed(3)} outside [${min}, ${max}]`)
}
const assertNoWhiteFringe = async (file) => {
    const { data: px } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (let o = 0; o < px.length; o += 4) {
        if (px[o + 3] > 10 && px[o] > 200 && px[o + 1] > 200 && px[o + 2] > 200) {
            throw new Error(`${file}: white pixel survived the corner mask`)
        }
    }
}
await assertOpaque(join(RES, 'tray', 'tray-activeTemplate@2x.png'), 0.2, 0.7)
await assertOpaque(join(RES, 'icons', '512x512.png'), 0.9, 1)
await assertNoWhiteFringe(join(RES, 'icon.png'))
await assertNoWhiteFringe(join(ROOT, 'src/renderer/assets/logo.png'))

console.log('icons + tray templates written')
