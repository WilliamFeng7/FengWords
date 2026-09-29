<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import Tooltip from '../Tooltip.vue'
import BaseButton from '../BaseButton.vue'
import { useI18n } from 'vue-i18n'
import { modalStack } from './stack.ts'

export interface ModalProps {
  modelValue?: boolean
  showClose?: boolean
  title?: string
  content?: string
  fullScreen?: boolean
  padding?: boolean
  footer?: boolean
  header?: boolean
  confirmButtonText?: string
  cancelButtonText?: string
  keyboard?: boolean
  closeOnClickBg?: boolean
  onConfirm?: any
  beforeClose?: any
  t?: any
}

const props = withDefaults(defineProps<ModalProps>(), {
  modelValue: undefined,
  showClose: true,
  closeOnClickBg: true,
  fullScreen: false,
  footer: false,
  header: true,
  confirmButtonText: '',
  cancelButtonText: '',
  keyboard: true,
})

//在Message.confirm里面，因为是一个新的vue实例，所有没有i18n，只能靠外面传
const localeT = $computed(() => {
  if (props.t) return props.t
  const { t: i18nT } = useI18n()
  return i18nT
})

const emit = defineEmits(['update:modelValue', 'close', 'ok', 'cancel'])

// keep in sync with the enter / leave animations below
const ENTER_MS = 260
const LEAVE_MS = 180

let confirmButtonLoading = $ref(false)
let zIndex = $ref(999)
let visible = $ref(false)
let leaving = $ref(false)
let openTime = Date.now()
let id = Date.now()
let closeSeq = 0

async function close() {
  if (!visible || leaving) {
    return
  }
  if (props.beforeClose) {
    if (!(await props.beforeClose())) {
      return
    }
  }
  //让入场动画先播完，避免弹框闪烁
  const wait = Math.max(0, ENTER_MS - (Date.now() - openTime))
  const seq = ++closeSeq
  return new Promise(resolve => {
    setTimeout(() => {
      if (seq !== closeSeq) return resolve(false)
      leaving = true
      setTimeout(() => {
        if (seq !== closeSeq) return resolve(false)
        emit('update:modelValue', false)
        emit('close')
        visible = false
        leaving = false
        resolve(true)
        let rIndex = modalStack.findIndex(item => item.id === id)
        if (rIndex > -1) {
          modalStack.splice(rIndex, 1)
        }
      }, LEAVE_MS)
    }, wait)
  })
}

function open() {
  // reopened while still animating out: cancel that close and drop its stack entry
  closeSeq++
  let rIndex = modalStack.findIndex(item => item.id === id)
  if (visible && rIndex > -1) modalStack.splice(rIndex, 1)
  id = Date.now()
  openTime = Date.now()
  modalStack.push({ id, close })
  zIndex = 999 + modalStack.length
  leaving = false
  visible = true
}

watch(
  () => props.modelValue,
  n => {
    if (n) {
      open()
    } else {
      close()
    }
  }
)

onMounted(() => {
  if (props.modelValue === undefined) {
    open()
  }
})

onUnmounted(() => {
  if (props.modelValue === undefined) {
    visible = false
    let rIndex = modalStack.findIndex(item => item.id === id)
    if (rIndex > -1) {
      modalStack.splice(rIndex, 1)
    }
  }
})

watch(
  () => visible,
  n => {
    if (n) window.addEventListener('keydown', onKeyDown)
    else window.removeEventListener('keydown', onKeyDown)
  }
)

async function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.keyboard) {
    let lastItem = modalStack[modalStack.length - 1]
    if (lastItem?.id === id) {
      await cancel()
    }
  }
}

async function ok() {
  if (props.onConfirm) {
    confirmButtonLoading = true
    let res = await props.onConfirm()
    confirmButtonLoading = false
    if (res === false) return
  }
  emit('ok')
  await close()
}

async function cancel() {
  emit('cancel')
  await close()
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-root" :class="{ 'is-leaving': leaving }" :style="{ 'z-index': zIndex }" v-if="visible">
      <div class="modal-mask" v-if="!fullScreen" @click.stop="closeOnClickBg && close()"></div>
      <div class="modal" :class="[fullScreen ? 'full' : 'window', content && ' w-84']">
        <Tooltip :title="localeT('close')">
          <IconLineMdClose @click="close" v-if="showClose" class="close cursor-pointer" width="24" />
        </Tooltip>
        <div class="modal-header" v-if="header">
          <div class="title">{{ props.title }}</div>
        </div>
        <div class="modal-body" :class="{ padding }">
          <slot></slot>
          <div v-if="content" class="pt-4 max-h-60vh">{{ content }}</div>
        </div>
        <div class="modal-footer" v-if="footer">
          <div class="left flex items-end">
            <slot name="footer-left"></slot>
          </div>
          <div class="right">
            <BaseButton type="info" @click="cancel">{{ cancelButtonText || localeT('cancel') }}</BaseButton>
            <BaseButton id="dialog-ok" :loading="confirmButtonLoading" @click="ok"
              >{{ confirmButtonText || localeT('confirm') }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* modal: centered (not trigger-anchored), backdrop and panel move as one surface */
@keyframes modal-mask-in {
  from {
    opacity: 0;
  }
}

@keyframes modal-mask-out {
  to {
    opacity: 0;
  }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0) scale(0.96);
  }
}

@keyframes modal-out {
  to {
    opacity: 0;
    transform: scale(0.97);
  }
}

@keyframes modal-full-in {
  from {
    opacity: 0;
    transform: translate3d(0, 16px, 0);
  }
}

@keyframes modal-full-out {
  to {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }
}

.modal-root {
  @apply fixed top-0 left-0 z-999 flex items-center justify-center w-full h-full overflow-hidden;

  .modal-mask {
    @apply fixed top-0 left-0 w-full h-full;
    background: rgba(11, 13, 23, 0.5);
    animation: modal-mask-in 260ms var(--ease-out) backwards;
  }

  .window {
    animation: modal-in 260ms var(--ease-out) backwards;
    border-radius: var(--radius-tile);
    border: 1px solid var(--color-stroke);
    box-shadow: var(--shadow-pop);
  }

  .full {
    @apply w-full h-full;
    animation: modal-full-in 300ms var(--ease-out) backwards;
  }

  &.is-leaving {
    pointer-events: none;

    .modal-mask {
      animation: modal-mask-out 180ms var(--ease-out) forwards;
    }

    .window {
      animation: modal-out 180ms var(--ease-out) forwards;
    }

    .full {
      animation: modal-full-out 180ms var(--ease-out) forwards;
    }
  }

  .modal {
    @apply relative overflow-hidden flex flex-col;
    background: var(--color-card-bg);

    .close {
      @apply absolute right-1.2rem top-1.2rem z-999;
      color: var(--color-ink-3);
      transition:
        color var(--dur-hover) ease,
        transform 200ms var(--ease-out);

      &:hover {
        color: var(--color-ink-1);
      }

      &:active {
        transform: scale(0.9);
      }
    }

    .modal-header {
      @apply flex justify-between items-center p-5 pb-0;

      .title {
        @apply font-bold text-xl;
        letter-spacing: -0.01em;
      }
    }

    .modal-body {
      @apply box-border text-main-text font-normal text-base leading-6 w-full flex-1 overflow-hidden flex;

      &.padding {
        @apply p-1 px-5;
      }
    }

    .modal-footer {
      @apply flex justify-between p-5;
    }
  }
}
</style>
