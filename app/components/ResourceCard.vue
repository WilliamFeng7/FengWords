<script setup lang="ts">
import { BaseButton } from '@/base'
import type { Resource } from '@/core/types'

defineProps<{
  resource: Resource
}>()

const emit = defineEmits(['openLink'])
</script>

<template>
  <!-- 等高卡片：标题与标签在上，说明居中，打开按钮固定贴底，一排卡片的按钮永远对齐 -->
  <article class="res-card">
    <div class="res-top">
      <h4 class="res-name">{{ resource.name }}</h4>
      <span v-if="resource.difficulty" class="res-tag">{{ resource.difficulty }}</span>
    </div>

    <div v-if="resource.author" class="res-author">{{ $t('author') }}{{ resource.author }}</div>

    <p v-if="resource.description" class="res-desc">{{ resource.description }}</p>

    <dl v-if="resource.features || resource.suitable" class="res-facts">
      <div v-if="resource.features">
        <dt>{{ $t('features') }}</dt>
        <dd>{{ resource.features }}</dd>
      </div>
      <div v-if="resource.suitable">
        <dt>{{ $t('suitable_for') }}</dt>
        <dd>{{ resource.suitable }}</dd>
      </div>
    </dl>

    <BaseButton v-if="resource.link" class="res-open" type="info" @click="emit('openLink', resource.link)">
      <span class="center gap-1.5">
        <span>{{ $t('open_link') }}</span>
        <IconLucideArrowUpRight class="i-nudge" />
      </span>
    </BaseButton>
  </article>
</template>

<style scoped lang="scss">
.res-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
  padding: 1.1rem 1.15rem;
  border-radius: var(--radius-inner);
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);
  transition:
    transform var(--dur-tile) var(--ease-out),
    box-shadow var(--dur-tile) var(--ease-out),
    border-color var(--dur-hover) ease;
}

@media (hover: hover) and (pointer: fine) {
  .res-card:hover {
    transform: translateY(-2px);
    border-color: var(--color-brand-soft-2);
    box-shadow: var(--shadow-tile-hover);
  }
}

.res-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.res-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--color-ink-1);
}

.res-tag {
  flex-shrink: 0;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.4rem;
  white-space: nowrap;
  color: var(--color-brand-text);
  background: var(--color-brand-soft);
}

.res-author {
  font-size: 0.8rem;
  color: var(--color-ink-3);
}

.res-desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-ink-2);
}

.res-facts {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0;

  div {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem;
  }

  dt {
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.6;
    color: var(--color-ink-3);
    white-space: nowrap;
  }

  dd {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--color-ink-2);
  }
}

/* 按钮贴底：卡片内容多少不一，按钮依然在同一条线上（BaseButton 渲染的是片段，需从卡片用 :deep 够到） */
.res-card :deep(.res-open) {
  margin-top: auto;
  align-self: flex-start;
}

@media (prefers-reduced-motion: reduce) {
  .res-card:hover {
    transform: none;
  }
}
</style>
