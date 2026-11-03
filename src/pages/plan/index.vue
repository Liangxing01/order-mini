<template>
  <view class="plan-page">
    <plan-week :start-date="startDate" @close="goBack" @cart="onCart" />
  </view>
</template>

<script>
import { useCartStore } from '@/store/cart'

export default {
  data() {
    return {
      /** 周视图起始日（周一），由点菜页传进来 */
      startDate: ''
    }
  },

  computed: {
    cart() {
      return useCartStore()
    }
  },

  onLoad(query) {
    this.startDate = (query && query.start) || ''
  },

  methods: {
    /** 页内「‹ 返回」与系统返回键都回到点菜页 */
    goBack() {
      uni.navigateBack({
        fail: () => uni.switchTab({ url: '/pages/order/index' })
      })
    },

    /** 在周排菜里点了购物车：回点菜页并自动弹出购物车 */
    onCart() {
      this.cart.openCartOnBack = true
      uni.switchTab({ url: '/pages/order/index' })
    }
  }
}
</script>

<style lang="scss" scoped>
.plan-page {
  position: relative;
  height: 100vh;
  overflow: hidden;
}
</style>
