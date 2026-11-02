<template>
  <view class="edit-page">
    <scroll-view scroll-y class="edit-scroll">
      <!-- 封面 -->
      <view class="section u-card">
        <view class="section__title">封面图</view>
        <view class="cover">
          <view v-if="form.cover" class="cover__box" @tap="preview(form.cover)">
            <cloud-image class="cover__img" :src="form.cover" size="full" />
            <view class="cover__del" @tap.stop="form.cover = ''">✕</view>
          </view>
          <view v-else class="cover__add" @tap="pickCover">
            <text class="cover__plus">＋</text>
            <text class="cover__tip">上传照片</text>
          </view>
          <view class="cover__hint">
            <text>建议用正方形图片，展示在点菜页会是圆形</text>
          </view>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="section u-card">
        <view class="field">
          <text class="field__label">菜品名称</text>
          <input
            v-model="form.name"
            class="field__input"
            placeholder="例如：柠檬手撕鸡"
            placeholder-class="field__ph"
            maxlength="20"
          />
        </view>

        <view class="field">
          <text class="field__label">所属分类</text>
          <picker
            class="field__picker"
            mode="selector"
            :range="categoryNames"
            :value="categoryIndex"
            @change="onCategoryChange"
          >
            <view class="field__picker-inner">
              <text>{{ categoryNames[categoryIndex] }}</text>
              <text class="field__arrow">›</text>
            </view>
          </picker>
        </view>

        <view class="field">
          <text class="field__label">菜品类目</text>
          <view class="chips">
            <view
              v-for="type in types"
              :key="type"
              class="chip"
              :class="{ 'is-active': form.tags.type === type }"
              @tap="form.tags.type = type"
            >
              {{ type }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="field__label">辣度</text>
          <view class="chips">
            <view
              v-for="level in spicyLevels"
              :key="level.value"
              class="chip"
              :class="{ 'is-active': form.tags.spicy === level.value }"
              @tap="form.tags.spicy = level.value"
            >
              {{ level.label }}
            </view>
          </view>
        </view>

        <view class="field field--row">
          <text class="field__label">耗时</text>
          <view class="field__number">
            <input
              v-model="form.tags.minutes"
              class="field__number-input"
              type="number"
              placeholder="30"
              placeholder-class="field__ph"
            />
            <text class="field__unit">分钟</text>
          </view>
        </view>

        <view class="field">
          <text class="field__label">简介</text>
          <textarea
            v-model="form.desc"
            class="field__textarea"
            placeholder="一句话描述这道菜，比如「酸甜开胃，宝宝最爱」"
            placeholder-class="field__ph"
            maxlength="120"
          />
        </view>
      </view>

      <!-- 食材 -->
      <view class="section u-card">
        <view class="section__title">
          <text>食材清单</text>
          <text class="section__extra">{{ form.ingredients.length }} 项</text>
        </view>

        <view v-for="(item, index) in form.ingredients" :key="'ing-' + index" class="ing-row">
          <input
            v-model="item.name"
            class="ing-row__name"
            placeholder="食材名"
            placeholder-class="field__ph"
            maxlength="16"
          />
          <input
            v-model="item.amount"
            class="ing-row__amount"
            placeholder="用量"
            placeholder-class="field__ph"
            maxlength="16"
          />
          <view class="ing-row__del" @tap="removeIngredient(index)">−</view>
        </view>

        <view class="add-row" @tap="addIngredient">＋ 添加食材</view>
        <view class="section__tip">下单后可在「厨房」自动汇总成采购清单</view>
      </view>

      <!-- 做法 -->
      <view class="section u-card">
        <view class="section__title">
          <text>做法步骤</text>
          <text class="section__extra">{{ form.steps.length }} 步</text>
        </view>

        <view v-for="(step, index) in form.steps" :key="'step-' + index" class="step-row">
          <view class="step-row__index">{{ index + 1 }}</view>
          <view class="step-row__body">
            <textarea
              v-model="step.text"
              class="step-row__text"
              placeholder="这一步要做什么"
              placeholder-class="field__ph"
              maxlength="120"
              auto-height
            />
            <view class="step-row__ops">
              <view class="step-row__img" @tap="pickStepImage(index)">
                <cloud-image
                  v-if="step.image"
                  class="step-row__thumb"
                  :src="step.image"
                  size="thumb"
                  :ph-size="32"
                />
                <text v-else class="step-row__img-tip">＋ 配图</text>
              </view>
              <text class="step-row__del" @tap="removeStep(index)">删除</text>
            </view>
          </view>
        </view>

        <view class="add-row" @tap="addStep">＋ 添加步骤</view>
      </view>

      <!-- 更多图片 -->
      <view class="section u-card">
        <view class="section__title">
          <text>更多图片</text>
          <text class="section__extra">{{ form.images.length }}/5</text>
        </view>
        <view class="gallery">
          <view v-for="(img, index) in form.images" :key="'img-' + index" class="gallery__item">
            <cloud-image
              class="gallery__img"
              :src="img"
              size="thumb"
              :ph-size="40"
              @tap="preview(img)"
            />
            <view class="gallery__del" @tap.stop="removeImage(index)">✕</view>
          </view>
          <view v-if="form.images.length < 5" class="gallery__add" @tap="pickImages">
            <text class="gallery__plus">＋</text>
          </view>
        </view>
      </view>

      <view class="edit-pad" />
    </scroll-view>

    <!-- 底部操作 -->
    <view class="edit-footer u-safe-bottom">
      <view v-if="dishId" class="edit-footer__del" @tap="onDelete">删除</view>
      <view class="edit-footer__save" :class="{ 'is-loading': saving }" @tap="onSave">
        {{ saving ? '保存中…' : dishId ? '保存修改' : '添加菜品' }}
      </view>
    </view>
  </view>
</template>

<script>
import { useMenuStore } from '@/store/menu'
import { categoryApi, dishApi } from '@/api'
import { uploadImage } from '@/api/cloud'
import { DISH_TYPES, SPICY_LEVELS } from '@/config'
import { toast, toastOk, toastError, confirm, showLoading, hideLoading, isBlank } from '@/utils/ui'

function chooseImages(count) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => resolve(res.tempFilePaths || []),
      fail: reject
    })
  })
}

export default {
  data() {
    return {
      dishId: '',
      saving: false,
      categoryLoading: false,
      categories: [],
      types: DISH_TYPES,
      spicyLevels: SPICY_LEVELS,
      form: {
        name: '',
        categoryId: '',
        cover: '',
        images: [],
        desc: '',
        tags: { type: '荤', spicy: 0, minutes: 30 },
        ingredients: [{ name: '', amount: '' }],
        steps: [{ text: '', image: '' }]
      }
    }
  },

  computed: {
    menu() {
      return useMenuStore()
    },
    categoryNames() {
      return ['未分类', ...this.categories.map((cat) => cat.name)]
    },
    categoryIndex() {
      if (!this.form.categoryId) return 0
      const idx = this.categories.findIndex((cat) => cat._id === this.form.categoryId)
      return idx === -1 ? 0 : idx + 1
    }
  },

  onLoad(query) {
    this.dishId = (query && query.id) || ''
    uni.setNavigationBarTitle({ title: this.dishId ? '编辑菜品' : '添加菜品' })
    this.loadCategories()
    if (this.dishId) this.loadDish()
  },

  methods: {
    async loadCategories() {
      this.categoryLoading = true
      try {
        const res = await categoryApi.list()
        this.categories = res.list || []
        if (!this.dishId && !this.form.categoryId) {
          // 默认选中点菜页当前分类，减少一次手动选择
          this.form.categoryId = this.menu.currentId === 'uncategorized' ? '' : this.menu.currentId || ''
        }
      } catch (err) {
        toastError(err, '分类加载失败')
      } finally {
        this.categoryLoading = false
      }
    },

    async loadDish() {
      showLoading('加载中')
      try {
        const dish = await dishApi.detail(this.dishId)
        this.form = {
          name: dish.name || '',
          categoryId: dish.categoryId || '',
          cover: dish.cover || '',
          images: dish.images || [],
          desc: dish.desc || '',
          tags: {
            type: (dish.tags && dish.tags.type) || '其他',
            spicy: (dish.tags && dish.tags.spicy) || 0,
            minutes: (dish.tags && dish.tags.minutes) || 0
          },
          ingredients: dish.ingredients && dish.ingredients.length
            ? dish.ingredients
            : [{ name: '', amount: '' }],
          steps: dish.steps && dish.steps.length ? dish.steps : [{ text: '', image: '' }]
        }
      } catch (err) {
        toastError(err, '菜品加载失败')
      } finally {
        hideLoading()
      }
    },

    onCategoryChange(e) {
      const idx = Number(e.detail.value)
      this.form.categoryId = idx === 0 ? '' : this.categories[idx - 1]._id
    },

    async pickCover() {
      const paths = await chooseImages(1).catch(() => [])
      if (!paths.length) return
      await this.uploadTo(paths[0], (fileID) => {
        this.form.cover = fileID
      })
    },

    async pickImages() {
      const remain = 5 - this.form.images.length
      if (remain <= 0) return
      const paths = await chooseImages(remain).catch(() => [])
      if (!paths.length) return
      showLoading('上传中')
      try {
        for (const path of paths) {
          const fileID = await uploadImage(path, 'dish')
          this.form.images.push(fileID)
        }
      } catch (err) {
        toastError(err, '图片上传失败')
      } finally {
        hideLoading()
      }
    },

    async pickStepImage(index) {
      const paths = await chooseImages(1).catch(() => [])
      if (!paths.length) return
      await this.uploadTo(paths[0], (fileID) => {
        this.form.steps[index].image = fileID
      })
    },

    async uploadTo(path, assign) {
      showLoading('上传中')
      try {
        const fileID = await uploadImage(path, 'dish')
        assign(fileID)
      } catch (err) {
        toastError(err, '图片上传失败')
      } finally {
        hideLoading()
      }
    },

    removeImage(index) {
      this.form.images.splice(index, 1)
    },

    addIngredient() {
      this.form.ingredients.push({ name: '', amount: '' })
    },

    removeIngredient(index) {
      if (this.form.ingredients.length <= 1) {
        this.form.ingredients = [{ name: '', amount: '' }]
        return
      }
      this.form.ingredients.splice(index, 1)
    },

    addStep() {
      this.form.steps.push({ text: '', image: '' })
    },

    removeStep(index) {
      if (this.form.steps.length <= 1) {
        this.form.steps = [{ text: '', image: '' }]
        return
      }
      this.form.steps.splice(index, 1)
    },

    preview(url) {
      const urls = [url, ...this.form.images].filter(Boolean)
      uni.previewImage({ current: url, urls: [...new Set(urls)] })
    },

    buildPayload() {
      return {
        name: this.form.name,
        categoryId: this.form.categoryId,
        cover: this.form.cover,
        images: this.form.images,
        desc: this.form.desc,
        tags: {
          type: this.form.tags.type,
          spicy: Number(this.form.tags.spicy) || 0,
          minutes: Number(this.form.tags.minutes) || 0
        },
        ingredients: this.form.ingredients.filter((item) => !isBlank(item.name)),
        steps: this.form.steps.filter((item) => !isBlank(item.text))
      }
    },

    async onSave() {
      if (this.saving) return
      if (isBlank(this.form.name)) {
        toast('请填写菜品名称')
        return
      }
      this.saving = true
      showLoading(this.dishId ? '保存中' : '添加中')
      try {
        const payload = this.buildPayload()
        const dish = this.dishId
          ? await dishApi.update({ ...payload, _id: this.dishId })
          : await dishApi.create(payload)

        this.menu.upsertDish(dish)
        // 分类可能在别处新建，刷新一次保证左侧栏计数正确
        this.menu.loadCategories(true).catch(() => undefined)
        this.menu.invalidate()

        hideLoading()
        toastOk(this.dishId ? '已保存' : '已添加到小厨房')
        setTimeout(() => uni.navigateBack(), 600)
      } catch (err) {
        hideLoading()
        toastError(err, '保存失败')
      } finally {
        this.saving = false
      }
    },

    async onDelete() {
      const ok = await confirm('删除后不可恢复，确定吗？', '删除菜品', '删除')
      if (!ok) return
      showLoading('删除中')
      try {
        await dishApi.remove(this.dishId)
        this.menu.removeDish(this.dishId)
        this.menu.loadCategories(true).catch(() => undefined)
        hideLoading()
        toastOk('已删除')
        setTimeout(() => uni.navigateBack(), 600)
      } catch (err) {
        hideLoading()
        toastError(err, '删除失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.edit-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $c-bg;
}

.edit-scroll {
  flex: 1;
  min-height: 0;
  padding: 20rpx 24rpx 0;
}

.section {
  margin-bottom: 24rpx;
  padding: 28rpx 28rpx 32rpx;
}

.section__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.section__extra {
  font-size: 22rpx;
  font-weight: 400;
  color: $c-text-3;
}

.section__tip {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

/* 封面 */
.cover {
  display: flex;
  align-items: center;
}

.cover__box {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  border-radius: $radius-md;
  overflow: hidden;
  flex-shrink: 0;
}

.cover__img {
  width: 100%;
  height: 100%;
}

.cover__del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 22rpx;
  line-height: 40rpx;
  text-align: center;
}

.cover__add {
  @include center;
  flex-direction: column;
  width: 180rpx;
  height: 180rpx;
  border-radius: $radius-md;
  border: 2rpx dashed #e2d7c2;
  background: #fdfaf3;
  flex-shrink: 0;
}

.cover__plus {
  font-size: 44rpx;
  color: $c-primary;
  line-height: 1;
}

.cover__tip {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $c-text-3;
}

.cover__hint {
  flex: 1;
  margin-left: 24rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: $c-text-3;
}

/* 表单项 */
.field {
  margin-bottom: 26rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.field--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: $c-text-2;
}

.field__input {
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
  color: $c-text;
}

.field__ph {
  color: #c4bcaa;
  font-size: 26rpx;
}

.field__picker-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
  color: $c-text;
}

.field__arrow {
  color: $c-text-3;
}

.field__number {
  display: flex;
  align-items: center;
}

.field__number-input {
  width: 120rpx;
  height: 76rpx;
  text-align: center;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
}

.field__unit {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: $c-text-3;
}

.field__textarea {
  width: 100%;
  height: 140rpx;
  padding: 20rpx 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 26rpx;
  color: $c-text;
  line-height: 1.5;
}

.chips {
  display: flex;
  flex-wrap: wrap;
}

.chip {
  margin: 0 14rpx 14rpx 0;
  padding: 0 26rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 30rpx;
  background: #fbf7f0;
  font-size: 24rpx;
  color: $c-text-2;
  border: 2rpx solid transparent;
}

.chip.is-active {
  background: $c-primary-pale;
  border-color: $c-primary;
  color: $c-primary-ink;
  font-weight: 600;
}

/* 食材 */
.ing-row {
  display: flex;
  align-items: center;
  margin-bottom: 14rpx;
}

.ing-row__name {
  flex: 1;
  min-width: 0;
  height: 76rpx;
  padding: 0 22rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 26rpx;
}

.ing-row__amount {
  width: 170rpx;
  height: 76rpx;
  margin-left: 14rpx;
  padding: 0 22rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 26rpx;
}

.ing-row__del {
  @include center;
  width: 60rpx;
  height: 60rpx;
  margin-left: 10rpx;
  border-radius: 50%;
  background: #f4efe5;
  color: $c-text-3;
  font-size: 30rpx;
  line-height: 1;
  flex-shrink: 0;
}

.add-row {
  @include center;
  height: 76rpx;
  margin-top: 8rpx;
  border-radius: $radius-md;
  border: 2rpx dashed #e6dbc6;
  font-size: 26rpx;
  color: $c-primary-ink;
}

/* 步骤 */
.step-row {
  display: flex;
  margin-bottom: 20rpx;
}

.step-row__index {
  @include center;
  width: 48rpx;
  height: 48rpx;
  margin-right: 16rpx;
  border-radius: 50%;
  background: $c-primary-pale;
  color: $c-primary-ink;
  font-size: 22rpx;
  flex-shrink: 0;
}

.step-row__body {
  flex: 1;
  min-width: 0;
}

.step-row__text {
  width: 100%;
  min-height: 80rpx;
  padding: 16rpx 20rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 26rpx;
  line-height: 1.5;
}

.step-row__ops {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}

.step-row__img {
  @include center;
  width: 120rpx;
  height: 120rpx;
  border-radius: $radius-sm;
  background: #fdfaf3;
  border: 2rpx dashed #e6dbc6;
  overflow: hidden;
}

.step-row__thumb {
  width: 100%;
  height: 100%;
}

.step-row__img-tip {
  font-size: 20rpx;
  color: $c-text-3;
}

.step-row__del {
  margin-left: auto;
  font-size: 22rpx;
  color: $c-danger;
}

/* 图集 */
.gallery {
  display: flex;
  flex-wrap: wrap;
}

.gallery__item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  margin: 0 16rpx 16rpx 0;
  border-radius: $radius-md;
  overflow: hidden;
}

.gallery__img {
  width: 100%;
  height: 100%;
}

.gallery__del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 20rpx;
  line-height: 36rpx;
  text-align: center;
}

.gallery__add {
  @include center;
  width: 180rpx;
  height: 180rpx;
  border-radius: $radius-md;
  border: 2rpx dashed #e6dbc6;
  background: #fdfaf3;
  color: $c-primary;
  font-size: 40rpx;
}

.edit-pad {
  height: 40rpx;
}

/* 底部 */
.edit-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: $c-card;
  box-shadow: $shadow-float;
}

.edit-footer__del {
  @include center;
  width: 160rpx;
  height: 84rpx;
  border-radius: 42rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-danger;
}

.edit-footer__save {
  @include center;
  flex: 1;
  height: 84rpx;
  margin-left: 20rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;

  &.is-loading {
    opacity: 0.7;
  }
}
</style>
