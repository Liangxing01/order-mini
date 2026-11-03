const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const DISH = 'dish'
const HOT_LOG = 'hot_log'
const USER = 'user'

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

function beijingDate(ts = Date.now()) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

const DISH_FIELD = {
  name: true,
  cover: true,
  categoryId: true,
  tags: true,
  hot: true
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
    familyId: user.familyId || ''
  }
}

function scopeCondition(user) {
  if (user.familyId) {
    return _.or([
      { familyId: user.familyId },
      { familyId: _.in(['', null]) },
      { familyId: _.exists(false) }
    ])
  }
  // 超级VIP 尚未建家庭时看全局榜
  if (user.role === 'supervip') return null
  return { creatorOpenid: user.openid }
}

function combine(conditions) {
  const list = conditions.filter(Boolean)
  return list.length > 1 ? _.and(list) : list[0] || {}
}

/**
 * 热度榜
 * range: week(近 7 天) / month(近 30 天) / all(累计)
 * 只统计当前用户看得到的菜品
 */
async function actionHot(data = {}, openid) {
  const user = await loadUser(openid)
  const scope = scopeCondition(user)
  const range = ['week', 'month', 'all'].includes(data.range) ? data.range : 'week'
  const limit = Math.min(50, Math.max(1, Number(data.limit) || 20))

  // 累计榜直接读 dish 上冗余的 hot.score，一次查询即可
  if (range === 'all') {
    const res = await db
      .collection(DISH)
      .where(scope || {})
      .orderBy('hot.score', 'desc')
      .limit(limit)
      .field(DISH_FIELD)
      .get()

    const list = res.data
      .map((dish) => ({
        dish,
        score: Number(dish.hot && dish.hot.score) || 0,
        count: Number(dish.hot && dish.hot.ordered) || 0
      }))
      .filter((row) => row.score > 0)

    return { range, list }
  }

  const days = range === 'week' ? 7 : 30
  const start = beijingDate(Date.now() - (days - 1) * 86400000)

  const agg = await db
    .collection(HOT_LOG)
    .aggregate()
    .match({ date: _.gte(start) })
    .group({
      _id: '$dishId',
      score: $.sum('$weight'),
      actions: $.sum(1)
    })
    .sort({ score: -1 })
    .limit(limit)
    .end()

  const rows = (agg.list || []).filter((row) => row._id)
  if (!rows.length) return { range, list: [], start }

  const ids = rows.map((row) => row._id)
  const dishRes = await db
    .collection(DISH)
    .where(combine([{ _id: _.in(ids) }, scope]))
    .field(DISH_FIELD)
    .get()

  const dishMap = {}
  dishRes.data.forEach((dish) => {
    dishMap[dish._id] = dish
  })

  const list = rows
    .map((row) => ({
      dish: dishMap[row._id],
      score: Math.round((Number(row.score) || 0) * 10) / 10,
      count: Number(row.actions) || 0
    }))
    .filter((row) => !!row.dish)

  return { range, list, start }
}

const ACTIONS = {
  hot: actionHot
}

exports.main = async (event = {}) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    const result = await handler(data, OPENID)
    if (result && typeof result.code === 'number' && 'msg' in result && result.data === undefined) {
      return result
    }
    return ok(result)
  } catch (err) {
    console.error(`[rank:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
