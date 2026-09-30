<script setup lang="ts">

</script>

<template>
  <div class="base-page">
    <div class="page">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
 * 页面铺满侧栏右侧的空间，四周都是同一个留白（--page-gutter，与卡片间距相同）：
 * 侧栏展开或收起，页面左缘与侧栏的距离始终一样。只有超宽屏才在 --page-max 处停住（靠左，与侧栏的距离仍不变）。
 */
.page {
  box-sizing: border-box;
  width: auto;
  max-width: var(--page-max);
  min-height: calc(100vh - var(--page-gutter));
  margin: var(--page-gutter) var(--page-gutter) 0;
  /* 不给整页做淡入：整页一大块合成层在大屏上很贵；入场由里面的卡片负责 */
}


/* 手机：两边 12px 留白（--page-gutter），和卡片间距一致，内容不贴边 */
@media (max-width: 768px) {
  .page {
    max-width: none;
    margin: 0.25rem var(--page-gutter) 0;
    min-height: auto;
  }
}
</style>
