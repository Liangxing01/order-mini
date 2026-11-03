const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const USER = 'user'
const FAMILY = 'family'
const DISH = 'dish'

/** 角色等级：supervip 看所有家庭，vip 看本家庭，user 只看自己 */
const ROLE_RANK = { user: 0, vip: 1, supervip: 2 }

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

function normalizeUser(user) {
  if (!user) return { role: 'user', familyId: '', familyRole: '' }
  const next = { ...user }
  if (next.role === 'admin' || next.role === 'member') {
    next.familyRole = next.familyRole || (user.role === 'admin' ? 'owner' : 'member')
    next.role = 'vip'
  }
  if (!ROLE_RANK[next.role] && next.role !== 'user') next.role = 'user'
  next.familyId = next.familyId || ''
  next.familyRole = next.familyRole || ''
  return next
}

async function loadUser(openid) {
  // 少传 openid 时 .doc() 只会抛「docId必须为字符串或数字」，这里给出可读的提示
  if (!openid) throw new Error('未获取到用户身份，请重新进入小程序')
  const res = await db.collection(USER).doc(openid).get().catch(() => null)
  const user = res && res.data ? normalizeUser(res.data) : null
  if (user) return user
  const now = Date.now()
  const doc = {
    _id: openid,
    nickName: '',
    avatar: '',
    role: 'user',
    familyId: '',
    familyRole: '',
    inviterOpenid: '',
    createTime: now,
    updateTime: now
  }
  await db.collection(USER).add({ data: doc }).catch(() => undefined)
  return doc
}

function isOwner(family, user, openid) {
  if (!family) return false
  return family.ownerOpenid === openid || user.familyRole === 'owner'
}

/** 家庭文档；历史数据只有 familyId 时按最早成员自愈创建 */
async function ensureFamily(familyId) {
  if (!familyId) return null
  const res = await db.collection(FAMILY).doc(familyId).get().catch(() => null)
  if (res && res.data) return res.data

  const ownerRes = await db
    .collection(USER)
    .where({ familyId })
    .orderBy('createTime', 'asc')
    .limit(1)
    .get()
  const owner = ownerRes.data[0]
  if (!owner) return null

  const now = Date.now()
  const doc = {
    _id: familyId,
    name: `${owner.nickName || '我们'}的小厨房`,
    ownerOpenid: owner._id,
    createTime: owner.createTime || now,
    updateTime: now
  }
  await db.collection(FAMILY).add({ data: doc }).catch(() => undefined)
  return doc
}

function memberBrief(user) {
  const item = normalizeUser(user)
  return {
    _id: item._id,
    nickName: item.nickName || '未命名家人',
    avatar: item.avatar || '',
    role: item.role,
    familyRole: item.familyRole,
    createTime: item.createTime
  }
}

/** 创建家庭：只有 vip 及以上可以，且一人只能有一个家庭 */
async function actionCreate(data = {}, openid) {
  const user = await loadUser(openid)
  if (user.familyId) return fail('你已经在家庭里了，退出后才能创建新家庭', 1003)
  if ((ROLE_RANK[user.role] || 0) < 1) return fail('普通用户不能创建家庭', 1003)

  const name = String(data.name || '').trim().slice(0, 20)
  const now = Date.now()
  const doc = {
    name: name || `${user.nickName || '我'}的小厨房`,
    ownerOpenid: openid,
    createTime: now,
    updateTime: now
  }
  const res = await db.collection(FAMILY).add({ data: doc })
  await db
    .collection(USER)
    .doc(openid)
    .update({ data: { familyId: res._id, familyRole: 'owner', updateTime: now } })

  return { _id: res._id, ...doc, familyRole: 'owner' }
}

async function actionInfo(data = {}, openid) {
  const user = await loadUser(openid)
  if (!user.familyId) {
    return { family: null, members: [], isOwner: false, myRole: user.role }
  }

  const family = await ensureFamily(user.familyId)
  const memberRes = await db
    .collection(USER)
    .where({ familyId: user.familyId })
    .orderBy('createTime', 'asc')
    .limit(50)
    .get()

  const dishRes = await db.collection(DISH).where({ familyId: user.familyId }).count().catch(() => ({ total: 0 }))

  return {
    family: family ? { ...family, dishTotal: dishRes.total } : null,
    members: memberRes.data.map(memberBrief),
    isOwner: isOwner(family, user, openid),
    myRole: user.role
  }
}

/** 通过邀请加入家庭：一人只能加入一个，加入即获得家庭版权益 */
async function actionJoin(data = {}, openid) {
  const familyId = String(data.familyId || '').trim()
  if (!familyId) return fail('邀请信息无效', 1002)

  const user = await loadUser(openid)
  if (user.familyId === familyId) return { alreadyIn: true, familyId }
  if (user.familyId) return fail('你已经加入了一个家庭，请先退出', 1003)

  const family = await ensureFamily(familyId)
  if (!family) return fail('邀请无效，这个家庭不存在', 1004)

  const now = Date.now()
  const patch = {
    familyId,
    familyRole: 'member',
    inviterOpenid: String(data.inviterOpenid || ''),
    updateTime: now
  }
  if (user.role === 'user') patch.role = 'vip'
  await db.collection(USER).doc(openid).update({ data: patch })

  return { ...patch, familyName: family.name }
}

/** 成员主动退出；房主需要先解散或转让，避免家庭失去房主 */
async function actionLeave(data = {}, openid) {
  const user = await loadUser(openid)
  if (!user.familyId) return fail('你还没有加入家庭', 1003)

  const family = await ensureFamily(user.familyId)
  if (isOwner(family, user, openid)) return fail('房主不能直接退出，请解散家庭', 1003)

  await db
    .collection(USER)
    .doc(openid)
    .update({ data: { familyId: '', familyRole: '', updateTime: Date.now() } })
  return { familyId: '' }
}

/** 房主移除成员 */
async function actionRemoveMember(data = {}, openid) {
  const target = String(data.openid || '').trim()
  if (!target) return fail('缺少成员标识', 1002)
  if (target === openid) return fail('不能移除自己，请使用退出家庭', 1002)

  const user = await loadUser(openid)
  if (!user.familyId) return fail('你还没有家庭', 1003)
  const family = await ensureFamily(user.familyId)
  if (!isOwner(family, user, openid)) return fail('只有房主可以移除成员', 1003)

  const targetRes = await db.collection(USER).doc(target).get().catch(() => null)
  const targetUser = targetRes && targetRes.data ? targetRes.data : null
  if (!targetUser || targetUser.familyId !== user.familyId) return fail('该成员不在你的家庭里', 1004)

  await db
    .collection(USER)
    .doc(target)
    .update({ data: { familyId: '', familyRole: '', updateTime: Date.now() } })
  return { _id: target }
}

async function actionRename(data = {}, openid) {
  const name = String(data.name || '').trim().slice(0, 20)
  if (!name) return fail('家庭名称不能为空', 1002)

  const user = await loadUser(openid)
  if (!user.familyId) return fail('你还没有家庭', 1003)
  const family = await ensureFamily(user.familyId)
  if (!isOwner(family, user, openid)) return fail('只有房主可以改名', 1003)

  await db
    .collection(FAMILY)
    .doc(user.familyId)
    .update({ data: { name, updateTime: Date.now() } })
  return { _id: user.familyId, name }
}

/** 解散家庭：所有成员清空 familyId，家庭文档删除 */
async function actionDissolve(data = {}, openid) {
  const user = await loadUser(openid)
  if (!user.familyId) return fail('你还没有家庭', 1003)
  const family = await ensureFamily(user.familyId)
  if (!isOwner(family, user, openid)) return fail('只有房主可以解散家庭', 1003)

  await db
    .collection(USER)
    .where({ familyId: user.familyId })
    .update({ data: { familyId: '', familyRole: '' } })
  await db.collection(FAMILY).doc(user.familyId).remove()
  return { _id: user.familyId }
}

/** 超级VIP 专用：所有家庭 + 人数 + 菜品数 */
async function actionList(data = {}, openid) {
  const user = await loadUser(openid)
  if (user.role !== 'supervip') return fail('只有超级VIP 可以查看所有家庭', 1003)

  const res = await db.collection(FAMILY).orderBy('createTime', 'asc').limit(100).get()
  const [memberAgg, dishAgg] = await Promise.all([
    db.collection(USER).aggregate().match({ familyId: _.neq('') }).group({ _id: '$familyId', count: $.sum(1) }).end(),
    db.collection(DISH).aggregate().match({ familyId: _.neq('') }).group({ _id: '$familyId', count: $.sum(1) }).end()
  ])

  const memberMap = {}
  ;(memberAgg.list || []).forEach((row) => {
    memberMap[row._id] = row.count
  })
  const dishMap = {}
  ;(dishAgg.list || []).forEach((row) => {
    dishMap[row._id] = row.count
  })

  const list = res.data.map((family) => ({
    _id: family._id,
    name: family.name,
    ownerOpenid: family.ownerOpenid,
    createTime: family.createTime,
    memberTotal: memberMap[family._id] || 0,
    dishTotal: dishMap[family._id] || 0,
    isMine: family._id === user.familyId
  }))
  return { list, myFamilyId: user.familyId }
}

const ACTIONS = {
  create: actionCreate,
  info: actionInfo,
  join: actionJoin,
  leave: actionLeave,
  removeMember: actionRemoveMember,
  rename: actionRename,
  dissolve: actionDissolve,
  list: actionList
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
    console.error(`[family:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
