<template>
  <view class="cloud-image" :class="{ 'is-loaded': loaded, 'cloud-image--auto': auto }">
    <image
      v-if="showImg"
      class="cloud-image__img"
      :class="{ 'cloud-image__img--auto': auto }"
      :src="showImg"
      :mode="mode"
      :lazy-load="lazy"
      @load="onLoad"
      @error="onError"
    />
    <text v-else-if="placeholder" class="cloud-image__ph" :style="phStyle">{{ placeholder }}</text>
  </view>
</template>

<script>
import { withThumb, resolveImageUrl, isCloudFile, IMG_SIZE } from '@/utils/image'

/**
 * 云存储图片：换成临时链接 + imageView2 缩略图 + 懒加载 + 加载淡入。
 *
 * 降级链：临时链接缩略图 → 临时链接原图 → fileID 直连 → 占位字符。
 * 缩略图那一步失败就当当前环境不支持图片处理，全局打标后不再尝试。
 */
let THUMB_UNSUPPORTED = false

export default {
  name: 'CloudImage',
  props: {
    /** 云文件 ID、本地 static 路径或网络地址 */
    src: { type: String, default: '' },
    mode: { type: String, default: 'aspectFill' },
    /** 缩略图宽度（px），可传 IMG_SIZE 的键名，传 0 表示用原图 */
    size: { type: [Number, String], default: 'thumb' },
    lazy: { type: Boolean, default: true },
    /** 无图或加载失败时占位字符 */
    placeholder: { type: String, default: '🍽️' },
    /** 占位字符大小（rpx） */
    phSize: { type: Number, default: 44 }
  },
  emits: ['load', 'error'],

  data() {
    return {
      /** 实际地址：https 临时链接，或拿不到链接时的原始 fileID */
      baseUrl: '',
      /** baseUrl 上是否还能继续拼缩略图参数 */
      thumbOk: true,
      loaded: false,
      failed: false,
      timer: null
    }
  },

  computed: {
    width() {
      if (!this.size) return 0
      return typeof this.size === 'string' ? IMG_SIZE[this.size] || 0 : this.size
    },
    /** widthFix 需要图片自己撑高度，不能用绝对定位 */
    auto() {
      return this.mode === 'widthFix'
    },
    showImg() {
      if (!this.baseUrl || this.failed) return ''
      if (this.thumbOk && !THUMB_UNSUPPORTED) return withThumb(this.baseUrl, this.width)
      return this.baseUrl
    },
    phStyle() {
      return { fontSize: `${this.phSize}rpx` }
    }
  },

  watch: {
    src() {
      this.load()
    }
  },

  mounted() {
    this.load()
  },

  beforeUnmount() {
    this.clearTimer()
  },

  methods: {
    async load() {
      const src = this.src
      this.clearTimer()
      this.loaded = false
      this.failed = false
      this.thumbOk = true
      this.baseUrl = ''
      if (!src) return

      let url = src
      try {
        url = await resolveImageUrl(src)
      } catch (err) {
        // 换不到临时链接，直接交给 image 组件解析 fileID
        url = src
      }
      // 期间 src 变了就丢弃这次结果
      if (src !== this.src) return
      this.baseUrl = url
      this.armTimer()
    },

    armTimer() {
      this.clearTimer()
      // 兜底：load 事件不回调时也不能让图片永远停在 opacity 0
      this.timer = setTimeout(() => {
        this.loaded = true
      }, 3000)
    },

    clearTimer() {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
    },

    onLoad(e) {
      this.clearTimer()
      this.loaded = true
      // 缩略图那一步失败过但原图能出，说明环境不支持图片处理参数
      if (!this.thumbOk) THUMB_UNSUPPORTED = true
      this.$emit('load', e)
    },

    onError(e) {
      this.clearTimer()
      // 1. 缩略图失败 → 用同一临时链接的原图
      if (this.thumbOk && !THUMB_UNSUPPORTED) {
        this.thumbOk = false
        this.armTimer()
        return
      }
      // 2. 临时链接失效 → 退回 fileID 直连
      if (this.baseUrl !== this.src && isCloudFile(this.src)) {
        this.baseUrl = this.src
        this.armTimer()
        return
      }
      this.failed = true
      this.$emit('error', e)
    }
  }
}
</script>

<style lang="scss" scoped>
.cloud-image {
  position: relative;
  display: block;
  /* 内部根节点必须填满组件节点，否则图片绝对定位后会撑不出高度，整块空白 */
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f7f1e6;
}

.cloud-image__img {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.26s ease;
}

.cloud-image.is-loaded .cloud-image__img {
  opacity: 1;
}

/* widthFix：高度由图片自身决定 */
.cloud-image--auto {
  height: auto;
}

.cloud-image__img--auto {
  position: static;
  height: auto;
  opacity: 1;
  transition: none;
}

.cloud-image__ph {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>
