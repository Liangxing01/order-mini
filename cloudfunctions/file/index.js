const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/** 单次 getTempFileURL 最多 50 个 */
const MAX_BATCH = 50

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

/**
 * 批量把 cloud:// fileID 换成 https 临时链接。
 *
 * 云函数跑在管理端，不受云存储安全规则（「仅创建者可读写」）的限制。
 * 免费套餐改不了存储权限时，客户端直接 getTempFileURL 别人的图会被拒绝，
 * 由这里兜底换取链接，家人和体验者才能正常看到图片。
 */
async function actionTempUrls(data = {}) {
  const raw = Array.isArray(data.fileList) ? data.fileList : []
  const fileList = [
    ...new Set(raw.filter((id) => typeof id === 'string' && id.startsWith('cloud://')))
  ].slice(0, MAX_BATCH)
  if (!fileList.length) return { list: [] }

  const res = await cloud.getTempFileURL({ fileList })
  const list = (res.fileList || []).map((file) => ({
    fileID: file.fileID,
    tempFileURL: file.tempFileURL || '',
    status: file.status
  }))
  return { list }
}

const ACTIONS = {
  tempUrls: actionTempUrls
}

exports.main = async (event = {}) => {
  const { action, data = {} } = event
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    return ok(await handler(data))
  } catch (err) {
    console.error(`[file:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
