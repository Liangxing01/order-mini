const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const CATEGORY = 'category'
const DISH = 'dish'

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

/** 统计每个分类下的菜品数量 */
async function dishCountMap() {
  const res = await db
    .collection(DISH)
    .aggregate()
    .group({ _id: '$categoryId', count: $.sum(1) })
    .end()

  const map = { count: 0 }
  let uncategorized = 0
  res.list.forEach((row) => {
    const key = row._id === null || row._id === undefined || row._id === '' ? '' : row._id
    map[key] = (map[key] || 0) + row.count
    if (key === '') uncategorized += row.count
  })
  map.count = uncategorized
  return map
}

async function actionList() {
  const [cats, counts] = await Promise.all([
    db.collection(CATEGORY).orderBy('sort', 'asc').limit(100).get(),
    dishCountMap()
  ])

  const list = cats.data.map((cat) => ({
    ...cat,
    dishCount: counts[cat._id] || 0
  }))

  return { list, uncategorizedCount: counts.count || 0 }
}

async function actionCreate(data = {}) {
  const payload = normalize(data)

  const dup = await db
    .collection(CATEGORY)
    .where({ name: payload.name })
    .limit(1)
    .get()
  if (dup.data.length) return fail('已存在同名分类', 1003)

  const maxRes = await db
    .collection(CATEGORY)
    .orderBy('sort', 'desc')
    .limit(1)
    .get()
  const maxSort = maxRes.data.length ? Number(maxRes.data[0].sort) || 0 : 0

  const doc = {
    ...payload,
    sort: maxSort + 10,
    isSystem: false,
    createTime: Date.now()
  }
  const res = await db.collection(CATEGORY).add({ data: doc })
  return { _id: res._id, ...doc }
}

async function actionUpdate(data = {}) {
  if (!data._id) return fail('缺少分类 ID', 1002)
  const payload = normalize(data)

  const dup = await db
    .collection(CATEGORY)
    .where({ name: payload.name, _id: _.neq(data._id) })
    .limit(1)
    .get()
  if (dup.data.length) return fail('已存在同名分类', 1003)

  await db
    .collection(CATEGORY)
    .doc(data._id)
    .update({ data: { ...payload, updateTime: Date.now() } })
  return { _id: data._id, ...payload }
}

async function actionRemove(data = {}) {
  if (!data._id) return fail('缺少分类 ID', 1002)

  const catRes = await db.collection(CATEGORY).doc(data._id).get().catch(() => null)
  if (!catRes || !catRes.data) return fail('分类不存在', 1004)

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

async function actionSort(data = {}) {
  const list = Array.isArray(data.list) ? data.list : []
  if (!list.length) return fail('缺少排序数据', 1002)

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
  const handler = ACTIONS[action]
  if (!handler) return fail(`未知操作: ${action}`, 1000)

  try {
    const result = await handler(data)
    if (result && typeof result.code === 'number' && 'msg' in result && result.data === undefined) {
      return result
    }
    return ok(result)
  } catch (err) {
    console.error(`[category:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
