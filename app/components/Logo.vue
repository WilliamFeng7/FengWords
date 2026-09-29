<script setup lang="ts">
import { useRouter } from 'vue-router'
import { APP_NAME } from '@/core/config/env'

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="logo" @click="goHome" :title="APP_NAME">
    <!-- 键帽 F：盲打时食指找到的那颗带凸点的键 -->
    <span class="logo-mark" aria-hidden="true">F<i class="logo-bump"></i></span>
    <span class="logo-word">{{ APP_NAME }}</span>
  </div>
</template>

<style scoped lang="scss">
.logo {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
  user-select: none;
}

.logo-mark {
  position: relative;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: var(--color-brand);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.15rem;
  line-height: 1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -3px 0 rgba(0, 0, 0, 0.18),
    0 4px 10px -4px rgba(var(--color-brand-rgb), 0.55);
  transition: transform 160ms var(--ease-out);
}

.logo-bump {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  width: 0.5rem;
  height: 2px;
  margin-left: -0.25rem;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.75);
}

.logo:active .logo-mark {
  transform: translateY(1px) scale(0.96);
}

.logo-word {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: 0.01em;
  color: var(--color-ink-1);
  white-space: nowrap;
}
</style>
