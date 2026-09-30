<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { BaseButton, BasePage } from '@/base'
import QRCode from 'qrcode'
import ResourceCard from '@/components/ResourceCard.vue'
import { APP_NAME, GITHUB_ISSUES } from '@/core/config/env.ts'
import type { Resource } from '@/core'
import IconBook from '~icons/lucide/book-open'
import IconFilm from '~icons/lucide/clapperboard'
import IconGrammar from '~icons/lucide/spell-check'
import IconListen from '~icons/lucide/headphones'

let title = APP_NAME + ' 英语学习资源分享'
useSeoMeta({
  title: title,
  description: title,
  ogTitle: title,
  ogDescription: title,
  ogUrl: useRequestURL().href,
  twitterTitle: title,
  twitterDescription: title,
})

/** 合集里包含的一项（没有单独的链接，统一在合集链接里） */
interface IncludedItem {
  name: string
  en?: string
  description?: string
  tag?: string
}

interface Collection {
  name: string
  note: string
  link: string
  /** 直接在浏览器打开（不是网盘链接，不需要扫码） */
  direct?: boolean
}

interface Subcategory {
  name: string
  resources: Resource[]
}

interface Category {
  id: string
  name: string
  icon: Component
  description?: string
  /** 一个链接打包了整个分类的合集，下面 included 是合集里的内容 */
  collection?: Collection
  included?: { title: string; items: IncludedItem[] }[]
  resources?: Resource[]
  subcategories?: Subcategory[]
}

// 资源分类
const categories: Category[] = [
  {
    id: 'new-concept',
    name: '新概念英语',
    icon: markRaw(IconBook),
    description: '经典英语教材，适合从零开始系统学习',
    collection: {
      name: '新概念资源合集',
      note: '一个链接打包了右侧全部教材与讲解视频',
      link: 'https://pan.quark.cn/s/6b12da160020',
    },
    included: [
      {
        title: '教材',
        items: [
          { name: '新概念英语青少年版', description: '儿童读物', tag: '7–14 岁' },
          { name: '新概念英语第一册', description: '适合英语初学者', tag: '入门' },
          { name: '新概念英语第二册', description: '基础英语学习，巩固语法和词汇', tag: '基础' },
          { name: '新概念英语第三册', description: '提高英语水平，增强阅读能力', tag: '进阶' },
          { name: '新概念英语第四册', description: '高级英语学习，提升综合能力', tag: '高级' },
          { name: '新概念英语 1–4 册高清 PDF', description: '仅 1–4 册教材的高清扫描版', tag: 'PDF' },
        ],
      },
      {
        title: '讲解视频',
        items: [
          { name: '新东方新概念 1–4 册精讲', description: '机构讲解视频', tag: '新东方' },
          { name: '新东方新概念语法精讲', description: '机构讲解视频', tag: '新东方' },
          { name: '沪江新概念英语全套', description: '机构讲解视频', tag: '沪江' },
          { name: '新概念其他讲解视频', description: '多家机构 / 个人的讲解视频', tag: '其他' },
        ],
      },
    ],
  },
  {
    id: 'tv',
    name: '电视 / 电影',
    icon: markRaw(IconFilm),
    description: '一些不错的美 / 英剧和电影，边追剧边练听力和口语',
    collection: {
      name: '经典美 / 英剧资源合集',
      note: '一个链接打包了右侧全部剧集和电影',
      link: 'https://v.v8l.cn/s/TG3sgVg',
      direct: true,
    },
    included: [
      {
        title: '剧集与电影',
        items: [
          { name: '老友记', en: 'Friends', description: '纽约六个好友的日常，生活口语地道，美剧入门首选', tag: '喜剧' },
          { name: '生活大爆炸', en: 'The Big Bang Theory', description: '科学家宅男们的日常，语速偏快，科学词汇多', tag: '喜剧' },
          { name: '破产姐妹', en: '2 Broke Girls', description: '两个女孩在纽约打工创业，口语和俚语多', tag: '喜剧' },
          { name: '是，大臣 / 是，首相', en: 'Yes Minister', description: '英式政治讽刺喜剧，正式英式英语，长句多', tag: '喜剧 / 讽刺' },
          { name: '绝命毒师', en: 'Breaking Bad', description: '化学老师走上制毒之路，剧情紧凑', tag: '犯罪' },
          { name: '风骚律师', en: 'Better Call Saul', description: '《绝命毒师》前传，律师 Saul 的故事', tag: '犯罪 / 剧情' },
          { name: '黑道家族', en: 'The Sopranos', description: '黑帮家族的日常与心理，经典美剧', tag: '犯罪 / 剧情' },
          { name: '火线', en: 'The Wire', description: '巴尔的摩的警匪生态，俚语多，难度较高', tag: '犯罪 / 剧情' },
          { name: '越狱', en: 'Prison Break', description: '为救哥哥设计越狱，节奏快、悬念足', tag: '犯罪' },
          { name: '毒枭', en: 'Narcos', description: '哥伦比亚缉毒故事，英语和西班牙语混合', tag: '犯罪 / 传记' },
          { name: '纸钞屋', en: 'Money Heist', description: '西班牙剧集，建议看英语配音版', tag: '犯罪 / 悬疑' },
          { name: '纸牌屋', en: 'House of Cards', description: '华盛顿的政治权谋，正式用语多', tag: '剧情 / 政治' },
          { name: '良医', en: 'The Good Doctor', description: '自闭症天才外科医生的成长，医学词汇多', tag: '剧情 / 医疗' },
          { name: '实习医生格蕾', en: "Grey's Anatomy", description: '外科住院医生的工作与生活', tag: '剧情 / 医疗' },
          { name: '唐顿庄园', en: 'Downton Abbey', description: '英国贵族与仆人的时代剧，标准英式英语', tag: '剧情' },
          { name: '王冠', en: 'The Crown', description: '伊丽莎白二世的王室故事，英式发音清晰', tag: '剧情 / 历史' },
          { name: '行尸走肉', en: 'The Walking Dead', description: '丧尸末日下的生存故事', tag: '恐怖 / 惊悚' },
          { name: '西部世界', en: 'Westworld', description: '人工智能主题乐园里的科幻悬疑', tag: '科幻' },
          { name: '爱，死亡和机器人', en: 'Love, Death & Robots', description: '成人向动画短片集，单集很短', tag: '动画 / 科幻' },
          { name: '哈利·波特', en: 'Harry Potter', description: '魔法世界系列电影，英式英语', tag: '奇幻' },
          { name: '经典英文电影', description: '多部经典英文电影大片', tag: '电影' },
        ],
      },
    ],
  },
  {
    id: 'grammar',
    name: '语法学习',
    icon: markRaw(IconGrammar),
    description: '从入门教材到权威工具书，系统搭建语法体系',
    subcategories: [
      {
        name: '经典教材',
        resources: [
          {
            name: '英语语法新思维',
            author: '张满胜',
            features: '从思维角度讲解语法，注重理解而非死记硬背，分为初级、中级、高级三册，循序渐进',
            suitable: '希望系统建立语法体系的学习者',
            link: 'https://pan.quark.cn/s/d06abef6c737',
          },
          {
            name: '薄冰英语语法',
            author: '薄冰',
            features: '老牌经典，体系完整，分类非常细，查语法点方便',
            suitable: '中学生或基础较弱的学习者',
            link: 'https://pan.quark.cn/s/30777ceba5b9',
          },
          {
            name: '旋元佑语法',
            author: '旋元佑',
            features: '以通俗易懂的语言解析复杂语法，强调“理解逻辑”，适合突破语法难点',
            suitable: '对传统语法教学感到枯燥，想轻松掌握核心逻辑的学习者',
            difficulty: '繁体中文版',
            link: 'https://pan.quark.cn/s/0d0de559794e',
          },
        ],
      },
      {
        name: '进阶提升',
        resources: [
          {
            name: '剑桥英语语法（English Grammar in Use）',
            author: '剑桥大学出版社',
            features: '分为初级、中级、高级三册，经典畅销的语法自学书，解释简明且有大量练习',
            suitable: '需要结合国际考试的学习者',
            difficulty: '中文版',
            link: 'https://pan.quark.cn/s/d4a6ef53c04d',
          },
          {
            name: '牛津英语语法（Oxford English Grammar）',
            author: 'Sidney Greenbaum & Gerald Nelson',
            features: '分为基础、提升、高级三册，英式语法权威，解释清晰、例句地道，适合备考雅思 / 托福',
            suitable: '想全面系统梳理语法体系的人',
            difficulty: '英文版',
            link: 'https://pan.quark.cn/s/ca505875e68c',
          },
          {
            name: '实用英语用法（Practical English Usage）',
            author: 'Michael Swan',
            features: '解释非常细致，尤其适合纠正常见错误和困惑',
            suitable: '中高级学习者，适合作为语法问题的工具书',
            difficulty: '中文版 / 英文版',
            link: 'https://pan.quark.cn/s/05006e705a77',
          },
        ],
      },
    ],
  },
  {
    id: 'listening',
    name: '听力训练',
    icon: markRaw(IconListen),
    description: '由浅入深提升英语听力',
    resources: [
      {
        name: 'VOA 慢速英语合集',
        description: '新闻类听力材料，语速适中，内容丰富',
        difficulty: '初级',
        link: 'https://pan.quark.cn/s/681794bffc6e',
      },
      {
        name: 'TED-Ed 科普动画',
        description: '专为中学生设计的 3–5 分钟科普动画课程',
        difficulty: '初级',
        link: 'https://pan.quark.cn/s/d3d83038afb9',
      },
      {
        name: '哈佛演讲',
        description: '高质量演讲，锻炼听力的同时开拓视野',
        difficulty: '中高级',
        link: 'https://pan.quark.cn/s/62e8d536a34f',
      },
    ],
  },
]

function countOf(c: Category) {
  const included = (c.included ?? []).reduce((n, g) => n + g.items.length, 0)
  const subs = (c.subcategories ?? []).reduce((n, s) => n + s.resources.length, 0)
  return included + subs + (c.resources?.length ?? 0)
}

const totalCount = categories.reduce((n, c) => n + countOf(c), 0)

const filterOptions = computed(() => [
  { id: 'all', name: '全部', count: totalCount },
  ...categories.map(c => ({ id: c.id, name: c.name, count: countOf(c) })),
])

// 当前选中的分类
const selectedCategory = ref('all')

// 筛选后的资源
const filteredResources = computed(() =>
  selectedCategory.value === 'all' ? categories : categories.filter(c => c.id === selectedCategory.value)
)

// ── 分类切换：一块底色在选项之间滑动（和侧栏、设置页的指示条同一种手感）──
const segRef = ref<HTMLElement | null>(null)
const seg = ref({ x: 0, y: 0, w: 0, h: 0 })
const segReady = ref(false)

function placeSeg() {
  const root = segRef.value
  const active = root?.querySelector('.seg-item.is-active') as HTMLElement | null
  if (!root || !active) return
  seg.value = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
  // 手机上是一排可横向滑动的：选中项露出来
  if (root.scrollWidth > root.clientWidth) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: segReady.value ? 'smooth' : 'auto' })
  }
}

function selectCategory(id: string) {
  if (selectedCategory.value === id) return
  selectedCategory.value = id
  nextTick(placeSeg)
}

onMounted(() => {
  nextTick(() => {
    placeSeg()
    // 首次定位不滑动，之后才开启过渡
    requestAnimationFrame(() => requestAnimationFrame(() => (segReady.value = true)))
  })
  window.addEventListener('resize', placeSeg)
})
onBeforeUnmount(() => window.removeEventListener('resize', placeSeg))

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

// 网盘资源：弹出二维码方便手机扫码，也可以直接在浏览器打开
let showQrDialog = $ref(false)
let currentResourceName = $ref('')
let currentLink = $ref('')
let qrDataUrl = $ref('')

async function openResource(item: { name?: string; link?: string; direct?: boolean }) {
  if (!item.link) return
  if (item.direct) {
    window.open(item.link, '_blank', 'noopener')
    return
  }
  currentResourceName = item.name || ''
  currentLink = item.link
  try {
    qrDataUrl = await QRCode.toDataURL(item.link, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {
    qrDataUrl = ''
  }
  showQrDialog = true
}

function openInBrowser() {
  if (currentLink) window.open(currentLink, '_blank', 'noopener')
}
</script>

<template>
  <BasePage>
    <div class="doc-page">
      <div class="bento doc-bento">
        <!-- 页面标题 -->
        <section class="tile tile--brand doc-hero" style="--i: 0">
          <h1>{{ $t('resource_sharing') }}</h1>
          <p>经典教材、美 / 英剧、语法书和听力材料。网盘资源点「打开」后可以手机扫码，也可以直接在浏览器打开。</p>
          <div class="doc-hero-stats">
            <span><b>{{ totalCount }}</b> 项资源</span>
            <span><b>{{ categories.length }}</b> 个分类</span>
          </div>
        </section>

        <!-- 分类筛选 -->
        <section class="tile doc-filter" style="--i: 1">
          <div class="tile-eyebrow">分类</div>
          <div class="seg" ref="segRef" role="tablist">
            <span
              class="seg-indicator"
              :class="{ 'is-ready': segReady }"
              :style="{
                width: seg.w + 'px',
                height: seg.h + 'px',
                transform: `translate3d(${seg.x}px, ${seg.y}px, 0)`,
              }"
              aria-hidden="true"
            ></span>
            <button
              v-for="opt in filterOptions"
              :key="opt.id"
              type="button"
              role="tab"
              class="seg-item"
              :class="{ 'is-active': selectedCategory === opt.id }"
              :aria-selected="selectedCategory === opt.id"
              @click="selectCategory(opt.id)"
            >
              <span>{{ opt.name }}</span>
              <span class="seg-count">{{ opt.count }}</span>
            </button>
          </div>
        </section>
      </div>

      <!-- 资源分类：换筛选时整段重新入场 -->
      <section
        v-for="(category, ci) in filteredResources"
        :key="category.id + '|' + selectedCategory"
        class="tile doc-section tile-enter"
        :style="{ '--i': ci + 2 }"
      >
        <header class="section-head">
          <div class="tile-icon"><component :is="category.icon" /></div>
          <div class="section-text">
            <h2>{{ category.name }}</h2>
            <p v-if="category.description">{{ category.description }}</p>
          </div>
          <span class="section-count">{{ countOf(category) }} 项</span>
        </header>

        <!-- 合集 + 合集里的内容 -->
        <div v-if="category.collection" class="collection">
          <div class="collection-card">
            <div class="collection-kicker"><IconLucideLayers /> 合集</div>
            <div class="collection-name">{{ category.collection.name }}</div>
            <p class="collection-note">{{ category.collection.note }}</p>
            <BaseButton size="large" class="collection-open" @click="openResource(category.collection)">
              <span class="center gap-1.5">
                <span>{{ $t('open_link') }}</span>
                <IconLucideArrowUpRight class="i-nudge" />
              </span>
            </BaseButton>
          </div>

          <div class="included">
            <div v-for="group in category.included" :key="group.title" class="included-group">
              <div class="included-title">
                {{ group.title }}<span>{{ group.items.length }}</span>
              </div>
              <ul class="included-grid">
                <li v-for="item in group.items" :key="item.name" class="included-item">
                  <div class="included-top">
                    <span class="included-name">{{ item.name }}</span>
                    <span v-if="item.tag" class="res-tag">{{ item.tag }}</span>
                  </div>
                  <div v-if="item.en" class="included-en">{{ item.en }}</div>
                  <div v-if="item.description" class="included-desc">{{ item.description }}</div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 分小类的资源 -->
        <div v-for="sub in category.subcategories" :key="sub.name" class="sub-block">
          <div class="included-title">
            {{ sub.name }}<span>{{ sub.resources.length }}</span>
          </div>
          <div class="res-grid">
            <ResourceCard v-for="r in sub.resources" :key="r.name" :resource="r" @openLink="openResource(r)" />
          </div>
        </div>

        <!-- 单独的资源 -->
        <div v-if="category.resources?.length" class="res-grid">
          <ResourceCard v-for="r in category.resources" :key="r.name" :resource="r" @openLink="openResource(r)" />
        </div>
      </section>

      <!-- 页面底部 -->
      <section class="tile doc-tips tile-enter" :style="{ '--i': filteredResources.length + 2 }">
        <div class="tile-eyebrow mb-2">温馨提示</div>
        <ul>
          <li>所有资源均来自互联网收集，仅供学习交流使用</li>
          <li>
            如果链接失效，请到 <a :href="GITHUB_ISSUES" target="_blank" rel="noopener">GitHub Issues</a> 告知，我会尽快更新
          </li>
        </ul>
      </section>
    </div>

    <Dialog v-model="showQrDialog" title="手机扫码访问资源">
      <div class="qr-body">
        <p class="qr-name">{{ currentResourceName }}</p>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="qr-img" />
        <p class="qr-hint">用手机夸克 App 扫码打开</p>
        <BaseButton type="info" @click="openInBrowser">
          <span class="center gap-1.5">
            <span>在浏览器中打开</span>
            <IconLucideArrowUpRight class="i-nudge" />
          </span>
        </BaseButton>
      </div>
    </Dialog>
  </BasePage>
</template>

<style scoped lang="scss">
.doc-page {
  display: flex;
  flex-direction: column;
  gap: var(--bento-gap);
  margin-bottom: 2rem;
}

.doc-bento {
  margin-bottom: 0;

  .doc-hero {
    grid-column: span 7;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.75rem 2rem;

    h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      line-height: 1.2;
      color: #fff;
      letter-spacing: -0.02em;
    }

    p {
      margin: 0;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.86);
    }
  }

  .doc-filter {
    grid-column: span 5;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.75rem;
  }
}

.doc-hero-stats {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;

  span {
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-size: 0.85rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  b {
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    margin-right: 0.15rem;
  }
}

/* 分段选择：一块底色滑到选中的那一项（位置用 transform，尺寸只在切换时变化一次） */
.seg {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 0.875rem;
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);
}

.seg-indicator {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 0.65rem;
  background: var(--color-tile);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.08),
    0 0 0 1px var(--color-stroke);
  pointer-events: none;

  &.is-ready {
    transition:
      transform 260ms var(--ease-in-out),
      width 260ms var(--ease-in-out),
      height 260ms var(--ease-in-out);
  }
}

.seg-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.1rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 0.65rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--color-ink-2);
  white-space: nowrap;
  transition:
    color var(--dur-hover) ease,
    transform 160ms var(--ease-out);

  &:active {
    transform: scale(0.96);
    transition-duration: var(--dur-hover), var(--dur-press);
  }

  &.is-active {
    color: var(--color-brand-text);
    font-weight: 600;
  }
}

@media (hover: hover) and (pointer: fine) {
  .seg-item:not(.is-active):hover {
    color: var(--color-ink-1);
  }
}

.seg-count {
  min-width: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.25rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-3);
  background: var(--color-stroke);
  transition:
    color var(--dur-hover) ease,
    background-color var(--dur-hover) ease;

  .is-active & {
    color: var(--color-brand-text);
    background: var(--color-brand-soft);
  }
}

/* ── 分类 ── */
.doc-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.section-text {
  flex: 1;
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-ink-1);
    letter-spacing: -0.01em;
  }

  p {
    margin: 0.2rem 0 0;
    font-size: 0.9rem;
    color: var(--color-ink-3);
  }
}

.section-count {
  flex-shrink: 0;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-2);
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);
}

/* 合集卡片在左，合集里的内容在右 */
.collection {
  display: grid;
  grid-template-columns: minmax(15rem, 4fr) 8fr;
  gap: 1.25rem;
  align-items: start;
}

.collection-card {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.25rem;
  border-radius: var(--radius-inner);
  background: var(--color-brand-soft);
  border: 1px solid var(--color-brand-soft-2);
}

.collection-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-brand-text);

  svg {
    width: 0.95rem;
    height: 0.95rem;
  }
}

.collection-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-ink-1);
}

.collection-note {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-ink-2);
}

.collection-card :deep(.collection-open) {
  margin-top: 0.4rem;
  align-self: flex-start;
}

.included {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.included-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-ink-3);

  span {
    padding: 0 0.4rem;
    border-radius: 999px;
    font-size: 0.72rem;
    line-height: 1.2rem;
    background: var(--color-tile-sunken);
    border: 1px solid var(--color-stroke);
  }
}

.included-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.included-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.65rem 0.8rem;
  border-radius: 0.75rem;
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);
  transition:
    background-color var(--dur-hover) ease,
    border-color var(--dur-hover) ease;
}

@media (hover: hover) and (pointer: fine) {
  .included-item:hover {
    background: var(--color-brand-soft);
    border-color: var(--color-brand-soft-2);
  }
}

.included-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.included-name {
  min-width: 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--color-ink-1);
}

.included-en {
  font-size: 0.75rem;
  color: var(--color-ink-3);
}

.included-desc {
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--color-ink-2);
}

/* 标签：小胶囊，颜色跟随主题色 */
.res-tag {
  flex-shrink: 0;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.35rem;
  white-space: nowrap;
  color: var(--color-brand-text);
  background: var(--color-brand-soft);
}

.sub-block + .sub-block {
  margin-top: 0.25rem;
}

/* 卡片等高排列：列数随宽度自适应，不再有“第一张占两格”的空洞 */
.res-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: var(--bento-gap);
}

.doc-tips {
  color: var(--color-ink-2);

  ul {
    margin: 0;
    padding-left: 1.2rem;
    line-height: 1.9;
  }
}

.qr-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: min(22rem, 80vw);
  padding: 0 1.5rem 1.5rem;
}

.qr-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  text-align: center;
  color: var(--color-ink-1);
}

.qr-img {
  width: 15rem;
  height: 15rem;
  border-radius: 0.75rem;
  box-shadow: var(--shadow-tile);
}

.qr-hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-ink-3);
}

@media (max-width: 1023px) {
  .doc-bento {
    .doc-hero,
    .doc-filter {
      grid-column: 1 / -1;
    }
  }

  .collection {
    grid-template-columns: minmax(0, 1fr);
  }

  .collection-card {
    position: static;
  }
}

@media (max-width: 640px) {
  .doc-section {
    padding: 1.1rem;
  }

  .doc-hero h1 {
    font-size: 1.6rem;
  }

  .res-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 分类排成一行、横向滑动，不再折成好几行 */
  .seg {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .seg-item {
    flex-shrink: 0;
    height: 2.4rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .seg-indicator.is-ready {
    transition-duration: 0.01ms;
  }

  .seg-item:active {
    transform: none;
  }
}
</style>
