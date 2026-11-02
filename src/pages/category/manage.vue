<template>
  <view class="cat-page">
    <view class="header">
      <view class="header__text">
        <text class="header__title">分类管理</text>
        <text class="header__sub">拖不动就点箭头，顺序即点菜页左侧栏顺序</text>
      </view>
      <view class="header__add" @tap="openCreate">＋ 新建</view>
    </view>

    <scroll-view scroll-y class="list">
      <view v-if="loading" class="u-loading">加载中…</view>

      <empty-state
        v-else-if="!categories.length"
        emoji="🗂️"
        title="还没有分类"
        desc="先建几个分类，比如「主食」「荤」「素」"
        action-text="新建分类"
        @action="openCreate"
      />

      <view v-for="(cat, index) in categories" :key="cat._id" class="row">
        <view class="row__icon">{{ cat.icon || '🍽️' }}</view>
        <view class="row__info">
          <text class="row__name">{{ cat.name }}</text>
          <text class="row__count">{{ cat.dishCount || 0 }} 道菜</text>
        </view>

        <view class="row__ops">
          <view class="row__op" :class="{ 'is-disabled': index === 0 }" @tap="move(index, -1)">↑</view>
          <view
            class="row__op"
            :class="{ 'is-disabled': index === categories.length - 1 }"
            @tap="move(index, 1)"
          >
            ↓
          </view>
          <view class="row__op" @tap="openEdit(cat)">编辑</view>
          <view class="row__op row__op--danger" @tap="onDelete(cat)">删除</view>
        </view>
      </view>

      <view class="list__pad" />
    </scroll-view>

    <!-- 新建 / 编辑 -->
    <bottom-sheet v-model="formVisible" :title="editingId ? '编辑分类' : '新建分类'">
      <view class="form">
        <text class="form__label">分类名称</text>
        <input
          v-model="form.name"
          class="form__input"
          placeholder="最多 8 个字"
          placeholder-class="form__ph"
          maxlength="8"
        />

        <text class="form__label">图标</text>
        <view class="icon-grid">
          <view
            v-for="icon in iconPresets"
            :key="icon"
            class="icon-item"
            :class="{ 'is-active': form.icon === icon }"
            @tap="form.icon = icon"
          >
            {{ icon }}
          </view>
        </view>
      </view>
      <template #footer>
        <view class="form-footer">
          <view class="form-footer__cancel" @tap="formVisible = false">取消</view>
          <view class="form-footer__ok" @tap="onSubmit">{{ editingId ? '保存' : '创建' }}</view>
        </view>
      </template>
    </bottom-sheet>

    <!-- 删除时选择迁移目标 -->
    <bottom-sheet v-model="moveVisible" title="把菜品迁移到">
      <view class="move-list">
        <view class="move-item" @tap="doRemove('')">
          <text>未分类</text>
          <text class="move-item__arrow">›</text>
        </view>
        <view
          v-for="cat in moveTargets"
          :key="cat._id"
          class="move-item"
          @tap="doRemove(cat._id)"
        >
          <text>{{ cat.icon }} {{ cat.name }}</text>
          <text class="move-item__arrow">›</text>
        </view>
      </view>
    </bottom-sheet>
  </view>
</template>

<script>
import { useMenuStore } from '@/store/menu'
import { categoryApi } from '@/api'
import { toastOk, toastError, confirm, isBlank } from '@/utils/ui'

const ICONS = [
  '🍚', '🥩', '🥬', '🍳', '🥣', '🧋', '🍟', '🍜',
  '🍲', '🥗', '🍗', '🐟', '🍰', '☕', '🍹', '🥟'
]

export default {
  data() {
    return {
      loading: true,
      formVisible: false,
      editingId: '',
      form: { name: '', icon: '🍽️' },
      iconPresets: ICONS,
      moveVisible: false,
      pendingDelete: null
    }
  },

  computed: {
    menu() {
      return useMenuStore()
    },
    categories() {
      return this.menu.categories
    },
    moveTargets() {
      if (!this.pendingDelete) return this.categories
      return this.categories.filter((cat) => cat._id !== this.pendingDelete._id)
    }
  },

  onLoad() {
    this.load()
  },

  methods: {
    async load() {
      this.loading = true
      try {
        await this.menu.loadCategories(true)
      } catch (err) {
        toastError(err, '分类加载失败')
      } finally {
        this.loading = false
      }
    },

    openCreate() {
      this.editingId = ''
      this.form = { name: '', icon: '🍽️' }
      this.formVisible = true
    },

    openEdit(cat) {
      this.editingId = cat._id
      this.form = { name: cat.name, icon: cat.icon || '🍽️' }
      this.formVisible = true
    },

    async onSubmit() {
      if (isBlank(this.form.name)) {
        toastError({ msg: '请填写分类名称' })
        return
      }
      try {
        if (this.editingId) {
          await categoryApi.update({ _id: this.editingId, ...this.form })
        } else {
          await categoryApi.create(this.form)
        }
        this.formVisible = false
        toastOk(this.editingId ? '已保存' : '已创建')
        this.menu.invalidate()
        await this.load()
      } catch (err) {
        toastError(err, '保存失败')
      }
    },

    async move(index, dir) {
      const target = index + dir
      if (target < 0 || target >= this.categories.length) return
      const list = [...this.categories]
      const temp = list[index]
      list[index] = list[target]
      list[target] = temp
      this.menu.categories = list
      try {
        await categoryApi.sort(list.map((cat) => ({ _id: cat._id })))
      } catch (err) {
        toastError(err, '排序保存失败')
        await this.load()
      }
    },

    async onDelete(cat) {
      if ((cat.dishCount || 0) > 0) {
        this.pendingDelete = cat
        this.moveVisible = true
        return
      }
      const ok = await confirm(`确定删除分类「${cat.name}」吗？`, '删除分类', '删除')
      if (!ok) return
      try {
        await categoryApi.remove({ _id: cat._id })
        toastOk('已删除')
        this.menu.invalidate()
        await this.load()
      } catch (err) {
        toastError(err, '删除失败')
      }
    },

    async doRemove(moveTo) {
      const cat = this.pendingDelete
      if (!cat) return
      try {
        await categoryApi.remove({ _id: cat._id, moveTo })
        this.moveVisible = false
        this.pendingDelete = null
        toastOk('已删除并迁移菜品')
        this.menu.invalidate()
        await this.load()
      } catch (err) {
        toastError(err, '删除失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.cat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 24rpx 24rpx 16rpx;
}

.header__text {
  flex: 1;
  min-width: 0;
}

.header__title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: $c-text;
}

.header__sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.header__add {
  @include center;
  height: 68rpx;
  padding: 0 30rpx;
  border-radius: 34rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 26rpx;
  flex-shrink: 0;
}

.list {
  flex: 1;
  min-height: 0;
  padding: 8rpx 24rpx 0;
}

.row {
  display: flex;
  align-items: center;
  margin-bottom: 18rpx;
  padding: 22rpx 24rpx;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.row__icon {
  @include center;
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: #fdf6e3;
  font-size: 36rpx;
  flex-shrink: 0;
}

.row__info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.row__name {
  display: block;
  font-size: 28rpx;
  color: $c-text;
  @include ellipsis(1);
}

.row__count {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.row__ops {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.row__op {
  @include center;
  min-width: 56rpx;
  height: 56rpx;
  margin-left: 8rpx;
  padding: 0 12rpx;
  border-radius: 28rpx;
  background: #fbf7f0;
  font-size: 22rpx;
  color: $c-text-2;
}

.row__op.is-disabled {
  opacity: 0.3;
}

.row__op--danger {
  color: $c-danger;
  background: #fdecea;
}

.list__pad {
  height: 60rpx;
}

/* 表单 */
.form {
  padding-bottom: 20rpx;
}

.form__label {
  display: block;
  margin: 20rpx 0 14rpx;
  font-size: 26rpx;
  color: $c-text-2;
}

.form__input {
  height: 84rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
}

.form__ph {
  color: #c4bcaa;
  font-size: 26rpx;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
}

.icon-item {
  @include center;
  width: 84rpx;
  height: 84rpx;
  margin: 0 14rpx 14rpx 0;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 36rpx;
  border: 2rpx solid transparent;
}

.icon-item.is-active {
  background: $c-primary-pale;
  border-color: $c-primary;
}

.form-footer {
  display: flex;
}

.form-footer__cancel {
  @include center;
  width: 200rpx;
  height: 80rpx;
  border-radius: 40rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-text-2;
}

.form-footer__ok {
  @include center;
  flex: 1;
  height: 80rpx;
  margin-left: 20rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

/* 迁移 */
.move-list {
  padding-bottom: 30rpx;
}

.move-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 96rpx;
  border-bottom: 1px solid $c-line;
  font-size: 28rpx;
  color: $c-text;
}

.move-item__arrow {
  color: $c-text-3;
}
</style>
