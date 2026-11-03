const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DISH = 'dish'
const HOT_LOG = 'hot_log'
const USER = 'user'
const FAMILY = 'family'

/** 各类行为的热度权重 */
const WEIGHT = { view: 0.2, add: 1, order: 3 }

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

/** 云函数运行在 UTC，统一转成北京时间再取日期 */
function beijingDate(ts = Date.now()) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 校验并归一化菜品入参 */
function normalizeDish(input = {}) {
  const name = String(input.name || '').trim()
  if (!name) throw new Error('请填写菜品名称')
  if (name.length > 20) throw new Error('菜品名称请控制在 20 个字以内')

  const ingredients = (Array.isArray(input.ingredients) ? input.ingredients : [])
    .map((item) => ({
      name: String((item && item.name) || '').trim(),
      amount: String((item && item.amount) || '').trim()
    }))
    .filter((item) => item.name)

  const steps = (Array.isArray(input.steps) ? input.steps : [])
    .map((item, index) => ({
      text: String((item && item.text) || '').trim(),
      image: (item && item.image) || '',
      order: index + 1
    }))
    .filter((item) => item.text)

  const tags = input.tags || {}

  return {
    name,
    categoryId: input.categoryId || '',
    cover: input.cover || '',
    images: (Array.isArray(input.images) ? input.images : []).filter(Boolean),
    desc: String(input.desc || '').trim(),
    ingredients,
    steps,
    tags: {
      type: tags.type || '其他',
      spicy: Number(tags.spicy) || 0,
      minutes: Number(tags.minutes) || 0
    }
  }
}

/** 列表只返回卡片需要的字段，避免整页传输冗余数据 */
const LIST_FIELD = {
  name: true,
  cover: true,
  categoryId: true,
  status: true,
  tags: true,
  hot: true,
  familyId: true,
  createTime: true,
  updateTime: true
}

/** 平台角色：supervip 看全部、vip 看本家庭、user 只看自己 */
function normalizeRole(user) {
  if (!user) return 'user'
  if (user.role === 'admin' || user.role === 'member') return 'vip'
  return user.role || 'user'
}

async function loadUser(openid) {
  // 少传 openid 时 .doc() 只会抛「docId必须为字符串或数字」，这里给出可读的提示
  if (!openid) throw new Error('未获取到用户身份，请重新进入小程序')
  const res = await db.collection(USER).doc(openid).get().catch(() => null)
  const user = (res && res.data) || {}
  return {
    openid,
    role: normalizeRole(user),
    familyId: user.familyId || '',
    familyRole: user.familyRole || ''
  }
}

/** 升级前的历史菜品没有 familyId，一并认作本家庭的 */
function familyCondition(familyId) {
  return _.or([
    { familyId },
    { familyId: _.in(['', null]) },
    { familyId: _.exists(false) }
  ])
}

/**
 * 可见范围查询条件。
 * 超级VIP 默认看自己家庭，传 familyId 看指定家庭，allFamilies 才看全部；
 * 普通用户只能看到自己创建的。
 */
function scopeCondition(user, options = {}) {
  if (user.role === 'supervip') {
    if (options.allFamilies) return null
    if (options.familyId) return { familyId: options.familyId }
    return user.familyId ? familyCondition(user.familyId) : null
  }
  if (user.familyId) return familyCondition(user.familyId)
  return { creatorOpenid: user.openid }
}

/** 能否编辑/删除这道菜：本人、家庭房主、超级VIP */
async function canManage(user, dish) {
  if (!dish) return false
  if (user.role === 'supervip') return true
  if (dish.creatorOpenid === user.openid) return true
  if (!user.familyId) return false
  // 没有 familyId 的是升级前的历史菜，归房主管
  if (dish.familyId && dish.familyId !== user.familyId) return false
  if (user.familyRole === 'owner') return true
  const family = await db.collection(FAMILY).doc(user.familyId).get().catch(() => null)
  return !!(family && family.data && family.data.ownerOpenid === user.openid)
}

async function actionList(data = {}, openid) {
  const user = await loadUser(openid)
  const page = Math.max(0, Number(data.page) || 0)
  const pageSize = Math.min(60, Number(data.pageSize) || 40)
  const keyword = String(data.keyword || '').trim()

  const conditions = []
  const scope = scopeCondition(user, {
    familyId: data.familyId,
    allFamilies: data.allFamilies
  })
  if (scope) conditions.push(scope)

  if (keyword) {
    conditions.push({ name: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) })
  } else if (data.categoryId === 'uncategorized') {
    conditions.push({ categoryId: _.in(['', null]) })
  } else if (data.categoryId) {
    conditions.push({ categoryId: data.categoryId })
  }
  if (data.status) conditions.push({ status: data.status })

  const where = conditions.length > 1 ? _.and(conditions) : conditions[0] || {}
  const orderField = data.sortBy === 'hot' ? 'hot.score' : 'createTime'

  const res = await db
    .collection(DISH)
    .where(where)
    .orderBy(orderField, 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .field(LIST_FIELD)
    .get()

  return { list: res.data, page, pageSize }
}

async function actionDetail(data = {}, openid) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  if (!res || !res.data) return fail('菜品不存在或已删除', 1004)

  const dish = res.data
  const user = await loadUser(openid)
  const visible =
    user.role === 'supervip' ||
    dish.creatorOpenid === openid ||
    (user.role === 'vip' && user.familyId && (!dish.familyId || dish.familyId === user.familyId))
  if (!visible) return fail('没有权限查看这道菜', 1003)

  return dish
}

async function actionCreate(data, openid) {
  const user = await loadUser(openid)
  const payload = normalizeDish(data)
  const now = Date.now()
  const doc = {
    ...payload,
    status: 'on',
    hot: { view: 0, add: 0, ordered: 0, score: 0, lastAt: now },
    creatorOpenid: openid,
    familyId: user.familyId || '',
    createTime: now,
    updateTime: now
  }
  const res = await db.collection(DISH).add({ data: doc })
  return { _id: res._id, ...doc }
}

async function actionUpdate(data = {}, openid) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const user = await loadUser(openid)
  const current = await db.collection(DISH).doc(data._id).get().catch(() => null)
  if (!current || !current.data) return fail('菜品不存在或已删除', 1004)
  if (!(await canManage(user, current.data))) return fail('没有权限修改这道菜', 1003)

  const payload = normalizeDish(data)
  await db
    .collection(DISH)
    .doc(data._id)
    .update({ data: { ...payload, updateTime: Date.now() } })
  return { _id: data._id, ...payload }
}

async function actionRemove(data = {}, openid) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const user = await loadUser(openid)
  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  const dish = res && res.data
  if (!dish) return fail('菜品不存在或已删除', 1004)
  if (!(await canManage(user, dish))) return fail('没有权限删除这道菜', 1003)

  await db.collection(DISH).doc(data._id).remove()
  const files = [dish.cover, ...(dish.images || [])].filter(
    (id) => typeof id === 'string' && id.startsWith('cloud://')
  )
  if (files.length) {
    await cloud.deleteFile({ fileList: files }).catch(() => undefined)
  }
  return { _id: data._id }
}

async function actionRemoveBatch(data = {}, openid) {
  const ids = (Array.isArray(data.ids) ? data.ids : []).filter(Boolean)
  if (!ids.length) return fail('请选择要删除的菜品', 1002)
  if (ids.length > 50) return fail('单次最多删除 50 道菜', 1002)

  const user = await loadUser(openid)
  const res = await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .get()

  const checks = await Promise.all(res.data.map((dish) => canManage(user, dish)))
  const allowed = res.data.filter((dish, index) => checks[index])
  if (!allowed.length) return fail('没有权限删除这些菜品', 1003)

  const allowedIds = allowed.map((dish) => dish._id)
  const files = []
  allowed.forEach((dish) => {
    files.push(dish.cover, ...(dish.images || []))
  })
  const cloudFiles = files.filter((id) => typeof id === 'string' && id.startsWith('cloud://'))

  await db
    .collection(DISH)
    .where({ _id: _.in(allowedIds) })
    .remove()
  if (cloudFiles.length) {
    await cloud.deleteFile({ fileList: cloudFiles }).catch(() => undefined)
  }
  return { count: allowedIds.length }
}

async function actionBatchMove(data = {}, openid) {
  const ids = (Array.isArray(data.ids) ? data.ids : []).filter(Boolean)
  if (!ids.length) return fail('请选择要移动的菜品', 1002)
  if (ids.length > 100) return fail('单次最多移动 100 道菜', 1002)

  const user = await loadUser(openid)
  const res = await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .get()
  const checks = await Promise.all(res.data.map((dish) => canManage(user, dish)))
  const allowedIds = res.data.filter((dish, index) => checks[index]).map((dish) => dish._id)
  if (!allowedIds.length) return fail('没有权限移动这些菜品', 1003)

  await db
    .collection(DISH)
    .where({ _id: _.in(allowedIds) })
    .update({ data: { categoryId: data.categoryId || '', updateTime: Date.now() } })
  return { count: allowedIds.length }
}

async function actionToggleStatus(data = {}, openid) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const user = await loadUser(openid)
  const current = await db.collection(DISH).doc(data._id).get().catch(() => null)
  if (!current || !current.data) return fail('菜品不存在或已删除', 1004)
  if (!(await canManage(user, current.data))) return fail('没有权限上下架这道菜', 1003)

  const status = data.status === 'off' ? 'off' : 'on'
  await db
    .collection(DISH)
    .doc(data._id)
    .update({ data: { status, updateTime: Date.now() } })
  return { _id: data._id, status }
}

/** 超级VIP 把别人家的菜复制一份到自己家，图片复用原文件不重复占空间 */
async function actionImport(data = {}, openid) {
  const user = await loadUser(openid)
  if (user.role !== 'supervip') return fail('只有超级VIP 可以跨家庭导入菜品', 1003)
  if (!data._id) return fail('缺少菜品 ID', 1002)

  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  const src = res && res.data
  if (!src) return fail('菜品不存在或已删除', 1004)
  if (src.familyId && src.familyId === user.familyId) return fail('这道菜已经在你的家庭菜单里了', 1003)

  const now = Date.now()
  const doc = {
    name: src.name,
    categoryId: '',
    cover: src.cover || '',
    images: src.images || [],
    desc: src.desc || '',
    ingredients: src.ingredients || [],
    steps: src.steps || [],
    tags: src.tags || { type: '其他', spicy: 0, minutes: 0 },
    status: 'on',
    hot: { view: 0, add: 0, ordered: 0, score: 0, lastAt: now },
    creatorOpenid: openid,
    familyId: user.familyId || '',
    originDishId: src._id,
    createTime: now,
    updateTime: now
  }
  const addRes = await db.collection(DISH).add({ data: doc })
  return { _id: addRes._id, name: doc.name }
}

/** 记录一次热度行为：view / add / order */
async function actionTrack(data, openid) {
  const action = data.action
  const weight = WEIGHT[action]
  if (!weight) return fail('未知的热度行为', 1002)
  if (!data._id) return fail('缺少菜品 ID', 1002)

  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  if (!res || !res.data) return fail('菜品不存在或已删除', 1004)

  const now = Date.now()
  await db.collection(HOT_LOG).add({
    data: {
      dishId: data._id,
      openid,
      action,
      weight,
      date: beijingDate(now),
      createTime: now
    }
  })

  const counterKey =
    action === 'view' ? 'hot.view' : action === 'add' ? 'hot.add' : 'hot.ordered'

  await db
    .collection(DISH)
    .doc(data._id)
    .update({
      data: {
        [counterKey]: _.inc(1),
        'hot.score': _.inc(weight),
        'hot.lastAt': now
      }
    })

  return { weight }
}

const ACTIONS = {
  list: actionList,
  detail: actionDetail,
  create: actionCreate,
  update: actionUpdate,
  remove: actionRemove,
  removeBatch: actionRemoveBatch,
  batchMove: actionBatchMove,
  toggleStatus: actionToggleStatus,
  track: actionTrack,
  import: actionImport
}

exports.main = async (event = {}) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    const result = await handler(data, OPENID)
    // handler 内部已经返回 { code, msg } 形式的，直接透传
    if (result && typeof result.code === 'number' && 'msg' in result && result.data === undefined) {
      return result
    }
    return ok(result)
  } catch (err) {
    console.error(`[dish:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
