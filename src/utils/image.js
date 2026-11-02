import { initCloud } from '@/api/cloud'

/**
 * 云存储图片处理。
 *
 * 小程序 image 组件只认「纯 cloud:// fileID」：一旦后面挂上 ?imageView2 参数，
 * 就会被当成相对路径去请求（渲染层网络层直接报 Failed to load image）。
 * 所以缩略图必须基于 getTempFileURL 换来的 https 临时链接再拼参数，
 * 原图的 fileID 反而可以直连，用作最后的兜底。
 */

/** 常用宽度（px），按展示尺寸取最接近的一档，够清晰又省流量 */
export const IMG_SIZE = {
  avatar: 160,
  thumb: 200,
  card: 240,
  cover: 480,
  full: 750
}

/** 临时链接默认 2 小时有效，缓存 1 小时后重新换取 */
const CACHE_TTL = 60 * 60 * 1000
const MAX_BATCH = 50

const urlCache = new Map()
const pending = new Map()
let queue = []
let flushTimer = null

export function isCloudFile(src) {
  return typeof src === 'string' && src.indexOf('cloud://') === 0
}

function isHttpUrl(src) {
  return typeof src === 'string' && /^https?:\/\//.test(src)
}

/**
 * 生成缩略图地址。
 * 只对 http(s) 链接生效——本地 static 路径和 cloud:// fileID 都不能拼参数。
 * @param {string} src 临时链接
 * @param {number|string} width 目标宽度（px），也接受 IMG_SIZE 的键名，传 0 表示用原图
 */
export function withThumb(src, width) {
  if (!src || !isHttpUrl(src)) return src
  const size = typeof width === 'string' ? IMG_SIZE[width] : width
  if (!size) return src
  const sep = src.indexOf('?') === -1 ? '?' : '&'
  return `${src}${sep}imageView2/2/w/${Math.round(size)}`
}

/** 同一帧内收集到的 fileID 合并成一次 getTempFileURL */
function flush() {
  flushTimer = null
  const items = queue.splice(0, MAX_BATCH)
  if (!items.length) return

  wx.cloud
    .getTempFileURL({ fileList: items.map((item) => item.fileID) })
    .then((res) => {
      const map = {}
      ;(res.fileList || []).forEach((file) => {
        map[file.fileID] = file
      })
      items.forEach((item) => {
        const hit = map[item.fileID]
        pending.delete(item.fileID)
        if (hit && hit.status === 0 && hit.tempFileURL) {
          urlCache.set(item.fileID, { url: hit.tempFileURL, expire: Date.now() + CACHE_TTL })
          item.resolve(hit.tempFileURL)
        } else {
          item.reject(new Error((hit && hit.errMsg) || '获取图片链接失败'))
        }
      })
    })
    .catch((err) => {
      items.forEach((item) => {
        pending.delete(item.fileID)
        item.reject(err)
      })
    })

  if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 0)
}

/**
 * fileID → https 临时链接（带内存缓存与批量合并）。
 * 非云文件原样返回；换不到链接时 reject，由调用方退回 fileID 直连。
 */
export function resolveImageUrl(fileID) {
  if (!isCloudFile(fileID)) return Promise.resolve(fileID)
  if (!initCloud()) return Promise.resolve(fileID)

  const cached = urlCache.get(fileID)
  if (cached && cached.expire > Date.now()) return Promise.resolve(cached.url)

  const waiting = pending.get(fileID)
  if (waiting) return waiting

  const task = new Promise((resolve, reject) => {
    queue.push({ fileID, resolve, reject })
    if (!flushTimer) flushTimer = setTimeout(flush, 0)
  })
  pending.set(fileID, task)
  return task
}
