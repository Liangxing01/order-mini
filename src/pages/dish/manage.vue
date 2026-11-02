<template>
  <view class="manage-page">
    <view class="topbar">
      <view class="topbar__search">
        <text class="topbar__icon">🔍</text>
        <input
          v-model="keyword"
          class="topbar__input"
          placeholder="搜索菜品"
          placeholder-class="topbar__ph"
          confirm-type="search"
          @confirm="reload"
        />
        <text v-if="keyword" class="topbar__clear" @tap="onClear">✕</text>
      </view>
      <view class="topbar__mode" :class="{ 'is-active': selectMode }" @tap="toggleSelectMode">
        {{ selectMode ? '取消' : '批量' }}
      </view>
    </view>

    <scroll-view class="filter" scroll-x :show-scrollbar="false">
      <view
        v-for="chip in filters"
        :key="chip._id"
        class="filter__chip"
        :class="{ 'is-active': chip._id === activeFilter }"
        @tap="onFilter(chip._id)"
      >
        {{ chip.name }}
      </view>
    </scroll-view>

    <scroll-view class="list" scroll-y :lower-threshold="120" @scrolltolower="loadMore">
      <view v-if="loading" class="u-loading">加载中…</view>

      <empty-state
        v-else-if="!dishes.length"
        emoji="🍳"
        title="还没有菜品"
        desc="去添加第一道菜吧"
        action-text="添加菜品"
        @action="goCreate"
      />

      <view
        v-for="dish in dishes"
        :key="dish._id"
        class="row"
        @tap="onRowTap(dish)"
        @longpress="onRowLongPress(dish)"
      >
        <view v-if="selectMode" class="row__check" :class="{ 'is-checked': selected.includes(dish._id) }">
          <text v-if="selected.includes(dish._id)" class="row__check-icon">✓</text>
        </view>

        <view class="row__photo">
          <cloud-image class="row__img" :src="dish.cover" size="thumb" :ph-size="40" />
        </view>

        <view class="row__info">
          <text class="row__name">{{ dish.name }}</text>
          <view class="row__meta">
            <text class="row__tag">{{ categoryName(dish.categoryId) }}</text>
            <text class="row__hot">🔥 {{ hotScore(dish) }}</text>
            <text v-if="dish.status === 'off'" class="row__off">已下架</text>
          </view>
        </view>

        <view class="row__edit" @tap.stop="goEdit(dish)">编辑</view>
      </view>

      <view class="list__foot">
        <text v-if="!hasMore && dishes.length" class="u-muted">共 {{ dishes.length }} 道菜</text>
        <text v-else-if="loadingMore" class="u-muted">加载中…</text>
      </view>
      <view class="list__pad" />
    </scroll-view>

    <view v-if="selectMode" class="batch-bar">
      <view class="batch-bar__count">已选 {{ selected.length }}</view>
      <view class="batch-bar__btn" @tap="openMove">移动到分类</view>
      <view class="batch-bar__btn batch-bar__btn--danger" @tap="batchRemove">删除</view>
    </view>

    <bottom-sheet v-model="moveVisible" title="移动到分类">
      <view class="move-list">
        <view
          v-for="chip in filters"
          :key="chip._id"
          class="move-item"
          @tap="doMove(chip)"
        >
          <text>{{ chip.name }}</text>
          <text class="move-item__arrow">›</text>
        </view>
      </view>
    </bottom-sheet>
  </view>
</template>

<script>
import { useMenuStore } from '@/store/menu'
import { dishApi } from '@/api'
import { toastOk, toastError, confirm } from '@/utils/ui'

const PAGE_SIZE = 30

export default {
  data() {
    return {
      keyword: '',
      dishes: [],
      page: 0,
      hasMore: true,
      loading: true,
      loadingMore: false,
      activeFilter: 'all',
      selectMode: false,
      selected: [],
      moveVisible: false
    }
  },

  computed: {
    menu() {
      return useMenuStore()
    },
    filters() {
      const list = [{ _id: 'all', name: '全部' }]
      this.menu.categories.forEach((cat) => {
        list.push({ _id: cat._id, name: cat.name })
      })
      if (this.menu.uncategorizedCount > 0) {
        list.push({ _id: 'uncategorized', name: '未分类' })
      }
      return list
    }
  },

  onLoad() {
    this.boot()
  },

  onShow() {
    if (this.dishes.length) this.reload()
  },

  methods: {
    async boot() {
      try {
        await this.menu.loadCategories()
      } catch (err) {
        toastError(err, '分类加载失败')
      }
      this.reload()
    },

    async fetch(reset) {
      if (reset) {
        this.page = 0
        this.hasMore = true
        this.loading = true
      } else {
        this.loadingMore = true
      }
      try {
        const params = {
          page: this.page,
          pageSize: PAGE_SIZE
        }
        if (this.activeFilter !== 'all') params.categoryId = this.activeFilter
        if (this.keyword.trim()) params.keyword = this.keyword.trim()

        const res = await dishApi.list(params)
        const list = res.list || []
        this.dishes = reset ? list : this.dishes.concat(list)
        this.hasMore = list.length >= PAGE_SIZE
        this.page += 1
      } catch (err) {
        toastError(err, '加载失败')
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },

    reload() {
      this.selected = []
      this.fetch(true)
    },

    loadMore() {
      if (!this.hasMore || this.loading || this.loadingMore) return
      this.fetch(false)
    },

    onFilter(id) {
      if (this.activeFilter === id) return
      this.activeFilter = id
      this.reload()
    },

    onClear() {
      this.keyword = ''
      this.reload()
    },

    categoryName(categoryId) {
      const hit = this.menu.sideList.find((cat) => cat._id === categoryId)
      if (hit) return hit.name
      return categoryId ? '未知分类' : '未分类'
    },

    hotScore(dish) {
      return Math.round((dish.hot && dish.hot.score) || 0)
    },

    toggleSelectMode() {
      this.selectMode = !this.selectMode
      this.selected = []
    },

    toggleSelect(dish) {
      if (!this.selectMode) {
        this.selectMode = true
      }
      const idx = this.selected.indexOf(dish._id)
      if (idx > -1) {
        this.selected.splice(idx, 1)
      } else {
        this.selected.push(dish._id)
      }
    },

    onRowTap(dish) {
      if (this.selectMode) {
        this.toggleSelect(dish)
      } else {
        this.goEdit(dish)
      }
    },

    onRowLongPress(dish) {
      this.toggleSelect(dish)
    },

    goEdit(dish) {
      uni.navigateTo({ url: `/pages/dish/edit?id=${dish._id}` })
    },

    goCreate() {
      uni.navigateTo({ url: '/pages/dish/edit' })
    },

    openMove() {
      if (!this.selected.length) {
        toastError({ msg: '请先选择菜品' })
        return
      }
      this.moveVisible = true
    },

    async doMove(chip) {
      const categoryId = chip._id === 'all' || chip._id === 'uncategorized' ? '' : chip._id
      try {
        await dishApi.batchMove({ ids: this.selected, categoryId })
        this.moveVisible = false
        this.selectMode = false
        toastOk(`已移动 ${this.selected.length} 道菜`)
        this.selected = []
        this.menu.loadCategories(true).catch(() => undefined)
        this.menu.invalidate()
        this.reload()
      } catch (err) {
        toastError(err, '移动失败')
      }
    },

    async batchRemove() {
      if (!this.selected.length) {
        toastError({ msg: '请先选择菜品' })
        return
      }
      const ok = await confirm(`确定删除选中的 ${this.selected.length} 道菜吗？`, '批量删除', '删除')
      if (!ok) return
      try {
        await dishApi.removeBatch(this.selected)
        toastOk('已删除')
        this.selectMode = false
        this.selected = []
        this.menu.loadCategories(true).catch(() => undefined)
        this.menu.invalidate()
        this.reload()
      } catch (err) {
        toastError(err, '删除失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.manage-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.topbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 20rpx 24rpx 12rpx;
}

.topbar__search {
  flex: 1;
  display: flex;
  align-items: center;
  height: 76rpx;
  padding: 0 24rpx;
  border-radius: 38rpx;
  background: $c-card;
  border: 2rpx solid #efe4cd;
}

.topbar__icon {
  font-size: 24rpx;
  opacity: 0.6;
}

.topbar__input {
  flex: 1;
  min-width: 0;
  margin-left: 12rpx;
  font-size: 26rpx;
}

.topbar__ph {
  color: $c-text-3;
  font-size: 26rpx;
}

.topbar__clear {
  font-size: 24rpx;
  color: $c-text-3;
}

.topbar__mode {
  @include center;
  height: 76rpx;
  margin-left: 16rpx;
  padding: 0 28rpx;
  border-radius: 38rpx;
  background: $c-card;
  border: 2rpx solid #efe4cd;
  font-size: 26rpx;
  color: $c-text-2;

  &.is-active {
    background: $c-primary-pale;
    border-color: $c-primary;
    color: $c-primary-ink;
  }
}

.filter {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 8rpx 24rpx 16rpx;
}

.filter__chip {
  display: inline-block;
  margin-right: 14rpx;
  padding: 0 26rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 30rpx;
  background: $c-card;
  font-size: 24rpx;
  color: $c-text-2;
  border: 2rpx solid transparent;
}

.filter__chip.is-active {
  background: $c-primary-pale;
  border-color: $c-primary;
  color: $c-primary-ink;
  font-weight: 600;
}

.list {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.row {
  display: flex;
  align-items: center;
  margin-bottom: 18rpx;
  padding: 20rpx;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.row__check {
  @include center;
  width: 44rpx;
  height: 44rpx;
  margin-right: 16rpx;
  border-radius: 50%;
  border: 2rpx solid #ddd4c2;
  flex-shrink: 0;
}

.row__check.is-checked {
  background: $c-primary;
  border-color: $c-primary;
}

.row__check-icon {
  color: #fff;
  font-size: 22rpx;
}

.row__photo {
  @include center;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
  flex-shrink: 0;
}

.row__img {
  width: 100%;
  height: 100%;
}

.row__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.row__name {
  display: block;
  font-size: 28rpx;
  color: $c-text;
  @include ellipsis(1);
}

.row__meta {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.row__tag {
  padding: 2rpx 14rpx;
  border-radius: 16rpx;
  background: #fbf4e2;
  font-size: 20rpx;
  color: $c-primary-ink;
}

.row__hot {
  margin-left: 14rpx;
  font-size: 20rpx;
  color: $c-text-3;
}

.row__off {
  margin-left: 14rpx;
  font-size: 20rpx;
  color: $c-danger;
}

.row__edit {
  @include center;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 28rpx;
  border: 2rpx solid $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}

.list__foot {
  padding: 24rpx 0;
  text-align: center;
  font-size: 22rpx;
}

.list__pad {
  height: 140rpx;
}

.batch-bar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  height: 100rpx;
  padding: 0 16rpx 0 28rpx;
  border-radius: 50rpx;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 10rpx 30rpx rgba(150, 125, 80, 0.2);
}

.batch-bar__count {
  flex: 1;
  font-size: 26rpx;
  color: $c-text-2;
}

.batch-bar__btn {
  @include center;
  height: 68rpx;
  margin-left: 14rpx;
  padding: 0 26rpx;
  border-radius: 34rpx;
  background: $c-primary-pale;
  font-size: 24rpx;
  color: $c-primary-ink;
}

.batch-bar__btn--danger {
  background: #fdecea;
  color: $c-danger;
}

.move-list {
  padding-bottom: 30rpx;
}

.move-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 96rpx;
  border-bottom: 1px solid $c-line;
  font-size: 28rpx;
  color: $c-text;
}

.move-item__arrow {
  color: $c-text-3;
}
</style>
