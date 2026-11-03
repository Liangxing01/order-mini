import { call } from './cloud'
import { FN } from '@/config'

/** 分类 */
export const categoryApi = {
  list: () => call(FN.category, 'list'),
  create: (data) => call(FN.category, 'create', data),
  update: (data) => call(FN.category, 'update', data),
  remove: (data) => call(FN.category, 'remove', data),
  sort: (list) => call(FN.category, 'sort', { list })
}

/** 菜品 */
export const dishApi = {
  list: (data) => call(FN.dish, 'list', data),
  detail: (id) => call(FN.dish, 'detail', { _id: id }),
  create: (data) => call(FN.dish, 'create', data),
  update: (data) => call(FN.dish, 'update', data),
  remove: (id) => call(FN.dish, 'remove', { _id: id }),
  removeBatch: (ids) => call(FN.dish, 'removeBatch', { ids }),
  batchMove: (data) => call(FN.dish, 'batchMove', data),
  toggleStatus: (data) => call(FN.dish, 'toggleStatus', data),
  importDish: (id) => call(FN.dish, 'import', { _id: id }),
  track: (data) => call(FN.dish, 'track', data)
}

/** 订单 / 餐次 */
export const orderApi = {
  submit: (data) => call(FN.order, 'submit', data),
  list: (data) => call(FN.order, 'list', data),
  detail: (id) => call(FN.order, 'detail', { _id: id }),
  cancel: (id) => call(FN.order, 'cancel', { _id: id }),
  finish: (id) => call(FN.order, 'finish', { _id: id }),
  repeat: (id) => call(FN.order, 'repeat', { _id: id }),
  randomPick: (data) => call(FN.order, 'randomPick', data),
  planSave: (data) => call(FN.order, 'planSave', data),
  planMove: (data) => call(FN.order, 'planMove', data),
  planClear: (id) => call(FN.order, 'planClear', { _id: id })
}

/** 热度排行 */
export const rankApi = {
  hot: (data) => call(FN.rank, 'hot', data)
}

/** 统计 */
export const statsApi = {
  overview: () => call(FN.stats, 'overview'),
  shoppingList: (data) => call(FN.stats, 'shoppingList', data)
}

/** 用户与家庭成员 */
export const userApi = {
  me: () => call(FN.user, 'me'),
  update: (data) => call(FN.user, 'update', data),
  members: () => call(FN.user, 'members'),
  bind: (inviterOpenid) => call(FN.user, 'bind', { inviterOpenid }),
  removeMember: (openid) => call(FN.user, 'removeMember', { openid })
}

/** 家庭：创建 / 加入 / 成员管理 / 所有家庭（仅超级VIP） */
export const familyApi = {
  info: () => call(FN.family, 'info'),
  create: (name) => call(FN.family, 'create', { name }),
  join: (data) => call(FN.family, 'join', data),
  leave: () => call(FN.family, 'leave'),
  removeMember: (openid) => call(FN.family, 'removeMember', { openid }),
  rename: (name) => call(FN.family, 'rename', { name }),
  dissolve: () => call(FN.family, 'dissolve'),
  list: () => call(FN.family, 'list')
}
