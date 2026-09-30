<script setup lang="ts">
import type {Dict} from '@/core/types';
import Book from "@/components/Book.vue";

defineProps<{
  list?: Partial<Dict>[],
  selectId?: string
  quantifier?: string
}>()

const emit = defineEmits<{
  selectDict: [val: { dict: any, index: number }]
  del: [val: { dict: any, index: number }]
  detail: [],
  add: []
}>()

</script>

<template>
  <div class="flex gap-4 flex-wrap">
    <Book v-for="(dict,index) in list"
          :is-add="false"
          @click="emit('selectDict',{dict,index})"
          :quantifier="quantifier"
          :item="dict"/>
  </div>
</template>

<style scoped lang="scss">
.dict-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* 手机：一排 3 本。书的宽度 = (屏宽 − 页面留白 − 卡片内边距 − 间距) / 3；
   Book 的宽高都读 --book-width，所以在列表上改这个变量就行 */
@media (max-width: 560px) {
  .flex.gap-4.flex-wrap {
    gap: 0.6rem;
    --book-width: calc((100vw - 2 * var(--page-gutter) - 2 * var(--tile-pad) - 2px - 2 * 0.6rem) / 3);
  }
}
</style>
