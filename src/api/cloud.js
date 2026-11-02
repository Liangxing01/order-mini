import { CLOUD_ENV } from '@/config'

let inited = false

/** 云函数返回的业务错误 */
export class CloudError extends Error {
  constructor({ code, msg }) {
    super(msg || '请求失败')
    this.code = code
    this.msg = msg || '请求失败'
  }
}

/** 初始化云开发，必须在任何云能力调用之前执行 */
export function initCloud() {
  if (inited) return true
  // #ifdef MP-WEIXIN
  if (!wx.cloud) {
    console.error('[cloud] 请使用 2.2.3 或以上基础库以使用云能力')
    return false
  }
  const options = { traceUser: true }
  if (CLOUD_ENV) options.env = CLOUD_ENV
  wx.cloud.init(options)
  inited = true
  return true
  // #endif
  // #ifndef MP-WEIXIN
  return false
  // #endif
}

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {string} action 业务动作
 * @param {object} data 业务参数
 */
export async function call(name, action = '', data = {}) {
  // #ifdef MP-WEIXIN
  if (!initCloud()) throw new CloudError({ code: -1, msg: '当前环境不支持云开发' })
  let res
  try {
    res = await wx.cloud.callFunction({ name, data: { action, data } })
  } catch (err) {
    throw new CloudError({ code: -2, msg: err.errMsg || '网络异常，请检查云函数是否已部署' })
  }
  const result = res.result || {}
  if (result.code !== 0) throw new CloudError(result)
  return result.data
  // #endif
  // #ifndef MP-WEIXIN
  throw new CloudError({ code: -1, msg: '请在微信小程序端使用' })
  // #endif
}

/**
 * 上传图片到云存储
 * @param {string} filePath 本地临时路径
 * @param {string} dir 云存储目录
 * @returns {Promise<string>} fileID
 */
export async function uploadImage(filePath, dir = 'dish') {
  // #ifdef MP-WEIXIN
  if (!initCloud()) throw new CloudError({ code: -1, msg: '当前环境不支持云开发' })
  const matched = /\.([a-zA-Z0-9]+)$/.exec(filePath)
  const ext = matched ? matched[1] : 'png'
  const random = Math.random().toString(36).slice(2, 8)
  const cloudPath = `${dir}/${Date.now()}-${random}.${ext}`
  const res = await wx.cloud.uploadFile({ cloudPath, filePath })
  return res.fileID
  // #endif
  // #ifndef MP-WEIXIN
  throw new CloudError({ code: -1, msg: '请在微信小程序端使用' })
  // #endif
}

/**
 * 删除云存储文件，失败静默处理（不影响主流程）
 */
export function removeCloudFiles(fileList = []) {
  // #ifdef MP-WEIXIN
  const ids = fileList.filter((id) => typeof id === 'string' && id.startsWith('cloud://'))
  if (!ids.length || !initCloud()) return Promise.resolve()
  return wx.cloud.deleteFile({ fileList: ids }).catch(() => undefined)
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.resolve()
  // #endif
}
