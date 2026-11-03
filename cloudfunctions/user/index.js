const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const USER = 'user'
const FAMILY = 'family'

/** 平台角色：supervip 看所有家庭，vip 看本家庭，user 只看自己 */
const ROLES = ['supervip', 'vip', 'user']

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

/**
 * 兼容历史数据：老的 admin / member 归一化成 vip，
 * 家庭内身份单独存 familyRole（owner / member）。
 */
function normalizeUser(user) {
  if (!user) return user
  const next = { ...user }
  if (next.role === 'admin' || next.role === 'member') {
    next.familyRole = next.familyRole || (user.role === 'admin' ? 'owner' : 'member')
    next.role = 'vip'
  }
  if (ROLES.indexOf(next.role) === -1) next.role = 'user'
  next.familyId = next.familyId || ''
  next.familyRole = next.familyRole || ''
  return next
}

function isOwner(family, user, openid) {
  if (!family) return false
  return family.ownerOpenid === openid || user.familyRole === 'owner'
}

/** 取当前用户，不存在则创建。新用户默认普通用户，没有家庭。 */
async function ensureUser(openid) {
  const res = await db.collection(USER).where({ _id: openid }).limit(1).get()
  if (res.data.length) return normalizeUser(res.data[0])

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
  await db.collection(USER).add({ data: doc })
  return doc
}

/** 家庭文档；历史上只有 familyId 没有实体记录时按最早成员自愈创建 */
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

async function actionMe(data, openid) {
  const user = await ensureUser(openid)
  const family = await ensureFamily(user.familyId)
  const memberRes = user.familyId
    ? await db.collection(USER).where({ familyId: user.familyId }).count()
    : { total: 1 }

  return {
    ...user,
    familyName: family ? family.name : '',
    isOwner: isOwner(family, user, openid),
    memberTotal: memberRes.total
  }
}

async function actionUpdate(data = {}, openid) {
  const payload = {}
  if (typeof data.nickName === 'string') {
    const nickName = data.nickName.trim().slice(0, 16)
    if (!nickName) return fail('昵称不能为空', 1002)
    payload.nickName = nickName
  }
  if (typeof data.avatar === 'string') {
    payload.avatar = data.avatar
  }
  if (!Object.keys(payload).length) return fail('没有需要更新的内容', 1002)

  payload.updateTime = Date.now()
  await db.collection(USER).doc(openid).update({ data: payload })
  return ensureUser(openid)
}

async function actionMembers(data, openid) {
  const me = await ensureUser(openid)
  if (!me.familyId) {
    return { list: [{ ...me, isSelf: true, label: me.nickName || '我' }], isAdmin: false }
  }

  const res = await db
    .collection(USER)
    .where({ familyId: me.familyId })
    .orderBy('createTime', 'asc')
    .limit(50)
    .get()

  const list = res.data.map((user) => normalizeUser(user)).map((user) => ({
    _id: user._id,
    nickName: user.nickName || '未命名家人',
    avatar: user.avatar || '',
    role: user.role,
    familyRole: user.familyRole,
    createTime: user.createTime,
    isSelf: user._id === openid
  }))
  const family = await ensureFamily(me.familyId)
  return { list, isAdmin: isOwner(family, me, openid) }
}

/** 兼容老邀请卡片：按邀请人找到他的家庭后加入 */
async function actionBind(data = {}, openid) {
  const inviterOpenid = String(data.inviterOpenid || '').trim()
  if (!inviterOpenid) return fail('邀请信息无效', 1002)
  if (inviterOpenid === openid) return fail('不能邀请自己', 1002)

  const me = await ensureUser(openid)
  if (me.familyId) return { ...me, alreadyIn: true }

  const inviterRes = await db.collection(USER).doc(inviterOpenid).get().catch(() => null)
  const inviter = inviterRes && inviterRes.data ? normalizeUser(inviterRes.data) : null
  if (!inviter || !inviter.familyId) return fail('邀请人还没有创建家庭', 1004)

  const family = await ensureFamily(inviter.familyId)
  const now = Date.now()
  const patch = {
    familyId: inviter.familyId,
    familyRole: 'member',
    inviterOpenid,
    updateTime: now
  }
  // 加入家庭即获得家庭版权益
  if (me.role === 'user') patch.role = 'vip'
  await db.collection(USER).doc(openid).update({ data: patch })

  return { ...me, ...patch, familyName: family ? family.name : '' }
}

/** 仅房主可移除成员 */
async function actionRemoveMember(data = {}, openid) {
  const target = String(data.openid || '').trim()
  if (!target) return fail('缺少成员标识', 1002)
  if (target === openid) return fail('不能移除自己，可以退出家庭', 1002)

  const me = await ensureUser(openid)
  if (!me.familyId) return fail('你还没有家庭', 1003)
  const family = await ensureFamily(me.familyId)
  if (!isOwner(family, me, openid)) return fail('只有房主可以移除成员', 1003)

  const targetRes = await db.collection(USER).doc(target).get().catch(() => null)
  const targetUser = targetRes && targetRes.data ? targetRes.data : null
  if (!targetUser || targetUser.familyId !== me.familyId) return fail('该成员不在你的家庭里', 1004)

  await db
    .collection(USER)
    .doc(target)
    .update({ data: { familyId: '', familyRole: '', updateTime: Date.now() } })
  return { _id: target }
}

const ACTIONS = {
  me: actionMe,
  update: actionUpdate,
  members: actionMembers,
  bind: actionBind,
  removeMember: actionRemoveMember
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
    console.error(`[user:${action}]`, err)
    return fail(err.message || '服务异常', 1500)
  }
}
