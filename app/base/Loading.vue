<script setup lang="ts">

</script>

<template>
  <div class="loading-veil">
    <IconEosIconsLoading class="text-3xl"/>
  </div>
</template>

<style scoped lang="scss">
.loading-veil {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  border-radius: inherit;
  color: var(--color-brand-text);
  background: rgba(255, 255, 255, 0.7);
  animation: fade-in 160ms ease-out backwards;
}

:global(html.dark) .loading-veil {
  background: rgba(20, 23, 38, 0.72);
}
</style>
