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

/** 厨房总览：菜品分布、本周热菜、最新上传、成员数 */
async function actionOverview() {
  const weekStart = beijingDate(Date.now() - 6 * 86400000)
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [dishCount, categoryList, memberCount, monthOrderCount, catAgg, recent, topAgg] =
    await Promise.all([
      db.collection(DISH).count(),
      db.collection(CATEGORY).orderBy('sort', 'asc').limit(100).get(),
      db.collection(USER).count(),
      db
        .collection(ORDER)
        .where({ date: _.gte(monthStart), status: _.in(['pending', 'finished']) })
        .count(),
      db
        .collection(DISH)
        .aggregate()
        .group({ _id: '$categoryId', count: $.sum(1) })
        .end(),
      db
        .collection(DISH)
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
        .limit(5)
        .end()
    ])

  const catMap = {}
  categoryList.data.forEach((cat) => {
    catMap[cat._id] = cat
  })

  const catCounts = groupByDate(catAgg.list || [], '_id')
  const categoryDist = (catAgg.list || []).map((row) => {
    const key = row._id || ''
    const cat = catMap[key]
    return {
      _id: key,
      name: cat ? cat.name : '未分类',
      icon: cat ? cat.icon || '🍴' : '🍴',
      count: row.count
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
  const topRows = (topAgg.list || []).filter((row) => row._id)
  if (topRows.length) {
    const dishRes = await db
      .collection(DISH)
      .where({ _id: _.in(topRows.map((row) => row._id)) })
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
async function actionShoppingList(data = {}) {
  const days = Math.min(30, Math.max(1, Number(data.days) || 7))
  const end = beijingDate()
  const start = beijingDate(Date.now() - (days - 1) * 86400000)

  const orderRes = await db
    .collection(ORDER)
    .where({ date: _.gte(start).and(_.lte(end)), status: _.neq('canceled') })
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
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    const result = await handler(data)
    if (result && typeof result.code === 'number' && 'msg' in result && result.data === undefined) {
      return result
    }
    return ok(result)
  } catch (err) {
    console.error(`[stats:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
