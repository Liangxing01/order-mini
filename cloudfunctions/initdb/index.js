const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 需要的集合，首次部署后调用一次本函数即可建好 */
const COLLECTIONS = ['dish', 'category', 'order', 'hot_log', 'user', 'family']

/** 初始化分类，与设计稿左侧栏保持一致 */
const DEFAULT_CATEGORIES = [
  { name: '主食', icon: '🍚', sort: 10 },
  { name: '荤', icon: '🥩', sort: 20 },
  { name: '素', icon: '🥬', sort: 30 },
  { name: '蛋', icon: '🍳', sort: 40 },
  { name: '汤', icon: '🥣', sort: 50 },
  { name: '喝', icon: '🧋', sort: 60 },
  { name: '空气炸锅', icon: '🍟', sort: 70 }
]

exports.main = async () => {
  const created = []
  const existed = []

  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      created.push(name)
    } catch (err) {
      // 已存在时会抛错，忽略即可
      existed.push(name)
    }
  }

  let seeded = 0
  const countRes = await db.collection('category').count()
  if (countRes.total === 0) {
    for (const item of DEFAULT_CATEGORIES) {
      await db.collection('category').add({
        data: {
          ...item,
          dishCount: 0,
          isSystem: false,
          createTime: Date.now()
        }
      })
      seeded += 1
    }
  }

  return {
    code: 0,
    msg: 'ok',
    data: {
      created,
      existed,
      seeded,
      tips: seeded
        ? '初始化完成，默认分类已写入'
        : '集合已就绪，分类已存在无需重复初始化'
    }
  }
}
