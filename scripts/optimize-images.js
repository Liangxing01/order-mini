/**
 * 把设计稿里用到的大图压到小程序可接受的体积：
 * 解码 PNG -> 面积平均缩放 -> 重新编码为 8bit RGB PNG。
 * 用法：node scripts/optimize-images.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const STATIC_DIR = path.resolve(__dirname, '../src/static')

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

function encodePNG(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------- PNG 解码 ---------------- */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function decodePNG(file) {
  const buf = fs.readFileSync(file)
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  let interlace = 0
  const idat = []

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }

  if (bitDepth !== 8) throw new Error(`仅支持 8bit，当前 ${bitDepth}`)
  if (interlace !== 0) throw new Error('不支持交错 PNG')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  let p = 0

  for (let y = 0; y < height; y += 1) {
    const filter = raw[p]
    p += 1
    const rowStart = y * stride
    for (let x = 0; x < stride; x += 1) {
      const cur = raw[p + x]
      const a = x >= channels ? out[rowStart + x - channels] : 0
      const b = y > 0 ? out[rowStart + x - stride] : 0
      const c = x >= channels && y > 0 ? out[rowStart + x - channels - stride] : 0
      let val
      if (filter === 0) val = cur
      else if (filter === 1) val = cur + a
      else if (filter === 2) val = cur + b
      else if (filter === 3) val = cur + ((a + b) >> 1)
      else if (filter === 4) val = cur + paeth(a, b, c)
      else throw new Error(`未知的 filter ${filter}`)
      out[rowStart + x] = val & 0xff
    }
    p += stride
  }

  return { width, height, channels, data: out }
}

/* ---------------- 缩放 ---------------- */
function resizeArea(img, targetWidth) {
  const scale = targetWidth / img.width
  const targetHeight = Math.round(img.height * scale)
  const { width, height, channels, data } = img
  const out = Buffer.alloc(targetWidth * targetHeight * 3)

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = Math.floor(y / scale)
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) / scale)))
    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = Math.floor(x / scale)
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) / scale)))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * width + xx) * channels
          r += data[i]
          g += channels >= 3 ? data[i + 1] : data[i]
          b += channels >= 3 ? data[i + 2] : data[i]
          n += 1
        }
      }
      const o = (y * targetWidth + x) * 3
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
    }
  }

  return { width: targetWidth, height: targetHeight, data: out }
}

/* ---------------- 执行 ---------------- */
const JOBS = [
  { file: 'hero-bg.png', width: 750 },
  { file: 'chef-avatar.png', width: 240 }
]

JOBS.forEach((job) => {
  const source = path.join(STATIC_DIR, job.file)
  if (!fs.existsSync(source)) {
    console.log(`[skip] ${job.file} 不存在`)
    return
  }
  const before = fs.statSync(source).size
  const img = decodePNG(source)
  const resized = resizeArea(img, job.width)
  const png = encodePNG(resized.width, resized.height, resized.data)
  fs.writeFileSync(source, png)

  const kb = (n) => `${Math.round(n / 1024)}KB`
  console.log(
    `${job.file}: ${img.width}x${img.height} ${kb(before)} -> ${resized.width}x${resized.height} ${kb(png.length)}`
  )
})
