<template>
  <view class="kitchen-page">
    <scroll-view scroll-y class="kitchen-scroll">
      <view v-if="loading" class="u-loading">正在整理厨房…</view>

      <block v-else>
        <!-- 概览 -->
        <view class="overview">
          <view class="overview__item">
            <text class="overview__num">{{ overview.dishTotal || 0 }}</text>
            <text class="overview__label">道菜</text>
          </view>
          <view class="overview__divider" />
          <view class="overview__item">
            <text class="overview__num">{{ overview.categoryTotal || 0 }}</text>
            <text class="overview__label">个分类</text>
          </view>
          <view class="overview__divider" />
          <view class="overview__item">
            <text class="overview__num">{{ overview.memberTotal || 0 }}</text>
            <text class="overview__label">位家人</text>
          </view>
          <view class="overview__divider" />
          <view class="overview__item">
            <text class="overview__num">{{ overview.monthOrderTotal || 0 }}</text>
            <text class="overview__label">本月下单</text>
          </view>
        </view>

        <!-- 快捷入口 -->
        <view class="quick">
          <view class="quick__item" @tap="openShopping">
            <text class="quick__icon">🛒</text>
            <text class="quick__text">采购清单</text>
          </view>
          <view class="quick__item" @tap="goRank">
            <text class="quick__icon">🔥</text>
            <text class="quick__text">热度排行</text>
          </view>
          <view class="quick__item" @tap="goAdd">
            <text class="quick__icon">➕</text>
            <text class="quick__text">添加菜品</text>
          </view>
          <view class="quick__item" @tap="goCategory">
            <text class="quick__icon">🗂️</text>
            <text class="quick__text">分类管理</text>
          </view>
        </view>

        <!-- 分类分布 -->
        <view class="card u-card">
          <view class="card__head">
            <text class="card__title">分类分布</text>
            <text class="card__extra">{{ overview.weekStart }} 起统计的热度</text>
          </view>
          <empty-state v-if="!dist.length" emoji="🗂️" title="还没有菜品" />
          <view v-else>
            <view v-for="item in dist" :key="item._id || 'none'" class="dist-row">
              <text class="dist-row__icon">{{ item.icon }}</text>
              <text class="dist-row__name">{{ item.name }}</text>
              <view class="dist-row__bar">
                <view class="dist-row__fill" :style="{ width: barWidth(item.count) }" />
              </view>
              <text class="dist-row__count">{{ item.count }}</text>
            </view>
          </view>
        </view>

        <!-- 本周最常点 -->
        <view class="card u-card">
          <view class="card__head">
            <text class="card__title">近 7 天最常点</text>
            <text class="card__extra" @tap="goRank">查看完整榜单 ›</text>
          </view>
          <empty-state v-if="!topWeek.length" emoji="🔥" title="还没有点菜记录" desc="去点菜页选几道吧" />
          <view
            v-for="(item, index) in topWeek"
            :key="item.dish._id"
            class="top-row"
            @tap="goDetail(item.dish)"
          >
            <text class="top-row__rank" :class="'is-' + (index + 1)">{{ index + 1 }}</text>
            <view class="top-row__photo">
              <cloud-image class="top-row__img" :src="item.dish.cover" size="thumb" :ph-size="28" />
            </view>
            <text class="top-row__name">{{ item.dish.name }}</text>
            <text class="top-row__score">{{ item.score }}</text>
          </view>
        </view>

        <!-- 最新上传 -->
        <view class="card u-card">
          <view class="card__head">
            <text class="card__title">最近添加</text>
            <text class="card__extra">{{ overview.recentDishes.length }} 道</text>
          </view>
          <empty-state v-if="!overview.recentDishes.length" emoji="🍳" title="还没有上传菜品" />
          <view v-else class="recent">
            <view
              v-for="dish in overview.recentDishes"
              :key="dish._id"
              class="recent__item"
              @tap="goDetail(dish)"
            >
              <view class="recent__photo">
                <cloud-image class="recent__img" :src="dish.cover" size="thumb" :ph-size="44" />
              </view>
              <text class="recent__name">{{ dish.name }}</text>
            </view>
          </view>
        </view>

        <view class="kitchen-pad" />
      </block>
    </scroll-view>

    <!-- 采购清单 -->
    <bottom-sheet v-model="shoppingVisible" title="采购清单">
      <view class="days-switch">
        <view
          v-for="opt in dayOptions"
          :key="opt"
          class="days-switch__item"
          :class="{ 'is-active': days === opt }"
          @tap="loadShopping(opt)"
        >
          近 {{ opt }} 天
        </view>
      </view>

      <view v-if="shoppingLoading" class="u-loading">汇总中…</view>
      <empty-state
        v-else-if="!shoppingList.length"
        emoji="🧾"
        title="这几天还没有点菜"
        desc="做过的菜的食材会在这里自动合并"
      />
      <view v-else class="shopping">
        <view v-for="item in shoppingList" :key="item.name" class="shopping__row">
          <view class="shopping__check" />
          <view class="shopping__info">
            <text class="shopping__name">{{ item.name }}</text>
            <text class="shopping__from">{{ item.dishes.join('、') }}</text>
          </view>
          <text class="shopping__amount">{{ item.amount || '适量' }}</text>
        </view>
      </view>
    </bottom-sheet>
  </view>
</template>

<script>
import { statsApi } from '@/api'
import { toastError } from '@/utils/ui'

const EMPTY = {
  dishTotal: 0,
  categoryTotal: 0,
  memberTotal: 0,
  monthOrderTotal: 0,
  categoryDist: [],
  topWeek: [],
  recentDishes: [],
  weekStart: ''
}

export default {
  data() {
    return {
      loading: true,
      overview: { ...EMPTY },
      shoppingVisible: false,
      shoppingLoading: false,
      shoppingList: [],
      days: 7,
      dayOptions: [7, 14, 30]
    }
  },

  computed: {
    dist() {
      return this.overview.categoryDist || []
    },
    topWeek() {
      return this.overview.topWeek || []
    },
    maxDist() {
      return this.dist.reduce((max, item) => Math.max(max, item.count || 0), 1)
    }
  },

  onShow() {
    this.fetch()
  },

  methods: {
    async fetch() {
      if (!this.overview.dishTotal) this.loading = true
      try {
        this.overview = await statsApi.overview()
      } catch (err) {
        toastError(err, '厨房数据加载失败')
      } finally {
        this.loading = false
      }
    },

    barWidth(count) {
      const value = (Number(count) || 0) / this.maxDist
      return `${Math.max(8, Math.round(value * 100))}%`
    },

    async openShopping() {
      this.shoppingVisible = true
      if (!this.shoppingList.length) this.loadShopping(this.days)
    },

    async loadShopping(days) {
      this.days = days
      this.shoppingLoading = true
      try {
        const res = await statsApi.shoppingList({ days })
        this.shoppingList = res.list || []
      } catch (err) {
        toastError(err, '采购清单加载失败')
      } finally {
        this.shoppingLoading = false
      }
    },

    goRank() {
      uni.navigateTo({ url: '/pages/rank/index' })
    },

    goAdd() {
      uni.navigateTo({ url: '/pages/dish/edit' })
    },

    goCategory() {
      uni.navigateTo({ url: '/pages/category/manage' })
    },

    goDetail(dish) {
      uni.navigateTo({ url: `/pages/dish/detail?id=${dish._id}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.kitchen-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.kitchen-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.overview {
  display: flex;
  align-items: center;
  margin: 20rpx 0 24rpx;
  padding: 30rpx 0;
  border-radius: $radius-lg;
  background: linear-gradient(135deg, #fffdf5, #fbf1d8);
  box-shadow: $shadow-card;
}

.overview__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.overview__num {
  font-size: 38rpx;
  font-weight: 600;
  color: $c-primary-ink;
}

.overview__label {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: #a2967c;
}

.overview__divider {
  width: 1px;
  height: 48rpx;
  background: #eadfc4;
}

.quick {
  display: flex;
  margin-bottom: 24rpx;
  padding: 24rpx 0;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.quick__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.quick__icon {
  font-size: 40rpx;
  line-height: 1;
}

.quick__text {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: $c-text-2;
}

.card {
  margin-bottom: 24rpx;
  padding: 28rpx;
}

.card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.card__title {
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.card__extra {
  font-size: 21rpx;
  color: $c-text-3;
}

.dist-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.dist-row__icon {
  width: 40rpx;
  font-size: 24rpx;
}

.dist-row__name {
  width: 120rpx;
  font-size: 24rpx;
  color: $c-text-2;
  @include ellipsis(1);
}

.dist-row__bar {
  flex: 1;
  height: 14rpx;
  margin: 0 16rpx;
  border-radius: 7rpx;
  background: #f4eee2;
  overflow: hidden;
}

.dist-row__fill {
  height: 100%;
  border-radius: 7rpx;
  background: linear-gradient(90deg, #fbe08a, #eab63a);
}

.dist-row__count {
  width: 56rpx;
  text-align: right;
  font-size: 22rpx;
  color: $c-text-3;
}

.top-row {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
}

.top-row__rank {
  width: 44rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #c3bcae;
  text-align: center;
}

.top-row__rank.is-1 {
  color: #e9a23b;
}

.top-row__rank.is-2 {
  color: #b9a48a;
}

.top-row__rank.is-3 {
  color: #c9925f;
}

.top-row__photo {
  @include center;
  width: 72rpx;
  height: 72rpx;
  margin-left: 10rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
}

.top-row__img {
  width: 100%;
  height: 100%;
}

.top-row__name {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  font-size: 26rpx;
  color: $c-text;
  @include ellipsis(1);
}

.top-row__score {
  font-size: 23rpx;
  color: $c-primary-ink;
}

.recent {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18rpx;
}

.recent__item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.recent__photo {
  @include center;
  width: 150rpx;
  height: 150rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
  border: 4rpx solid #fff;
  box-shadow: 0 6rpx 16rpx rgba(190, 160, 100, 0.14);
}

.recent__img {
  width: 100%;
  height: 100%;
}

.recent__name {
  margin-top: 10rpx;
  max-width: 150rpx;
  font-size: 22rpx;
  color: $c-text-2;
  @include ellipsis(1);
}

.kitchen-pad {
  height: 60rpx;
}

/* 采购清单 */
.days-switch {
  display: flex;
  margin-bottom: 20rpx;
  padding: 6rpx;
  border-radius: 32rpx;
  background: #f3ecdd;
}

.days-switch__item {
  @include center;
  flex: 1;
  height: 60rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
  color: $c-text-2;
}

.days-switch__item.is-active {
  background: #fff;
  color: $c-primary-ink;
  font-weight: 600;
}

.shopping {
  padding-bottom: 30rpx;
}

.shopping__row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid $c-line;
}

.shopping__check {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid #ddd4c2;
  margin-right: 18rpx;
  flex-shrink: 0;
}

.shopping__info {
  flex: 1;
  min-width: 0;
}

.shopping__name {
  display: block;
  font-size: 27rpx;
  color: $c-text;
}

.shopping__from {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $c-text-3;
  @include ellipsis(1);
}

.shopping__amount {
  margin-left: 16rpx;
  font-size: 25rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}
</style>
