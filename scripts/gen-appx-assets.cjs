#!/usr/bin/env node
// Generates the Microsoft Store (MSIX/APPX) logos in build/appx/ from public/icon.png.
// electron-builder copies every file in build/appx/ into the package's assets\ and,
// when there are scale/targetsize variants, builds resources.pri so Windows picks
// the right one. Without these files it ships its own sample logos.
//
//   node scripts/gen-appx-assets.cjs
//
// Run it whenever public/icon.png changes and commit build/appx/.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const SRC = path.join(__dirname, '..', 'public', 'icon.png')
const OUT = path.join(__dirname, '..', 'build', 'appx')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

// [file name, width, height, icon size as a share of the shorter side]
// Tiles keep some margin (Windows' own apps do); small logos use the full square.
const BASE = [
  ['StoreLogo', 50, 50, 1],
  ['Square44x44Logo', 44, 44, 1],
  ['SmallTile', 71, 71, 0.8],
  ['Square150x150Logo', 150, 150, 0.66],
  ['Wide310x150Logo', 310, 150, 0.66],
  ['LargeTile', 310, 310, 0.6],
]
const SCALES = [100, 200]
// Taskbar, Start list and Explorer: unplated variants at fixed pixel sizes.
const TARGET_SIZES = [16, 24, 32, 48, 256]

async function render(file, width, height, share) {
  const side = Math.round(Math.min(width, height) * share)
  const icon = await sharp(SRC).resize(side, side, { fit: 'contain', kernel: 'lanczos3', background: TRANSPARENT }).png().toBuffer()
  await sharp({ create: { width, height, channels: 4, background: TRANSPARENT } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, file))
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source icon not found: ${SRC}`)
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })

  const written = []
  for (const [name, w, h, share] of BASE) {
    // Only qualified files: the manifest names `assets\<name>.png` and Windows
    // resolves it to the right scale through resources.pri. An unqualified copy
    // next to scale-100 would be a duplicate candidate for makepri.
    for (const scale of SCALES) {
      const file = `${name}.scale-${scale}.png`
      await render(file, Math.round((w * scale) / 100), Math.round((h * scale) / 100), share)
      written.push(file)
    }
  }
  for (const size of TARGET_SIZES) {
    for (const suffix of ['', '_altform-unplated']) {
      const file = `Square44x44Logo.targetsize-${size}${suffix}.png`
      await render(file, size, size, 1)
      written.push(file)
    }
  }
  console.log(`Wrote ${written.length} files to ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
