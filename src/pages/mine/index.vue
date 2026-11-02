<template>
  <view class="mine-page">
    <view class="hero" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="hero__bg" />
      <view class="hero__profile" @tap="openProfile">
        <cloud-image class="hero__avatar" :src="avatarUrl" size="avatar" :lazy="false" :ph-size="48" />
        <view class="hero__info">
          <view class="hero__name-row">
            <text class="hero__name">{{ userStore.nickname }}</text>
            <text class="hero__role">{{ roleText }}</text>
          </view>
          <text class="hero__sub">{{ userStore.profile ? userStore.profile.memberTotal || 1 : 1 }} 位家人共享这个小厨房</text>
        </view>
        <text class="hero__arrow">›</text>
      </view>
    </view>

    <!-- 数值概览 -->
    <view class="stats">
      <view class="stats__item">
        <text class="stats__num">{{ stats.dishTotal }}</text>
        <text class="stats__label">道菜</text>
      </view>
      <view class="stats__line" />
      <view class="stats__item">
        <text class="stats__num">{{ stats.categoryTotal }}</text>
        <text class="stats__label">个分类</text>
      </view>
      <view class="stats__line" />
      <view class="stats__item">
        <text class="stats__num">{{ stats.monthOrderTotal }}</text>
        <text class="stats__label">本月下单</text>
      </view>
    </view>

    <!-- 家庭成员 -->
    <view class="card u-card">
      <view class="card__head">
        <text class="card__title">家庭成员</text>
        <button class="card__share" open-type="share">＋ 邀请家人</button>
      </view>
      <view v-if="membersLoading" class="u-loading">加载中…</view>
      <view v-else class="members">
        <view v-for="member in members" :key="member._id" class="member">
          <cloud-image
            class="member__avatar"
            :src="member.avatar"
            size="avatar"
            placeholder="👤"
            :ph-size="32"
          />
          <view class="member__info">
            <text class="member__name">
              {{ member.nickName || '未命名家人' }}
              <text v-if="member.isSelf" class="member__self">（我）</text>
            </text>
            <text class="member__role">{{ member.role === 'admin' ? '管理员' : '成员' }}</text>
          </view>
          <text
            v-if="canRemove(member)"
            class="member__remove"
            @tap.stop="removeMember(member)"
          >
            移除
          </text>
        </view>
        <view v-if="!members.length" class="u-muted members__empty">还没有其他家人加入，分享给他们打开就自动加入</view>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="card u-card">
      <view class="cell" @tap="goCategory">
        <text class="cell__icon">🗂️</text>
        <text class="cell__text">分类管理</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="goManage">
        <text class="cell__icon">🍽️</text>
        <text class="cell__text">管理菜品</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="goRank">
        <text class="cell__icon">🔥</text>
        <text class="cell__text">热度排行</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="goKitchen">
        <text class="cell__icon">🧑‍🍳</text>
        <text class="cell__text">厨房与采购清单</text>
        <text class="cell__arrow">›</text>
      </view>
    </view>

    <view class="card u-card">
      <view class="cell" @tap="onInitDb">
        <text class="cell__icon">🗄️</text>
        <text class="cell__text">初始化数据库</text>
        <text class="cell__hint">首次部署后执行一次</text>
        <text class="cell__arrow">›</text>
      </view>
      <view class="cell" @tap="onAbout">
        <text class="cell__icon">ℹ️</text>
        <text class="cell__text">关于</text>
        <text class="cell__arrow">›</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer__text">蓝宝宝专属小厨房 · v1.0.0</text>
    </view>

    <!-- 资料编辑 -->
    <bottom-sheet v-model="profileVisible" title="编辑资料">
      <view class="profile">
        <view class="profile__avatar" @tap="pickAvatar">
          <cloud-image class="profile__avatar-img" :src="avatarUrl" size="card" :ph-size="60" />
          <text class="profile__avatar-tip">换头像</text>
        </view>
        <text class="profile__label">昵称</text>
        <input
          v-model="form.nickName"
          class="profile__input"
          placeholder="家人怎么称呼你"
          placeholder-class="profile__ph"
          maxlength="16"
        />
      </view>
      <template #footer>
        <view class="profile-footer">
          <view class="profile-footer__save" @tap="onSaveProfile">保存</view>
        </view>
      </template>
    </bottom-sheet>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user'
import { useMenuStore } from '@/store/menu'
import { userApi, statsApi } from '@/api'
import { call, uploadImage } from '@/api/cloud'
import { FN } from '@/config'
import { toast, toastOk, toastError, confirm, showLoading, hideLoading } from '@/utils/ui'

export default {
  data() {
    return {
      statusBarHeight: 20,
      stats: { dishTotal: 0, categoryTotal: 0, monthOrderTotal: 0 },
      members: [],
      membersLoading: false,
      profileVisible: false,
      form: { nickName: '' }
    }
  },

  computed: {
    userStore() {
      return useUserStore()
    },
    menu() {
      return useMenuStore()
    },
    avatarUrl() {
      return this.userStore.avatar || '/static/chef-avatar.png'
    },
    roleText() {
      return this.userStore.isAdmin ? '管理员' : '成员'
    }
  },

  onLoad() {
    const info = uni.getSystemInfoSync()
    this.statusBarHeight = info.statusBarHeight || 20
  },

  onShow() {
    this.userStore.bootstrap(true)
    this.loadMembers()
    this.loadStats()
  },

  onShareAppMessage() {
    return {
      title: '来加入我们的小厨房吧',
      path: `/pages/order/index?inviter=${this.userStore.openid}`
    }
  },

  methods: {
    async loadStats() {
      try {
        const res = await statsApi.overview()
        this.stats = res
      } catch (err) {
        console.error('[mine] 统计加载失败', err)
      }
    },

    async loadMembers() {
      this.membersLoading = true
      try {
        const res = await userApi.members()
        this.members = res.list || []
      } catch (err) {
        toastError(err, '成员加载失败')
      } finally {
        this.membersLoading = false
      }
    },

    canRemove(member) {
      return this.userStore.isAdmin && !member.isSelf
    },

    async removeMember(member) {
      const ok = await confirm(`确定把「${member.nickName}」移出小厨房吗？`, '移除成员', '移除')
      if (!ok) return
      try {
        await userApi.removeMember(member._id)
        toastOk('已移除')
        this.loadMembers()
      } catch (err) {
        toastError(err)
      }
    },

    openProfile() {
      this.form.nickName = (this.userStore.profile && this.userStore.profile.nickName) || ''
      this.profileVisible = true
    },

    pickAvatar() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        success: async (res) => {
          const path = (res.tempFilePaths || [])[0]
          if (!path) return
          showLoading('上传中')
          try {
            const fileID = await uploadImage(path, 'avatar')
            await this.userStore.update({ avatar: fileID })
            toastOk('头像已更新')
          } catch (err) {
            toastError(err, '头像上传失败')
          } finally {
            hideLoading()
          }
        }
      })
    },

    async onSaveProfile() {
      if (!this.form.nickName.trim()) {
        toast('昵称不能为空')
        return
      }
      showLoading('保存中')
      try {
        await this.userStore.update({ nickName: this.form.nickName })
        this.profileVisible = false
        hideLoading()
        toastOk('已保存')
      } catch (err) {
        hideLoading()
        toastError(err, '保存失败')
      }
    },

    async onInitDb() {
      const ok = await confirm(
        '会在云数据库中创建所需集合，并写入默认分类（已存在则跳过）',
        '初始化数据库',
        '开始'
      )
      if (!ok) return
      showLoading('初始化中')
      try {
        const res = await call(FN.initdb, '')
        hideLoading()
        uni.showModal({
          title: '初始化完成',
          content: `新建集合：${(res.created || []).join('、') || '无'}\n已有集合：${(res.existed || []).join('、') || '无'}\n新增分类：${res.seeded || 0} 个`,
          showCancel: false
        })
        this.menu.loadCategories(true).catch(() => undefined)
      } catch (err) {
        hideLoading()
        toastError(err, '初始化失败，请确认 initdb 云函数已部署')
      }
    },

    onAbout() {
      uni.showModal({
        title: '蓝宝宝专属小厨房',
        content: '基于 uni-app + 微信云开发（腾讯云函数）。\n菜品、分类、热度排行、食记与采购清单，全都为家里这一口热饭准备。',
        showCancel: false,
        confirmColor: '#E9B93B'
      })
    },

    goCategory() {
      uni.navigateTo({ url: '/pages/category/manage' })
    },
    goManage() {
      uni.navigateTo({ url: '/pages/dish/manage' })
    },
    goRank() {
      uni.navigateTo({ url: '/pages/rank/index' })
    },
    goKitchen() {
      uni.switchTab({ url: '/pages/kitchen/index' })
    }
  }
}
</script>

<style lang="scss" scoped>
.mine-page {
  min-height: 100vh;
  background: $c-bg;
  padding-bottom: 60rpx;
}

.hero {
  position: relative;
  padding-bottom: 40rpx;
}

.hero__bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(160deg, #efe9fb 0%, #fbf7f2 100%);
}

.hero__profile {
  position: relative;
  display: flex;
  align-items: center;
  margin: 30rpx 24rpx 0;
  padding: 26rpx 28rpx;
  border-radius: $radius-xl;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8rpx 24rpx rgba(120, 100, 160, 0.12);
}

.hero__avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #fff6d8;
  flex-shrink: 0;
}

.hero__info {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
}

.hero__name-row {
  display: flex;
  align-items: center;
}

.hero__name {
  font-size: 34rpx;
  font-weight: 600;
  color: #4a3f2a;
  @include ellipsis(1);
}

.hero__role {
  margin-left: 12rpx;
  padding: 2rpx 14rpx;
  border-radius: 14rpx;
  background: $c-primary-pale;
  font-size: 20rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}

.hero__sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9c8f78;
}

.hero__arrow {
  font-size: 32rpx;
  color: #c4bba8;
}

.stats {
  display: flex;
  align-items: center;
  margin: -10rpx 24rpx 24rpx;
  padding: 26rpx 0;
  border-radius: $radius-lg;
  background: $c-card;
  box-shadow: $shadow-card;
}

.stats__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stats__num {
  font-size: 36rpx;
  font-weight: 600;
  color: $c-primary-ink;
}

.stats__label {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $c-text-3;
}

.stats__line {
  width: 1px;
  height: 44rpx;
  background: $c-line;
}

.card {
  margin: 0 24rpx 24rpx;
  padding: 26rpx 28rpx;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.card__title {
  font-size: 28rpx;
  font-weight: 600;
  color: $c-text;
}

.card__share {
  @include center;
  height: 60rpx;
  margin: 0;
  padding: 0 26rpx;
  border-radius: 30rpx;
  background: $c-primary-pale;
  color: $c-primary-ink;
  font-size: 23rpx;
  line-height: 1;

  &::after {
    border: none;
  }
}

.members__empty {
  padding: 20rpx 0;
  font-size: 23rpx;
}

.member {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1px solid $c-line;

  &:last-child {
    border-bottom: none;
  }
}

.member__avatar {
  width: 74rpx;
  height: 74rpx;
  border-radius: 50%;
  background: #fdf6e3;
  flex-shrink: 0;
}

.member__info {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
}

.member__name {
  display: block;
  font-size: 27rpx;
  color: $c-text;
  @include ellipsis(1);
}

.member__self {
  font-size: 21rpx;
  color: $c-text-3;
}

.member__role {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $c-text-3;
}

.member__remove {
  font-size: 22rpx;
  color: $c-danger;
  padding: 10rpx 6rpx;
}

.cell {
  display: flex;
  align-items: center;
  height: 100rpx;
  border-bottom: 1px solid $c-line;

  &:last-child {
    border-bottom: none;
  }
}

.cell__icon {
  width: 48rpx;
  font-size: 30rpx;
}

.cell__text {
  flex: 1;
  font-size: 27rpx;
  color: $c-text;
}

.cell__hint {
  font-size: 21rpx;
  color: $c-text-3;
}

.cell__arrow {
  margin-left: 10rpx;
  font-size: 28rpx;
  color: #c4bba8;
}

.footer {
  padding: 30rpx 0 20rpx;
  text-align: center;
}

.footer__text {
  font-size: 21rpx;
  color: #c2bbae;
}

/* 资料编辑 */
.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10rpx 0 30rpx;
}

.profile__avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.profile__avatar-img {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: #fdf6e3;
}

.profile__avatar-tip {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: $c-primary-ink;
}

.profile__label {
  align-self: flex-start;
  margin: 30rpx 0 12rpx;
  font-size: 26rpx;
  color: $c-text-2;
}

.profile__input {
  width: 100%;
  height: 84rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
}

.profile__ph {
  color: #c4bcaa;
  font-size: 26rpx;
}

.profile-footer {
  display: flex;
}

.profile-footer__save {
  @include center;
  flex: 1;
  height: 80rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}
</style>
