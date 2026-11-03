<template>
  <view class="order-page">
    <!-- 顶部插画头图 -->
    <view class="hero" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="hero__bg">
        <image class="hero__img" src="/static/hero-bg.png" mode="widthFix" />
        <view class="hero__fade" />
      </view>
      <view class="hero__card">
        <cloud-image class="hero__avatar" :src="avatarUrl" size="avatar" :lazy="false" />
        <view class="hero__info">
          <text class="hero__title">路璐的专属小厨房</text>
          <text class="hero__sub">{{ userStore.nickname }} 是大王</text>
        </view>
        <view class="hero__rank" @tap="goRank">
          <text class="hero__rank-icon">🔥</text>
          <text class="hero__rank-text">热度榜</text>
        </view>
      </view>
    </view>

    <!-- 搜索 / 日期餐次 / 快捷入口 -->
    <view class="toolbar">
      <view class="toolbar__search">
        <text class="toolbar__search-icon">🔍</text>
        <input
          v-model="searchInput"
          class="toolbar__search-input"
          placeholder="搜索"
          placeholder-class="toolbar__ph"
          confirm-type="search"
          @input="onSearchInput"
          @confirm="onSearch"
        />
        <text v-if="searchInput" class="toolbar__clear" @tap="clearSearch">✕</text>
      </view>

      <view class="toolbar__date">
        <picker mode="date" :value="cart.orderDate" :end="maxDate" @change="onDateChange">
          <view class="toolbar__date-inner">
            <text class="toolbar__step" @tap.stop="shiftDay(-1)">‹</text>
            <text class="toolbar__date-text">{{ cart.orderDate.slice(5) }}</text>
          </view>
        </picker>
        <view class="toolbar__meal" @tap="mealVisible = true">{{ mealLabel }} ▾</view>
      </view>

      <view class="toolbar__btn toolbar__btn--ghost" @tap="goManage">管理菜品</view>
      <view class="toolbar__btn toolbar__btn--solid" @tap="goAdd">添加菜品</view>
    </view>

    <!-- 分类 + 菜品 -->
    <view class="body">
      <scroll-view class="cats" scroll-y :show-scrollbar="false">
        <view
          v-for="cat in menu.sideList"
          :key="cat._id"
          class="cats__item"
          :class="{ 'is-active': cat._id === menu.currentId }"
          @tap="selectCat(cat._id)"
        >
          <text class="cats__label">{{ cat.name }}</text>
          <text class="cats__icon">{{ cat.icon }}</text>
        </view>

        <view v-if="!menu.sideList.length" class="cats__hint" @tap="goCategory">还没有分类</view>

        <view class="cats__manage" @tap="goCategory">
          <text class="cats__manage-icon">⚙</text>
          <text>分类管理</text>
        </view>
      </scroll-view>

      <scroll-view
        class="dishes"
        scroll-y
        :show-scrollbar="false"
        :lower-threshold="120"
        :scroll-into-view="scrollAnchor"
        @scrolltolower="loadMore"
      >
        <view id="dish-top" class="dishes__head">
          <text class="dishes__title">{{ listTitle }}</text>
          <text class="dishes__count">({{ dishes.length }})</text>
        </view>

        <view v-if="loading" class="u-loading">正在端上来…</view>

        <empty-state
          v-else-if="!dishes.length"
          :emoji="emptyEmoji"
          :title="emptyTitle"
          :desc="emptyDesc"
          :action-text="menu.keyword ? '' : '去添加菜品'"
          @action="goAdd"
        />

        <view v-else class="grid">
          <dish-card
            v-for="dish in dishes"
            :key="dish._id"
            :dish="dish"
            :count="cart.countMap[dish._id] || 0"
            @add="addToCart(dish)"
            @tap="openDish(dish)"
            @longpress="onDishLongPress(dish)"
          />
        </view>

        <view class="dishes__foot">
          <text v-if="bucketLoadingMore" class="u-muted">加载更多…</text>
          <text v-else-if="dishes.length && !currentBucket.hasMore" class="u-muted">已经到底啦</text>
        </view>
        <view class="dishes__pad" />
      </scroll-view>
    </view>

    <!-- 悬浮操作栏 -->
    <view class="float-bar">
      <view class="float-bar__inner">
        <view class="float-bar__cart" @tap="openCart">
          <text class="float-bar__cart-icon">🛒</text>
          <view v-if="cart.totalCount" class="float-bar__badge">{{ cart.totalCount }}</view>
        </view>
        <view class="float-bar__link" @tap="openPlan">饮食计划</view>
        <view class="float-bar__link" @tap="onRandomPick">随机点菜</view>
        <button class="float-bar__ghost" open-type="share">邀请下单</button>
        <view
          class="float-bar__primary"
          :class="{ 'is-empty': cart.isEmpty }"
          @tap="submit"
        >
          {{ cart.isEmpty ? '下单' : '下单 ' + cart.totalCount }}
        </view>
      </view>
    </view>

    <!-- 餐次选择 -->
    <bottom-sheet v-model="mealVisible" title="选择餐次">
      <view class="meal-list">
        <view
          v-for="meal in meals"
          :key="meal.value"
          class="meal-item"
          :class="{ 'is-active': meal.value === cart.mealType }"
          @tap="onMealChange(meal.value)"
        >
          <text class="meal-item__emoji">{{ meal.emoji }}</text>
          <text class="meal-item__label">{{ meal.label }}</text>
        </view>
      </view>
    </bottom-sheet>

    <!-- 购物车 -->
    <bottom-sheet v-model="cartVisible" :title="`已选 ${cart.totalCount} 份`">
      <view v-if="cart.isEmpty" class="cart-empty">
        <empty-state emoji="🛒" title="还没有选菜" desc="点菜品右下角的 + 加进来" />
      </view>
      <view v-else class="cart-list">
        <view v-for="item in cart.items" :key="item._id" class="cart-row">
          <view class="cart-row__photo">
            <cloud-image class="cart-row__img" :src="item.cover" size="thumb" :ph-size="36" />
          </view>
          <view class="cart-row__info">
            <text class="cart-row__name">{{ item.name }}</text>
          </view>
          <view class="stepper">
            <view class="stepper__btn" @tap="cart.dec(item._id)">−</view>
            <text class="stepper__num">{{ item.count }}</text>
            <view class="stepper__btn stepper__btn--add" @tap="cart.add({ _id: item._id, name: item.name, cover: item.cover })">＋</view>
          </view>
        </view>
      </view>
      <template #footer>
        <view class="cart-footer">
          <view class="cart-footer__clear" @tap="onClearCart">清空</view>
          <view class="cart-footer__submit" @tap="submit">确认下单</view>
        </view>
      </template>
    </bottom-sheet>

    <!-- 周排菜已改为独立页面 pages/plan/index，用页面栈返回 -->
  </view>
</template>

<script>
import { useUserStore } from '@/store/user'
import { useMenuStore } from '@/store/menu'
import { useCartStore } from '@/store/cart'
import { orderApi, userApi, dishApi, familyApi } from '@/api'
import { MEAL_TYPES } from '@/config'
import { today, shiftDate, weekStartOf } from '@/utils/date'
import { toast, toastOk, toastError, confirm, tapFeedback } from '@/utils/ui'

/** 分享卡片带参数，小程序码带 scene=familyId%3Dxxx%26inviter%3Dyyy，两种入口都兼容 */
function readParam(query = {}, key) {
  if (query[key]) return query[key]
  if (!query.scene) return ''
  try {
    const matched = new RegExp(`${key}=([^&]+)`).exec(decodeURIComponent(query.scene))
    return matched ? matched[1] : ''
  } catch (err) {
    return ''
  }
}

export default {
  data() {
    return {
      statusBarHeight: 20,
      searchInput: '',
      searchTimer: null,
      // 切换分类 / 搜索时右侧列表回到顶部（小程序 scroll-view 换内容不会自动归零）
      scrollAnchor: '',
      sortBy: 'createTime',

      meals: MEAL_TYPES,
      mealVisible: false,
      cartVisible: false,
      maxDate: shiftDate(today(), 30)
    }
  },

  computed: {
    userStore() {
      return useUserStore()
    },
    menu() {
      return useMenuStore()
    },
    cart() {
      return useCartStore()
    },
    avatarUrl() {
      return this.userStore.avatar || '/static/chef-avatar.png'
    },
    mealLabel() {
      const hit = MEAL_TYPES.find((m) => m.value === this.cart.mealType)
      return hit ? hit.label : '晚餐'
    },
    dateText() {
      return `${this.cart.orderDate.slice(5)} ${this.mealLabel}`
    },
    dishes() {
      return this.menu.currentDishes
    },
    currentBucket() {
      return this.menu.currentBucket
    },
    loading() {
      return !!this.currentBucket.loading && !this.dishes.length
    },
    bucketLoadingMore() {
      return !!this.currentBucket.loading && this.dishes.length > 0
    },
    listTitle() {
      if (this.menu.keyword) return `搜索「${this.menu.keyword}」`
      const cat = this.menu.currentCategory
      return cat ? cat.name : '全部菜品'
    },
    emptyEmoji() {
      return this.menu.keyword ? '🔍' : '🍳'
    },
    emptyTitle() {
      if (this.menu.keyword) return '没搜到这道菜'
      return this.menu.sideList.length ? '这个分类还没有菜' : '还没有任何分类'
    },
    emptyDesc() {
      return this.menu.keyword ? '换个关键词试试' : '点右上角添加菜品，把它加到小厨房里'
    }
  },

  onLoad(query) {
    const info = uni.getSystemInfoSync()
    this.statusBarHeight = info.statusBarHeight || 20
    // 分享进来：带 familyId 直接加入家庭，老邀请卡片只有 inviter 就按邀请人找家庭
    const familyId = readParam(query, 'familyId')
    const inviter = readParam(query, 'inviter')
    if (familyId) {
      familyApi
        .join({ familyId, inviterOpenid: inviter })
        .then((res) => {
          this.userStore.bootstrap(true)
          if (res && res.alreadyIn) return
          toastOk('已加入家庭小厨房')
        })
        .catch((err) => toast((err && err.msg) || '加入家庭失败'))
    } else if (inviter) {
      userApi
        .bind(inviter)
        .then(() => {
          this.userStore.bootstrap(true)
          toastOk('已加入家庭小厨房')
        })
        .catch(() => undefined)
    }
  },

  onShow() {
    this.loadAll()
    // 从周排菜页点🛒回来时直接弹出购物车
    if (this.cart.openCartOnBack) {
      this.cart.openCartOnBack = false
      this.cartVisible = true
    }
  },

  onShareAppMessage() {
    const familyId = this.userStore.familyId
    const path = familyId
      ? `/pages/order/index?familyId=${familyId}&inviter=${this.userStore.openid}`
      : `/pages/order/index?inviter=${this.userStore.openid}`
    return {
      title: `${this.userStore.nickname} 邀请你一起来点菜`,
      path
    }
  },

  methods: {
    async loadAll() {
      try {
        if (!this.menu.categoriesLoaded) {
          await this.menu.loadCategories()
        }
        if (!this.menu.currentId && this.menu.sideList.length) {
          this.menu.currentId = this.menu.sideList[0]._id
        }
        // 从添加/编辑菜品页回来时可能有新菜，强制重新拉一次当前分类
        await this.menu.loadDishes({ force: true })
      } catch (err) {
        toastError(err, '菜品加载失败')
      }
    },

    async selectCat(id) {
      if (id === this.menu.currentId && !this.menu.keyword) return
      this.menu.setCurrent(id)
      this.searchInput = ''
      this.scrollToTop()
      try {
        // 切分类一律重新拉，避免上次的缓存 / 空结果导致看不到菜
        const list = await this.menu.loadDishes({ force: true })
        const cat = this.menu.currentCategory
        // 分类计数说有几道菜却一条没取到，说明是服务端过滤的问题，直接提示而不是白屏
        if (!list.length && cat && cat.dishCount > 0) {
          toast(`这个分类有 ${cat.dishCount} 道菜，但没取到，请稍后再试`)
        }
      } catch (err) {
        toastError(err)
      }
    },

    /** scroll-into-view 同一个值不会重复触发，先清空再设回 */
    scrollToTop() {
      if (!this.scrollAnchor) {
        this.scrollAnchor = 'dish-top'
        return
      }
      this.scrollAnchor = ''
      this.$nextTick(() => {
        this.scrollAnchor = 'dish-top'
      })
    },

    async loadMore() {
      if (this.menu.keyword) return
      if (!this.currentBucket.hasMore || this.currentBucket.loading) return
      try {
        await this.menu.loadDishes({ more: true })
      } catch (err) {
        toastError(err)
      }
    },

    addToCart(dish) {
      this.cart.add(dish)
      this.cart.trackAdd(dish._id)
      const count = this.cart.countMap[dish._id] || 1
      tapFeedback()
      toast(`${dish.name} 已加入 · 共 ${count} 份`)
    },

    openDish(dish) {
      uni.navigateTo({ url: `/pages/dish/detail?id=${dish._id}` })
    },

    onDishLongPress(dish) {
      uni.showActionSheet({
        itemList: ['编辑这道菜', '下架 / 上架', '删除'],
        success: async ({ tapIndex }) => {
          if (tapIndex === 0) {
            uni.navigateTo({ url: `/pages/dish/edit?id=${dish._id}` })
          } else if (tapIndex === 1) {
            const status = dish.status === 'off' ? 'on' : 'off'
            try {
              await dishApi.toggleStatus({ _id: dish._id, status })
              dish.status = status
              toastOk(status === 'on' ? '已上架' : '已下架')
            } catch (err) {
              toastError(err)
            }
          } else if (tapIndex === 2) {
            const ok = await confirm(`删除「${dish.name}」后不可恢复`, '删除菜品', '删除')
            if (!ok) return
            try {
              await dishApi.remove(dish._id)
              this.menu.removeDish(dish._id)
              toastOk('已删除')
            } catch (err) {
              toastError(err)
            }
          }
        }
      })
    },

    onSearchInput(e) {
      const value = e.detail.value
      this.searchInput = value
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => {
        this.onSearch()
      }, 400)
    },

    async onSearch() {
      const keyword = this.searchInput.trim()
      this.scrollToTop()
      try {
        if (!keyword) {
          this.menu.clearSearch()
          return
        }
        await this.menu.search(keyword)
      } catch (err) {
        toastError(err)
      }
    },

    clearSearch() {
      this.searchInput = ''
      clearTimeout(this.searchTimer)
      this.menu.clearSearch()
      this.scrollToTop()
    },

    onDateChange(e) {
      this.cart.setContext(e.detail.value)
    },

    shiftDay(offset) {
      const next = shiftDate(this.cart.orderDate, offset)
      if (next > this.maxDate) return
      this.cart.setContext(next)
    },

    onMealChange(value) {
      this.cart.setContext(null, value)
      this.mealVisible = false
    },

    async onRandomPick() {
      try {
        const res = await orderApi.randomPick({
          categoryId: this.menu.currentId || 'all',
          count: 3
        })
        if (!res.list.length) return
        this.cart.replaceWith(res.list)
        toastOk(`帮你随机了 ${res.list.length} 道菜`)
        this.cartVisible = true
      } catch (err) {
        toastError(err, '随机点菜失败')
      }
    },

    async submit() {
      if (this.cart.submitting) return
      if (this.cart.isEmpty) {
        toast('还没有选菜哦')
        return
      }
      try {
        await this.cart.submit()
        this.cartVisible = false
        toastOk('已记入食记')
      } catch (err) {
        toastError(err, '下单失败')
      }
    },

    async onClearCart() {
      const ok = await confirm('确定清空已选的菜吗？', '清空购物车', '清空')
      if (!ok) return
      this.cart.clear()
      this.cartVisible = false
    },

    openCart() {
      this.cartVisible = true
    },

    openPlan() {
      uni.navigateTo({ url: `/pages/plan/index?start=${weekStartOf(this.cart.orderDate)}` })
    },

    goRank() {
      uni.navigateTo({ url: '/pages/rank/index' })
    },
    goManage() {
      uni.navigateTo({ url: '/pages/dish/manage' })
    },
    goAdd() {
      uni.navigateTo({ url: '/pages/dish/edit' })
    },
    goCategory() {
      uni.navigateTo({ url: '/pages/category/manage' })
    }
  }
}
</script>

<style lang="scss" scoped>
.order-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: $c-bg;
}

/* ---------- 头图 ---------- */
.hero {
  position: relative;
  flex-shrink: 0;
  padding: 0 24rpx 16rpx;
}

.hero__bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 100%;
  overflow: hidden;
  background: #f2ecfd;
}

/* 微信 WXSS 不支持本地图片做 background-image，这里用 image 元素铺底 */
.hero__img {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
}

.hero__fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60rpx;
  background: linear-gradient(180deg, rgba(251, 247, 242, 0) 0%, $c-bg 100%);
}

.hero__card {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 116rpx;
  padding: 20rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(8rpx);
  box-shadow: 0 8rpx 24rpx rgba(120, 100, 160, 0.12);
}

.hero__avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: #fff6d8;
  flex-shrink: 0;
}

.hero__info {
  flex: 1;
  margin-left: 18rpx;
  overflow: hidden;
}

.hero__title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #4a3f2a;
  @include ellipsis(1);
}

.hero__sub {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #9c8f78;
  @include ellipsis(1);
}

.hero__rank {
  display: flex;
  align-items: center;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #fbe08a, #f3cf5e);
  flex-shrink: 0;
}

.hero__rank-icon {
  font-size: 24rpx;
}

.hero__rank-text {
  margin-left: 6rpx;
  font-size: 22rpx;
  color: #7c5f0e;
  font-weight: 600;
}

/* ---------- 工具条 ---------- */
.toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 8rpx 24rpx 16rpx;
  gap: 12rpx;
}

.toolbar__search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 68rpx;
  padding: 0 20rpx;
  border-radius: 34rpx;
  background: $c-card;
  border: 2rpx solid #efe4cd;
}

.toolbar__search-icon {
  font-size: 24rpx;
  opacity: 0.6;
}

.toolbar__search-input {
  flex: 1;
  min-width: 0;
  margin-left: 10rpx;
  font-size: 24rpx;
  color: $c-text;
}

.toolbar__ph {
  color: $c-text-3;
  font-size: 24rpx;
}

.toolbar__clear {
  font-size: 22rpx;
  color: $c-text-3;
  padding: 0 4rpx;
}

.toolbar__date {
  display: flex;
  align-items: center;
  height: 68rpx;
  padding: 0 16rpx;
  border-radius: 34rpx;
  background: $c-card;
  border: 2rpx solid #efe4cd;
  flex-shrink: 0;
}

.toolbar__date-inner {
  display: flex;
  align-items: center;
}

.toolbar__step {
  font-size: 28rpx;
  color: #c8bda6;
  padding-right: 8rpx;
}

.toolbar__date-text {
  font-size: 24rpx;
  color: $c-text;
}

.toolbar__meal {
  margin-left: 8rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.toolbar__btn {
  @include center;
  height: 68rpx;
  padding: 0 18rpx;
  border-radius: 34rpx;
  font-size: 22rpx;
  flex-shrink: 0;
}

.toolbar__btn--ghost {
  color: $c-primary-ink;
  border: 2rpx solid $c-primary-pale;
  background: #fffdf6;
}

.toolbar__btn--solid {
  color: #fff;
  background: linear-gradient(135deg, #f6cd63, #eab63a);
}

/* ---------- 主体 ---------- */
.body {
  display: flex;
  flex: 1;
  min-height: 0;
  padding-bottom: 148rpx;
}

.cats {
  width: 172rpx;
  height: 100%;
  flex-shrink: 0;
  padding-top: 8rpx;
}

.cats__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 112rpx;
  margin: 6rpx 10rpx;
  border-radius: $radius-md;
  transition: background 0.15s;
}

.cats__label {
  font-size: 26rpx;
  color: #6f6a5f;
}

.cats__icon {
  margin-top: 4rpx;
  font-size: 24rpx;
  opacity: 0.85;
}

.cats__item.is-active {
  background: #fffdf7;
  box-shadow: 0 4rpx 16rpx rgba(190, 160, 100, 0.12);

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 6rpx;
    height: 48rpx;
    border-radius: 3rpx;
    background: $c-primary;
  }

  .cats__label {
    color: $c-primary-ink;
    font-weight: 600;
  }
}

.cats__hint {
  margin: 20rpx 12rpx;
  font-size: 22rpx;
  color: $c-text-3;
  text-align: center;
}

.cats__manage {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  margin: 24rpx 12rpx 40rpx;
  border-radius: 32rpx;
  background: $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.cats__manage-icon {
  margin-right: 6rpx;
  font-size: 20rpx;
}

.dishes {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 20rpx;
}

.dishes__head {
  display: flex;
  align-items: baseline;
  padding: 8rpx 4rpx 16rpx;
}

.dishes__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #4a4a4a;
}

.dishes__count {
  margin-left: 6rpx;
  font-size: 24rpx;
  color: #b3ada0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.dishes__foot {
  padding: 30rpx 0;
  text-align: center;
  font-size: 22rpx;
}

.dishes__pad {
  height: 40rpx;
}

/* ---------- 悬浮操作栏 ---------- */
.float-bar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 16rpx;
  z-index: 80;
}

.float-bar__inner {
  display: flex;
  align-items: center;
  height: 100rpx;
  padding: 0 12rpx 0 20rpx;
  border-radius: 50rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10rpx 30rpx rgba(150, 125, 80, 0.18);
}

.float-bar__cart {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
}

.float-bar__cart-icon {
  font-size: 34rpx;
}

.float-bar__badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 34rpx;
  height: 34rpx;
  padding: 0 8rpx;
  border-radius: 17rpx;
  background: $c-danger;
  color: #fff;
  font-size: 20rpx;
  line-height: 34rpx;
  text-align: center;
}

.float-bar__link {
  padding: 0 16rpx;
  font-size: 25rpx;
  color: #8d8577;
  white-space: nowrap;
  border-bottom: 4rpx solid $c-primary;
  padding-bottom: 4rpx;
  line-height: 1.2;
}

.float-bar__ghost {
  @include center;
  height: 64rpx;
  margin: 0 12rpx;
  padding: 0 22rpx;
  border-radius: 32rpx;
  border: 2rpx solid $c-primary-pale;
  background: #fffdf6;
  color: $c-primary-ink;
  font-size: 24rpx;
  line-height: 1;
  white-space: nowrap;

  &::after {
    border: none;
  }
}

.float-bar__primary {
  @include center;
  flex: 1;
  height: 76rpx;
  border-radius: 38rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;

  &.is-empty {
    background: #efe7d6;
    color: #b5ab97;
  }
}

/* ---------- 弹层内容 ---------- */
.meal-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  padding: 10rpx 0 30rpx;
}

.meal-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  border: 2rpx solid transparent;
}

.meal-item.is-active {
  background: $c-primary-pale;
  border-color: $c-primary;
}

.meal-item__emoji {
  font-size: 32rpx;
}

.meal-item__label {
  margin-left: 10rpx;
  font-size: 28rpx;
  color: $c-text;
}

.cart-list {
  padding-bottom: 20rpx;
}

.cart-row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid $c-line;
}

.cart-row__photo {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #fdf6e3;
  flex-shrink: 0;
  @include center;
}

.cart-row__img {
  width: 100%;
  height: 100%;
}

.cart-row__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.cart-row__name {
  font-size: 28rpx;
  color: $c-text;
  @include ellipsis(1);
}

.stepper {
  display: flex;
  align-items: center;
}

.stepper__btn {
  @include center;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  border: 2rpx solid $c-line;
  font-size: 30rpx;
  color: $c-text-2;
  line-height: 1;
}

.stepper__btn--add {
  background: linear-gradient(135deg, #fbe08a, #f3cf5e);
  border-color: transparent;
  color: #fff;
}

.stepper__num {
  min-width: 56rpx;
  text-align: center;
  font-size: 26rpx;
  color: $c-text;
}

.cart-empty {
  padding: 10rpx 0 20rpx;
}

.cart-footer {
  display: flex;
  align-items: center;
}

.cart-footer__clear {
  height: 76rpx;
  line-height: 76rpx;
  padding: 0 30rpx;
  border-radius: 38rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-text-2;
}

.cart-footer__submit {
  @include center;
  flex: 1;
  margin-left: 20rpx;
  height: 76rpx;
  border-radius: 38rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}
</style>
