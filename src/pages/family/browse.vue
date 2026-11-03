<template>
  <view class="browse-page">
    <!-- 家庭筛选 -->
    <scroll-view scroll-x class="tabs" :show-scrollbar="false">
      <view
        class="tab"
        :class="{ 'is-active': !currentFamilyId }"
        @tap="selectFamily('')"
      >
        全部
      </view>
      <view
        v-for="family in families"
        :key="family._id"
        class="tab"
        :class="{ 'is-active': currentFamilyId === family._id }"
        @tap="selectFamily(family._id)"
      >
        {{ family.name }}
        <text v-if="family.isMine" class="tab__mine">我家</text>
      </view>
    </scroll-view>

    <view class="tip">
      <text class="tip__text">超级VIP 可以浏览所有家庭的菜单，把喜欢的菜复制到自己的菜单里</text>
    </view>

    <scroll-view scroll-y class="list" @scrolltolower="loadMore">
      <view v-if="loading" class="u-loading">加载中…</view>

      <empty-state
        v-else-if="!dishes.length"
        emoji="🍳"
        title="这个家庭还没有菜"
        desc="换个家庭看看"
      />

      <view v-for="dish in dishes" :key="dish._id" class="row">
        <cloud-image class="row__cover" :src="dish.cover" size="card" placeholder="🍲" :ph-size="40" />
        <view class="row__info">
          <text class="row__name">{{ dish.name }}</text>
          <view class="row__tags">
            <text class="row__tag">{{ dish.tags && dish.tags.type ? dish.tags.type : '其他' }}</text>
            <text v-if="dish.tags && dish.tags.minutes" class="row__tag">{{ dish.tags.minutes }} 分钟</text>
            <text v-if="familyNameOf(dish)" class="row__tag row__tag--family">{{ familyNameOf(dish) }}</text>
          </view>
        </view>
        <view
          class="row__import"
          :class="{ 'is-done': importedIds.indexOf(dish._id) !== -1 }"
          @tap="onImport(dish)"
        >
          {{ importedIds.indexOf(dish._id) !== -1 ? '已导入' : '导入' }}
        </view>
      </view>

      <view v-if="dishes.length && dishes.length % PAGE_SIZE === 0" class="more" @tap="loadMore">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </view>
      <view class="list__pad" />
    </scroll-view>
  </view>
</template>

<script>
import { familyApi, dishApi } from '@/api'
import { toastOk, toastError } from '@/utils/ui'

const PAGE_SIZE = 30

export default {
  data() {
    return {
      PAGE_SIZE,
      families: [],
      familyMap: {},
      currentFamilyId: '',
      dishes: [],
      importedIds: [],
      page: 0,
      loading: true,
      loadingMore: false,
      finished: false
    }
  },

  onLoad() {
    this.loadFamilies()
  },

  methods: {
    async loadFamilies() {
      try {
        const res = await familyApi.list()
        this.families = res.list || []
        const map = {}
        this.families.forEach((family) => {
          map[family._id] = family.name
        })
        this.familyMap = map
      } catch (err) {
        toastError(err, '家庭列表加载失败')
      }
      this.reload()
    },

    familyNameOf(dish) {
      if (this.currentFamilyId) return ''
      return this.familyMap[dish.familyId] || ''
    },

    selectFamily(familyId) {
      if (this.currentFamilyId === familyId) return
      this.currentFamilyId = familyId
      this.reload()
    },

    async reload() {
      this.page = 0
      this.dishes = []
      this.finished = false
      await this.loadPage()
    },

    async loadPage() {
      this.loading = this.page === 0
      this.loadingMore = this.page > 0
      try {
        // 选中家庭就看这家；「全部」显式声明跳家庭，否则后端默认回到自己家
        const scope = this.currentFamilyId
          ? { familyId: this.currentFamilyId }
          : { allFamilies: true }
        const res = await dishApi.list({ page: this.page, pageSize: PAGE_SIZE, ...scope })
        const list = res.list || []
        this.dishes = this.page === 0 ? list : this.dishes.concat(list)
        this.finished = list.length < PAGE_SIZE
      } catch (err) {
        toastError(err, '菜品加载失败')
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },

    loadMore() {
      if (this.loading || this.loadingMore || this.finished) return
      this.page += 1
      this.loadPage()
    },

    async onImport(dish) {
      if (this.importedIds.indexOf(dish._id) !== -1) return
      try {
        await dishApi.importDish(dish._id)
        this.importedIds = this.importedIds.concat(dish._id)
        toastOk('已复制到我的菜单')
      } catch (err) {
        toastError(err, '导入失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.browse-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.tabs {
  flex-shrink: 0;
  padding: 18rpx 24rpx 4rpx;
  white-space: nowrap;
}

.tab {
  display: inline-flex;
  align-items: center;
  height: 64rpx;
  margin-right: 16rpx;
  padding: 0 28rpx;
  border-radius: 32rpx;
  background: #f3ede2;
  font-size: 24rpx;
  color: $c-text-2;
}

.tab.is-active {
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-weight: 600;
}

.tab__mine {
  margin-left: 8rpx;
  font-size: 19rpx;
  opacity: 0.85;
}

.tip {
  flex-shrink: 0;
  padding: 14rpx 28rpx 6rpx;
}

.tip__text {
  font-size: 21rpx;
  line-height: 1.5;
  color: #b8b0a2;
}

.list {
  flex: 1;
  min-height: 0;
  padding: 8rpx 24rpx 0;
  box-sizing: border-box;
}

.row {
  display: flex;
  align-items: center;
  margin-bottom: 18rpx;
  padding: 18rpx;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.row__cover {
  width: 132rpx;
  height: 132rpx;
  border-radius: $radius-md;
  background: #fdf6e3;
  flex-shrink: 0;
}

.row__info {
  flex: 1;
  min-width: 0;
  margin: 0 18rpx;
}

.row__name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
  @include ellipsis(1);
}

.row__tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10rpx;
}

.row__tag {
  margin: 0 10rpx 6rpx 0;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  background: #fbf7f0;
  font-size: 20rpx;
  color: $c-text-3;
}

.row__tag--family {
  background: $c-primary-pale;
  color: $c-primary-ink;
}

.row__import {
  @include center;
  width: 120rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background: $c-primary-pale;
  font-size: 24rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}

.row__import.is-done {
  background: #f2f2ee;
  color: #b8b0a2;
}

.more {
  @include center;
  height: 80rpx;
  margin-bottom: 20rpx;
  font-size: 24rpx;
  color: $c-primary-ink;
}

.list__pad {
  height: 40rpx;
}
</style>
