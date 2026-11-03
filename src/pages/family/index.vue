<template>
  <view class="family-page">
    <view v-if="loading" class="u-loading">加载中…</view>

    <template v-else>
      <!-- 还没有家庭 -->
      <view v-if="!family" class="card u-card setup">
        <text class="setup__emoji">{{ canCreate ? '🏡' : '🔒' }}</text>
        <text class="setup__title">{{ canCreate ? '创建一个家庭小厨房' : '还没有加入家庭' }}</text>
        <text class="setup__desc">{{ setupDesc }}</text>

        <template v-if="canCreate">
          <input
            v-model="createName"
            class="setup__input"
            placeholder="给家庭起个名字，比如「蓝宝宝家」"
            placeholder-class="setup__ph"
            maxlength="20"
          />
          <view class="setup__btn" @tap="onCreate">创建家庭</view>
        </template>
      </view>

      <template v-else>
        <!-- 家庭信息 -->
        <view class="card u-card">
          <view class="card__head">
            <text class="card__title">{{ family.name }}</text>
            <text v-if="isOwner" class="card__op" @tap="openRename">改名</text>
          </view>
          <text class="card__sub">{{ members.length }} 位成员 · {{ family.dishTotal || 0 }} 道菜</text>
          <text class="card__hint">一个账号只能在一个家庭里，退出后才能加入别的家庭</text>
          <button class="invite" open-type="share">＋ 邀请家人加入</button>
        </view>

        <!-- 成员列表 -->
        <view class="card u-card">
          <view class="card__head">
            <text class="card__title">成员管理</text>
            <text class="card__sub">共 {{ members.length }} 人</text>
          </view>

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
                <text v-if="member._id === myOpenid" class="member__self">（我）</text>
              </text>
              <text class="member__meta">
                {{ member.familyRole === 'owner' ? '房主' : '成员' }} · {{ roleLabel(member.role) }}
              </text>
            </view>
            <text v-if="canRemove(member)" class="member__remove" @tap="onRemove(member)">移除</text>
          </view>
        </view>

        <!-- 超级VIP 专属入口 -->
        <view v-if="userStore.isSuperVip" class="card u-card">
          <view class="cell" @tap="goBrowse">
            <text class="cell__icon">🌏</text>
            <text class="cell__text">浏览所有家庭的菜单</text>
            <text class="cell__arrow">›</text>
          </view>
        </view>

        <!-- 退出 / 解散 -->
        <view class="card u-card">
          <view v-if="!isOwner" class="cell" @tap="onLeave">
            <text class="cell__icon">🚪</text>
            <text class="cell__text">退出家庭</text>
            <text class="cell__arrow">›</text>
          </view>
          <view v-else class="cell" @tap="onDissolve">
            <text class="cell__icon">💥</text>
            <text class="cell__text cell__text--danger">解散家庭</text>
            <text class="cell__arrow">›</text>
          </view>
        </view>
      </template>
    </template>

    <!-- 改名 -->
    <bottom-sheet v-model="renameVisible" title="修改家庭名称">
      <view class="rename">
        <input
          v-model="renameName"
          class="rename__input"
          placeholder="最多 20 个字"
          placeholder-class="setup__ph"
          maxlength="20"
        />
      </view>
      <template #footer>
        <view class="rename-footer">
          <view class="rename-footer__cancel" @tap="renameVisible = false">取消</view>
          <view class="rename-footer__ok" @tap="onRename">保存</view>
        </view>
      </template>
    </bottom-sheet>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user'
import { familyApi } from '@/api'
import { toastOk, toastError, confirm, showLoading, hideLoading, isBlank } from '@/utils/ui'

export default {
  data() {
    return {
      loading: true,
      family: null,
      members: [],
      isOwner: false,
      createName: '',
      renameVisible: false,
      renameName: ''
    }
  },

  computed: {
    userStore() {
      return useUserStore()
    },
    myOpenid() {
      return this.userStore.openid
    },
    /** 普通用户不能创建家庭 */
    canCreate() {
      return this.userStore.isVip
    },
    setupDesc() {
      if (this.canCreate) return '家庭建好后把它分享给家人，点开就自动加入'
      return '普通用户只能看自己创建的菜单，也不能创建家庭。等家人把家庭邀请发给你，点开就能加入'
    }
  },

  onShow() {
    this.load()
  },

  onShareAppMessage() {
    const family = this.family
    if (!family) {
      return { title: '来我们的小厨房点菜吧', path: '/pages/order/index' }
    }
    return {
      title: `${this.userStore.nickname} 邀请你加入「${family.name}」`,
      path: `/pages/order/index?familyId=${family._id}&inviter=${this.myOpenid}`
    }
  },

  methods: {
    async load() {
      this.loading = true
      try {
        await this.userStore.bootstrap(true)
        const res = await familyApi.info()
        this.family = res.family
        this.members = res.members || []
        this.isOwner = !!res.isOwner
      } catch (err) {
        toastError(err, '家庭信息加载失败')
      } finally {
        this.loading = false
      }
    },

    roleLabel(role) {
      if (role === 'supervip') return '超级VIP'
      if (role === 'vip') return 'VIP'
      return '普通用户'
    },

    canRemove(member) {
      return this.isOwner && member._id !== this.myOpenid
    },

    async onCreate() {
      if (isBlank(this.createName)) {
        toastError({ msg: '请先给家庭起个名字' })
        return
      }
      showLoading('创建中')
      try {
        await familyApi.create(this.createName.trim())
        hideLoading()
        toastOk('家庭已创建')
        this.createName = ''
        await this.load()
      } catch (err) {
        hideLoading()
        toastError(err, '创建失败')
      }
    },

    openRename() {
      this.renameName = this.family ? this.family.name : ''
      this.renameVisible = true
    },

    async onRename() {
      if (isBlank(this.renameName)) {
        toastError({ msg: '家庭名称不能为空' })
        return
      }
      try {
        await familyApi.rename(this.renameName.trim())
        this.renameVisible = false
        toastOk('已改名')
        await this.load()
      } catch (err) {
        toastError(err, '改名失败')
      }
    },

    async onRemove(member) {
      const ok = await confirm(
        `把「${member.nickName || '该成员'}」移出家庭？移除后他只能看到自己创建的菜单`,
        '移除成员',
        '移除'
      )
      if (!ok) return
      try {
        await familyApi.removeMember(member._id)
        toastOk('已移除')
        await this.load()
      } catch (err) {
        toastError(err, '移除失败')
      }
    },

    async onLeave() {
      const ok = await confirm('退出后就看不到家人的菜单了，确定退出吗？', '退出家庭', '退出')
      if (!ok) return
      try {
        await familyApi.leave()
        toastOk('已退出')
        await this.load()
      } catch (err) {
        toastError(err, '退出失败')
      }
    },

    async onDissolve() {
      const ok = await confirm(
        '解散后所有成员都会被移出，菜品不会删除但只有各自创建的能看到了',
        '解散家庭',
        '解散'
      )
      if (!ok) return
      try {
        await familyApi.dissolve()
        toastOk('家庭已解散')
        await this.load()
      } catch (err) {
        toastError(err, '解散失败')
      }
    },

    goBrowse() {
      uni.navigateTo({ url: '/pages/family/browse' })
    }
  }
}
</script>

<style lang="scss" scoped>
.family-page {
  min-height: 100vh;
  padding-top: 24rpx;
  background: $c-bg;
}

.card {
  margin: 0 24rpx 24rpx;
  padding: 26rpx 28rpx;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}

.card__title {
  font-size: 30rpx;
  font-weight: 600;
  color: $c-text;
  @include ellipsis(1);
}

.card__op {
  padding: 6rpx 20rpx;
  border-radius: 24rpx;
  background: $c-primary-pale;
  font-size: 22rpx;
  color: $c-primary-ink;
  flex-shrink: 0;
}

.card__sub {
  font-size: 22rpx;
  color: $c-text-3;
}

.card__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  color: #b8b0a2;
}

.invite {
  @include center;
  height: 76rpx;
  margin: 26rpx 0 0;
  border-radius: 38rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1;

  &::after {
    border: none;
  }
}

/* 未加入家庭 */
.setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 40rpx;
  text-align: center;
}

.setup__emoji {
  font-size: 72rpx;
}

.setup__title {
  margin-top: 24rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: $c-text;
}

.setup__desc {
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: $c-text-3;
}

.setup__input {
  width: 100%;
  height: 88rpx;
  margin-top: 36rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
  text-align: left;
}

.setup__ph {
  color: #c4bcaa;
  font-size: 26rpx;
}

.setup__btn {
  @include center;
  width: 100%;
  height: 84rpx;
  margin-top: 24rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #f7d873, #e9b93b);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

/* 成员 */
.member {
  display: flex;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1px solid $c-line;

  &:last-child {
    border-bottom: none;
  }
}

.member__avatar {
  width: 76rpx;
  height: 76rpx;
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

.member__meta {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $c-text-3;
}

.member__remove {
  padding: 10rpx 8rpx;
  font-size: 22rpx;
  color: $c-danger;
  flex-shrink: 0;
}

/* 功能格 */
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

.cell__text--danger {
  color: $c-danger;
}

.cell__arrow {
  margin-left: 10rpx;
  font-size: 28rpx;
  color: #c4bba8;
}

/* 改名 */
.rename {
  padding: 10rpx 0 30rpx;
}

.rename__input {
  height: 88rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: #fbf7f0;
  font-size: 28rpx;
}

.rename-footer {
  display: flex;
}

.rename-footer__cancel {
  @include center;
  width: 200rpx;
  height: 80rpx;
  border-radius: 40rpx;
  border: 2rpx solid $c-line;
  font-size: 26rpx;
  color: $c-text-2;
}

.rename-footer__ok {
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
</style>
