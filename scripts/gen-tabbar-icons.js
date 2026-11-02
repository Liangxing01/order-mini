/**
 * 生成 tabBar 图标（81x81 PNG）
 * 纯 Node 渲染 SDF 图形并手写 PNG 编码，无需任何图像库依赖。
 * 用法：node scripts/gen-tabbar-icons.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 81
const OUT_DIR = path.resolve(__dirname, '../src/static/tabbar')

/* ---------------- PNG 编码 ---------------- */
let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------- SDF 图元（坐标系 0~1，y 向下） ---------------- */
const clamp01 = (v) => Math.min(1, Math.max(0, v))

function seg(px, py, ax, ay, bx, by) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const denom = bax * bax + bay * bay || 1e-6
  const h = clamp01((pax * bax + pay * bay) / denom)
  return Math.hypot(pax - bax * h, pay - bay * h)
}

const capsule = (px, py, a, b, r) => seg(px, py, a[0], a[1], b[0], b[1]) - r
const circle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r
function box(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const union = (...list) => Math.min(...list)
const ring = (d, t) => Math.abs(d) - t

/* ---------------- 四个图标 ---------------- */
const STROKE = 0.042

/** 点菜：饭碗 + 筷子 */
function sdfOrder(px, py) {
  const rimY = 0.62
  // 只保留碗口以下的弧，形成一个 U 形碗身
  const bowl = py >= rimY ? ring(circle(px, py, 0.5, rimY, 0.29), STROKE) : 1
  const rim = ring(capsule(px, py, [0.20, rimY], [0.80, rimY], 0.028), STROKE)
  const stickA = ring(capsule(px, py, [0.34, 0.18], [0.48, 0.50], 0.022), STROKE)
  const stickB = ring(capsule(px, py, [0.56, 0.16], [0.70, 0.48], 0.022), STROKE)
  return union(bowl, rim, stickA, stickB)
}

/** 食记：时钟 */
function sdfRecord(px, py) {
  const dial = ring(circle(px, py, 0.5, 0.5, 0.34), STROKE)
  const hour = capsule(px, py, [0.5, 0.5], [0.5, 0.28], 0.032)
  const minute = capsule(px, py, [0.5, 0.5], [0.66, 0.57], 0.032)
  const dot = circle(px, py, 0.5, 0.5, 0.036)
  return union(dial, hour, minute, dot)
}

/** 厨房：厨师帽 */
function sdfKitchen(px, py) {
  const hat = union(
    circle(px, py, 0.31, 0.44, 0.145),
    circle(px, py, 0.5, 0.35, 0.165),
    circle(px, py, 0.69, 0.44, 0.145),
    box(px, py, 0.5, 0.72, 0.245, 0.13, 0.05)
  )
  return ring(hat, STROKE)
}

/** 我：人像 */
function sdfMine(px, py) {
  const head = ring(circle(px, py, 0.5, 0.33, 0.155), STROKE)
  const body = ring(circle(px, py, 0.5, 0.97, 0.33), STROKE)
  // 只保留肩膀以上那一段弧
  const clipped = py > 0.86 ? 1 : body
  return union(head, clipped)
}

const ICONS = [
  { name: 'order', sdf: sdfOrder },
  { name: 'record', sdf: sdfRecord },
  { name: 'kitchen', sdf: sdfKitchen },
  { name: 'mine', sdf: sdfMine }
]

const COLORS = {
  normal: [185, 180, 168],
  active: [233, 185, 59]
}

function render(sdf, color) {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = (x + 0.5) / SIZE
      const py = (y + 0.5) / SIZE
      const d = sdf(px, py)
      const alpha = clamp01(0.5 - d * SIZE)
      const i = (y * SIZE + x) * 4
      buf[i] = color[0]
      buf[i + 1] = color[1]
      buf[i + 2] = color[2]
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return buf
}

fs.mkdirSync(OUT_DIR, { recursive: true })

ICONS.forEach((icon) => {
  const normal = encodePNG(SIZE, SIZE, render(icon.sdf, COLORS.normal))
  const active = encodePNG(SIZE, SIZE, render(icon.sdf, COLORS.active))
  fs.writeFileSync(path.join(OUT_DIR, `${icon.name}.png`), normal)
  fs.writeFileSync(path.join(OUT_DIR, `${icon.name}-on.png`), active)
  console.log(`generated ${icon.name}.png / ${icon.name}-on.png`)
})

console.log(`done -> ${OUT_DIR}`)
