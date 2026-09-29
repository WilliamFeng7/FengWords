<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, useSlots, watch } from 'vue'
import type { VNode } from 'vue'

interface Option {
  label: string
  value: any
  disabled?: boolean
}

const props = defineProps<{
  modelValue: any
  placeholder?: string
  disabled?: boolean
  options?: Option[]
}>()

const emit = defineEmits(['update:modelValue', 'toggle'])

const isOpen = ref(false)
const isReverse = ref(false)
const dropdownStyle = ref({}) // Teleport 用的样式
const selectedOption = ref<Option | null>(null)
const selectRef = ref<HTMLDivElement | null>(null)
const dropdownRef = ref<HTMLDivElement | null>(null)
const slots = useSlots()

const displayValue = computed(() => {
  return selectedOption.value ? selectedOption.value.label : props.placeholder || '请选择'
})

const updateDropdownPosition = async () => {
  if (!selectRef.value || !dropdownRef.value) return

  // 等待 DOM 完全渲染（尤其是下拉框高度）
  await nextTick()
  await new Promise(requestAnimationFrame)

  const rect = selectRef.value.getBoundingClientRect()
  const dropdownHeight = dropdownRef.value.offsetHeight
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  isReverse.value = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

  dropdownStyle.value = {
    position: 'fixed',
    left: rect.left + 'px',
    width: rect.width + 'px',
    top: !isReverse.value ? rect.bottom + 5 + 'px' : 'auto',
    bottom: isReverse.value ? window.innerHeight - rect.top + 5 + 'px' : 'auto',
    zIndex: 9999,
  }
}

const toggleDropdown = async () => {
  if (props.disabled) return

  isOpen.value = !isOpen.value
  emit('toggle', isOpen.value)

  if (isOpen.value) {
    await nextTick()
    await new Promise(requestAnimationFrame)
    await updateDropdownPosition()
  }
}

const selectOption = (value: any, label: string) => {
  selectedOption.value = { value, label }
  emit('update:modelValue', value)
  isOpen.value = false
  emit('toggle', isOpen.value)
}

let selectValue = ref(props.modelValue)

provide('selectValue', selectValue)
provide('selectHandler', selectOption)

function onClick(e: PointerEvent) {
  if (!e) return
  if (
    selectRef.value &&
    !selectRef.value.contains(e.target as Node) &&
    dropdownRef.value &&
    !dropdownRef.value.contains(e.target as Node)
  ) {
    isOpen.value = false
    emit('toggle', isOpen.value)
  }
}

watch(
  () => props.modelValue,
  newValue => {
    if (newValue) window.addEventListener('click', onClick)
    else window.removeEventListener('click', onClick)

    selectValue.value = newValue
    if (slots.default) {
      let slot = slots.default()
      let list = []
      if (slot.length === 1) {
        list = Array.from(slot[0].children as Array<VNode>)
      } else {
        list = slot
      }
      const option = list.find(opt => opt.props.value === newValue)
      if (option) {
        selectedOption.value = option.props
      }
      return
    }
    if (props.options) {
      const option = props.options.find(opt => opt.value === newValue)
      if (option) {
        selectedOption.value = option
      }
    }
  },
  { immediate: true }
)

watch(
  () => props.options,
  newOptions => {
    if (newOptions && props.modelValue) {
      const option = newOptions.find(opt => opt.value === props.modelValue)
      if (option) {
        selectedOption.value = option
      }
    }
  },
  { immediate: true }
)

const onScrollOrResize = () => {
  if (isOpen.value) updateDropdownPosition()
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <div class="select" ref="selectRef">
    <div class="select__wrapper" :class="{ disabled: disabled, active: isOpen }" @click="toggleDropdown">
      <div class="select__label" :class="{ 'is-placeholder': !selectedOption }">
        {{ displayValue }}
      </div>
      <IconLucideChevronLeft class="select__arrow" :class="{ 'is-reverse': isOpen }" width="16" />
    </div>

    <teleport to="body">
      <transition :name="isReverse ? 'zoom-in-bottom' : 'zoom-in-top'" :key="isReverse ? 'bottom' : 'top'">
        <div class="select__dropdown" v-if="isOpen" ref="dropdownRef" :style="dropdownStyle">
          <slot></slot>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style scoped lang="scss">
.select {
  @apply relative w-full;

  &__wrapper {
    @apply flex items-center justify-between cursor-pointer;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: var(--radius-control);
    border: 1px solid var(--color-input-border);
    background: var(--color-input-bg);
    transition:
      border-color var(--dur-hover) ease,
      box-shadow var(--dur-hover) ease;

    &:not(.disabled):hover {
      border-color: var(--color-brand-light);
    }

    &.active {
      border-color: var(--color-brand) !important;
      box-shadow: var(--ring);
    }

    &.disabled {
      background: var(--color-fourth);
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-placeholder {
      color: #999;
    }
  }

  &__arrow {
    color: var(--color-ink-3);
    transform: rotate(-90deg);
    transition: transform 200ms var(--ease-out);

    &.is-reverse {
      transform: rotate(90deg);
    }
  }
}

.select__dropdown {
  max-height: 200px;
  overflow-y: auto;
  background-color: var(--color-card-bg);
  border: 1px solid var(--color-stroke);
  border-radius: 0.75rem;
  box-shadow: var(--shadow-pop);
}

/* 往下展开：从触发器所在的顶部长出来 */
.zoom-in-top-enter-active,
.zoom-in-bottom-enter-active {
  transition:
    transform var(--dur-pop) var(--ease-out),
    opacity var(--dur-pop) var(--ease-out);
}

.zoom-in-top-leave-active,
.zoom-in-bottom-leave-active {
  transition:
    transform 120ms var(--ease-out),
    opacity 120ms var(--ease-out);
}

.zoom-in-top-enter-active,
.zoom-in-top-leave-active {
  transform-origin: center top;
}

/* 往上展开：从底部长出来 */
.zoom-in-bottom-enter-active,
.zoom-in-bottom-leave-active {
  transform-origin: center bottom;
}

.zoom-in-top-enter-from,
.zoom-in-top-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.97);
}

.zoom-in-bottom-enter-from,
.zoom-in-bottom-leave-to {
  opacity: 0;
  transform: translate3d(0, 4px, 0) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .zoom-in-top-enter-from,
  .zoom-in-top-leave-to,
  .zoom-in-bottom-enter-from,
  .zoom-in-bottom-leave-to {
    transform: none;
  }
}
</style>
