<script lang="jsx">
import {Teleport, Transition} from 'vue'

// 一个提示刚关闭时，相邻的提示直接出现（不再播放动画），扫过工具栏时更利落
let lastHideAt = 0

export default {
  name: "Tooltip",
  components: {
    Teleport,
    Transition
  },
  props: {
    title: {
      type: String,
      default() {
        return ''
      }
    },
    disabled: {
      type: Boolean,
      default() {
        return false
      }
    },
    // top：默认，在上方（离顶部太近时放到下方）；right：贴在元素右侧、垂直居中（收起的侧栏）
    placement: {
      type: String,
      default() {
        return 'top'
      }
    },
    // 与元素之间的距离（px）
    offset: {
      type: Number,
      default() {
        return 10
      }
    }
  },
  data() {
    return {
      show: false,
      instant: false
    }
  },
  methods: {
    showPop(e) {
      if (this.disabled) return
      if (!this.title && !this.$slots?.reference) return;
      e.stopPropagation()
      let rect = (e.currentTarget || e.target).getBoundingClientRect()
      this.instant = Date.now() - lastHideAt < 300
      this.show = true
      this.$nextTick(() => {
        let tip = this.$refs?.tip?.getBoundingClientRect()
        if (!tip) return
        if (this.placement === 'right') {
          this.$refs.tip.style.top = rect.top + (rect.height - tip.height) / 2 + 'px'
          this.$refs.tip.style.left = rect.right + this.offset + 'px'
          this.$refs.tip.style.transformOrigin = 'left center'
          return
        }
        if (rect.top < 50) {
          this.$refs.tip.style.top = rect.top + rect.height + this.offset + 'px'
          this.$refs.tip.style.transformOrigin = 'center top'
        } else {
          this.$refs.tip.style.top = rect.top - tip.height - this.offset + 'px'
          this.$refs.tip.style.transformOrigin = 'center bottom'
        }
        let tipWidth = tip.width
        let rectWidth = rect.width
        this.$refs.tip.style.left = rect.left - (tipWidth - rectWidth) / 2 + 'px'
        // onmouseleave={() => this.show = false}
      })
    },
    hidePop() {
      if (this.show) lastHideAt = Date.now()
      this.show = false
    },
  },
  render() {
    let DefaultNode = this.$slots.default()[0]
    let ReferenceNode = this.$slots?.reference?.()?.[0]
    return <>
      <Teleport to="body">
        <Transition name={this.instant ? 'tip-instant' : 'tip'}>
          {this.show && (
            <div ref="tip" class={['tip', `tip--${this.placement}`]}>
              {ReferenceNode ? <ReferenceNode/> : this.title}
            </div>
          )}
        </Transition>
      </Teleport>

      <DefaultNode
        onmouseenter={(e) => this.showPop(e)}
        onmouseleave={() => this.hidePop()}
      />
    </>
  }
}
</script>
<style lang="scss" scoped>
.tip {
  background: var(--color-tooltip-bg);
  color: var(--color-main-text);
  max-width: 22rem;
  font-size: 0.875rem;
  line-height: 1.45;
  border: 1px solid var(--color-stroke);
  border-radius: 0.625rem;
  box-shadow: var(--shadow-pop);
  @apply fixed z-9999 px-2.5 py-1.5;
}

.tip-enter-active {
  transition:
    opacity 125ms var(--ease-out),
    transform 125ms var(--ease-out);
}

.tip-leave-active {
  transition:
    opacity 100ms var(--ease-out),
    transform 100ms var(--ease-out);
}

.tip-enter-from,
.tip-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

/* 侧边提示从元素一侧轻轻滑出 */
.tip--right.tip-enter-from,
.tip--right.tip-leave-to {
  transform: translate3d(-4px, 0, 0) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .tip-enter-from,
  .tip-leave-to {
    transform: none;
  }
}
</style>
