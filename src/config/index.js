/**
 * 云开发环境 ID。
 * 小程序只有一个云开发环境时留空即可，会自动使用默认环境；
 * 存在多个环境时填写控制台里的环境 ID，例如 'lulu-prod-8gk1a2b3c4d5e6'。
 */
export const CLOUD_ENV = 'lulu-d2g9yofzq8e451dea'

/** 云函数名 */
export const FN = {
  initdb: 'initdb',
  user: 'user',
  category: 'category',
  dish: 'dish',
  order: 'order',
  rank: 'rank',
  stats: 'stats',
  file: 'file'
}

/** 餐次 */
export const MEAL_TYPES = [
  { value: 'breakfast', label: '早餐', emoji: '🌅' },
  { value: 'lunch', label: '午餐', emoji: '☀️' },
  { value: 'dinner', label: '晚餐', emoji: '🌙' },
  { value: 'night', label: '夜宵', emoji: '🌌' }
]

/** 周排菜只排三餐，夜宵不入计划 */
export const PLAN_MEALS = MEAL_TYPES.filter((meal) => meal.value !== 'night')

/** 菜品类目（用于标签筛选，非分类系统） */
export const DISH_TYPES = ['荤', '素', '蛋', '汤', '饮', '主食', '其他']

/** 辣度 */
export const SPICY_LEVELS = [
  { value: 0, label: '不辣' },
  { value: 1, label: '微辣' },
  { value: 2, label: '中辣' },
  { value: 3, label: '特辣' }
]

/** 未分类的虚拟分类 ID */
export const UNCATEGORIZED_ID = 'uncategorized'
