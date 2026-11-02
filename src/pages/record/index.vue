<template>
  <view class="record-page">
    <view class="tabs">
      <view
        class="tabs__item"
        :class="{ 'is-active': tab === 'history' }"
        @tap="switchTab('history')"
        >食记</view
      >
      <view
        class="tabs__item"
        :class="{ 'is-active': tab === 'plan' }"
        @tap="switchTab('plan')"
        >排菜计划</view
      >
    </view>

    <scroll-view scroll-y class="record-scroll" :lower-threshold="120" @scrolltolower="loadMore">
      <view v-if="tab === 'history'" class="summary">
        <view class="summary__item">
          <text class="summary__num">{{ totalOrders }}</text>
          <text class="summary__label">已记录餐次</text>
        </view>
        <view class="summary__item">
          <text class="summary__num">{{ totalDishes }}</text>
          <text class="summary__label">累计菜品</text>
        </view>
        <view class="summary__item">
          <text class="summary__num">{{ dayCount }}</text>
          <text class="summary__label">有记录的天数</text>
        </view>
      </view>

      <view v-if="loading" class="u-loading">加载中…</view>

      <empty-state
        v-else-if="!groups.length"
        :emoji="tab === 'plan' ? '🗓️' : '📖'"
        :title="tab === 'plan' ? '还没有排菜计划' : '还没有食记'"
        :desc="tab === 'plan' ? '去点菜页的「饮食计划」排一周的菜' : '下单之后就会记录在这里'"
      />

      <view v-for="group in groups" :key="group.date" class="group">
        <view class="group__head">
          <text class="group__date">{{ dateLabel(group.date) }}</text>
          <text class="group__count">{{ group.orders.length }} 单</text>
        </view>

        <view
          v-for="order in group.orders"
          :key="order._id"
          class="card"
          hover-class="card--hover"
          @tap="goDetail(order)"
        >
          <view class="card__head">
            <text class="card__meal">{{ mealText(order.mealType) }}</text>
            <text class="card__who">{{ order.creatorName || '家人' }} {{ tab === 'plan' ? '排的' : '点的' }}</text>
            <text class="card__status" :class="'is-' + order.status">{{ statusText(order.status) }}</text>
            <text class="card__arrow">›</text>
          </view>

          <view class="card__items">
            <text v-for="item in order.items" :key="item.dishId" class="card__chip">
              {{ item.name }} ×{{ item.count }}
            </text>
          </view>

          <view class="card__foot">
            <text class="card__time">
              {{ tab === 'plan' ? `共 ${order.totalCount || 0} 份` : `${formatTime(order.createTime)} · 共 ${order.totalCount || 0} 份` }}
            </text>
            <view class="card__ops">
              <template v-if="tab === 'plan'">
                <text class="card__op" @tap.stop="addToCart(order)">加入购物车</text>
                <text class="card__op card__op--danger" @tap.stop="clearPlan(order)">清除</text>
              </template>
              <template v-else>
                <text class="card__op" @tap.stop="repeat(order)">再来一单</text>
                <text v-if="order.status !== 'canceled'" class="card__op" @tap.stop="cancel(order)">撤销</text>
              </template>
            </view>
          </view>
        </view>
      </view>

      <view class="record-foot">
        <text v-if="loadingMore" class="u-muted">加载中…</text>
        <text v-else-if="groups.length && !hasMore" class="u-muted">
          {{ tab === 'plan' ? '以上是全部排菜计划' : '没有更早的记录啦' }}
        </text>
      </view>
      <view class="record-pad" />
    </scroll-view>
  </view>
</template>

<script>
import { orderApi } from '@/api'
import { useCartStore } from '@/store/cart'
import { friendlyDate, formatTime, today, shiftDate } from '@/utils/date'
import { MEAL_TYPES } from '@/config'
import { toastOk, toastError, confirm, toast } from '@/utils/ui'

const PAGE_SIZE = 20
/** 排菜计划只看最近一个月，往前的计划参考价值不大 */
const PLAN_DAYS = 30
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2, night: 3 }

export default {
  data() {
    return {
      tab: 'history',
      orders: [],
      page: 0,
      hasMore: true,
      loading: true,
      loadingMore: false
    }
  },

  computed: {
    cart() {
      return useCartStore()
    },
    groups() {
      const map = new Map()
      this.orders.forEach((order) => {
        if (!map.has(order.date)) map.set(order.date, [])
        map.get(order.date).push(order)
      })
      const planMode = this.tab === 'plan'
      return [...map.entries()]
        .map(([date, orders]) => ({ date, orders }))
        .sort((a, b) => {
          if (a.date === b.date) return 0
          if (planMode) return a.date < b.date ? -1 : 1
          return a.date < b.date ? 1 : -1
        })
    },
    totalOrders() {
      return this.orders.filter((order) => order.status !== 'canceled').length
    },
    totalDishes() {
      return this.orders.reduce(
        (sum, order) => sum + (order.status === 'canceled' ? 0 : order.totalCount || 0),
        0
      )
    },
    dayCount() {
      return new Set(this.orders.filter((order) => order.status !== 'canceled').map((o) => o.date)).size
    }
  },

  onShow() {
    this.fetch(true)
  },

  methods: {
    async fetch(reset) {
      if (reset) {
        this.page = 0
        this.hasMore = true
        this.loading = !this.orders.length
      } else {
        this.loadingMore = true
      }
      try {
        const payload = { page: this.page, pageSize: PAGE_SIZE }
        if (this.tab === 'plan') {
          payload.statuses = ['planned']
          payload.from = shiftDate(today(), -PLAN_DAYS)
        } else {
          payload.statuses = ['pending', 'finished', 'canceled']
        }
        const res = await orderApi.list(payload)
        const list = res.list || []
        if (this.tab === 'plan') {
          list.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1
            return (MEAL_ORDER[a.mealType] || 0) - (MEAL_ORDER[b.mealType] || 0)
          })
        }
        this.orders = reset ? list : this.orders.concat(list)
        this.hasMore = list.length >= PAGE_SIZE
        this.page += 1
      } catch (err) {
        toastError(err, this.tab === 'plan' ? '排菜计划加载失败' : '食记加载失败')
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },

    loadMore() {
      if (!this.hasMore || this.loading || this.loadingMore) return
      this.fetch(false)
    },

    switchTab(tab) {
      if (tab === this.tab) return
      this.tab = tab
      this.orders = []
      this.loading = true
      this.fetch(true)
    },

    dateLabel(date) {
      return friendlyDate(date)
    },

    goDetail(order) {
      uni.navigateTo({ url: `/pages/record/detail?id=${order._id}` })
    },

    mealText(value) {
      const hit = MEAL_TYPES.find((meal) => meal.value === value)
      return hit ? hit.label : '用餐'
    },

    statusText(status) {
      return (
        { planned: '计划中', pending: '待确认', finished: '已完成', canceled: '已撤销' }[status] || '已完成'
      )
    },

    formatTime,

    async repeat(order) {
      try {
        const res = await orderApi.repeat(order._id)
        this.cart.replaceWith(res.items)
        if (res.skipped) {
          toastOk(`已加入购物车，${res.skipped} 道菜已下架`)
        } else {
          toastOk('已放回购物车')
        }
        setTimeout(() => uni.switchTab({ url: '/pages/order/index' }), 600)
      } catch (err) {
        toastError(err, '操作失败')
      }
    },

    async cancel(order) {
      const ok = await confirm('撤销后这一单不再计入食记', '撤销订单', '撤销')
      if (!ok) return
      try {
        await orderApi.cancel(order._id)
        order.status = 'canceled'
        toastOk('已撤销')
      } catch (err) {
        toastError(err)
      }
    },

    /** 计划里的整餐加入购物车，回点菜页微调后下单 */
    addToCart(order) {
      const items = order.items || []
      if (!items.length) {
        toast('这一餐还没有菜')
        return
      }
      this.cart.setContext(order.date, order.mealType)
      items.forEach((item) => {
        this.cart.add({ _id: item.dishId, name: item.name, cover: item.cover }, item.count || 1)
      })
      toastOk(`已加入购物车，${this.mealText(order.mealType)}见`)
    },

    async clearPlan(order) {
      const ok = await confirm('清除后这一餐的排菜就没了', '清除排菜', '清除')
      if (!ok) return
      try {
        await orderApi.planClear(order._id)
        this.orders = this.orders.filter((item) => item._id !== order._id)
        toastOk('已清除')
      } catch (err) {
        toastError(err)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.record-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.record-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.tabs {
  flex-shrink: 0;
  display: flex;
  margin: 20rpx 24rpx 4rpx;
  padding: 6rpx;
  border-radius: 999rpx;
  background: #f4ede1;
}

.tabs__item {
  flex: 1;
  height: 62rpx;
  line-height: 62rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: $c-text-2;
}

.tabs__item.is-active {
  background: #fff;
  color: $c-primary-ink;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(160, 140, 100, 0.14);
}

.summary {
  display: flex;
  margin: 20rpx 0 24rpx;
  padding: 28rpx 0;
  border-radius: $radius-lg;
  background: linear-gradient(135deg, #fffdf5, #fbf1d8);
  box-shadow: $shadow-card;
}

.summary__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary__num {
  font-size: 40rpx;
  font-weight: 600;
  color: $c-primary-ink;
}

.summary__label {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #a2967c;
}

.group {
  margin-bottom: 10rpx;
}

.group__head {
  display: flex;
  align-items: baseline;
  padding: 16rpx 6rpx 14rpx;
}

.group__date {
  font-size: 30rpx;
  font-weight: 600;
  color: $c-text;
}

.group__count {
  margin-left: 12rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.card {
  margin-bottom: 18rpx;
  padding: 24rpx;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.card--hover {
  background: #fffdf7;
}

.card__arrow {
  margin-left: 8rpx;
  font-size: 28rpx;
  line-height: 1;
  color: $c-text-3;
}

.card__head {
  display: flex;
  align-items: center;
}

.card__meal {
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  background: $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.card__who {
  margin-left: 12rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.card__status {
  margin-left: auto;
  font-size: 22rpx;
  color: $c-text-3;

  &.is-pending {
    color: $c-primary-ink;
  }

  &.is-finished {
    color: $c-success;
  }

  &.is-canceled {
    color: $c-danger;
  }

  &.is-planned {
    color: $c-primary-ink;
  }
}

.card__items {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.card__chip {
  margin: 0 10rpx 10rpx 0;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  background: #fbf7f0;
  font-size: 22rpx;
  color: $c-text-2;
}

.card__foot {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.card__time {
  flex: 1;
  font-size: 21rpx;
  color: $c-text-3;
}

.card__ops {
  display: flex;
}

.card__op {
  margin-left: 24rpx;
  font-size: 23rpx;
  color: $c-primary-ink;
  text-decoration: underline;
}

.card__op--danger {
  color: $c-danger;
}

.record-foot {
  padding: 20rpx 0;
  text-align: center;
  font-size: 22rpx;
}

.record-pad {
  height: 40rpx;
}
</style>
