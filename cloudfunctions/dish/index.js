const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DISH = 'dish'
const HOT_LOG = 'hot_log'

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
  createTime: true,
  updateTime: true
}

async function actionList(data = {}) {
  const page = Math.max(0, Number(data.page) || 0)
  const pageSize = Math.min(60, Number(data.pageSize) || 40)
  const keyword = String(data.keyword || '').trim()

  const where = {}
  if (keyword) {
    where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  } else if (data.categoryId === 'uncategorized') {
    where.categoryId = _.in(['', null])
  } else if (data.categoryId) {
    where.categoryId = data.categoryId
  }
  if (data.status) where.status = data.status

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

async function actionDetail(data = {}) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  if (!res || !res.data) return fail('菜品不存在或已删除', 1004)
  return res.data
}

async function actionCreate(data, openid) {
  const payload = normalizeDish(data)
  const now = Date.now()
  const doc = {
    ...payload,
    status: 'on',
    hot: { view: 0, add: 0, ordered: 0, score: 0, lastAt: now },
    creatorOpenid: openid,
    createTime: now,
    updateTime: now
  }
  const res = await db.collection(DISH).add({ data: doc })
  return { _id: res._id, ...doc }
}

async function actionUpdate(data = {}) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const payload = normalizeDish(data)
  await db
    .collection(DISH)
    .doc(data._id)
    .update({ data: { ...payload, updateTime: Date.now() } })
  return { _id: data._id, ...payload }
}

async function actionRemove(data = {}) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const res = await db.collection(DISH).doc(data._id).get().catch(() => null)
  const dish = res && res.data
  await db.collection(DISH).doc(data._id).remove()
  if (dish) {
    const files = [dish.cover, ...(dish.images || [])].filter(
      (id) => typeof id === 'string' && id.startsWith('cloud://')
    )
    if (files.length) {
      await cloud.deleteFile({ fileList: files }).catch(() => undefined)
    }
  }
  return { _id: data._id }
}

async function actionRemoveBatch(data = {}) {
  const ids = (Array.isArray(data.ids) ? data.ids : []).filter(Boolean)
  if (!ids.length) return fail('请选择要删除的菜品', 1002)
  if (ids.length > 50) return fail('单次最多删除 50 道菜', 1002)

  const res = await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .get()
  const files = []
  res.data.forEach((dish) => {
    files.push(dish.cover, ...(dish.images || []))
  })
  const cloudFiles = files.filter((id) => typeof id === 'string' && id.startsWith('cloud://'))

  await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .remove()
  if (cloudFiles.length) {
    await cloud.deleteFile({ fileList: cloudFiles }).catch(() => undefined)
  }
  return { count: ids.length }
}

async function actionBatchMove(data = {}) {
  const ids = (Array.isArray(data.ids) ? data.ids : []).filter(Boolean)
  if (!ids.length) return fail('请选择要移动的菜品', 1002)
  if (ids.length > 100) return fail('单次最多移动 100 道菜', 1002)

  await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .update({ data: { categoryId: data.categoryId || '', updateTime: Date.now() } })
  return { count: ids.length }
}

async function actionToggleStatus(data = {}) {
  if (!data._id) return fail('缺少菜品 ID', 1002)
  const status = data.status === 'off' ? 'off' : 'on'
  await db
    .collection(DISH)
    .doc(data._id)
    .update({ data: { status, updateTime: Date.now() } })
  return { _id: data._id, status }
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
  track: actionTrack
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
