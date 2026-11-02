/** 轻提示 */
export function toast(title, icon = 'none', duration = 1800) {
  if (!title) return
  uni.showToast({ title: String(title), icon, duration, mask: false })
}

export function toastOk(title = '操作成功') {
  uni.showToast({ title, icon: 'success', duration: 1500 })
}

/** 确认弹窗，返回 boolean */
export function confirm(content, title = '提示', confirmText = '确定') {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText,
      confirmColor: '#E9B93B',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })
}

/** 带遮罩的加载 */
export function showLoading(title = '加载中') {
  uni.showLoading({ title, mask: true })
}

export function hideLoading() {
  uni.hideLoading()
}

/** 云数据库集合不存在的错误特征（-502005） */
const COLLECTION_MISSING = /-502005|DATABASE_COLLECTION_NOT_EXIST|collection not exists|ResourceNotFound/i

/** 统一错误提示：优先取云函数返回的 msg；建库前的原始报错换成中文引导 */
export function toastError(err, fallback = '操作失败') {
  const raw = (err && (err.msg || err.message)) || fallback
  const msg = COLLECTION_MISSING.test(raw)
    ? '数据库还没初始化，请到「我」页点「初始化数据库」'
    : raw
  toast(msg, 'none', COLLECTION_MISSING.test(raw) ? 3000 : 1800)
  // 开发期打印完整信息，方便定位云函数问题
  console.error('[request error]', err)
}

/** 表单校验：空值判断 */
export function isBlank(val) {
  return typeof val !== 'string' || !val.trim()
}

/** 轻微震动反馈，真机有效，开发者工具或不支持时静默 */
export function tapFeedback() {
  try {
    if (uni.vibrateShort) uni.vibrateShort({ type: 'light' })
  } catch (err) {
    /* 震动失败不影响主流程 */
  }
}

/** 节流，用于快速点击的加购面板 */
export function throttle(fn, wait = 300) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last < wait) return
    last = now
    return fn.apply(this, args)
  }
}
