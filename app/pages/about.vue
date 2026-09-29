<script setup lang="ts">
import { BasePage } from '@/base'
import About from '@/components/About.vue'
import { APP_NAME } from '@/core/config/env.ts'

const { t } = useI18n()

const title = APP_NAME + ' — ' + t('about_page_title')
useSeoMeta({
  title: title,
  description: t('about_page_desc'),
  ogTitle: title,
  ogDescription: t('about_page_desc'),
  ogUrl: useRequestURL().href,
  twitterTitle: title,
  twitterDescription: t('about_page_desc'),
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
