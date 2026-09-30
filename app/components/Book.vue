<script setup lang="ts">
import type { Dict } from '@/core/types'
import { Checkbox, Progress } from '@/base'
import { withAppBaseURL } from '@/core/utils/base-url'

interface IProps {
  item?: Partial<Dict>
  quantifier?: string
  isAdd: boolean
  showCheckbox?: boolean
  checked?: boolean
  selected?: boolean
  showProgress?: boolean
  isUser?: boolean //是否是用户的词典
}

const props = withDefaults(defineProps<IProps>(), {
  showProgress: true,
  isUser: false,
})

const emit = defineEmits<{
  check: []
  click: []
}>()

const progress = $computed(() => {
  return Number(((props.item?.lastLearnIndex / props.item?.length) * 100).toFixed())
})

const studyProgress = $computed(() => {
  if (!props.showProgress) return
  return props.item?.lastLearnIndex ? props.item?.lastLearnIndex + '/' : ''
})

const coverSrc = $computed(() => {
  return props.item?.cover ? withAppBaseURL(props.item.cover) : ''
})

function handleClick(e: MouseEvent) {
  if (props.showCheckbox) {
    e.stopPropagation()
    emit('check')
  } else {
    emit('click')
  }
}
</script>

<template>
  <div style="width: var(--book-width)" :id="`dict-${item?.id}`" v-if="!isAdd" @click="handleClick">
    <div
      class="book overflow-hidden relative"
      :class="[showCheckbox && 'book-selectable', (selected || checked) && 'book-selected', item?.unavailable && 'book-disabled']"
    >
      <img
        class="absolute top-0 left-0 w-full object-cover"
        v-if="item?.cover"
        :src="coverSrc"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div class="text-base mt-1" v-else>{{ item?.name }}</div>
      <div class="absolute bottom-4 right-3 z-1" v-if="!item?.cover">
        <div>{{ studyProgress }}{{ item?.length }}{{ quantifier }}</div>
      </div>
      <div class="absolute bottom-2 left-3 right-3">
        <Progress
          v-if="item?.lastLearnIndex && showProgress"
          class="mt-1"
          :percentage="progress"
          :show-text="false"
        ></Progress>
      </div>
      <Checkbox
        v-if="showCheckbox"
        :model-value="checked"
        @change="$emit('check')"
        class="absolute left-2 bottom-3 z-3"
      />
      <div class="custom z-1" v-if="item.custom">{{ $t('custom') }}</div>
      <div class="system z-1" v-else-if="item.system">{{ $t('dict_picker_builtin') }}</div>
      <div class="coming-soon z-3" v-if="item?.unavailable">未开放</div>
      <!--      <div class="custom bg-red! color-white z-1" v-else-if="item.update">更新中</div>-->
      <!--      <div class="sync bg-red! color-white z-1" v-if="!item.sync && isUser && !showCheckbox">未同步</div>-->
    </div>
    <div class="flex justify-between text-base mt-1" v-if="item?.cover">
      <div class="w-6/10 truncate">{{ item?.name }}</div>
      <div>{{ studyProgress }}{{ item?.length }}{{ quantifier }}</div>
    </div>
  </div>
  <div v-else class="book" id="no-book" @click="handleClick">
    <div class="h-full center text-2xl">
      <IconLineMdPlus class="i-rotate" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.book-selectable {
  &:hover {
    border-color: var(--color-input-border);
  }
}

.book-selected {
  @apply bg-fifth;
  border-color: var(--color-brand) !important;
  box-shadow: 0 0 0 3px var(--color-brand-soft-2);
}

.custom {
  position: absolute;
  top: 4px;
  right: -22px;
  padding: 1px 20px;
  background: var(--color-brand);
  color: white;
  font-size: 11px;
  font-weight: 600;
  transform: rotate(45deg);
}

.system {
  position: absolute;
  left: 10px;
  bottom: 18px;
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--color-brand-soft-2);
  color: var(--color-brand-ink);
  font-size: 11px;
  font-weight: 600;
}

.sync {
  @extend .custom;
  bottom: 4px;
  left: -22px;
  top: unset;
  right: unset;
}

/* 手机上的小书（一排 3 本）：字小一点，不挤 */
@media (max-width: 560px) {
  .book {
    padding: 0.55rem;
  }

  .text-base {
    font-size: 0.85rem;
    line-height: 1.3;
    word-break: break-word;
  }

  .absolute.bottom-4 {
    bottom: 0.7rem;
    right: 0.55rem;
    font-size: 0.75rem;
  }

  .system {
    left: 0.5rem;
    bottom: 1rem;
    padding: 1px 6px;
    font-size: 10px;
  }

  /* 书名在左上角，“未开放”挪到左下角，不再压住书名 */
  .coming-soon {
    top: auto;
    right: auto;
    left: 0.45rem;
    bottom: 0.6rem;
    padding: 0 6px;
    font-size: 10px;
    letter-spacing: 0;
  }
}

.book-disabled {
  cursor: not-allowed;
  filter: grayscale(0.55);
  opacity: 0.62;
}

.coming-soon {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-tile-sunken, rgba(0, 0, 0, 0.08));
  color: var(--color-ink-2, #888);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border: 1px solid var(--color-input-border, rgba(0, 0, 0, 0.1));
}
</style>
