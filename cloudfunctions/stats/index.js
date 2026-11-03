const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const DISH = 'dish'
const CATEGORY = 'category'
const USER = 'user'
const ORDER = 'order'
const HOT_LOG = 'hot_log'

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

/** "300g" / "2 个" -> { value, unit } */
function parseAmount(str) {
  const matched = /^([\d.]+)\s*(.*)$/.exec(String(str || '').trim())
  if (!matched) return null
  const value = parseFloat(matched[1])
  if (Number.isNaN(value)) return null
  return { value, unit: matched[2] || '' }
}

/** 同单位则求和，否则原样罗列 */
function mergeAmounts(amounts = []) {
  const valid = amounts.filter(Boolean)
  if (!valid.length) return ''
  const parsed = valid.map(parseAmount)
  if (parsed.some((item) => !item)) return valid.join(' + ')

  const unit = parsed[0].unit
  if (parsed.every((item) => item.unit === unit)) {
    const total = parsed.reduce((sum, item) => sum + item.value, 0)
    return `${Math.round(total * 100) / 100}${unit}`
  }
  return valid.join(' + ')
}

function groupByDate(list, key) {
  const map = new Map()
  list.forEach((item) => {
    const k = item[key] === '' || item[key] === null || item[key] === undefined ? '' : item[key]
    map.set(k, (map.get(k) || 0) + 1)
  })
  return map
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

/** 菜品 / 分类可见范围（超级VIP 有家庭时也只看自己家） */
function scopeCondition(user) {
  if (user.familyId) {
    return _.or([
      { familyId: user.familyId },
      { familyId: _.in(['', null]) },
      { familyId: _.exists(false) }
    ])
  }
  if (user.role === 'supervip') return null
  return { creatorOpenid: user.openid }
}

/** 订单可见范围 */
function orderScopeCondition(user) {
  if (user.familyId) {
    return _.or([
      { familyId: user.familyId },
      { familyId: _.in(['', null]) },
      { familyId: _.exists(false) }
    ])
  }
  if (user.role === 'supervip') return null
  return { creatorOpenid: user.openid }
}

function combine(conditions) {
  const list = conditions.filter(Boolean)
  return list.length > 1 ? _.and(list) : list[0] || {}
}

/** 厨房总览：菜品分布、本周热菜、最新上传、成员数 */
async function actionOverview(data = {}, openid) {
  const user = await loadUser(openid)
  const dishScope = scopeCondition(user)
  const orderScope = orderScopeCondition(user)
  const weekStart = beijingDate(Date.now() - 6 * 86400000)
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [dishCount, categoryList, memberCount, monthOrderCount, dishRows, recent, topAgg] =
    await Promise.all([
      db.collection(DISH).where(dishScope || {}).count(),
      db
        .collection(CATEGORY)
        .where(dishScope || {})
        .orderBy('sort', 'asc')
        .limit(100)
        .get(),
      user.familyId
        ? db.collection(USER).where({ familyId: user.familyId }).count()
        : Promise.resolve({ total: 1 }),
      db
        .collection(ORDER)
        .where(
          combine([
            orderScope,
            { date: _.gte(monthStart), status: _.in(['pending', 'finished']) }
          ])
        )
        .count(),
      // 分类分布：按当前可见范围取分类字段，本地汇总
      db.collection(DISH).where(dishScope || {}).field({ categoryId: true }).limit(1000).get(),
      db
        .collection(DISH)
        .where(dishScope || {})
        .orderBy('createTime', 'desc')
        .limit(6)
        .field({ name: true, cover: true, createTime: true, categoryId: true })
        .get(),
      db
        .collection(HOT_LOG)
        .aggregate()
        .match({ date: _.gte(weekStart) })
        .group({ _id: '$dishId', score: $.sum('$weight'), actions: $.sum(1) })
        .sort({ score: -1 })
        .limit(20)
        .end()
    ])

  const catMap = {}
  categoryList.data.forEach((cat) => {
    catMap[cat._id] = cat
  })

  const catCounts = groupByDate(dishRows.data, 'categoryId')
  const categoryDist = [...catCounts.entries()].map(([key, count]) => {
    const cat = catMap[key]
    return {
      _id: key,
      name: cat ? cat.name : '未分类',
      icon: cat ? cat.icon || '🍴' : '🍴',
      count
    }
  })
  // 合并未分类
  const uncategorized = catCounts.get('') || 0
  const mergedDist = categoryDist.filter((item) => item._id)
  if (uncategorized > 0) {
    mergedDist.push({ _id: '', name: '未分类', icon: '🍴', count: uncategorized })
  }
  mergedDist.sort((a, b) => b.count - a.count)

  let topWeek = []
  const topRows = (topAgg.list || []).filter((row) => row._id).slice(0, 5 * 4)
  if (topRows.length) {
    const dishRes = await db
      .collection(DISH)
      .where(combine([{ _id: _.in(topRows.map((row) => row._id)) }, dishScope]))
      .field({ name: true, cover: true, categoryId: true })
      .get()
    const dishMap = {}
    dishRes.data.forEach((dish) => {
      dishMap[dish._id] = dish
    })
    topWeek = topRows
      .map((row) => ({
        dish: dishMap[row._id],
        score: Math.round((Number(row.score) || 0) * 10) / 10,
        actions: row.actions
      }))
      .filter((row) => !!row.dish)
      .slice(0, 5)
  }

  return {
    dishTotal: dishCount.total,
    categoryTotal: categoryList.data.length,
    memberTotal: memberCount.total,
    monthOrderTotal: monthOrderCount.total,
    categoryDist: mergedDist,
    topWeek,
    recentDishes: recent.data,
    weekStart
  }
}

/** 采购清单：把一段时间内点过的菜的食材合并去重 */
async function actionShoppingList(data = {}, openid) {
  const user = await loadUser(openid)
  const days = Math.min(30, Math.max(1, Number(data.days) || 7))
  const end = beijingDate()
  const start = beijingDate(Date.now() - (days - 1) * 86400000)

  const orderRes = await db
    .collection(ORDER)
    .where(
      combine([
        orderScopeCondition(user),
        { date: _.gte(start).and(_.lte(end)), status: _.neq('canceled') }
      ])
    )
    .orderBy('date', 'desc')
    .limit(100)
    .get()

  const ids = []
  orderRes.data.forEach((order) => {
    ;(order.items || []).forEach((item) => {
      if (item.dishId) ids.push(item.dishId)
    })
  })

  const uniq = [...new Set(ids)]
  if (!uniq.length) return { list: [], start, end, orderCount: orderRes.data.length }

  const dishRes = await db
    .collection(DISH)
    .where({ _id: _.in(uniq.slice(0, 100)) })
    .field({ name: true, ingredients: true })
    .get()

  const map = new Map()
  dishRes.data.forEach((dish) => {
    ;(dish.ingredients || []).forEach((ing) => {
      if (!ing || !ing.name) return
      if (!map.has(ing.name)) {
        map.set(ing.name, { name: ing.name, amounts: [], dishes: [] })
      }
      const entry = map.get(ing.name)
      if (ing.amount) entry.amounts.push(ing.amount)
      if (!entry.dishes.includes(dish.name)) entry.dishes.push(dish.name)
    })
  })

  const list = [...map.values()]
    .map((entry) => ({
      name: entry.name,
      amount: mergeAmounts(entry.amounts),
      dishes: entry.dishes
    }))
    .sort((a, b) => b.dishes.length - a.dishes.length)

  return { list, start, end, orderCount: orderRes.data.length }
}

const ACTIONS = {
  overview: actionOverview,
  shoppingList: actionShoppingList
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
    console.error(`[stats:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
