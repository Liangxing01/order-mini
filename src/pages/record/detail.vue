<template>
  <view class="order-detail">
    <scroll-view scroll-y class="order-detail__scroll">
      <view v-if="loading" class="u-loading">加载中…</view>

      <empty-state
        v-else-if="!order"
        emoji="🧾"
        title="没找到这一单"
        desc="可能已经被清除了，返回列表刷新看看吧"
      />

      <block v-else>
        <!-- 单头 -->
        <view class="hero u-card">
          <view class="hero__top">
            <text class="hero__date">{{ dateLabel }}</text>
            <text class="hero__status" :class="'is-' + order.status">{{ statusText }}</text>
          </view>

          <view class="hero__meta">
            <text class="hero__meal">{{ mealLabel }}</text>
            <text class="hero__who">{{ order.creatorName || '家人' }}{{ isPlan ? ' 排的' : ' 点的' }}</text>
          </view>

          <text v-if="clockText" class="hero__time">{{ clockText }}</text>

          <view v-if="order.note" class="hero__note">
            <text class="hero__note-label">备注</text>
            <text class="hero__note-text">{{ order.note }}</text>
          </view>
        </view>

        <!-- 菜品清单 -->
        <view class="dishes u-card">
          <view class="dishes__head">
            <text class="dishes__title">菜品清单</text>
            <text class="dishes__total">{{ items.length }} 道 · 共 {{ totalCount }} 份</text>
          </view>

          <view
            v-for="item in items"
            :key="item.dishId"
            class="dish"
            hover-class="dish--hover"
            @tap="openDish(item)"
          >
            <view class="dish__photo">
              <cloud-image class="dish__img" :src="item.cover" size="thumb" :ph-size="34" />
            </view>
            <view class="dish__info">
              <text class="dish__name">{{ item.name }}</text>
              <text class="dish__hint">看看做法</text>
            </view>
            <text class="dish__count">×{{ item.count }}</text>
          </view>

          <view v-if="!items.length" class="dishes__empty">这一单里没有菜品记录</view>
        </view>

        <view class="page-pad" />
      </block>
    </scroll-view>

    <view v-if="order" class="footer u-safe-bottom">
      <template v-if="isPlan">
        <view class="footer__ghost" @tap="clearPlan">清除计划</view>
        <view class="footer__primary" @tap="addToCart">加入购物车</view>
      </template>
      <template v-else>
        <view v-if="order.status !== 'canceled'" class="footer__ghost" @tap="cancel">撤销这一单</view>
        <view class="footer__primary" @tap="repeat">再来一单</view>
      </template>
    </view>
  </view>
</template>

<script>
import { orderApi } from '@/api'
import { useCartStore } from '@/store/cart'
import { friendlyDate, formatTime } from '@/utils/date'
import { MEAL_TYPES } from '@/config'
import { toast, toastOk, toastError, confirm } from '@/utils/ui'

const STATUS_TEXT = {
  planned: '计划中',
  pending: '待确认',
  finished: '已完成',
  canceled: '已撤销'
}

export default {
  data() {
    return {
      orderId: '',
      order: null,
      loading: true
    }
  },

  computed: {
    cart() {
      return useCartStore()
    },
    items() {
      return (this.order && this.order.items) || []
    },
    totalCount() {
      return this.items.reduce((sum, item) => sum + (item.count || 0), 0)
    },
    isPlan() {
      return !!this.order && this.order.status === 'planned'
    },
    dateLabel() {
      return this.order ? friendlyDate(this.order.date) : ''
    },
    mealLabel() {
      if (!this.order) return ''
      const hit = MEAL_TYPES.find((meal) => meal.value === this.order.mealType)
      return hit ? hit.label : '用餐'
    },
    statusText() {
      return (this.order && STATUS_TEXT[this.order.status]) || '已完成'
    },
    clockText() {
      return this.order && this.order.createTime ? formatTime(this.order.createTime) : ''
    }
  },

  onLoad(query) {
    this.orderId = (query && query.id) || ''
    this.load()
  },

  methods: {
    async load() {
      if (!this.orderId) {
        this.loading = false
        return
      }
      try {
        this.order = await orderApi.detail(this.orderId)
        uni.setNavigationBarTitle({ title: this.isPlan ? '排菜详情' : '订单详情' })
      } catch (err) {
        toastError(err, '订单加载失败')
      } finally {
        this.loading = false
      }
    },

    openDish(item) {
      if (!item || !item.dishId) return
      uni.navigateTo({ url: `/pages/dish/detail?id=${item.dishId}` })
    },

    /** 计划里的整餐加入购物车，回点菜页微调后下单 */
    addToCart() {
      if (!this.items.length) {
        toast('这一餐还没有菜')
        return
      }
      this.cart.setContext(this.order.date, this.order.mealType)
      this.items.forEach((item) => {
        this.cart.add({ _id: item.dishId, name: item.name, cover: item.cover }, item.count || 1)
      })
      toastOk('已加入购物车')
      setTimeout(() => uni.navigateBack(), 600)
    },

    async repeat() {
      try {
        const res = await orderApi.repeat(this.orderId)
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

    async cancel() {
      const ok = await confirm('撤销后这一单不再计入食记', '撤销订单', '撤销')
      if (!ok) return
      try {
        await orderApi.cancel(this.orderId)
        this.order.status = 'canceled'
        toastOk('已撤销')
      } catch (err) {
        toastError(err)
      }
    },

    async clearPlan() {
      const ok = await confirm('清除后这一餐的排菜就没了', '清除排菜', '清除')
      if (!ok) return
      try {
        await orderApi.planClear(this.orderId)
        toastOk('已清除')
        setTimeout(() => uni.navigateBack(), 500)
      } catch (err) {
        toastError(err)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.order-detail {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.order-detail__scroll {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.hero {
  margin-top: 20rpx;
  padding: 28rpx;
}

.hero__top {
  display: flex;
  align-items: center;
}

.hero__date {
  font-size: 34rpx;
  font-weight: 600;
  color: $c-text;
}

.hero__status {
  margin-left: auto;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  background: #f4efe5;
  font-size: 22rpx;
  color: $c-text-3;

  &.is-pending,
  &.is-planned {
    background: $c-primary-pale;
    color: $c-primary-ink;
  }

  &.is-finished {
    background: #eaf6ec;
    color: $c-success;
  }

  &.is-canceled {
    background: #fdecea;
    color: $c-danger;
  }
}

.hero__meta {
  display: flex;
  align-items: center;
  margin-top: 18rpx;
}

.hero__meal {
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  background: $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.hero__who {
  margin-left: 12rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.hero__time {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: $c-text-3;
}

.hero__note {
  display: flex;
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
}

.hero__note-label {
  flex-shrink: 0;
  margin-right: 16rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.hero__note-text {
  flex: 1;
  font-size: 24rpx;
  line-height: 1.5;
  color: $c-text-2;
}

.dishes {
  margin-top: 24rpx;
  padding: 28rpx;
}

.dishes__head {
  display: flex;
  align-items: baseline;
  margin-bottom: 20rpx;
}

.dishes__title {
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.dishes__total {
  margin-left: auto;
  font-size: 22rpx;
  color: $c-text-3;
}

.dish {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1px solid $c-line;

  &:last-child {
    border-bottom: none;
  }
}

.dish--hover {
  background: #fdf8ee;
}

.dish__photo {
  width: 96rpx;
  height: 96rpx;
  flex-shrink: 0;
  border-radius: $radius-md;
  overflow: hidden;
  background: #fdf6e3;
}

.dish__img {
  width: 100%;
  height: 100%;
}

.dish__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
}

.dish__name {
  font-size: 27rpx;
  color: $c-text;
  @include ellipsis(1);
}

.dish__hint {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: $c-text-3;
}

.dish__count {
  margin-left: 16rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: $c-primary-ink;
}

.dishes__empty {
  padding: 30rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: $c-text-3;
}

.page-pad {
  height: 40rpx;
}

.footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: $c-card;
  box-shadow: $shadow-float;
}

.footer__ghost {
  @include center;
  flex: 1;
  height: 84rpx;
  border-radius: 42rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-text-2;
}

.footer__primary {
  @include center;
  flex: 2;
  height: 84rpx;
  margin-left: 20rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
