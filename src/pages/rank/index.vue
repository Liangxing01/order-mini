<template>
  <view class="rank-page">
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tabs__item"
        :class="{ 'is-active': tab.value === range }"
        @tap="onTab(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <scroll-view scroll-y class="rank-scroll">
      <view v-if="loading" class="u-loading">正在统计…</view>

      <empty-state
        v-else-if="!list.length"
        emoji="🔥"
        title="还没有热度数据"
        desc="多点点菜、加加菜，榜单就会热起来"
      />

      <block v-else>
        <!-- 前三名 -->
        <view class="podium">
          <view
            v-for="(item, index) in podium"
            :key="item.dish._id"
            class="podium__item"
            :class="'is-' + (index + 1)"
            @tap="goDetail(item.dish)"
          >
            <text class="podium__medal">{{ medals[index] }}</text>
            <view class="podium__photo" :class="'is-' + (index + 1)">
              <cloud-image class="podium__img" :src="item.dish.cover" size="cover" :ph-size="52" />
            </view>
            <text class="podium__name">{{ item.dish.name }}</text>
            <text class="podium__score">热度 {{ item.score }}</text>
          </view>
        </view>

        <!-- 4 名之后 -->
        <view class="list">
          <view
            v-for="(item, index) in rest"
            :key="item.dish._id"
            class="row"
            @tap="goDetail(item.dish)"
          >
            <text class="row__rank">{{ index + 4 }}</text>
            <view class="row__photo">
              <cloud-image class="row__img" :src="item.dish.cover" size="thumb" :ph-size="32" />
            </view>
            <view class="row__info">
              <text class="row__name">{{ item.dish.name }}</text>
              <view class="row__bar">
                <view class="row__bar-fill" :style="{ width: barWidth(item.score) }" />
              </view>
            </view>
            <text class="row__score">{{ item.score }}</text>
          </view>
        </view>
      </block>

      <view class="rank-foot">
        <text class="u-muted">{{ rangeText }} · 下单×3 加购×1 浏览×0.2</text>
      </view>
      <view class="rank-pad" />
    </scroll-view>
  </view>
</template>

<script>
import { rankApi } from '@/api'
import { toastError } from '@/utils/ui'

export default {
  data() {
    return {
      tabs: [
        { value: 'week', label: '近 7 天' },
        { value: 'month', label: '近 30 天' },
        { value: 'all', label: '累计' }
      ],
      range: 'week',
      list: [],
      loading: true,
      medals: ['🥇', '🥈', '🥉']
    }
  },

  computed: {
    podium() {
      return this.list.slice(0, 3)
    },
    rest() {
      return this.list.slice(3)
    },
    maxScore() {
      return this.list.length ? Number(this.list[0].score) || 1 : 1
    },
    rangeText() {
      const hit = this.tabs.find((tab) => tab.value === this.range)
      return hit ? hit.label : ''
    }
  },

  onLoad() {
    this.fetch()
  },

  onPullDownRefresh() {
    this.fetch().finally(() => uni.stopPullDownRefresh())
  },

  methods: {
    async fetch() {
      this.loading = true
      try {
        const res = await rankApi.hot({ range: this.range, limit: 20 })
        this.list = res.list || []
      } catch (err) {
        toastError(err, '排行榜加载失败')
      } finally {
        this.loading = false
      }
    },

    onTab(value) {
      if (this.range === value) return
      this.range = value
      this.fetch()
    },

    barWidth(score) {
      const value = (Number(score) || 0) / this.maxScore
      return `${Math.max(6, Math.round(value * 100))}%`
    },

    goDetail(dish) {
      uni.navigateTo({ url: `/pages/dish/detail?id=${dish._id}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.rank-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.tabs {
  display: flex;
  flex-shrink: 0;
  margin: 16rpx 24rpx;
  padding: 8rpx;
  border-radius: 40rpx;
  background: #f3ecdd;
}

.tabs__item {
  @include center;
  flex: 1;
  height: 64rpx;
  border-radius: 32rpx;
  font-size: 26rpx;
  color: $c-text-2;
}

.tabs__item.is-active {
  background: #fff;
  color: $c-primary-ink;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(180, 150, 90, 0.14);
}

.rank-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20rpx 0 30rpx;
}

.podium__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 200rpx;
}

.podium__item.is-1 {
  order: 2;
  transform: translateY(-16rpx);
}

.podium__item.is-2 {
  order: 1;
}

.podium__item.is-3 {
  order: 3;
}

.podium__medal {
  font-size: 40rpx;
  line-height: 1;
}

.podium__photo {
  @include center;
  width: 150rpx;
  height: 150rpx;
  margin-top: 10rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
  border: 6rpx solid #fff;
  box-shadow: 0 8rpx 20rpx rgba(190, 160, 100, 0.22);
}

.podium__photo.is-1 {
  width: 180rpx;
  height: 180rpx;
  border-color: #f7d873;
}

.podium__img {
  width: 100%;
  height: 100%;
}

.podium__name {
  margin-top: 12rpx;
  max-width: 190rpx;
  font-size: 26rpx;
  color: $c-text;
  @include ellipsis(1);
}

.podium__score {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.list {
  padding-bottom: 10rpx;
}

.row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  padding: 18rpx 22rpx;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.row__rank {
  width: 48rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #b9b2a3;
  text-align: center;
  flex-shrink: 0;
}

.row__photo {
  @include center;
  width: 88rpx;
  height: 88rpx;
  margin-left: 8rpx;
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
  margin-left: 18rpx;
}

.row__name {
  display: block;
  font-size: 27rpx;
  color: $c-text;
  @include ellipsis(1);
}

.row__bar {
  margin-top: 10rpx;
  height: 10rpx;
  border-radius: 5rpx;
  background: #f4eee2;
  overflow: hidden;
}

.row__bar-fill {
  height: 100%;
  border-radius: 5rpx;
  background: linear-gradient(90deg, #fbe08a, #eab63a);
}

.row__score {
  margin-left: 18rpx;
  font-size: 24rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}

.rank-foot {
  padding: 24rpx 0;
  text-align: center;
  font-size: 22rpx;
}

.rank-pad {
  height: 40rpx;
}
</style>
