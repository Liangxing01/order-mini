<template>
  <view v-if="modelValue" class="sheet">
    <view class="sheet__mask" @tap="onMaskTap" />
    <view class="sheet__panel" :style="panelStyle" @tap.stop>
      <view class="sheet__head">
        <text class="sheet__title">{{ title }}</text>
        <text class="sheet__close" @tap="close">✕</text>
      </view>
      <scroll-view scroll-y class="sheet__body" :style="{ maxHeight: bodyMaxHeight }">
        <slot />
      </scroll-view>
      <view v-if="$slots.footer" class="sheet__footer u-safe-bottom">
        <slot name="footer" />
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'BottomSheet',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    /** 面板高度，传 rpx 数值 */
    height: { type: Number, default: 0 },
    maskClosable: { type: Boolean, default: true }
  },
  emits: ['update:modelValue', 'close'],
  computed: {
    panelStyle() {
      return this.height ? { height: `${this.height}rpx` } : {}
    },
    bodyMaxHeight() {
      return this.height ? `${this.height - 200}rpx` : '60vh'
    }
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false)
      this.$emit('close')
    },
    onMaskTap() {
      if (this.maskClosable) this.close()
    }
  }
}
</script>

<style lang="scss" scoped>
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 900;
}

.sheet__mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(60, 48, 30, 0.42);
  animation: fade 0.2s ease;
}

.sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  background: $c-card;
  border-radius: $radius-xl $radius-xl 0 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  animation: slide-up 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.sheet__head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100rpx;
  flex-shrink: 0;
}

.sheet__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $c-text;
}

.sheet__close {
  position: absolute;
  right: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 30rpx;
  color: $c-text-3;
  padding: 10rpx;
}

.sheet__body {
  flex: 1;
  padding: 0 32rpx;
}

.sheet__footer {
  flex-shrink: 0;
  padding: 20rpx 32rpx 24rpx;
  border-top: 1px solid $c-line;
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
