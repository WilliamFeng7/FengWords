<script setup lang="ts">
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
// 部署时可用 ORIGIN 环境变量指定正式域名；没配就用当前请求的域名
const siteOrigin = String(runtimeConfig.public.origin || useRequestURL().origin).replace(/\/$/, '')

const canonicalURL = $computed(() => new URL(route.path, `${siteOrigin}/`).toString())

const nonIndexableRoutePrefixes = [
  '/fsrs',
  '/import',
  '/practice-articles',
  '/practice-sentences',
  '/practice-words',
  '/rrweb',
  '/setting',
  '/test',
  '/words-test',
]

const robotsContent = $computed(() => {
  const hostname = import.meta.client ? window.location.hostname : new URL(`${siteOrigin}/`).hostname
  const isDevelopmentHost = ['localhost', '127.0.0.1'].includes(hostname)
  const isFunctionalPage = nonIndexableRoutePrefixes.some(prefix =>
    route.path === prefix || route.path.startsWith(`${prefix}/`)
  )

  return isDevelopmentHost || isFunctionalPage
    ? 'noindex, nofollow, noarchive'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
})

useHead(() => ({
  link: [
    {
      key: 'canonical',
      rel: 'canonical',
      href: canonicalURL,
    },
  ],
  meta: [
    {
      key: 'robots',
      name: 'robots',
      content: robotsContent,
    },
  ],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
