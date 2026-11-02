import { defineStore } from 'pinia'
import { categoryApi, dishApi } from '@/api'
import { UNCATEGORIZED_ID } from '@/config'

const PAGE_SIZE = 40

function emptyBucket() {
  return { list: [], page: 0, hasMore: true, loading: false, loaded: false }
}

export const useMenuStore = defineStore('menu', {
  state: () => ({
    categories: [],
    uncategorizedCount: 0,
    currentId: '',
    /** { [categoryId]: { list, page, hasMore, loading, loaded } } */
    buckets: {},
    keyword: '',
    searchBucket: emptyBucket(),
    categoriesLoaded: false
  }),

  getters: {
    /** 左侧栏数据源，末尾追加虚拟的「未分类」 */
    sideList(state) {
      const list = state.categories.map((c) => ({
        _id: c._id,
        name: c.name,
        icon: c.icon || '🍽️',
        dishCount: c.dishCount || 0
      }))
      if (state.uncategorizedCount > 0) {
        list.push({
          _id: UNCATEGORIZED_ID,
          name: '未分类',
          icon: '🍴',
          dishCount: state.uncategorizedCount
        })
      }
      return list
    },

    currentCategory(state) {
      return this.sideList.find((c) => c._id === state.currentId) || this.sideList[0] || null
    },

    currentBucket(state) {
      if (state.keyword) return state.searchBucket
      return state.buckets[state.currentId] || emptyBucket()
    },

    currentDishes() {
      return this.currentBucket.list
    }
  },

  actions: {
    /** 拉取分类（带每个分类下的菜品数） */
    async loadCategories(force = false) {
      if (this.categoriesLoaded && !force) return this.sideList
      const res = await categoryApi.list()
      this.categories = res.list || []
      this.uncategorizedCount = res.uncategorizedCount || 0
      this.categoriesLoaded = true
      if (!this.currentId && this.sideList.length) {
        this.currentId = this.sideList[0]._id
      }
      return this.sideList
    },

    invalidate() {
      this.buckets = {}
      this.searchBucket = emptyBucket()
    },

    setCurrent(id) {
      this.currentId = id
      this.keyword = ''
      this.searchBucket = emptyBucket()
    },

    /**
     * 加载当前分类的菜品
     * @param {{ force?: boolean, more?: boolean }} options
     */
    async loadDishes({ force = false, more = false } = {}) {
      const categoryId = this.currentId
      if (!categoryId) return []

      const bucket = this.buckets[categoryId] || emptyBucket()
      if (bucket.loading) return bucket.list
      if (!more && bucket.loaded && !force) return bucket.list
      if (more && !bucket.hasMore) return bucket.list

      bucket.loading = true
      if (!more) {
        bucket.page = 0
        bucket.hasMore = true
      }
      this.buckets[categoryId] = bucket

      try {
        const res = await dishApi.list({
          categoryId,
          page: bucket.page,
          pageSize: PAGE_SIZE
        })
        const list = res.list || []
        bucket.list = more ? bucket.list.concat(list) : list
        bucket.page += 1
        bucket.hasMore = list.length >= PAGE_SIZE
        bucket.loaded = true
      } finally {
        bucket.loading = false
        // 触发响应式更新
        this.buckets = { ...this.buckets, [categoryId]: bucket }
      }
      return bucket.list
    },

    /** 搜索：跨分类 */
    async search(keyword) {
      this.keyword = keyword
      if (!keyword) {
        this.searchBucket = emptyBucket()
        return []
      }
      const bucket = emptyBucket()
      bucket.loading = true
      this.searchBucket = bucket
      try {
        const res = await dishApi.list({ keyword, page: 0, pageSize: PAGE_SIZE })
        bucket.list = res.list || []
        bucket.hasMore = (res.list || []).length >= PAGE_SIZE
        bucket.loaded = true
      } finally {
        bucket.loading = false
        this.searchBucket = { ...bucket, list: bucket.list }
      }
      return bucket.list
    },

    clearSearch() {
      this.keyword = ''
      this.searchBucket = emptyBucket()
    },

    /** 本地同步新增/编辑后的菜品，避免整页刷新闪烁 */
    upsertDish(dish) {
      const dishId = dish._id
      Object.keys(this.buckets).forEach((key) => {
        const bucket = this.buckets[key]
        const idx = bucket.list.findIndex((d) => d._id === dishId)
        const belongs = key === dish.categoryId
        if (idx > -1 && !belongs) {
          bucket.list.splice(idx, 1)
        } else if (idx > -1) {
          bucket.list.splice(idx, 1, { ...bucket.list[idx], ...dish })
        } else if (belongs) {
          bucket.list.unshift(dish)
        }
      })
      this.buckets = { ...this.buckets }
    },

    removeDish(dishId) {
      Object.keys(this.buckets).forEach((key) => {
        const bucket = this.buckets[key]
        bucket.list = bucket.list.filter((d) => d._id !== dishId)
      })
      this.buckets = { ...this.buckets }
    }
  }
})
