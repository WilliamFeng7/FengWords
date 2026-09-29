<script setup lang="ts">
import { BasePage, Collapse } from '@/base'
import { APP_NAME, GITHUB, GITHUB_ISSUES } from '@/core/config/env.ts'
import ConflictNoticeText from '@/components/dialog/ConflictNoticeText.vue'

let title = APP_NAME + ' 常见问题解答'
const requestURL = useRequestURL()
useSeoMeta({
  title: title,
  description: title,
  ogTitle: title,
  ogDescription: title,
  ogUrl: requestURL.href,
  twitterTitle: title,
  twitterDescription: title,
})

const { t } = useI18n()

type Faq = { q: string; a?: string | string[]; extra?: 'keyboard' | 'del' | 'contact' }

const faqs = $computed<Faq[]>(() => [
  {
    q: '数据丢失/被清空/不在了',
    a: [
      '360的垃圾清理功能，清垃圾的时候会自动清理浏览器数据，网站的数据也会被清除，其他软件的同类功能也可能导致数据被清掉',
      'C盘如果被占满了，是无法保存数据的',
      '无痕模式无法保存数据，关闭浏览器之后数据就没了',
      '开户了“自动清除历史记录”选项也无法保存数据，关闭浏览器之后数据就没了',
    ],
  },
  { q: t('qa2_a'), extra: 'keyboard' },
  { q: '按删除键却返回了上一页', extra: 'del' },
  { q: t('qa10_a'), a: [t('qa10_q1'), t('qa10_q2')] },
  { q: t('qa11_a'), a: t('qa11_q') },
  { q: t('qa3_a'), a: [t('qa3_q1'), t('qa3_q2'), t('qa3_q3')] },
  { q: t('qa1_a'), a: [t('qa1_q1'), t('qa1_q2')] },
  { q: t('qa4_a'), a: [t('qa4_q1'), t('qa4_q2')] },
  { q: t('qa5_a'), a: [t('qa5_q1'), t('qa5_q2'), t('qa5_q3'), t('qa5_q4')] },
  { q: t('qa6_a'), a: t('qa5_q4') },
  { q: t('qa7_a'), a: [t('qa7_q1'), t('qa7_q2'), t('qa7_q3')] },
  { q: t('qa8_a'), a: [t('qa8_q1'), t('qa8_q2'), t('qa8_q3')] },
  { q: t('qa9_a'), a: t('qa9_q') },
  { q: t('qa12_a'), a: t('qa12_q') },
  { q: t('qa13_a'), a: [t('qa13_q2'), t('qa13_q4')], extra: 'contact' },
])

// 两列各自独立堆叠：展开一张卡片只把同一列下面的卡片往下推，旁边那一列纹丝不动
const columns = $computed(() => [faqs.filter((_, i) => i % 2 === 0), faqs.filter((_, i) => i % 2 === 1)])
</script>

<template>
  <BasePage>
    <div class="help-page">
      <section class="tile help-head tile-enter" style="--i: 0">
        <div class="tile-icon"><IconLineMdQuestionCircle /></div>
        <div class="page-title">{{ $t('faq') }}</div>
      </section>

      <div class="faq-cols">
        <div v-for="(col, ci) in columns" :key="ci" class="faq-col">
          <!-- order 仅在窄屏合并成一列时生效，保持原来的先后顺序 -->
          <section
            v-for="(f, ri) in col"
            :key="f.q"
            class="tile faq-tile tile-enter"
            :style="{ '--i': Math.min(ri * 2 + ci + 1, 8), order: ri * 2 + ci }"
          >
            <Collapse :q="f.q" :a="f.a">
              <ConflictNoticeText v-if="f.extra === 'keyboard'" type="keyboard" />
              <ConflictNoticeText v-else-if="f.extra === 'del'" type="del" />
              <p v-else-if="f.extra === 'contact'" class="break-all">
                {{ $t('github_address') }}<a :href="GITHUB_ISSUES" target="_blank" rel="noopener">{{ GITHUB }}</a>
              </p>
            </Collapse>
          </section>
        </div>
      </div>
    </div>
  </BasePage>
</template>

<style scoped lang="scss">
.help-page {
  display: flex;
  flex-direction: column;
  gap: var(--bento-gap);
  margin-bottom: 2rem;
}

.help-head {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.faq-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bento-gap);
  align-items: start;
}

.faq-col {
  display: flex;
  flex-direction: column;
  gap: var(--bento-gap);
  min-width: 0;
}

.faq-tile {
  padding: 1.1rem 1.25rem;

  :deep(.qa-item) {
    margin: 0;
  }
}

/* 窄屏合成一列：两列容器“隐身”，卡片按 order 回到原顺序 */
@media (max-width: 1023px) {
  .faq-cols {
    display: flex;
    flex-direction: column;
  }

  .faq-col {
    display: contents;
  }
}
</style>
