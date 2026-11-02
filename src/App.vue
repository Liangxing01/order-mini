<script>
import { useUserStore } from '@/store/user'
import { useMenuStore } from '@/store/menu'

export default {
  onLaunch() {
    const userStore = useUserStore()
    const menuStore = useMenuStore()
    userStore.bootstrap().then(() => {
      menuStore.loadCategories()
    })
  },
  onShow() {},
  onHide() {}
}
</script>

<style lang="scss">
page {
  background: $c-bg;
  color: $c-text;
  font-size: 28rpx;
  line-height: 1.45;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Helvetica,
    'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

view,
text,
image,
scroll-view,
input,
textarea,
button {
  box-sizing: border-box;
}

/* ---------- 通用容器 ---------- */
.u-page {
  min-height: 100vh;
  background: $c-bg;
}

.u-card {
  background: $c-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

/* ---------- 按钮 ---------- */
.u-btn {
  @include center;
  height: 76rpx;
  padding: 0 32rpx;
  border-radius: 38rpx;
  font-size: 28rpx;
  line-height: 1;
  border: 2rpx solid transparent;
  transition: opacity 0.15s;

  &:active {
    opacity: 0.82;
  }
}

.u-btn--primary {
  background: linear-gradient(135deg, $c-primary-light, $c-primary);
  color: #fff;
}

.u-btn--ghost {
  border-color: $c-primary;
  color: $c-primary-ink;
  background: transparent;
}

.u-btn--plain {
  background: #fff;
  color: $c-text-2;
  border-color: $c-line;
}

.u-btn--sm {
  height: 60rpx;
  padding: 0 24rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
}

.u-btn--block {
  width: 100%;
}

.u-btn[disabled] {
  opacity: 0.5;
}

/* ---------- 文本 ---------- */
.u-ellipsis {
  @include ellipsis(1);
}

.u-ellipsis-2 {
  @include ellipsis(2);
}

.u-muted {
  color: $c-text-3;
}

.u-tag {
  display: inline-flex;
  align-items: center;
  height: 40rpx;
  padding: 0 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
  background: $c-primary-pale;
}

/* ---------- 反馈 ---------- */
.u-loading {
  padding: 60rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: $c-text-3;
}

.u-safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
