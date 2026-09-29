import { Comment, Fragment, Transition, defineComponent, h, type VNode } from 'vue'

/**
 * 图标微动效
 * - line-md 图标自带 SMIL 描线动画：点击时把时间轴拨回 0，让它重新“画”一遍
 * - 其它静态图标：轻轻弹一下（只动 transform，走合成层）
 */

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function replayIcon(root: Element | null | undefined) {
  if (!root || prefersReducedMotion()) return
  root.querySelectorAll('svg').forEach(svg => {
    const hasSmil = !!svg.querySelector('animate, animateTransform, animateMotion, set')
    if (hasSmil && typeof (svg as SVGSVGElement).setCurrentTime === 'function') {
      ;(svg as SVGSVGElement).setCurrentTime(0)
      ;(svg as SVGSVGElement).unpauseAnimations?.()
    } else if (typeof svg.animate === 'function') {
      // composite: add —— 叠加在图标已有的 transform（如图钉的旋转）之上，而不是覆盖它
      svg.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 300, easing: EASE_OUT, composite: 'add' }
      )
    }
  })
}

function flatten(nodes: VNode[]): VNode[] {
  return nodes.flatMap(n => (n.type === Fragment && Array.isArray(n.children) ? flatten(n.children as VNode[]) : [n]))
}

/**
 * 图标切换过渡：当槽里恰好是一个图标、且它被换成另一个图标（v-if / v-else）时，
 * 旧图标缩小淡出、新图标弹入。首次渲染不播放（Transition 默认不 appear）。
 * 槽里若有多个节点则原样渲染，不包 Transition（避免 Transition 只渲染第一个子节点）。
 */
export const IconSwap = defineComponent({
  name: 'IconSwap',
  props: {
    enabled: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => {
      const raw = slots.default?.() ?? []
      const nodes = flatten(raw).filter(n => n.type !== Comment)
      if (!props.enabled || nodes.length !== 1) return raw
      return h(Transition, { name: 'icon-swap' }, () => nodes[0])
    }
  },
})
