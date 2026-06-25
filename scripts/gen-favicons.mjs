/**
 * Favicon generator — rasterizes public/SVG/icon.svg into the full favicon set.
 *
 * To brand a site: drop your COMPACT brand mark (a square-ish SVG — an icon, not
 * a wide wordmark) at public/SVG/icon.svg, then run:
 *   node scripts/gen-favicons.mjs
 *
 * Outputs (in public/), all referenced by src/head/Favicons.astro:
 *   favicon.svg                 vector, padded square, transparent
 *   favicon.ico                 16/32/48 multi-res (PNG-encoded entries)
 *   favicon-16x16/32x32/48x48   transparent PNGs
 *   apple-touch-icon.png        180x180, white bg (iOS dislikes transparency)
 *   icon-192.png / icon-512.png PWA "any" icons, transparent
 *   icon-192-maskable.png       PWA maskable, white bg + ~20% safe-zone padding
 *   icon-512-maskable.png
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// sharp is a transitive (pnpm) dep — resolve whatever version is in the store
// (don't hard-code the version; it drifts between projects).
const pnpmDir = join(root, 'node_modules/.pnpm')
const sharpEntry = readdirSync(pnpmDir).find(d => /^sharp@/.test(d))
if (!sharpEntry) throw new Error('sharp not found in node_modules/.pnpm — run pnpm install')
const { default: sharp } = await import(join(pnpmDir, sharpEntry, 'node_modules/sharp/lib/index.js'))

const pub = join(root, 'public')
const BG = '#ffffff' // apple-touch + maskable background

// Source art may be non-square. We nest it inside a square parent <svg>; the
// inner viewBox + preserveAspectRatio="meet" centers it inside the padded box.
const raw = readFileSync(join(pub, 'SVG', 'icon.svg'), 'utf8')
const inner = raw.replace(/^<\?xml[^>]*\?>\s*/, '').trim()

/** Wrap the art in a 512² canvas. pad = inset on every side. */
function square({ pad, bg }) {
  const box = 512 - pad * 2
  const placed = inner.replace(
    /<svg\b/,
    `<svg x="${pad}" y="${pad}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"`,
  )
  const rect = bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${rect}${placed}</svg>`,
  )
}

const transparentSrc = square({ pad: 44, bg: null })
const appleSrc = square({ pad: 40, bg: BG })
const maskableSrc = square({ pad: 104, bg: BG }) // ~20% safe-zone padding

const png = (src, size) =>
  sharp(src, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer()

// 1) Vector favicon — padded square, transparent (scales to any size).
writeFileSync(join(pub, 'favicon.svg'), transparentSrc)

// 2) PNG raster set.
const jobs = [
  ['favicon-16x16.png', transparentSrc, 16],
  ['favicon-32x32.png', transparentSrc, 32],
  ['favicon-48x48.png', transparentSrc, 48],
  ['apple-touch-icon.png', appleSrc, 180],
  ['icon-192.png', transparentSrc, 192],
  ['icon-512.png', transparentSrc, 512],
  ['icon-192-maskable.png', maskableSrc, 192],
  ['icon-512-maskable.png', maskableSrc, 512],
]
for (const [name, src, size] of jobs) {
  writeFileSync(join(pub, name), await png(src, size))
  console.log('✓', name, `${size}×${size}`)
}

// 3) favicon.ico — pack 16/32/48 PNGs into an ICO container (PNG entries are
//    valid ICO content, supported by every modern browser + Windows).
const icoSizes = [16, 32, 48]
const icoPngs = await Promise.all(icoSizes.map(s => png(transparentSrc, s)))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(icoSizes.length, 4) // count
const entries = []
let offset = 6 + 16 * icoSizes.length
icoSizes.forEach((s, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(s === 256 ? 0 : s, 0) // width
  e.writeUInt8(s === 256 ? 0 : s, 1) // height
  e.writeUInt8(0, 2) // palette
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // color planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(icoPngs[i].length, 8) // size of image data
  e.writeUInt32LE(offset, 12) // offset
  offset += icoPngs[i].length
  entries.push(e)
})
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([header, ...entries, ...icoPngs]))
console.log('✓ favicon.ico', icoSizes.join('/'))
console.log('done')
