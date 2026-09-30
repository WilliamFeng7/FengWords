<script setup lang="ts">
import {watch} from "vue";
import type {DictResource} from '@/core/types';
import DictList from "./DictList.vue";

const props = defineProps<{
  category: string,
  groupByTag: any,
  selectId: string
}>()
const emit = defineEmits<{
  selectDict: [val: { dict: DictResource, index: number }]
  detail: [],
}>()
const tagList = $computed(() => Object.keys(props.groupByTag))
let currentTag = $ref(tagList[0])
let list = $computed(() => {
  return props.groupByTag[currentTag]
})

watch(() => props.groupByTag, () => {
  currentTag = tagList[0]
})

</script>

<template>
  <div>
    <div class="flex items-center">
      <div class="category shrink-0">{{ category }}：</div>
      <div class="tags">
        <div class="tag" :class="i === currentTag &&'active'"
             @click="currentTag = i"
             v-for="i in Object.keys(groupByTag)">{{ i }}
        </div>
      </div>
    </div>

    <!-- 切换标签时列表淡入，避免整片书架瞬间替换 -->
    <DictList
        class="swap-in"
        :key="currentTag"
        @selectDict="e => emit('selectDict',e)"
        :list="list"
        :select-id="selectId"/>
  </div>
</template>

<style scoped lang="scss">

.category {
  font-weight: 700;
  color: var(--color-ink-1);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  margin: 1rem 0;

  .tag {
    color: var(--color-main-text);
    cursor: pointer;
    padding: 0.4rem 1rem;
    border-radius: 2rem;
    transition:
      background-color var(--dur-hover) ease,
      color var(--dur-hover) ease,
      transform 160ms var(--ease-out);

    &:hover:not(.active) {
      background: var(--color-tile-sunken);
    }

    &:active {
      transform: scale(0.96);
    }

    &.active {
      color: #fff;
      background: var(--color-brand);
      box-shadow: 0 6px 14px -8px rgba(var(--color-brand-rgb), 0.7);
    }
  }
}


/* 手机：分类名在上，标签排成一行横向滑动，不再折成好几行 */
@media (max-width: 768px) {
  .flex.items-center {
    flex-direction: column;
    align-items: flex-start;
  }

  .tags {
    flex-wrap: nowrap;
    width: 100%;
    margin: 0.5rem 0 0.9rem;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    .tag {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      min-height: 2.25rem;
      padding: 0 0.85rem;
      font-size: 0.9rem;
      white-space: nowrap;
    }
  }
}

</style>
