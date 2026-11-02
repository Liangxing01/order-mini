<template>
  <view class="empty-state">
    <text class="empty-state__emoji">{{ emoji }}</text>
    <text class="empty-state__title">{{ title }}</text>
    <text v-if="desc" class="empty-state__desc">{{ desc }}</text>
    <view v-if="actionText" class="empty-state__btn" @tap="$emit('action')">
      {{ actionText }}
    </view>
  </view>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    emoji: { type: String, default: '🍽️' },
    title: { type: String, default: '这里还空空的' },
    desc: { type: String, default: '' },
    actionText: { type: String, default: '' }
  },
  emits: ['action']
}
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 40rpx;
}

.empty-state__emoji {
  font-size: 96rpx;
  line-height: 1;
  opacity: 0.9;
}

.empty-state__title {
  margin-top: 24rpx;
  font-size: 28rpx;
  color: $c-text-2;
}

.empty-state__desc {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: $c-text-3;
  text-align: center;
}

.empty-state__btn {
  margin-top: 32rpx;
  padding: 0 40rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 34rpx;
  font-size: 26rpx;
  color: #fff;
  background: linear-gradient(135deg, $c-primary-light, $c-primary);
}
</style>
