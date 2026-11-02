const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const USER = 'user'
const FAMILY_ID = 'default'

function ok(data) {
  return { code: 0, msg: 'ok', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

/**
 * 取当前用户，不存在则创建。
 * 这是给一个家庭用的小程序：第一个进来的人建家庭并成为管理员，
 * 之后扫码 / 分享进来的人直接并入已有家庭，不需要邀请确认。
 */
async function ensureUser(openid) {
  const res = await db.collection(USER).where({ _id: openid }).limit(1).get()
  if (res.data.length) return res.data[0]

  const countRes = await db.collection(USER).count()
  const now = Date.now()

  // 已有成员时沿用最早那个人的 familyId，新成员自动加入同一个家
  let familyId = FAMILY_ID
  if (countRes.total > 0) {
    const ownerRes = await db.collection(USER).orderBy('createTime', 'asc').limit(1).get()
    const owner = ownerRes.data[0]
    if (owner && owner.familyId) familyId = owner.familyId
  }

  const doc = {
    _id: openid,
    nickName: '',
    avatar: '',
    role: countRes.total === 0 ? 'admin' : 'member',
    familyId,
    inviterOpenid: '',
    createTime: now,
    updateTime: now
  }
  await db.collection(USER).add({ data: doc })
  return doc
}

async function actionMe(data, openid) {
  const user = await ensureUser(openid)
  const memberRes = await db.collection(USER).where({ familyId: user.familyId }).count()
  return { ...user, memberTotal: memberRes.total }
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
  const user = await ensureUser(openid)
  return user
}

async function actionMembers(data, openid) {
  const me = await ensureUser(openid)
  const res = await db
    .collection(USER)
    .where({ familyId: me.familyId })
    .orderBy('createTime', 'asc')
    .limit(50)
    .get()

  const list = res.data.map((user) => ({
    _id: user._id,
    nickName: user.nickName || '未命名家人',
    avatar: user.avatar || '',
    role: user.role,
    createTime: user.createTime,
    isSelf: user._id === openid
  }))
  return { list, isAdmin: me.role === 'admin' }
}

/** 记录邀请来源；家庭成员关系本身在 ensureUser 时已自动建立 */
async function actionBind(data = {}, openid) {
  const inviterOpenid = String(data.inviterOpenid || '').trim()
  if (!inviterOpenid) return fail('邀请信息无效', 1002)
  if (inviterOpenid === openid) return fail('不能邀请自己', 1002)

  const me = await ensureUser(openid)
  if (me.inviterOpenid) return { ...me, alreadyBound: true }

  await db
    .collection(USER)
    .doc(openid)
    .update({ data: { inviterOpenid, updateTime: Date.now() } })

  return { ...me, inviterOpenid }
}

async function actionRemoveMember(data = {}, openid) {
  const target = String(data.openid || '').trim()
  if (!target) return fail('缺少成员标识', 1002)
  if (target === openid) return fail('不能移除自己', 1002)

  const me = await ensureUser(openid)
  if (me.role !== 'admin') return fail('只有管理员可以移除成员', 1003)

  await db.collection(USER).doc(target).remove()
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
