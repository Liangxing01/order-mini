<template>
  <view class="detail-page">
    <scroll-view scroll-y class="detail-scroll">
      <view v-if="loading" class="u-loading">加载中…</view>

      <block v-else-if="dish">
        <!-- 头图 -->
        <view class="head">
          <cloud-image
            class="head__img"
            :src="dish.cover"
            size="full"
            :ph-size="120"
            @tap="preview(dish.cover)"
          />
        </view>

        <!-- 基本信息 -->
        <view class="card u-card">
          <view class="card__title-row">
            <text class="card__title">{{ dish.name }}</text>
            <text v-if="dish.status === 'off'" class="card__off">已下架</text>
          </view>

          <view class="tags">
            <text v-if="dish.tags && dish.tags.type" class="tag">{{ dish.tags.type }}</text>
            <text v-if="dish.tags && dish.tags.spicy > 0" class="tag">{{ spicyText }}</text>
            <text v-if="dish.tags && dish.tags.minutes" class="tag">约 {{ dish.tags.minutes }} 分钟</text>
            <text class="tag tag--ghost">{{ categoryName }}</text>
          </view>

          <text v-if="dish.desc" class="card__desc">{{ dish.desc }}</text>

          <view class="stats">
            <view class="stats__item">
              <text class="stats__num">{{ hotView }}</text>
              <text class="stats__label">浏览</text>
            </view>
            <view class="stats__item">
              <text class="stats__num">{{ hotAdd }}</text>
              <text class="stats__label">加购</text>
            </view>
            <view class="stats__item">
              <text class="stats__num">{{ hotOrdered }}</text>
              <text class="stats__label">下单</text>
            </view>
            <view class="stats__item">
              <text class="stats__num">{{ hotScore }}</text>
              <text class="stats__label">热度</text>
            </view>
          </view>
        </view>

        <!-- 更多图片 -->
        <view v-if="dish.images && dish.images.length" class="card u-card">
          <view class="card__sub-title">更多图片</view>
          <view class="gallery">
            <cloud-image
              v-for="(img, index) in dish.images"
              :key="index"
              class="gallery__img"
              :src="img"
              size="thumb"
              :ph-size="40"
              @tap="preview2(img)"
            />
          </view>
        </view>

        <!-- 食材 -->
        <view v-if="dish.ingredients && dish.ingredients.length" class="card u-card">
          <view class="card__sub-title">食材清单</view>
          <view class="ing-row" v-for="(item, index) in dish.ingredients" :key="index">
            <text class="ing-row__name">{{ item.name }}</text>
            <text class="ing-row__amount">{{ item.amount || '适量' }}</text>
          </view>
        </view>

        <!-- 做法 -->
        <view v-if="dish.steps && dish.steps.length" class="card u-card">
          <view class="card__sub-title">做法步骤</view>
          <view v-for="(step, index) in dish.steps" :key="index" class="step">
            <view class="step__index">{{ index + 1 }}</view>
            <view class="step__body">
              <text class="step__text">{{ step.text }}</text>
              <cloud-image
                v-if="step.image"
                class="step__img"
                :src="step.image"
                mode="widthFix"
                size="cover"
                @tap="preview2(step.image)"
              />
            </view>
          </view>
        </view>

        <view class="detail-pad" />
      </block>
    </scroll-view>

    <view v-if="dish" class="detail-footer u-safe-bottom">
      <view class="detail-footer__ghost" @tap="goEdit">编辑</view>
      <view class="detail-footer__primary" @tap="addToCart">加入今日菜单</view>
    </view>
  </view>
</template>

<script>
import { useMenuStore } from '@/store/menu'
import { useCartStore } from '@/store/cart'
import { dishApi } from '@/api'
import { SPICY_LEVELS } from '@/config'
import { toastOk, toastError } from '@/utils/ui'

export default {
  data() {
    return {
      dishId: '',
      dish: null,
      loading: true
    }
  },

  computed: {
    menu() {
      return useMenuStore()
    },
    cart() {
      return useCartStore()
    },
    categoryName() {
      if (!this.dish) return '未分类'
      const hit = this.menu.sideList.find((cat) => cat._id === this.dish.categoryId)
      return hit ? hit.name : '未分类'
    },
    spicyText() {
      const spicy = (this.dish && this.dish.tags && this.dish.tags.spicy) || 0
      const hit = SPICY_LEVELS.find((item) => item.value === spicy)
      return hit ? hit.label : ''
    },
    hotView() {
      return (this.dish && this.dish.hot && this.dish.hot.view) || 0
    },
    hotAdd() {
      return (this.dish && this.dish.hot && this.dish.hot.add) || 0
    },
    hotOrdered() {
      return (this.dish && this.dish.hot && this.dish.hot.ordered) || 0
    },
    hotScore() {
      return Math.round((this.dish && this.dish.hot && this.dish.hot.score) || 0)
    }
  },

  onLoad(query) {
    this.dishId = (query && query.id) || ''
    this.load()
  },

  methods: {
    async load() {
      if (!this.dishId) {
        this.loading = false
        return
      }
      try {
        this.dish = await dishApi.detail(this.dishId)
        uni.setNavigationBarTitle({ title: this.dish.name })
        // 浏览行为计入热度
        dishApi.track({ _id: this.dishId, action: 'view' }).catch(() => undefined)
      } catch (err) {
        toastError(err, '菜品加载失败')
      } finally {
        this.loading = false
      }
    },

    preview(url) {
      uni.previewImage({ current: url, urls: [url] })
    },

    preview2(url) {
      const urls = [url, ...((this.dish && this.dish.images) || [])].filter(Boolean)
      uni.previewImage({ current: url, urls: [...new Set(urls)] })
    },

    addToCart() {
      this.cart.add(this.dish)
      this.cart.trackAdd(this.dish._id)
      toastOk('已加入今日菜单')
    },

    goEdit() {
      uni.navigateTo({ url: `/pages/dish/edit?id=${this.dishId}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.detail-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 24rpx;
}

.head {
  margin-top: 20rpx;
  height: 400rpx;
  border-radius: $radius-xl;
  overflow: hidden;
  background: #fdf6e3;
  @include center;
}

.head__img {
  width: 100%;
  height: 100%;
}

.card {
  margin-top: 24rpx;
  padding: 28rpx;
}

.card__title-row {
  display: flex;
  align-items: center;
}

.card__title {
  font-size: 38rpx;
  font-weight: 600;
  color: $c-text;
}

.card__off {
  margin-left: 16rpx;
  padding: 2rpx 14rpx;
  border-radius: 14rpx;
  background: #fdecea;
  font-size: 20rpx;
  color: $c-danger;
}

.card__sub-title {
  margin-bottom: 18rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.card__desc {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: $c-text-2;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.tag {
  margin: 0 12rpx 12rpx 0;
  padding: 6rpx 18rpx;
  border-radius: 20rpx;
  background: $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.tag--ghost {
  background: #f4efe5;
  color: $c-text-2;
}

.stats {
  display: flex;
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1px solid $c-line;
}

.stats__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stats__num {
  font-size: 32rpx;
  font-weight: 600;
  color: $c-primary-ink;
}

.stats__label {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.gallery {
  display: flex;
  flex-wrap: wrap;
}

.gallery__img {
  width: 196rpx;
  height: 196rpx;
  margin: 0 14rpx 14rpx 0;
  border-radius: $radius-md;
}

.ing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1px solid $c-line;

  &:last-child {
    border-bottom: none;
  }
}

.ing-row__name {
  font-size: 26rpx;
  color: $c-text;
}

.ing-row__amount {
  font-size: 26rpx;
  color: $c-text-3;
}

.step {
  display: flex;
  margin-bottom: 24rpx;
}

.step__index {
  @include center;
  width: 44rpx;
  height: 44rpx;
  margin-right: 16rpx;
  border-radius: 50%;
  background: $c-primary-pale;
  color: $c-primary-ink;
  font-size: 22rpx;
  flex-shrink: 0;
}

.step__body {
  flex: 1;
  min-width: 0;
}

.step__text {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: $c-text-2;
}

.step__img {
  width: 100%;
  margin-top: 12rpx;
  border-radius: $radius-md;
}

.detail-pad {
  height: 40rpx;
}

.detail-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: $c-card;
  box-shadow: $shadow-float;
}

.detail-footer__ghost {
  @include center;
  width: 160rpx;
  height: 84rpx;
  border-radius: 42rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-text-2;
}

.detail-footer__primary {
  @include center;
  flex: 1;
  height: 84rpx;
  margin-left: 20rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
