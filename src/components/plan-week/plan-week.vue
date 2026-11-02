<template>
  <view class="plan-view">
    <!-- 头部 -->
    <view class="plan-head">
      <view class="plan-head__row">
        <text class="plan-head__back" @tap="$emit('close')">‹ 返回</text>
        <text class="plan-head__title">周排菜</text>
        <view class="plan-head__cart" @tap="$emit('cart')">
          <text class="plan-head__cart-icon">🛒</text>
          <text v-if="cart.totalCount" class="plan-head__cart-num">{{ cart.totalCount }}</text>
        </view>
      </view>

      <view class="plan-head__week">
        <text class="plan-head__nav" @tap="shiftWeek(-1)">‹</text>
        <view class="plan-head__range" @tap="backToThisWeek">
          <text class="plan-head__range-text">{{ rangeText }}</text>
          <text class="plan-head__range-tip">{{ isThisWeek ? '本周' : '回到本周' }}</text>
        </view>
        <text class="plan-head__nav" @tap="shiftWeek(1)">›</text>
      </view>
    </view>

    <!-- 周视图：周一至周日 × 早/午/晚 -->
    <scroll-view scroll-y class="plan-body" :show-scrollbar="false">
      <view v-if="loading" class="u-loading">正在翻排菜本…</view>

      <block v-else>
        <view
          v-for="day in days"
          :key="day.date"
          class="week-row"
          :class="{ 'is-today': day.isToday }"
        >
          <view class="week-row__day">
            <text class="week-row__week">{{ day.week }}</text>
            <text class="week-row__date">{{ day.label }}</text>
            <text v-if="day.isToday" class="week-row__badge">今</text>
          </view>

          <view class="week-row__meals">
            <view
              v-for="meal in meals"
              :key="meal.value"
              class="cell"
              :class="{
                'is-empty': !cellItems(day.date, meal.value).length,
                'is-moving': isMoving(day.date, meal.value)
              }"
              @tap="onCellTap(day.date, meal.value)"
              @longpress="onCellLongPress(day.date, meal.value)"
            >
              <view class="cell__top">
                <text class="cell__meal">
                  {{ meal.short }}
                  <text v-if="cellItems(day.date, meal.value).length" class="cell__num">{{
                    cellItems(day.date, meal.value).length
                  }}</text>
                </text>
                <text
                  v-if="cellItems(day.date, meal.value).length"
                  class="cell__cart"
                  @tap.stop="addCellToCart(day.date, meal.value)"
                  >🛒</text
                >
              </view>

              <view class="cell__body">
                <text v-if="!cellItems(day.date, meal.value).length" class="cell__ph">＋ 排菜</text>
                <block v-else>
                  <text
                    v-for="item in cellPreview(day.date, meal.value)"
                    :key="item.dishId"
                    class="cell__dish"
                    >{{ item.name }}</text
                  >
                  <text v-if="cellItems(day.date, meal.value).length > 2" class="cell__more"
                    >等 {{ cellItems(day.date, meal.value).length }} 道</text
                  >
                </block>
              </view>
            </view>
          </view>
        </view>

        <view class="plan-tip">
          <text class="plan-tip__line">点格子排菜 · 格子右上角 🛒 一键加入购物车</text>
          <text class="plan-tip__line">长按已排的格子，再点目标格子即可整餐挪过去</text>
        </view>
        <view class="plan-pad" />
      </block>
    </scroll-view>

    <!-- 移动模式提示条 -->
    <view v-if="moving" class="moving-bar">
      <text class="moving-bar__text">已选中 {{ movingText }}，点目标格子完成移动</text>
      <text class="moving-bar__cancel" @tap="moving = null">取消</text>
    </view>

    <!-- 单餐排菜 -->
    <bottom-sheet v-model="editorVisible" :title="editorTitle" :height="1100">
      <view class="editor">
        <view class="editor__head">
          <text class="editor__label">已选 {{ draft.items.length }} 道</text>
          <text v-if="draft.items.length" class="editor__clear" @tap="clearDraft">清空</text>
        </view>

        <view v-if="draft.items.length" class="picked">
          <view v-for="(item, idx) in draft.items" :key="item.dishId" class="picked__row">
            <text class="picked__idx">{{ idx + 1 }}</text>
            <text class="picked__name">{{ item.name }}</text>
            <view class="picked__ops">
              <text
                class="picked__op"
                :class="{ 'is-disabled': idx === 0 }"
                @tap="moveDraft(idx, -1)"
                >↑</text
              >
              <text
                class="picked__op"
                :class="{ 'is-disabled': idx === draft.items.length - 1 }"
                @tap="moveDraft(idx, 1)"
                >↓</text
              >
              <text class="picked__op picked__op--del" @tap="removeDraft(idx)">✕</text>
            </view>
          </view>
        </view>
        <view v-else class="picked picked--empty">
          <text class="picked__empty">从下面挑几道菜，加进这一餐吧</text>
        </view>

        <scroll-view scroll-x class="cats" :show-scrollbar="false">
          <view class="cats__inner">
            <view
              v-for="cat in catList"
              :key="cat._id"
              class="cats__item"
              :class="{ 'is-active': cat._id === pickerCat }"
              @tap="selectPickerCat(cat._id)"
              >{{ cat.icon }} {{ cat.name }}</view
            >
          </view>
        </scroll-view>

        <view v-if="pickerLoading" class="u-loading">正在翻菜谱…</view>
        <empty-state v-else-if="!pickerDishes.length" emoji="🍳" title="这里还没有菜" />
        <view v-else class="picker">
          <view
            v-for="dish in pickerDishes"
            :key="dish._id"
            class="picker__item"
            :class="{ 'is-picked': isPicked(dish._id) }"
            @tap="toggleDish(dish)"
          >
            <view class="picker__photo">
              <cloud-image class="picker__img" :src="dish.cover" size="thumb" :ph-size="36" />
            </view>
            <text class="picker__name">{{ dish.name }}</text>
            <text class="picker__badge">{{ isPicked(dish._id) ? '✓' : '＋' }}</text>
          </view>
        </view>
      </view>

      <template #footer>
        <view class="editor-foot">
          <view class="editor-foot__cart" @tap="addDraftToCart">加入购物车</view>
          <view class="editor-foot__save" :class="{ 'is-busy': saving }" @tap="saveDraft">保存这一餐</view>
        </view>
      </template>
    </bottom-sheet>
  </view>
</template>

<script>
import { orderApi, dishApi } from '@/api'
import { useCartStore } from '@/store/cart'
import { useMenuStore } from '@/store/menu'
import { PLAN_MEALS } from '@/config'
import { today, shiftDate, weekStartOf, weekDays } from '@/utils/date'
import { toast, toastOk, toastError } from '@/utils/ui'

const MEAL_SHORT = { breakfast: '早', lunch: '午', dinner: '晚' }

export default {
  name: 'PlanWeek',
  props: {
    /** 周视图起始日（周一），默认本周 */
    startDate: { type: String, default: '' }
  },
  emits: ['close', 'cart'],

  data() {
    return {
      meals: PLAN_MEALS.map((meal) => ({ ...meal, short: MEAL_SHORT[meal.value] })),
      monday: this.startDate || weekStartOf(today()),
      /** { '2026-11-02|dinner': plan } */
      plans: {},
      loading: true,
      moving: null,
      editorVisible: false,
      editor: { date: '', mealType: 'dinner' },
      draft: { _id: '', items: [] },
      catList: [],
      pickerCat: 'all',
      pickerDishes: [],
      pickerLoading: false,
      saving: false
    }
  },

  computed: {
    cart() {
      return useCartStore()
    },
    menu() {
      return useMenuStore()
    },
    days() {
      return weekDays(this.monday)
    },
    rangeText() {
      return `${this.monday.slice(5)} - ${shiftDate(this.monday, 6).slice(5)}`
    },
    isThisWeek() {
      return this.monday === weekStartOf(today())
    },
    movingText() {
      if (!this.moving) return ''
      return this.mealLabelOf(this.moving.date, this.moving.mealType)
    },
    editorTitle() {
      const day = this.days.find((item) => item.date === this.editor.date)
      const meal = this.meals.find((item) => item.value === this.editor.mealType)
      if (!day || !meal) return '安排这一餐'
      return `${day.week} ${day.label} ${meal.label}`
    }
  },

  mounted() {
    this.fetch()
    this.loadCategories()
  },

  methods: {
    keyOf(date, mealType) {
      return `${date}|${mealType}`
    },

    cellPlan(date, mealType) {
      return this.plans[this.keyOf(date, mealType)] || null
    },

    cellItems(date, mealType) {
      const plan = this.cellPlan(date, mealType)
      return plan ? plan.items || [] : []
    },

    cellPreview(date, mealType) {
      return this.cellItems(date, mealType).slice(0, 2)
    },

    isMoving(date, mealType) {
      return !!this.moving && this.moving.date === date && this.moving.mealType === mealType
    },

    /** 拉取本周所有 planned 计划 */
    async fetch() {
      this.loading = true
      try {
        const res = await orderApi.list({
          from: this.monday,
          to: shiftDate(this.monday, 6),
          statuses: ['planned'],
          pageSize: 50
        })
        const map = {}
        ;(res.list || []).forEach((plan) => {
          map[this.keyOf(plan.date, plan.mealType)] = plan
        })
        this.plans = map
      } catch (err) {
        toastError(err, '排菜计划加载失败')
      } finally {
        this.loading = false
      }
    },

    shiftWeek(offset) {
      this.moving = null
      this.monday = shiftDate(this.monday, offset * 7)
      this.fetch()
    },

    backToThisWeek() {
      const monday = weekStartOf(today())
      if (monday === this.monday) return
      this.moving = null
      this.monday = monday
      this.fetch()
    },

    onCellTap(date, mealType) {
      if (this.moving) {
        if (this.isMoving(date, mealType)) {
          this.moving = null
          return
        }
        this.movePlanTo(date, mealType)
        return
      }
      this.openEditor(date, mealType)
    },

    onCellLongPress(date, mealType) {
      if (!this.cellItems(date, mealType).length) return
      this.moving = { date, mealType }
      toast('已选中，再点目标格子')
    },

    /** 整餐挪动，目标已有计划时云端会合并 */
    async movePlanTo(date, mealType) {
      const plan = this.cellPlan(this.moving.date, this.moving.mealType)
      this.moving = null
      if (!plan) return
      try {
        const saved = await orderApi.planMove({ _id: plan._id, date, mealType })
        const next = { ...this.plans }
        delete next[this.keyOf(plan.date, plan.mealType)]
        next[this.keyOf(saved.date, saved.mealType)] = saved
        this.plans = next
        toastOk(saved.merged ? '已合并到目标餐次' : '已经挪过去啦')
      } catch (err) {
        toastError(err, '移动失败')
      }
    },

    openEditor(date, mealType) {
      const plan = this.cellPlan(date, mealType)
      this.editor = { date, mealType }
      this.draft = {
        _id: plan ? plan._id : '',
        items: plan ? (plan.items || []).map((item) => ({ ...item })) : []
      }
      this.editorVisible = true
      if (!this.pickerDishes.length) this.loadPicker()
    },

    async loadCategories() {
      try {
        if (!this.menu.categoriesLoaded) await this.menu.loadCategories()
      } catch (err) {
        console.warn('[plan-week] 分类加载失败', err)
      }
      this.catList = [{ _id: 'all', name: '全部', icon: '🍽️' }, ...this.menu.sideList]
    },

    async loadPicker() {
      this.pickerLoading = true
      try {
        const res = await dishApi.list({
          categoryId: this.pickerCat === 'all' ? '' : this.pickerCat,
          status: 'on',
          page: 0,
          pageSize: 60
        })
        this.pickerDishes = res.list || []
      } catch (err) {
        toastError(err, '菜品加载失败')
      } finally {
        this.pickerLoading = false
      }
    },

    selectPickerCat(id) {
      if (id === this.pickerCat) return
      this.pickerCat = id
      this.pickerDishes = []
      this.loadPicker()
    },

    isPicked(dishId) {
      return this.draft.items.some((item) => item.dishId === dishId)
    },

    toggleDish(dish) {
      const idx = this.draft.items.findIndex((item) => item.dishId === dish._id)
      if (idx > -1) {
        this.draft.items.splice(idx, 1)
        return
      }
      this.draft.items.push({
        dishId: dish._id,
        name: dish.name,
        cover: dish.cover || '',
        count: 1
      })
    },

    moveDraft(idx, offset) {
      const target = idx + offset
      if (target < 0 || target >= this.draft.items.length) return
      const items = this.draft.items.slice()
      const [row] = items.splice(idx, 1)
      items.splice(target, 0, row)
      this.draft.items = items
    },

    removeDraft(idx) {
      this.draft.items.splice(idx, 1)
    },

    clearDraft() {
      this.draft.items = []
    },

    /** 把草稿写回云端，空数组即清空这一餐 */
    async saveDraft() {
      if (this.saving) return
      this.saving = true
      try {
        const res = await orderApi.planSave({
          date: this.editor.date,
          mealType: this.editor.mealType,
          items: this.draft.items.map((item) => ({ dishId: item.dishId, count: item.count }))
        })
        const next = { ...this.plans }
        const key = this.keyOf(this.editor.date, this.editor.mealType)
        if (res.removed) {
          delete next[key]
        } else {
          next[key] = res
        }
        this.plans = next
        this.editorVisible = false
        toastOk(res.removed ? '这一餐已清空' : '已排进计划')
      } catch (err) {
        toastError(err, '保存失败')
      } finally {
        this.saving = false
      }
    },

    /** 「周一晚餐」格式的餐次标签 */
    mealLabelOf(date, mealType) {
      const day = this.days.find((item) => item.date === date)
      const meal = this.meals.find((item) => item.value === mealType)
      return `${day ? day.week : ''}${meal ? meal.label : ''}`
    },

    /** 整餐加入购物车 */
    addCellToCart(date, mealType) {
      const items = this.cellItems(date, mealType)
      if (!items.length) return
      this.cart.setContext(date, mealType)
      items.forEach((item) => {
        this.cart.add({ _id: item.dishId, name: item.name, cover: item.cover }, item.count || 1)
      })
      toastOk(`${this.mealLabelOf(date, mealType)}已加入购物车`)
    },

    addDraftToCart() {
      if (!this.draft.items.length) {
        toast('先挑几道菜吧')
        return
      }
      this.cart.setContext(this.editor.date, this.editor.mealType)
      this.draft.items.forEach((item) => {
        this.cart.add({ _id: item.dishId, name: item.name, cover: item.cover }, item.count || 1)
      })
      toastOk('已加入购物车')
    }
  }
}
</script>

<style lang="scss" scoped>
.plan-view {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: $c-bg;
}

/* ---------- 头部 ---------- */
.plan-head {
  flex-shrink: 0;
  padding: 16rpx 24rpx 20rpx;
  background: #fff;
  border-bottom: 1px solid $c-line;
}

.plan-head__row {
  display: flex;
  align-items: center;
  height: 72rpx;
}

.plan-head__back {
  font-size: 26rpx;
  color: $c-text-2;
  padding-right: 16rpx;
}

.plan-head__title {
  flex: 1;
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  color: $c-text;
}

.plan-head__cart {
  display: flex;
  align-items: center;
  height: 56rpx;
  padding: 0 20rpx;
  border-radius: 28rpx;
  background: #fdf6e3;
}

.plan-head__cart-icon {
  font-size: 26rpx;
}

.plan-head__cart-num {
  margin-left: 6rpx;
  font-size: 24rpx;
  color: $c-primary-ink;
}

.plan-head__week {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.plan-head__nav {
  @include center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  font-size: 34rpx;
  color: $c-text-2;
  background: #f7f2e9;
}

.plan-head__range {
  flex: 1;
  text-align: center;
}

.plan-head__range-text {
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.plan-head__range-tip {
  margin-left: 10rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

/* ---------- 周视图 ---------- */
.plan-body {
  flex: 1;
  min-height: 0;
  padding: 16rpx 20rpx 0;
}

.week-row {
  display: flex;
  align-items: stretch;
  margin-bottom: 12rpx;
  padding: 10rpx;
  border-radius: $radius-md;
  background: rgba(255, 255, 255, 0.72);
}

.week-row.is-today {
  background: #fffaf0;
  box-shadow: inset 0 0 0 2rpx rgba(233, 185, 59, 0.35);
}

.week-row__day {
  position: relative;
  width: 88rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.week-row__week {
  font-size: 26rpx;
  font-weight: 600;
  color: $c-text;
}

.week-row__date {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: $c-text-3;
}

.week-row__badge {
  position: absolute;
  top: -2rpx;
  right: 6rpx;
  font-size: 18rpx;
  color: #fff;
  background: $c-primary;
  border-radius: 8rpx;
  padding: 0 6rpx;
  line-height: 24rpx;
}

.week-row__meals {
  flex: 1;
  min-width: 0;
  display: flex;
}

.cell {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 148rpx;
  margin-left: 8rpx;
  padding: 8rpx 10rpx;
  border-radius: 16rpx;
  border: 2rpx solid transparent;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cell.is-empty {
  background: #fbf6ec;
  border-color: #eee2c8;
  border-style: dashed;
}

.cell.is-moving {
  border-color: $c-primary;
  box-shadow: 0 0 0 4rpx rgba(233, 185, 59, 0.18);
}

.cell__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cell__meal {
  font-size: 20rpx;
  color: $c-text-3;
}

.cell__num {
  margin-left: 4rpx;
  font-size: 18rpx;
  color: $c-primary-ink;
}

.cell__cart {
  font-size: 22rpx;
  padding: 6rpx 8rpx;
  margin: -6rpx -4rpx 0 0;
}

.cell__body {
  flex: 1;
  min-height: 0;
  margin-top: 4rpx;
  overflow: hidden;
}

.cell__dish {
  display: block;
  font-size: 20rpx;
  line-height: 28rpx;
  color: $c-text;
  @include ellipsis(1);
}

.cell__more {
  display: block;
  font-size: 18rpx;
  line-height: 24rpx;
  color: $c-text-3;
}

.cell__ph {
  font-size: 20rpx;
  color: #c3b79f;
}

.plan-tip {
  padding: 16rpx 8rpx 0;
}

.plan-tip__line {
  display: block;
  font-size: 22rpx;
  line-height: 34rpx;
  color: $c-text-3;
}

.plan-pad {
  height: 40rpx;
}

/* ---------- 移动模式 ---------- */
.moving-bar {
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  bottom: 24rpx;
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  border-radius: $radius-md;
  background: #4a3f2a;
  box-shadow: 0 12rpx 32rpx rgba(74, 63, 42, 0.28);
}

.moving-bar__text {
  flex: 1;
  font-size: 24rpx;
  color: #ffe9ad;
}

.moving-bar__cancel {
  font-size: 24rpx;
  color: #fff;
}

/* ---------- 排菜弹层 ---------- */
.editor__head {
  display: flex;
  align-items: center;
  padding: 8rpx 0 16rpx;
}

.editor__label {
  flex: 1;
  font-size: 26rpx;
  color: $c-text-2;
}

.editor__clear {
  font-size: 24rpx;
  color: $c-danger;
}

.picked {
  border-radius: $radius-md;
  background: #fbf7f0;
  padding: 6rpx 0;
}

.picked--empty {
  padding: 28rpx 0;
  text-align: center;
}

.picked__empty {
  font-size: 24rpx;
  color: $c-text-3;
}

.picked__row {
  display: flex;
  align-items: center;
  padding: 12rpx 20rpx;
}

.picked__idx {
  width: 40rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.picked__name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: $c-text;
  @include ellipsis(1);
}

.picked__ops {
  display: flex;
  align-items: center;
}

.picked__op {
  @include center;
  width: 52rpx;
  height: 52rpx;
  margin-left: 8rpx;
  border-radius: 50%;
  background: #fff;
  font-size: 24rpx;
  color: $c-text-2;

  &.is-disabled {
    opacity: 0.32;
  }
}

.picked__op--del {
  color: $c-danger;
}

.cats {
  margin-top: 20rpx;
  white-space: nowrap;
}

.cats__inner {
  display: flex;
}

.cats__item {
  flex-shrink: 0;
  margin-right: 12rpx;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: #f7f2e9;
  font-size: 24rpx;
  color: $c-text-2;
}

.cats__item.is-active {
  background: $c-primary-pale;
  color: $c-primary-ink;
  font-weight: 600;
}

.picker {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
  padding-bottom: 20rpx;
}

.picker__item {
  position: relative;
  width: 31.5%;
  margin: 0 2.75% 20rpx 0;
  padding: 12rpx;
  border-radius: $radius-md;
  background: #fdfaf4;
  border: 2rpx solid transparent;
  box-sizing: border-box;

  &:nth-child(3n) {
    margin-right: 0;
  }
}

.picker__item.is-picked {
  border-color: $c-primary;
  background: #fffaf0;
}

.picker__photo {
  @include center;
  height: 120rpx;
  overflow: hidden;
  border-radius: 16rpx;
  background: #fdf6e3;
}

.picker__img {
  width: 100%;
  height: 100%;
}

.picker__name {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: $c-text;
  @include ellipsis(1);
}

.picker__badge {
  position: absolute;
  right: 10rpx;
  bottom: 10rpx;
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background: #f4cf5b;
  font-size: 22rpx;
  color: #fff;
}

.editor-foot {
  display: flex;
  align-items: center;
}

.editor-foot__cart {
  @include center;
  height: 76rpx;
  padding: 0 30rpx;
  border-radius: 38rpx;
  border: 2rpx solid $c-primary;
  font-size: 26rpx;
  color: $c-primary-ink;
}

.editor-foot__save {
  @include center;
  flex: 1;
  height: 76rpx;
  margin-left: 20rpx;
  border-radius: 38rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  font-size: 28rpx;
  font-weight: 600;
  color: #fff;

  &.is-busy {
    opacity: 0.6;
  }
}
</style>
