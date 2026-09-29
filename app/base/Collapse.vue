<script setup lang="ts">
const props = defineProps<{
  q: string,
  a?: string | string[],
}>()
let show = $ref(false)
let isArray = $computed(() => typeof props.a !== 'string')
</script>

<template>
  <div class="qa-item my-6" :class="{ open: show }">
    <header class="flex justify-between items-center cp font-bold text-lg" @click="show = !show">
      <span>{{ q }}</span>
      <IconLucideChevronLeft class="chevron"/>
    </header>
    <!-- grid 0fr → 1fr：高度自适应的展开动画，无需测量内容 -->
    <div class="content-wrap">
      <div class="content-inner" :aria-hidden="!show">
        <div class="content mt-4 text-base">
          <template v-if="isArray">
            <p v-for="(v,i) in a">{{a.length>1?`${i+1}. `:''}}{{v}}</p>
          </template>
          <span v-else>{{a}}</span>
          <slot></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
header {
  transition: color var(--dur-hover) ease;

  &:hover {
    color: var(--color-brand-text);
  }
}

.chevron {
  flex-shrink: 0;
  transform: rotate(180deg);
  transition: transform 240ms var(--ease-out);
}

.content-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--ease-out);
}

.content-inner {
  min-height: 0;
  overflow: hidden;
  visibility: hidden;
  transition: visibility 0s linear 240ms;
}

.content {
  opacity: 0;
  transition: opacity 180ms var(--ease-out);
}

.open {
  .chevron {
    transform: rotate(270deg);
  }

  .content-wrap {
    grid-template-rows: 1fr;
  }

  .content-inner {
    visibility: visible;
    transition-delay: 0s;
  }

  .content {
    opacity: 1;
    transition-delay: 60ms;
  }
}

@media (prefers-reduced-motion: reduce) {
  .content-wrap,
  .chevron {
    transition: none;
  }
}
</style>
