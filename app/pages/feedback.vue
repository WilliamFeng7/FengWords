<script setup lang="ts">
import { BasePage } from '@/base'
import About from '@/components/About.vue'
import { APP_NAME } from '@/core/config/env.ts'

let title = APP_NAME + ' 反馈'
useSeoMeta({
  title: title,
  description: title,
  ogTitle: title,
  ogDescription: title,
  ogUrl: useRequestURL().href,
  twitterTitle: title,
  twitterDescription: title,
})
</script>

<template>
  <BasePage>
    <div class="center pb-12">
      <About />
    </div>
  </BasePage>
</template>

<style scoped lang="scss"></style>
