<template>
  <view
    class="dish-card"
    :class="{ 'is-off': dish.status === 'off' }"
    @tap="$emit('tap')"
    @longpress="$emit('longpress')"
  >
    <view class="dish-card__photo">
      <cloud-image
        class="dish-card__img"
        :src="dish.cover"
        size="card"
        :placeholder="fallbackEmoji"
        :ph-size="72"
      />
      <view v-if="count > 0" class="dish-card__badge" :class="{ 'is-pop': popping }">
        {{ count > 99 ? '99+' : count }}
      </view>
    </view>

    <view class="dish-card__foot">
      <text class="dish-card__name">{{ dish.name }}</text>
      <view class="dish-card__add" @tap.stop="$emit('add')">
        <text class="dish-card__add-icon">＋</text>
      </view>
    </view>

    <view v-if="dish.status === 'off'" class="dish-card__mask">
      <text class="dish-card__mask-text">已下架</text>
    </view>
  </view>
</template>

<script>
const TYPE_EMOJI = {
  荤: '🥩',
  素: '🥬',
  蛋: '🍳',
  汤: '🥣',
  饮: '🧋',
  主食: '🍚',
  其他: '🍽️'
}

export default {
  name: 'DishCard',
  props: {
    dish: {
      type: Object,
      required: true
    },
    /** 已加入购物车的数量，用于角标 */
    count: {
      type: Number,
      default: 0
    }
  },
  emits: ['tap', 'add', 'longpress'],
  data() {
    return {
      /** 加购时角标弹一下，让用户看到数量变了 */
      popping: false,
      popTimer: null
    }
  },
  computed: {
    fallbackEmoji() {
      const type = this.dish.tags && this.dish.tags.type
      return TYPE_EMOJI[type] || '🍽️'
    }
  },
  watch: {
    count(val, old) {
      if (val > old) this.pop()
    }
  },
  beforeUnmount() {
    if (this.popTimer) clearTimeout(this.popTimer)
  },
  methods: {
    pop() {
      if (this.popTimer) clearTimeout(this.popTimer)
      this.popping = true
      this.popTimer = setTimeout(() => {
        this.popping = false
      }, 340)
    }
  }
}
</script>

<style lang="scss" scoped>
.dish-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 16rpx 20rpx;
  background: $c-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.97);
  }

  &.is-off {
    opacity: 0.72;
  }
}

.dish-card__photo {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
  border: 6rpx solid #fff;
  box-shadow: 0 6rpx 18rpx rgba(190, 160, 100, 0.16);
  @include center;
}

.dish-card__img {
  width: 100%;
  height: 100%;
}

.dish-card__badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 40rpx;
  height: 40rpx;
  padding: 0 10rpx;
  border-radius: 20rpx;
  background: $c-danger;
  color: #fff;
  font-size: 22rpx;
  line-height: 40rpx;
  text-align: center;
}

.dish-card__badge.is-pop {
  animation: badge-pop 0.34s ease;
}

@keyframes badge-pop {
  0% {
    transform: scale(0.6);
  }
  55% {
    transform: scale(1.25);
  }
  100% {
    transform: scale(1);
  }
}

.dish-card__foot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 16rpx;
}

.dish-card__name {
  max-width: 150rpx;
  font-size: 26rpx;
  color: #4a4a4a;
  @include ellipsis(1);
}

.dish-card__add {
  @include center;
  width: 46rpx;
  height: 46rpx;
  margin-left: 6rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbe08a, #f3cf5e);
  box-shadow: 0 4rpx 10rpx rgba(226, 186, 74, 0.35);
}

.dish-card__add-icon {
  font-size: 26rpx;
  line-height: 1;
  color: #fff;
}

.dish-card__mask {
  position: absolute;
  right: 16rpx;
  top: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  background: rgba(0, 0, 0, 0.45);
}

.dish-card__mask-text {
  font-size: 20rpx;
  color: #fff;
}
</style>
