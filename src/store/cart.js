import { defineStore } from 'pinia'
import { orderApi, dishApi } from '@/api'
import { today, defaultMeal } from '@/utils/date'

const STORAGE_KEY = 'lulu_cart_v1'

function readCache() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (raw && Array.isArray(raw.items)) return raw
  } catch (err) {
    console.warn('[cart] 读取缓存失败', err)
  }
  return null
}

export const useCartStore = defineStore('cart', {
  state: () => {
    const cached = readCache() || {}
    return {
      /** [{ _id, name, cover, count }] */
      items: cached.items || [],
      orderDate: cached.orderDate || today(),
      mealType: cached.mealType || defaultMeal(),
      submitting: false
    }
  },

  getters: {
    totalCount: (s) => s.items.reduce((sum, i) => sum + i.count, 0),
    isEmpty: (s) => s.items.length === 0,
    /** { dishId: count } */
    countMap: (s) => {
      const map = {}
      s.items.forEach((i) => {
        map[i._id] = i.count
      })
      return map
    }
  },

  actions: {
    persist() {
      uni.setStorageSync(STORAGE_KEY, {
        items: this.items,
        orderDate: this.orderDate,
        mealType: this.mealType
      })
    },

    add(dish, step = 1) {
      if (!dish || !dish._id) return
      const hit = this.items.find((i) => i._id === dish._id)
      if (hit) {
        hit.count += step
      } else {
        this.items.push({
          _id: dish._id,
          name: dish.name,
          cover: dish.cover || '',
          count: step
        })
      }
      this.persist()
    },

    dec(dishId, step = 1) {
      const idx = this.items.findIndex((i) => i._id === dishId)
      if (idx === -1) return
      this.items[idx].count -= step
      if (this.items[idx].count <= 0) this.items.splice(idx, 1)
      this.persist()
    },

    setCount(dishId, count) {
      const idx = this.items.findIndex((i) => i._id === dishId)
      if (idx === -1) return
      if (count <= 0) {
        this.items.splice(idx, 1)
      } else {
        this.items[idx].count = count
      }
      this.persist()
    },

    clear() {
      this.items = []
      this.persist()
    },

    setContext(date, mealType) {
      if (date) this.orderDate = date
      if (mealType) this.mealType = mealType
      this.persist()
    },

    /** 用随机点菜结果覆盖购物车 */
    replaceWith(dishes = []) {
      this.items = dishes.map((d) => ({
        _id: d._id,
        name: d.name,
        cover: d.cover || '',
        count: 1
      }))
      this.persist()
    },

    async submit(note = '') {
      if (this.isEmpty) throw new Error('还没有选菜')
      this.submitting = true
      try {
        const payload = {
          date: this.orderDate,
          mealType: this.mealType,
          note,
          items: this.items.map((i) => ({ dishId: i._id, count: i.count }))
        }
        const res = await orderApi.submit(payload)
        this.clear()
        return res
      } finally {
        this.submitting = false
      }
    },

    /** 加购时上报热度，失败不打断主流程 */
    trackAdd(dishId) {
      dishApi.track({ _id: dishId, action: 'add' }).catch(() => undefined)
    }
  }
})
