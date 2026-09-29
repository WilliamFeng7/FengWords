<script setup lang="ts">
import { APP_NAME, GITHUB } from '@/core/config/env.ts'
import { BaseIcon } from '@/base'
import { usePlayBeep, usePlayCorrect, usePlayKeyboardAudio } from '@/core/hooks/sound.ts'

definePageMeta({ layout: 'empty' })

onMounted(() => {
  startTypingAnimation()
})

const { t } = useI18n()

const typingWords = ['abandon', 'persevere', 'eloquent', 'diligent', 'profound', 'innovation']
let typingCursor = $ref(true)

function startTypingAnimation() {
  let wordIdx = 0
  let charIdx = 0
  let deleting = false
  function tick() {
    const word = typingWords[wordIdx]
    if (!deleting) {
      charIdx++
      if (charIdx === word.length) {
        deleting = true
        setTimeout(tick, 1600)
        return
      }
    } else {
      charIdx--
      if (charIdx === 0) {
        deleting = false
        wordIdx = (wordIdx + 1) % typingWords.length
      }
    }
    setTimeout(tick, deleting ? 60 : 100)
  }
  setInterval(() => {
    typingCursor = !typingCursor
  }, 530)
  tick()
}

// ── 首屏打字 Demo（PC 端，轻量自包含，不依赖 store）──
const demoWords = $computed(() => [
  {
    word: 'persevere',
    phonetic: '/ˌpɜːrsɪˈvɪər/',
    trans: t('demo_word_persevere_trans'),
    examples: [
      { en: 'You must persevere if you want to succeed.', zh: t('demo_word_persevere_ex1') },
      { en: 'She persevered through years of hardship.', zh: t('demo_word_persevere_ex2') },
    ],
  },
  {
    word: 'eloquent',
    phonetic: '/ˈeləkwənt/',
    trans: t('demo_word_eloquent_trans'),
    examples: [
      { en: 'He gave an eloquent speech at the ceremony.', zh: t('demo_word_eloquent_ex1') },
      { en: 'Her eloquent writing moved the audience deeply.', zh: t('demo_word_eloquent_ex2') },
    ],
  },
  {
    word: 'diligent',
    phonetic: '/ˈdɪlɪdʒənt/',
    trans: t('demo_word_diligent_trans'),
    examples: [
      { en: 'A diligent student always finishes homework on time.', zh: t('demo_word_diligent_ex1') },
      { en: 'He was diligent in his research and rarely took breaks.', zh: t('demo_word_diligent_ex2') },
    ],
  },
  {
    word: 'profound',
    phonetic: '/prəˈfaʊnd/',
    trans: t('demo_word_profound_trans'),
    examples: [
      { en: 'Reading widely has a profound effect on vocabulary.', zh: t('demo_word_profound_ex1') },
      { en: 'The discovery had a profound impact on modern science.', zh: t('demo_word_profound_ex2') },
    ],
  },
])
let demoIdx = $ref(0)
let demoInput = $ref('')
let demoWrong = $ref('')
let demoDone = $ref(false)
let demoShake = $ref(false)

const demoWord = $computed(() => demoWords[demoIdx])
const demoRemain = $computed(() => demoWord.word.slice(demoInput.length + demoWrong.length))

function demoNextWord() {
  demoDone = false
  demoInput = ''
  demoWrong = ''
  demoIdx = (demoIdx + 1) % demoWords.length
}

function onDemoKey(e: KeyboardEvent) {
  if (demoDone) {
    if (e.code === 'Space') {
      e.preventDefault()
      demoNextWord()
    }
    return
  }
  if (e.key.length !== 1) return
  e.preventDefault()
  const target = demoWord.word
  const pos = demoInput.length
  if (demoWrong) return
  if (e.key.toLowerCase() === target[pos].toLowerCase()) {
    demoInput += e.key
    demoWrong = ''
    playDemoKeyboard()
    if (demoInput.length === target.length) {
      demoDone = true
      playDemoCorrect()
    }
  } else {
    demoWrong = e.key
    demoShake = true
    playDemoBeep()
    setTimeout(() => {
      demoWrong = ''
      demoShake = false
    }, 500)
  }
}

function onDemoBackspace(e: KeyboardEvent) {
  if (e.code === 'Backspace') {
    e.preventDefault()
    if (demoWrong) {
      demoWrong = ''
      return
    }
    demoInput = demoInput.slice(0, -1)
  }
}

let demoFocused = $ref(false)

const demoCardRef = $ref<HTMLElement | null>(null)

function focusDemoCard() {
  demoCardRef?.focus()
}

const playDemoKeyboard = usePlayKeyboardAudio()
const playDemoBeep = usePlayBeep()
const playDemoCorrect = usePlayCorrect()

let mobileMenuOpen = $ref(false)

const requestURL = useRequestURL()
useSeoMeta({
  title: () => APP_NAME,
  ogUrl: requestURL.origin + '/',
})
</script>

<template>
  <div class="hw min-h-screen overflow-x-hidden" id="wrapper">
    <!-- NAV -->
    <header class="hw-nav sticky top-0 z-100">
      <div class="max-w-[1200px] mx-auto px-4 sm:px-8 h-15 flex items-center gap-8">
        <!-- Logo -->
        <div class="brand shrink-0">
          <span class="brand-mark" aria-hidden="true">F<i></i></span>
          <span class="brand-word">{{ APP_NAME }}</span>
        </div>
        <!-- Desktop nav links -->
        <nav class="hidden md:flex gap-7">
          <NuxtLink to="/words" class="nav-link">{{ $t('nav_words') }}</NuxtLink>
          <NuxtLink to="/articles" class="nav-link">{{ $t('nav_articles') }}</NuxtLink>
        </nav>
        <!-- Actions -->
        <div class="ml-auto flex items-center gap-2 text-[var(--hw-text-2)]">
          <!-- GitHub -->
          <a
            class="gh-link flex center gap-1 text-[var(--hw-text-2)] no-underline"
            :href="GITHUB"
            target="_blank"
            aria-label="GitHub"
          >
            <BaseIcon title="GitHub" noBg>
              <IconSimpleIconsGithub />
            </BaseIcon>
          </a>
          <!-- Mobile menu button -->
          <button
            class="flex md:hidden items-center justify-center w-8 h-8 rounded-lg bg-transparent text-[var(--hw-text-2)] cursor-pointer"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <span class="text-[1.2rem] leading-none">☰</span>
          </button>
        </div>
      </div>
    </header>

    <main>
      <section class="px-4 sm:px-8 pt-6 pb-12 sm:pt-10">
        <div class="landing-bento max-w-[1200px] mx-auto">
          <!-- ══════════ HERO ══════════ -->
          <div class="l-tile hero" style="--i: 0">
            <!-- Social proof badge -->
            <div class="flex justify-center lg:justify-start">
              <a :href="GITHUB" target="_blank" rel="noopener" class="hero-badge">
                <IconSimpleIconsGithub class="shrink-0" />
                {{ $t('hero_badge') }} · GitHub
              </a>
            </div>

            <!-- Title -->
            <h1 class="hero-title">
              <span class="hero-name" :aria-label="APP_NAME">
                <span
                  v-for="(ch, ci) in APP_NAME.split('')"
                  :key="ci"
                  class="hero-letter"
                  :class="{ 'is-soft': ci >= 4 }"
                  :style="{ '--l': ci }"
                  aria-hidden="true"
                  >{{ ch }}</span
                ><span class="hero-caret" aria-hidden="true"></span>
              </span>
              <span class="hero-tagline">
                {{ $t('hero_tagline') }}
              </span>
            </h1>

            <p class="hero-desc">
              {{ $t('hero_desc') }}
            </p>

            <!-- Core value pills -->
            <div class="flex gap-2 justify-center lg:justify-start flex-wrap">
              <span class="value-pill">{{ $t('hero_pill_typing') }}</span>
              <span class="value-pill">{{ $t('hero_pill_fsrs') }}</span>
              <span class="value-pill">{{ $t('hero_pill_free') }}</span>
            </div>

            <!-- 手机端不支持提示 Banner -->
            <div class="block sm:hidden">
              <div class="mobile-note">
                <span class="text-[.84rem]">{{ $t('mobile_not_optimized') }}</span>
              </div>
            </div>

            <div class="hero-foot">
              <!-- CTA buttons -->
              <div
                class="flex gap-3 justify-center lg:justify-start flex-col sm:flex-row items-stretch sm:items-center flex-wrap"
              >
                <button class="cta cta-primary" @click="navigateTo('/words')">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="shrink-0"
                  >
                    <polyline points="13 17 18 12 13 7" />
                    <polyline points="6 17 11 12 6 7" />
                  </svg>
                  {{ $t('hero_cta_start') }}
                </button>
                <a class="cta cta-ghost" :href="GITHUB" target="_blank" rel="noopener">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="shrink-0">
                    <path
                      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                    />
                  </svg>
                  {{ $t('hero_cta_github') }}
                </a>
              </div>

            </div>
          </div>

          <!-- ══════════ 打字 Demo（PC） ══════════ -->
          <div class="demo-cell hidden lg:block" style="--i: 1">
            <div class="w-full h-full relative">
              <!-- 未 focus 时的引导覆盖层 -->
              <div
                v-if="!demoFocused"
                class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[1.5rem] cursor-pointer"
                style="background: rgba(0, 0, 0, 0)"
                @click="focusDemoCard()"
              >
                <!-- 引导文字，带脉冲效果 -->
                <div class="demo-click-guide">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="shrink-0"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h4" />
                  </svg>
                  <span>{{ $t('demo_click_guide') }}</span>
                </div>
                <div class="demo-bounce-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </div>
              </div>

              <!-- Demo 主卡片 -->
              <div
                ref="demoCardRef"
                class="l-tile demo-card"
                :class="demoFocused ? 'is-focused' : 'is-idle'"
                tabindex="0"
                @focus="demoFocused = true"
                @blur="demoFocused = false"
                @keydown="onDemoKey"
                @keydown.backspace="onDemoBackspace"
              >
                <!-- 顶栏 -->
                <div class="demo-bar">
                  <span class="w-3 h-3 rounded-full bg-[#ff5f57]"></span>
                  <span class="w-3 h-3 rounded-full bg-[#febc2e]"></span>
                  <span class="w-3 h-3 rounded-full bg-[#28c840]"></span>
                  <span class="ml-3 text-[.78rem] text-[var(--hw-text-3)] font-mono"
                    >{{ APP_NAME }} — {{ $t('nav_words') }}</span
                  >
                  <div class="ml-auto">
                    <span class="demo-status" :class="demoFocused ? 'is-on' : ''">{{
                      demoFocused ? '● ' + $t('demo_typing_status') : '○ ' + $t('demo_click_to_activate')
                    }}</span>
                  </div>
                </div>

                <!-- 内容区 -->
                <div
                  class="flex-1 px-8 py-5 flex flex-col items-center justify-center gap-1 cursor-text"
                  @click="focusDemoCard()"
                >
                  <!-- 音标 -->
                  <div class="text-[1rem] text-[var(--hw-text-3)] tracking-widest">{{ demoWord.phonetic }}</div>
                  <!-- 单词打字区 -->
                  <div
                    class="text-[3rem] leading-none tracking-widest min-h-[3.8rem] flex items-center en-article-family"
                    :class="{ 'demo-shake': demoShake }"
                  >
                    <span class="text-[#16a34a]">{{ demoInput }}</span>
                    <span class="text-[rgba(220,38,38,.85)]">{{ demoWrong }}</span>
                    <span class="text-[var(--hw-text-3)]">{{ demoRemain }}</span>
                  </div>
                  <!-- 释义 -->
                  <div class="text-[.9rem] text-[var(--hw-text-2)] mt-1">{{ demoWord.trans }}</div>
                  <!-- 例句 -->
                  <div class="w-full mt-3 border-t border-[var(--hw-border)] pt-3 flex flex-col gap-1.5">
                    <div class="text-[.72rem] font-bold tracking-[.06em] uppercase text-[var(--hw-text-3)]">
                      {{ $t('demo_example_label') }}
                    </div>
                    <div
                      v-for="(ex, ei) in demoWord.examples"
                      :key="ei"
                      class="text-[.82rem] leading-[1.6] flex flex-col gap-0.5"
                    >
                      <div class="italic text-[var(--hw-text-2)]">
                        <span class="text-[var(--hw-brand)] font-bold not-italic mr-1">{{ ei + 1 }}.</span>{{ ex.en }}
                      </div>
                      <div class="text-[.78rem] text-[var(--hw-text-3)] not-italic pl-3.5">{{ ex.zh }}</div>
                    </div>
                  </div>
                  <!-- 完成提示 / 状态文字 -->
                  <div class="h-12 flex justify-end flex-col">
                    <div v-if="demoDone" class="demo-done mt-3 flex flex-col items-center gap-1">
                      <div class="text-[1.1rem] text-[#16a34a] font-bold">{{ $t('demo_done') }}</div>
                      <div class="text-sm text-[var(--hw-brand)]">
                        {{ $t('demo_press_space_next') }}
                      </div>
                    </div>
                    <div v-else-if="demoFocused" class="mt-3 text-sm text-[var(--hw-text-3)]">
                      {{ $t('demo_typing_hint') }}
                    </div>
                  </div>
                  <!-- 进度点 -->
                  <div class="flex gap-1.5 mt-2">
                    <span
                      v-for="(_, i) in demoWords"
                      :key="i"
                      class="demo-dot"
                      :class="i === demoIdx && 'is-active'"
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ══════════ 亮点 ══════════ -->
          <div class="l-tile perk tone-brand" style="--i: 2">
            <div class="perk-icon"><IconLucideKeyboard /></div>
            <div class="perk-num">7</div>
            <div class="perk-label">{{ $t('hero_perk_modes') }}</div>
          </div>
          <div class="l-tile perk tone-sky" style="--i: 3">
            <div class="perk-icon"><IconLucideLibraryBig /></div>
            <div class="perk-num">50+</div>
            <div class="perk-label">{{ $t('hero_perk_dicts') }}</div>
          </div>
          <div class="l-tile perk tone-deep" style="--i: 4">
            <div class="perk-icon"><IconLucideShieldCheck /></div>
            <div class="perk-label perk-label--lead">{{ $t('hero_perk_offline') }}</div>
          </div>
          <a class="l-tile perk perk-link tone-ink" style="--i: 5" :href="GITHUB" target="_blank" rel="noopener">
            <div class="perk-icon"><IconSimpleIconsGithub /></div>
            <div class="perk-label perk-label--lead">
              {{ $t('hero_badge') }}<IconLucideArrowUpRight class="perk-arrow" />
            </div>
          </a>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* 落地页固定浅色主题（与原先一致），色值取自 FENG 调色板 */
.hw {
  --hw-bg: #f1f5f9;
  --hw-bg-card: #ffffff;
  --hw-bg-nav: rgba(241, 245, 249, 0.82);
  --hw-border: #e2e8f0;
  --hw-text: #0f172a;
  --hw-text-2: #475569;
  --hw-text-3: #64748b;
  /* 品牌色跟随“主题色”设置 */
  --hw-brand: var(--color-brand);
  --hw-brand-hover: var(--color-brand-deep);
  --hw-brand-soft: var(--color-brand-tint);
  --hw-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -16px rgba(15, 23, 42, 0.14);
  --hw-shadow-md: 0 2px 6px rgba(15, 23, 42, 0.06), 0 20px 40px -20px rgba(15, 23, 42, 0.28);
  --hw-shadow-lg: 0 2px 8px rgba(15, 23, 42, 0.06), 0 28px 60px -28px rgba(15, 23, 42, 0.36);
  --hw-ease: cubic-bezier(0.23, 1, 0.32, 1);
  background: var(--hw-bg);
  color: var(--hw-text);
  font-family: var(--font-family);
}

/* ── Nav ── 近乎不透明的底色代替实时背景模糊：滚动时不必每帧重新模糊下面的内容 */
.hw-nav {
  background: rgba(241, 245, 249, 0.96);
  border-bottom: 1px solid var(--hw-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.brand-mark {
  position: relative;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  background: var(--hw-brand);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -2px 0 rgba(0, 0, 0, 0.18);
}

.brand-mark i {
  position: absolute;
  left: 50%;
  bottom: 0.42rem;
  width: 0.42rem;
  height: 2px;
  margin-left: -0.21rem;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.75);
}

.brand-word {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: 0.18em;
  color: var(--hw-text);
}

.nav-link {
  font-weight: 500;
  color: var(--hw-text-2);
  text-decoration: none;
  transition: color 160ms ease;
}

.nav-link:hover {
  color: var(--hw-text);
}

.gh-link {
  transition: color 160ms ease;
}

.gh-link:hover {
  color: var(--hw-text);
}

/* ── Bento grid ──
 * lg:  [hero 7][demo 5] / [perk 3 ×4]
 * md:  [hero 12] [perk 6 ×4]      (demo hidden below lg, as before)
 */
.landing-bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1rem;
}

.l-tile {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  padding: 1.5rem;
  background: var(--hw-bg-card);
  border: 1px solid var(--hw-border);
  border-radius: 1.5rem;
  box-shadow: var(--hw-shadow-sm);
}

/* first-visit entrance: the delight budget lives here — longer and staggered, still transform + opacity only */
.landing-bento > * {
  animation: l-tile-in 560ms var(--hw-ease) backwards;
  animation-delay: calc(80ms + var(--i, 0) * 60ms);
}

@keyframes l-tile-in {
  from {
    opacity: 0;
    transform: translate3d(0, 18px, 0) scale(0.985);
  }
}

.hero {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 2.25rem 2rem;
  text-align: center;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.88);
  background: var(--hw-brand);
  border-color: transparent;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 30px 60px -30px rgba(var(--color-brand-rgb), 0.6);
}

/* one quiet light source in the corner instead of a gradient wash */
.hero::before {
  content: '';
  position: absolute;
  right: -8rem;
  top: -10rem;
  width: 26rem;
  height: 26rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}

.hero > * {
  position: relative;
}

.demo-cell {
  grid-column: 1 / -1;
}

.perk {
  grid-column: span 6;
}

@media (min-width: 1024px) {
  .hero {
    grid-column: span 7;
    text-align: left;
    padding: 2.5rem 2.5rem 2.25rem;
  }

  .demo-cell {
    grid-column: span 5;
  }

  .perk {
    grid-column: span 3;
  }
}

/* ── Hero content ── */
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  transition: background-color 160ms ease;
}

.hero-badge:hover {
  background: rgba(255, 255, 255, 0.2);
}

.hero-badge svg {
  width: 0.95rem;
  height: 0.95rem;
  color: rgba(255, 255, 255, 0.85);
}

.hero-title {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.hero-name {
  font-family: var(--font-display);
  /* 9 个字母约 7.3em 宽：字号按列宽算，1024 / 390 宽都不会被裁掉 */
  font-size: clamp(1.75rem, 9.2vw, 5.25rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: #fff;
  white-space: nowrap;
}

/* Feng·Words rise in one after another on first visit; "Words" in a softer white */
.hero-letter {
  display: inline-block;
  animation: letter-in 700ms var(--hw-ease) backwards;
  animation-delay: calc(260ms + var(--l) * 55ms);
}

.hero-letter.is-soft {
  color: rgba(255, 255, 255, 0.72);
}

@keyframes letter-in {
  from {
    opacity: 0;
    transform: translate3d(0, 0.35em, 0);
  }
}

/* typing caret — the product in one glyph */
.hero-caret {
  display: inline-block;
  width: 0.09em;
  height: 0.78em;
  margin-left: 0.1em;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.7);
  vertical-align: -0.02em;
  animation: caret-blink 1.06s steps(1, end) infinite;
}

@keyframes caret-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.hero-tagline {
  margin-top: 1rem;
  font-size: clamp(1.3rem, 2.6vw, 1.85rem);
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fff;
}

.hero-desc {
  margin: 0 auto;
  max-width: 34rem;
  font-size: clamp(0.92rem, 2vw, 1.03rem);
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.88);
}

@media (min-width: 1024px) {
  .hero-name {
    font-size: min(6.3vw, 5.25rem);
  }

  .hero-desc {
    margin: 0;
  }
}

/* 核心价值 pill */
.value-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.mobile-note {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.875rem;
  line-height: 1.6;
  text-align: left;
  color: #fff;
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.5);
}

.hero-foot {
  margin-top: auto;
  padding-top: 0.25rem;
}

.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 1.75rem;
  border-radius: 0.875rem;
  font-weight: 600;
  font-size: 0.97rem;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 240ms var(--hw-ease),
    transform 160ms var(--hw-ease);
}

.cta:active {
  transform: scale(0.97);
}

.cta-primary {
  color: var(--hw-brand);
  background: #fff;
  border: none;
  box-shadow: 0 10px 24px -12px rgba(15, 23, 42, 0.55);
}

.cta-ghost {
  color: #fff;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.site-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: rgba(255, 255, 255, 0.78);
  text-decoration: none;
  transition: color 160ms ease;
}

.site-link:hover {
  color: #fff;
}

@media (hover: hover) and (pointer: fine) {
  .cta-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 30px -12px rgba(15, 23, 42, 0.62);
  }

  .cta-primary:active {
    transform: translateY(0) scale(0.97);
  }

  .cta-ghost:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.7);
  }

  .perk-link:hover {
    border-color: rgba(var(--color-brand-rgb), 0.35);
    box-shadow: var(--hw-shadow-md);
    transform: translateY(-2px);
  }

  .perk-link:hover .perk-arrow {
    transform: translate(2px, -2px);
  }
}

/* ── Demo tile ── */
.demo-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  outline: none;
  border-width: 1.5px;
  box-shadow: var(--hw-shadow-lg);
  transition:
    border-color 250ms ease,
    box-shadow 250ms var(--hw-ease);
}

.demo-card.is-focused {
  border-color: var(--hw-brand);
  box-shadow:
    0 0 0 4px rgba(var(--color-brand-rgb), 0.14),
    var(--hw-shadow-lg);
}

/* idle: a breathing ring drawn on its own layer — opacity only, no per-frame border repaint */
.demo-card.is-idle::after {
  content: '';
  position: absolute;
  inset: -1.5px;
  border-radius: inherit;
  border: 2px solid rgba(var(--color-brand-rgb), 0.5);
  pointer-events: none;
  opacity: 0;
  animation: ring-breathe 2.4s ease-in-out infinite;
}

@keyframes ring-breathe {
  50% {
    opacity: 1;
  }
}

.demo-bar {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--hw-border);
  background: #f7f8fc;
}

.demo-status {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  color: var(--hw-brand);
  background: var(--hw-brand-soft);
  transition:
    background-color 200ms ease,
    color 200ms ease;
}

.demo-status.is-on {
  color: #059669;
  background: rgba(16, 185, 129, 0.12);
}

.demo-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 999px;
  background: var(--hw-border);
  transition: background-color 200ms ease;
}

.demo-dot.is-active {
  background: var(--hw-brand);
}

/* success: a small pop, once per word */
.demo-done {
  animation: done-pop 320ms var(--hw-ease) backwards;
}

@keyframes done-pop {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0) scale(0.96);
  }
}

/* 打字 Demo 输错抖动 */
.demo-shake {
  animation: demo-shake 0.36s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
@keyframes demo-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-5px);
  }
  40% {
    transform: translateX(5px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(4px);
  }
}

/* 点击引导 — 只用 transform 轻微浮动 */
.demo-click-guide {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--hw-brand);
  background: color-mix(in srgb, var(--color-brand-tint) 92%, transparent);
  border: 1.5px solid rgba(var(--color-brand-rgb), 0.35);
  border-radius: 999px;
  padding: 8px 18px;
  cursor: pointer;
  box-shadow: 0 8px 20px -10px rgba(var(--color-brand-rgb), 0.4);
  animation: guide-float 1.8s ease-in-out infinite;
}
@keyframes guide-float {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-3px);
  }
}

/* 引导箭头弹跳 */
.demo-bounce-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--color-brand-rgb), 0.6);
  margin-top: 6px;
  animation: arrow-bounce 1.4s ease-in-out infinite;
}
@keyframes arrow-bounce {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.6;
  }
  50% {
    transform: translateY(5px);
    opacity: 1;
  }
}

/* ── Perks ── */
.perk {
  --tone: var(--hw-brand);
  --tone-soft: var(--hw-brand-soft);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.25rem 1.25rem 1.1rem;
}

.perk.tone-sky {
  --tone: #0369a1;
  --tone-soft: #e0f2fe;
}

.perk.tone-deep {
  --tone: var(--color-brand-deep);
  --tone-soft: var(--color-brand-tint);
}

.perk.tone-ink {
  --tone: #0f172a;
  --tone-soft: #e2e8f0;
}

.perk-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  margin-bottom: 0.75rem;
  border-radius: 0.75rem;
  font-size: 1.15rem;
  color: var(--tone);
  background: var(--tone-soft);
}

.perk-num {
  font-family: var(--font-display);
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--hw-text);
}

.perk-label {
  font-size: 0.9rem;
  color: var(--hw-text-2);
}

.perk-label--lead {
  margin-top: auto;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--hw-text);
}

/* 开源卡片整块可点：去 GitHub 仓库 */
.perk-link {
  color: inherit;
  text-decoration: none;
  transition:
    border-color 200ms ease,
    box-shadow 240ms var(--hw-ease),
    transform 240ms var(--hw-ease);
}

.perk-link:active {
  transform: scale(0.98);
}

.perk-arrow {
  display: inline-block;
  width: 0.95rem;
  height: 0.95rem;
  margin-left: 0.3rem;
  vertical-align: -0.1em;
  color: var(--hw-text-3);
  transition: transform 220ms var(--hw-ease);
}

@media (prefers-reduced-motion: reduce) {
  .landing-bento > *,
  .hero-letter {
    animation-name: fade-in;
  }

  .hero-caret,
  .demo-card.is-idle::after,
  .demo-click-guide,
  .demo-bounce-arrow {
    animation: none;
  }

  .demo-shake {
    animation: none;
  }
}
</style>
