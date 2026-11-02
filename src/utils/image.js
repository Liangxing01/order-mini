import { initCloud, call } from '@/api/cloud'
import { FN } from '@/config'

/**
 * 云存储图片处理。
 *
 * 小程序 image 组件只认「纯 cloud:// fileID」：一旦后面挂上 ?imageView2 参数，
 * 就会被当成相对路径去请求（渲染层网络层直接报 Failed to load image）。
 * 所以缩略图必须基于 getTempFileURL 换来的 https 临时链接再拼参数，
 * 原图的 fileID 反而可以直连，用作最后的兜底。
 *
 * 取链接分两步：先走客户端（自己的图最快），拿不到再走 file 云函数。
 * 云函数是管理端权限，绕得开云存储「仅创建者可读写」的限制——
 * 否则家人 / 体验者永远看不到别人上传的菜图。
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

/** 客户端直接换：上传者本人最快，但「仅创建者可读写」下别人的图会被拒 */
function localTempUrls(fileList) {
  return wx.cloud.getTempFileURL({ fileList }).then((res) => {
    const map = {}
    ;(res.fileList || []).forEach((file) => {
      if (file.status === 0 && file.tempFileURL) map[file.fileID] = file.tempFileURL
    })
    return map
  })
}

/** 云函数兜底：管理端权限，任何登录用户都能取到链接 */
async function remoteTempUrls(fileList) {
  const map = {}
  for (let i = 0; i < fileList.length; i += MAX_BATCH) {
    const chunk = fileList.slice(i, i + MAX_BATCH)
    const res = await call(FN.file, 'tempUrls', { fileList: chunk })
    ;((res && res.list) || []).forEach((file) => {
      if (file.tempFileURL) map[file.fileID] = file.tempFileURL
    })
  }
  return map
}

/** 同一帧内收集到的 fileID 合并成一次请求 */
async function flush() {
  flushTimer = null
  const items = queue.splice(0, MAX_BATCH)
  if (!items.length) return

  const fileList = items.map((item) => item.fileID)
  let map = {}
  try {
    map = await localTempUrls(fileList)
  } catch (err) {
    map = {}
  }

  const missing = fileList.filter((id) => !map[id])
  if (missing.length) {
    try {
      Object.assign(map, await remoteTempUrls(missing))
    } catch (err) {
      // 云函数也失败时按失败处理，调用方退回 fileID 直连
    }
  }

  items.forEach((item) => {
    pending.delete(item.fileID)
    const url = map[item.fileID]
    if (url) {
      urlCache.set(item.fileID, { url, expire: Date.now() + CACHE_TTL })
      item.resolve(url)
    } else {
      item.reject(new Error('获取图片链接失败'))
    }
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
