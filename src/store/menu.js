import { defineStore } from 'pinia'
import { categoryApi, dishApi } from '@/api'
import { UNCATEGORIZED_ID } from '@/config'

const PAGE_SIZE = 40

function emptyBucket() {
  return { list: [], page: 0, hasMore: true, loading: false, loaded: false }
}

/** 还没拿到当前分类的数据时的占位：右侧立刻进入加载态，不会停在上一个分类 */
function pendingBucket() {
  return { list: [], page: 0, hasMore: true, loading: true, loaded: false }
}

export const useMenuStore = defineStore('menu', {
  state: () => ({
    categories: [],
    uncategorizedCount: 0,
    currentId: '',
    /**
     * 当前分类的菜品数据。
     * 只保留当前分类、每次整体替换对象，比按分类 id 存 map 少一类「写进去读不到」的问题。
     */
    bucket: emptyBucket(),
    /** bucket 属于哪个分类，用来判断数据是不是当前分类的 */
    bucketCategoryId: '',
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
      if (!state.currentId) return emptyBucket()
      // 手上这份数据不属于当前分类，说明还没开始请求
      if (state.bucketCategoryId !== state.currentId) return pendingBucket()
      return state.bucket
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
      this.bucket = emptyBucket()
      this.bucketCategoryId = ''
      this.searchBucket = emptyBucket()
    },

    setCurrent(id) {
      this.currentId = id
      this.keyword = ''
      this.searchBucket = emptyBucket()
      // 切到新分类先清空，避免右侧短暂显示上一个分类的菜
      if (this.bucketCategoryId !== id) {
        this.bucket = emptyBucket()
        this.bucketCategoryId = id
      }
    },

    /**
     * 加载当前分类的菜品
     * @param {{ force?: boolean, more?: boolean }} options
     */
    async loadDishes({ force = false, more = false } = {}) {
      const categoryId = this.currentId
      if (!categoryId) return []

      const sameCategory = this.bucketCategoryId === categoryId
      if (sameCategory && this.bucket.loading) return this.bucket.list
      // 上次拿到的是空列表就不缓存，下次点这个分类会重新请求（可能刚加了菜）
      if (!more && sameCategory && this.bucket.loaded && this.bucket.list.length && !force) {
        return this.bucket.list
      }
      if (more && sameCategory && !this.bucket.hasMore) return this.bucket.list

      const page = more && sameCategory ? this.bucket.page : 0
      const base = more && sameCategory ? this.bucket : emptyBucket()
      this.bucketCategoryId = categoryId
      this.bucket = { ...base, loading: true }

      try {
        const res = await dishApi.list({ categoryId, page, pageSize: PAGE_SIZE })
        // 请求期间又切了分类，这份结果直接丢掉
        if (this.bucketCategoryId !== categoryId) return this.bucket.list
        const list = res.list || []
        this.bucket = {
          list: more ? this.bucket.list.concat(list) : list,
          page: page + 1,
          hasMore: list.length >= PAGE_SIZE,
          loading: false,
          loaded: true
        }
      } catch (err) {
        if (this.bucketCategoryId === categoryId) {
          this.bucket = { ...this.bucket, loading: false }
        }
        throw err
      }
      return this.bucket.list
    },

    /** 搜索：跨分类 */
    async search(keyword) {
      this.keyword = keyword
      if (!keyword) {
        this.searchBucket = emptyBucket()
        return []
      }
      this.searchBucket = { ...emptyBucket(), loading: true }
      try {
        const res = await dishApi.list({ keyword, page: 0, pageSize: PAGE_SIZE })
        const list = res.list || []
        this.searchBucket = {
          list,
          page: 1,
          hasMore: list.length >= PAGE_SIZE,
          loading: false,
          loaded: true
        }
        return list
      } catch (err) {
        this.searchBucket = { ...this.searchBucket, loading: false }
        throw err
      }
    },

    clearSearch() {
      this.keyword = ''
      this.searchBucket = emptyBucket()
    },

    /** 本地同步新增/编辑后的菜品，避免整页刷新闪烁 */
    upsertDish(dish) {
      const list = this.bucket.list.slice()
      const idx = list.findIndex((d) => d._id === dish._id)
      const belongs = dish.categoryId === this.bucketCategoryId
      if (idx > -1) {
        if (belongs) list.splice(idx, 1, { ...list[idx], ...dish })
        else list.splice(idx, 1)
      } else if (belongs) {
        list.unshift(dish)
      }
      this.bucket = { ...this.bucket, list }
    },

    removeDish(dishId) {
      this.bucket = { ...this.bucket, list: this.bucket.list.filter((d) => d._id !== dishId) }
    }
  }
})
