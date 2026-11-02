import { defineStore } from 'pinia'
import { userApi } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null,
    loaded: false
  }),

  getters: {
    isAdmin: (s) => !!s.profile && s.profile.role === 'admin',
    nickname: (s) => (s.profile && s.profile.nickName) || '家人',
    avatar: (s) => (s.profile && s.profile.avatar) || '',
    openid: (s) => (s.profile && s.profile._id) || ''
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
