const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ORDER = 'order'
const DISH = 'dish'
const HOT_LOG = 'hot_log'
const USER = 'user'
const FAMILY = 'family'

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
  status: true,
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
    nickName: user.nickName || '',
    role: normalizeRole(user),
    familyId: user.familyId || '',
    familyRole: user.familyRole || ''
  }
}

/** 家庭成员 openid 列表（一定包含自己） */
async function memberOpenids(familyId, openid) {
  if (!familyId) return [openid]
  const res = await db.collection(USER).where({ familyId }).limit(100).get().catch(() => null)
  const list = ((res && res.data) || []).map((row) => row._id).filter(Boolean)
  if (list.indexOf(openid) === -1) list.push(openid)
  return list
}

/**
 * 订单可见范围。
 * 超级VIP 传了 familyId 就看指定家庭；不传按自己的家庭走。
 * 早期订单没有 familyId，按创建人是否同家庭成员兜住。
 */
async function orderScope(user, familyId) {
  const target = user.role === 'supervip' && familyId ? familyId : user.familyId
  if (!target) return { creatorOpenid: user.openid }
  const openids = await memberOpenids(target, user.openid)
  return _.or([
    { familyId: target },
    { familyId: _.in(['', null]), creatorOpenid: _.in(openids) },
    { familyId: _.exists(false), creatorOpenid: _.in(openids) }
  ])
}

/** 能否撤销 / 完成别人下的单：家庭房主和超级VIP */
async function canManageOrder(user, order) {
  if (!order) return false
  if (user.role === 'supervip') return true
  if (order.creatorOpenid === user.openid) return true
  if (!user.familyId) return false
  if (order.familyId && order.familyId !== user.familyId) return false
  if (user.familyRole === 'owner') return true
  const family = await db.collection(FAMILY).doc(user.familyId).get().catch(() => null)
  return !!(family && family.data && family.data.ownerOpenid === user.openid)
}

/** 能否查看这条订单 / 排菜计划 */
async function canViewOrder(user, order) {
  if (!order) return false
  if (user.role === 'supervip') return true
  if (order.creatorOpenid === user.openid) return true
  if (!user.familyId) return false
  if (order.familyId) return order.familyId === user.familyId
  const openids = await memberOpenids(user.familyId, user.openid)
  return openids.indexOf(order.creatorOpenid) !== -1
}

/** 随机点菜的菜品池，与菜品列表用同一套可见范围 */
function dishScope(user, familyId) {
  if (user.role === 'supervip') return familyId ? { familyId } : null
  if (user.familyId) {
    return _.or([
      { familyId: user.familyId },
      { familyId: _.in(['', null]) },
      { familyId: _.exists(false) }
    ])
  }
  return { creatorOpenid: user.openid }
}

async function actionSubmit(data = {}, openid) {
  const date = String(data.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('请选择用餐日期', 1002)

  const mealType = String(data.mealType || 'dinner')
  const rawItems = Array.isArray(data.items) ? data.items : []
  const items = rawItems
    .map((item) => ({
      dishId: item && item.dishId,
      count: Math.min(99, Math.max(1, Number(item && item.count) || 1))
    }))
    .filter((item) => item.dishId)

  if (!items.length) return fail('请先选择菜品', 1002)
  if (items.length > 60) return fail('单次最多点 60 道菜', 1002)

  const ids = [...new Set(items.map((item) => item.dishId))]
  const dishRes = await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .field(DISH_FIELD)
    .get()

  const dishMap = {}
  dishRes.data.forEach((dish) => {
    dishMap[dish._id] = dish
  })

  const missing = ids.filter((id) => !dishMap[id])
  if (missing.length) return fail(`有 ${missing.length} 道菜已被删除，请下拉刷新后重试`, 1004)

  const orderItems = items.map((item) => {
    const dish = dishMap[item.dishId]
    return {
      dishId: dish._id,
      name: dish.name,
      cover: dish.cover || '',
      categoryId: dish.categoryId || '',
      count: item.count
    }
  })

  const user = await loadUser(openid)
  const creatorName = user.nickName || '家人'

  const now = Date.now()
  const totalCount = orderItems.reduce((sum, item) => sum + item.count, 0)
  const doc = {
    date,
    mealType,
    items: orderItems,
    totalCount,
    note: String(data.note || '').trim().slice(0, 100),
    // 家庭内部点菜不需要二次确认，下单即完成
    status: 'finished',
    creatorOpenid: openid,
    creatorName,
    familyId: user.familyId,
    createTime: now
  }

  const res = await db.collection(ORDER).add({ data: doc })

  // 下单行为计入热度，失败不影响下单结果
  await Promise.all(
    ids.map(async (dishId) => {
      try {
        await db.collection(HOT_LOG).add({
          data: {
            dishId,
            openid,
            action: 'order',
            weight: 3,
            date: beijingDate(now),
            createTime: now
          }
        })
        await db
          .collection(DISH)
          .doc(dishId)
          .update({
            data: { 'hot.ordered': _.inc(1), 'hot.score': _.inc(3), 'hot.lastAt': now }
          })
      } catch (err) {
        console.warn('[order.submit] 热度写入失败', dishId, err && err.message)
      }
    })
  )

  return { _id: res._id, totalCount, date, mealType }
}

async function actionList(data = {}, openid) {
  const user = await loadUser(openid)
  const page = Math.max(0, Number(data.page) || 0)
  const pageSize = Math.min(50, Number(data.pageSize) || 20)

  const timeCondition = {}
  if (data.from && data.to) {
    timeCondition.date = _.gte(data.from).and(_.lte(data.to))
  } else if (data.from) {
    timeCondition.date = _.gte(data.from)
  } else if (data.to) {
    timeCondition.date = _.lte(data.to)
  }
  if (Array.isArray(data.statuses) && data.statuses.length) {
    timeCondition.status = _.in(data.statuses)
  } else if (data.status) {
    timeCondition.status = data.status
  }

  const conditions = [await orderScope(user, data.familyId)]
  if (Object.keys(timeCondition).length) conditions.push(timeCondition)
  const where = conditions.length > 1 ? _.and(conditions) : conditions[0]

  const res = await db
    .collection(ORDER)
    .where(where)
    .orderBy('date', 'desc')
    .orderBy('createTime', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()

  return { list: res.data, page, pageSize }
}

async function actionDetail(data = {}, openid) {
  if (!data._id) return fail('缺少订单 ID', 1002)
  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  if (!res || !res.data) return fail('订单不存在', 1004)

  const user = await loadUser(openid)
  if (!(await canViewOrder(user, res.data))) return fail('没有权限查看这条食记', 1003)
  return res.data
}

async function actionCancel(data = {}, openid) {
  if (!data._id) return fail('缺少订单 ID', 1002)
  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail('订单不存在', 1004)
  if (order.status === 'canceled') return { _id: data._id, status: 'canceled' }

  const user = await loadUser(openid)
  if (!(await canManageOrder(user, order))) {
    return fail('只能撤销自己下的单', 1003)
  }

  await db.collection(ORDER).doc(data._id).update({ data: { status: 'canceled' } })
  return { _id: data._id, status: 'canceled' }
}

async function actionFinish(data = {}, openid) {
  if (!data._id) return fail('缺少订单 ID', 1002)
  const user = await loadUser(openid)
  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail('订单不存在', 1004)
  if (!(await canManageOrder(user, order))) return fail('没有权限操作这一单', 1003)

  await db.collection(ORDER).doc(data._id).update({ data: { status: 'finished' } })
  return { _id: data._id, status: 'finished' }
}

/** 再来一单：把历史订单里的菜还原成购物车结构 */
async function actionRepeat(data = {}, openid) {
  if (!data._id) return fail('缺少订单 ID', 1002)
  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail('订单不存在', 1004)

  const user = await loadUser(openid)
  if (!(await canViewOrder(user, order))) return fail('没有权限复用这条食记', 1003)

  const ids = [...new Set((order.items || []).map((item) => item.dishId))]
  if (!ids.length) return fail('这单没有可复用的菜品', 1004)

  const dishRes = await db
    .collection(DISH)
    .where({ _id: _.in(ids) })
    .field(DISH_FIELD)
    .get()

  const alive = {}
  dishRes.data.forEach((dish) => {
    alive[dish._id] = dish
  })

  const items = (order.items || [])
    .filter((item) => alive[item.dishId])
    .map((item) => ({
      _id: item.dishId,
      name: alive[item.dishId].name,
      cover: alive[item.dishId].cover || item.cover || '',
      count: item.count
    }))

  if (!items.length) return fail('这单里的菜都已被删除', 1004)
  return { items, skipped: (order.items || []).length - items.length }
}

/** 随机点菜：冷门菜权重更高，避免总是抽到同几道 */
async function actionRandomPick(data = {}, openid) {
  const user = await loadUser(openid)
  const count = Math.min(10, Math.max(1, Number(data.count) || 3))

  const conditions = [{ status: 'on' }]
  if (data.categoryId && data.categoryId !== 'all') {
    conditions.push({ categoryId: data.categoryId })
  }
  const scope = dishScope(user, data.familyId)
  if (scope) conditions.push(scope)
  const where = conditions.length > 1 ? _.and(conditions) : conditions[0]

  const res = await db.collection(DISH).where(where).limit(200).field(DISH_FIELD).get()
  const exclude = Array.isArray(data.excludeIds) ? data.excludeIds : []
  const pool = res.data.filter((dish) => !exclude.includes(dish._id))

  if (!pool.length) return fail('这个范围里还没有菜，先去添加吧', 1005)

  const weightOf = (dish) => {
    const ordered = (dish.hot && dish.hot.ordered) || 0
    return 1 / (1 + ordered)
  }

  const candidates = pool.slice()
  const picked = []
  const total = Math.min(count, candidates.length)

  for (let i = 0; i < total; i += 1) {
    const sum = candidates.reduce((acc, dish) => acc + weightOf(dish), 0)
    let r = Math.random() * sum
    let idx = 0
    for (; idx < candidates.length; idx += 1) {
      r -= weightOf(candidates[idx])
      if (r <= 0) break
    }
    if (idx >= candidates.length) idx = candidates.length - 1
    picked.push(candidates.splice(idx, 1)[0])
  }

  return { list: picked }
}

/** 周排菜只覆盖三餐，夜宵不排 */
const PLAN_MEALS = ['breakfast', 'lunch', 'dinner']

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

/** 合并同一道菜的份数，保持传入顺序 */
function normalizePlanItems(rawItems) {
  const list = []
  const index = {}
  ;(Array.isArray(rawItems) ? rawItems : []).forEach((item) => {
    const dishId = item && item.dishId
    if (!dishId) return
    const count = Math.min(20, Math.max(1, Number(item && item.count) || 1))
    if (index[dishId]) {
      index[dishId].count = Math.min(99, index[dishId].count + count)
      return
    }
    const entry = { dishId, count }
    index[dishId] = entry
    list.push(entry)
  })
  return list
}

/** 一个家庭里，一个日期 + 餐次只保留一份排菜计划 */
async function findPlan(date, mealType, user) {
  const conditions = [{ date }, { mealType }, { status: 'planned' }]
  if (user.familyId) {
    // 早期计划没有 familyId，一并认作本家庭的
    conditions.push(
      _.or([
        { familyId: user.familyId },
        { familyId: _.in(['', null]) },
        { familyId: _.exists(false) }
      ])
    )
  } else {
    conditions.push({ creatorOpenid: user.openid })
  }

  const res = await db
    .collection(ORDER)
    .where(_.and(conditions))
    .orderBy('updateTime', 'desc')
    .limit(1)
    .get()
  return res.data[0] || null
}

/** 用最新的菜品信息展开排菜条目 */
async function snapshotPlanItems(items) {
  const ids = [...new Set(items.map((item) => item.dishId))]
  const dishRes = await db.collection(DISH).where({ _id: _.in(ids) }).field(DISH_FIELD).get()
  const dishMap = {}
  dishRes.data.forEach((dish) => {
    dishMap[dish._id] = dish
  })

  const missing = ids.filter((id) => !dishMap[id])
  if (missing.length) return { missing }

  return {
    items: items.map((item) => {
      const dish = dishMap[item.dishId]
      return {
        dishId: dish._id,
        name: dish.name,
        cover: dish.cover || '',
        categoryId: dish.categoryId || '',
        count: item.count
      }
    })
  }
}

function mergePlanItems(base = [], extra = []) {
  const list = base.map((item) => ({ ...item }))
  extra.forEach((item) => {
    const hit = list.find((row) => row.dishId === item.dishId)
    if (hit) {
      hit.count = Math.min(99, hit.count + item.count)
    } else {
      list.push({ ...item })
    }
  })
  return list
}

function sumCount(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
}

/** 保存某一餐的排菜：items 为空视作清空该餐 */
async function actionPlanSave(data = {}, openid) {
  const date = String(data.date || '').trim()
  if (!isDateString(date)) return fail('请选择用餐日期', 1002)
  const mealType = PLAN_MEALS.includes(data.mealType) ? data.mealType : 'dinner'

  const items = normalizePlanItems(data.items)
  if (items.length > 30) return fail('单餐最多安排 30 道菜', 1002)

  const user = await loadUser(openid)
  const existing = await findPlan(date, mealType, user)

  if (!items.length) {
    if (existing) await db.collection(ORDER).doc(existing._id).remove()
    return { _id: existing ? existing._id : '', date, mealType, items: [], totalCount: 0, removed: !!existing }
  }

  const snap = await snapshotPlanItems(items)
  if (snap.missing) return fail(`有 ${snap.missing.length} 道菜已被删除，刷新后再试`, 1004)

  const creatorName = user.nickName || '家人'
  const now = Date.now()
  const doc = {
    date,
    mealType,
    items: snap.items,
    totalCount: sumCount(snap.items),
    note: String(data.note || '').trim().slice(0, 100),
    status: 'planned',
    creatorOpenid: openid,
    creatorName,
    familyId: user.familyId,
    updateTime: now
  }

  if (existing) {
    await db.collection(ORDER).doc(existing._id).update({ data: doc })
    return { ...doc, _id: existing._id, createTime: existing.createTime }
  }

  const created = { ...doc, createTime: now }
  const res = await db.collection(ORDER).add({ data: created })
  return { ...created, _id: res._id }
}

/** 把整餐计划挪到另一个日期 / 餐次，目标已有计划时合并 */
async function actionPlanMove(data = {}, openid) {
  if (!data._id) return fail('缺少计划 ID', 1002)
  const date = String(data.date || '').trim()
  if (!isDateString(date)) return fail('请选择用餐日期', 1002)
  const mealType = PLAN_MEALS.includes(data.mealType) ? data.mealType : 'dinner'

  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  const plan = res && res.data
  if (!plan) return fail('计划不存在', 1004)
  if (plan.status !== 'planned') return fail('只有排菜计划可以移动', 1003)

  const user = await loadUser(openid)
  if (!(await canViewOrder(user, plan))) return fail('没有权限修改这个排菜计划', 1003)
  if (plan.date === date && plan.mealType === mealType) return plan

  const target = await findPlan(date, mealType, user)
  const now = Date.now()

  if (target && target._id !== data._id) {
    const items = mergePlanItems(target.items || [], plan.items || [])
    const next = { items, totalCount: sumCount(items), updateTime: now }
    await db.collection(ORDER).doc(target._id).update({ data: next })
    await db.collection(ORDER).doc(data._id).remove()
    return { ...target, ...next, merged: true }
  }

  await db.collection(ORDER).doc(data._id).update({ data: { date, mealType, updateTime: now } })
  return { ...plan, date, mealType, updateTime: now }
}

async function actionPlanClear(data = {}, openid) {
  if (!data._id) return fail('缺少计划 ID', 1002)
  const res = await db.collection(ORDER).doc(data._id).get().catch(() => null)
  const plan = res && res.data
  if (!plan) return { _id: data._id, removed: true }

  const user = await loadUser(openid)
  if (!(await canViewOrder(user, plan))) return fail('没有权限修改这个排菜计划', 1003)

  await db.collection(ORDER).doc(data._id).remove()
  return { _id: data._id, removed: true }
}

const ACTIONS = {
  submit: actionSubmit,
  list: actionList,
  detail: actionDetail,
  cancel: actionCancel,
  finish: actionFinish,
  repeat: actionRepeat,
  randomPick: actionRandomPick,
  planSave: actionPlanSave,
  planMove: actionPlanMove,
  planClear: actionPlanClear
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
    console.error(`[order:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
