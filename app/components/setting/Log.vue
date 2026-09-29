<script setup lang="ts">
// FengWords 更新日志（最新的在最上面）
let logList: { date: string; items: string[] }[] = [
  {
    date: '2026/09/28',
    items: [
      '产品正式更名为 FengWords',
      '全新便当网格（Bento Grid）界面，配色改为纯蓝；新增 10 种系统主题色（设置 → 通用设置），默认蓝色',
      '图标全部换成简约线性图标，点击时带切换动效；全站动画重新打磨，更丝滑',
      '侧边栏可展开 / 收起，收起后悬停显示菜单名称；练习页右侧面板适配各种屏幕尺寸',
      '开关、单选、复选框、数字输入框改为简约风格',
      '新增一键导入自己的词库（/vocab-import）',
      '词典列表展示完整内置书目，尚未上线的词书标注“未开放”',
      '帮助页问答卡片展开互不影响；问题反馈改为通过 GitHub Issues 提交',
    ],
  },
]
</script>

<template>
  <div>
    <div class="log-item" v-for="item in logList" :key="item.date">
      <div class="mb-2">
        <div>日期：{{ item.date }}</div>
        <div>内容：</div>
        <ul class="m-0 pl-5 leading-7">
          <li v-for="(point, i) in item.items" :key="i">{{ point }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.log-item {
  border-bottom: 1px solid var(--color-input-border);
  margin-bottom: 1rem;
}
</style>
