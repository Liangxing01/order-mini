import { defineStore } from 'pinia'
import { userApi } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null,
    loaded: false
  }),

  getters: {
    /** 平台角色：supervip 看所有家庭，vip 看本家庭，user 只看自己 */
    role: (s) => {
      const role = s.profile && s.profile.role
      // 历史数据的 admin / member 归一化成 vip
      if (role === 'admin' || role === 'member') return 'vip'
      return role || 'user'
    },
    isSuperVip() {
      return this.role === 'supervip'
    },
    /** vip 与 supervip 都能建家庭、看家庭菜单 */
    isVip() {
      return this.isSuperVip || this.role === 'vip'
    },
    /** 当前家庭房主 */
    isOwner: (s) => !!(s.profile && s.profile.isOwner),
    familyId: (s) => (s.profile && s.profile.familyId) || '',
    familyName: (s) => (s.profile && s.profile.familyName) || '',
    /** 兼容旧代码 */
    isAdmin() {
      return this.isOwner || this.isSuperVip
    },
    nickname: (s) => (s.profile && s.profile.nickName) || '家人',
    avatar: (s) => (s.profile && s.profile.avatar) || '',
    openid: (s) => (s.profile && s.profile._id) || '',
    /** 角色文案，用于「我」页头像旁的小标签 */
    roleText() {
      if (this.isSuperVip) return '超级VIP'
      if (this.role === 'vip') return this.isOwner ? '家庭房主' : '家庭VIP'
      return '普通用户'
    }
  },

  actions: {
    /** 首次进入：拉取（或创建）当前用户 */
    async bootstrap(force = false) {
      if (this.loaded && !force) return this.profile
      try {
        this.profile = await userApi.me()
        this.loaded = true
      } catch (err) {
        console.error('[user.bootstrap]', err)
      }
      return this.profile
    },

    async update(payload) {
      this.profile = await userApi.update(payload)
      return this.profile
    }
  }
})
