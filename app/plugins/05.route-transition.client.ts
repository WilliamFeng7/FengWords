import { nextTick } from 'vue'

/**
 * 路由切换的页面过渡（View Transitions）
 *
 * 旧页面在 140ms 里带一点模糊淡出、微微上移，新页面在它下面直接开始自己的卡片入场 ——
 * 两页之间不再有“先空白一帧、再淡入”的闪烁。侧栏、顶部工具条两边本来就一样，不参与过渡。
 * 样式见 main.scss 的 html.vt-route。
 *
 * 布局用的是 <router-view>（不经过 <NuxtPage>，没有 page:finish 钩子），所以不用 Nuxt 自带的
 * viewTransition（它会一直等 page:finish），而是在 afterEach 之后、DOM 更新完成时结束过渡。
 * 不支持的浏览器、减少动态效果、后台标签页、只改 query 的跳转（如设置页切 tab）都直接跳过。
 */
export default defineNuxtPlugin(() => {
  if (!('startViewTransition' in document)) return

  const router = useRouter()
  const root = document.documentElement
  let finishUpdate: (() => void) | undefined
  let running = 0
  let uaTransition = false

  // Safari 等的手势返回自带过渡动画，不再叠一层
  window.addEventListener('popstate', (e: any) => {
    uaTransition = !!e.hasUAVisualTransition
  })

  const finish = () => {
    finishUpdate?.()
    finishUpdate = undefined
  }

  router.beforeResolve((to, from) => {
    // 上一次过渡还没结束又跳转了：先让上一次收尾
    finish()
    const skip =
      from.matched.length === 0 || // 首次进入
      to.path === from.path || // 只改了 query / hash
      uaTransition ||
      document.visibilityState !== 'visible' ||
      root.classList.contains('theme-switching') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    uaTransition = false
    if (skip) return

    let resolveUpdate!: () => void
    const updated = new Promise<void>(resolve => (resolveUpdate = resolve))
    // 兜底：无论如何 1s 内结束，页面不会被卡住
    const timer = window.setTimeout(resolveUpdate, 1000)
    finishUpdate = () => {
      window.clearTimeout(timer)
      resolveUpdate()
    }

    // 旧页面截图完成后才放行路由，确保“旧页面”截到的真是旧页面
    let release!: () => void
    const captured = new Promise<void>(resolve => (release = resolve))
    const releaseTimer = window.setTimeout(release, 300)

    running++
    root.classList.add('vt-route')
    const transition = (document as any).startViewTransition(() => {
      window.clearTimeout(releaseTimer)
      release()
      return updated
    })
    transition.ready?.catch(() => {})
    transition.finished
      .catch(() => {})
      .finally(() => {
        if (--running === 0) root.classList.remove('vt-route')
      })
    return captured
  })

  // afterEach 对成功、取消、失败的跳转都会调用；等 Vue 把新页面渲染进 DOM 再结束过渡
  router.afterEach(() => nextTick(finish))
  router.onError(finish)
})
