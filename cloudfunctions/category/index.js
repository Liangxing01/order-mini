const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const CATEGORY = 'category'
const DISH = 'dish'
const USER = 'user'
const FAMILY = 'family'

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

function normalize(input = {}) {
  const name = String(input.name || '').trim()
  if (!name) throw new Error('请填写分类名称')
  if (name.length > 8) throw new Error('分类名称请控制在 8 个字以内')
  return {
    name,
    icon: String(input.icon || '🍽️').trim().slice(0, 8) || '🍽️'
  }
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

/** 升级前的历史数据没有 familyId，一并认作本家庭的 */
function familyCondition(familyId) {
  return _.or([
    { familyId },
    { familyId: _.in(['', null]) },
    { familyId: _.exists(false) }
  ])
}

/**
 * 与 dish 一致的可见范围。
 * 超级VIP 默认只看自己家庭，传 familyId 看指定家庭，allFamilies 才看全部。
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

async function canManageCategory(user, cat) {
  if (!cat) return false
  if (user.role === 'supervip') return true
  if (cat.creatorOpenid === user.openid) return true
  if (!user.familyId) return false
  if (cat.familyId && cat.familyId !== user.familyId) return false
  if (user.familyRole === 'owner') return true
  const family = await db.collection(FAMILY).doc(user.familyId).get().catch(() => null)
  return !!(family && family.data && family.data.ownerOpenid === user.openid)
}

/** 统计可见范围内每个分类的菜品数量 */
async function dishCountMap(where) {
  const map = { count: 0 }
  const res = await db
    .collection(DISH)
    .where(where || {})
    .field({ categoryId: true })
    .limit(1000)
    .get()

  res.data.forEach((row) => {
    const key = row.categoryId || ''
    map[key] = (map[key] || 0) + 1
    if (!key) map.count += 1
  })
  return map
}

async function actionList(data = {}, openid) {
  const user = await loadUser(openid)
  const catWhere =
    scopeCondition(user, { familyId: data.familyId, allFamilies: data.allFamilies }) || {}

  const [cats, counts] = await Promise.all([
    db.collection(CATEGORY).where(catWhere).orderBy('sort', 'asc').limit(100).get(),
    dishCountMap(catWhere)
  ])

  const list = cats.data.map((cat) => ({
    ...cat,
    dishCount: counts[cat._id] || 0
  }))

  console.log(
    '[category:list]',
    JSON.stringify({
      role: user.role,
      familyId: user.familyId,
      categories: list.length,
      uncategorized: counts.count || 0
    })
  )
  return { list, uncategorizedCount: counts.count || 0 }
}

async function actionCreate(data = {}, openid) {
  const user = await loadUser(openid)
  const payload = normalize(data)

  const dupWhere = {
    name: payload.name,
    ...(user.role === 'supervip' ? {} : { familyId: user.familyId || '' })
  }
  const dup = await db.collection(CATEGORY).where(dupWhere).limit(1).get()
  if (dup.data.length) return fail('已存在同名分类', 1003)

  const maxRes = await db
    .collection(CATEGORY)
    .where(user.role === 'supervip' ? {} : { familyId: user.familyId || '' })
    .orderBy('sort', 'desc')
    .limit(1)
    .get()
  const maxSort = maxRes.data.length ? Number(maxRes.data[0].sort) || 0 : 0

  const doc = {
    ...payload,
    sort: maxSort + 10,
    isSystem: false,
    creatorOpenid: openid,
    familyId: user.familyId || '',
    createTime: Date.now()
  }
  const res = await db.collection(CATEGORY).add({ data: doc })
  return { _id: res._id, ...doc }
}

async function actionUpdate(data = {}, openid) {
  if (!data._id) return fail('缺少分类 ID', 1002)
  const user = await loadUser(openid)
  const current = await db.collection(CATEGORY).doc(data._id).get().catch(() => null)
  if (!current || !current.data) return fail('分类不存在', 1004)
  if (!(await canManageCategory(user, current.data))) return fail('没有权限修改这个分类', 1003)

  const payload = normalize(data)
  const dupWhere = { name: payload.name, _id: _.neq(data._id) }
  const dup = await db.collection(CATEGORY).where(dupWhere).limit(1).get()
  if (dup.data.length) return fail('已存在同名分类', 1003)

  await db
    .collection(CATEGORY)
    .doc(data._id)
    .update({ data: { ...payload, updateTime: Date.now() } })
  return { _id: data._id, ...payload }
}

async function actionRemove(data = {}, openid) {
  if (!data._id) return fail('缺少分类 ID', 1002)
  const user = await loadUser(openid)

  const catRes = await db.collection(CATEGORY).doc(data._id).get().catch(() => null)
  if (!catRes || !catRes.data) return fail('分类不存在', 1004)
  if (!(await canManageCategory(user, catRes.data))) return fail('没有权限删除这个分类', 1003)

  const countRes = await db
    .collection(DISH)
    .where({ categoryId: data._id })
    .count()

  if (countRes.total > 0) {
    // moveTo 为 undefined 表示未指定迁移目标；空字符串代表「未分类」，是合法目标
    if (data.moveTo === undefined || data.moveTo === null) {
      // 交给前端二次确认：迁移到目标分类，或取消删除
      return {
        code: 1001,
        msg: `该分类下还有 ${countRes.total} 道菜，请选择迁移到的分类`,
        data: { dishCount: countRes.total, category: catRes.data }
      }
    }
    if (data.moveTo === data._id) {
      return fail('不能迁移到被删除的分类', 1002)
    }
    await db
      .collection(DISH)
      .where({ categoryId: data._id })
      .update({ data: { categoryId: data.moveTo, updateTime: Date.now() } })
  }

  await db.collection(CATEGORY).doc(data._id).remove()
  return { _id: data._id, moved: countRes.total }
}

async function actionSort(data = {}, openid) {
  const list = Array.isArray(data.list) ? data.list : []
  if (!list.length) return fail('缺少排序数据', 1002)

  const user = await loadUser(openid)
  const res = await db
    .collection(CATEGORY)
    .where({ _id: _.in(list.map((item) => item && item._id).filter(Boolean)) })
    .get()
  const checks = await Promise.all(res.data.map((cat) => canManageCategory(user, cat)))
  if (!checks.some(Boolean)) return fail('没有权限调整这些分类', 1003)

  await Promise.all(
    list.map((item, index) => {
      if (!item || !item._id) return Promise.resolve()
      return db
        .collection(CATEGORY)
        .doc(item._id)
        .update({ data: { sort: (index + 1) * 10 } })
    })
  )
  return { count: list.length }
}

const ACTIONS = {
  list: actionList,
  create: actionCreate,
  update: actionUpdate,
  remove: actionRemove,
  sort: actionSort
}

exports.main = async (event = {}) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()
  // 云开发控制台「测试」没有 OPENID，先拦住并给可读提示，避免下游 .doc(undefined)
  if (!OPENID) return fail('缺少用户身份，请在微信小程序内调用', 1005)
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    const result = await handler(data, OPENID)
    if (result && typeof result.code === 'number' && 'msg' in result && result.data === undefined) {
      return result
    }
    return ok(result)
  } catch (err) {
    console.error(`[category:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
