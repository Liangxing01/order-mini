const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

/** 格式化为 YYYY-MM-DD */
export function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'YYYY-MM-DD' 转 Date，兼容 iOS */
export function parseDate(str) {
  if (!str) return new Date()
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today() {
  return formatDate(new Date())
}

export function shiftDate(dateStr, offset) {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + offset)
  return formatDate(d)
}

/** 日期展示：今天 / 明天 / 2026-09-26 周六 */
export function friendlyDate(dateStr) {
  const t = today()
  if (dateStr === t) return '今天'
  if (dateStr === shiftDate(t, 1)) return '明天'
  if (dateStr === shiftDate(t, -1)) return '昨天'
  const d = parseDate(dateStr)
  return `${dateStr.slice(5)} ${WEEK[d.getDay()]}`
}

/** 距今天的自然天差，用于分组标题 */
export function dayOffset(dateStr) {
  const a = parseDate(today()).getTime()
  const b = parseDate(dateStr).getTime()
  return Math.round((a - b) / 86400000)
}

/** 时间戳转 MM-DD HH:mm */
export function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 根据当前时间推断默认餐次 */
export function defaultMeal() {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'night'
}

/** 所在周的周一 */
export function weekStartOf(dateStr = today()) {
  const d = parseDate(dateStr)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return formatDate(d)
}

/** 由周起点展开 7 天，周一在前 */
export function weekDays(startStr) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(startStr, i)
    return {
      date,
      week: WEEK[parseDate(date).getDay()],
      label: date.slice(5),
      isToday: date === today()
    }
  })
}
