<script setup lang="ts">
import { APP_NAME, GITHUB, GITHUB_ISSUES } from '@/core/config/env.ts'

// 仓库名（WilliamFeng7/FengWords），直接从地址里取，改仓库时只需改 env.ts
const repoName = GITHUB.replace(/^https?:\/\/github\.com\//, '')
</script>

<template>
  <div class="about-bento">
    <section class="tile tile--brand about-hero tile-enter" style="--i: 0">
      <h1>{{ APP_NAME }}</h1>
      <p class="text-xl">{{ $t('hero_tagline') }}</p>
      <p>{{ $t('hero_desc') }}</p>
    </section>

    <section class="tile about-github tile-enter" style="--i: 1">
      <div class="gh-head">
        <div class="tile-icon"><IconLucideGithub /></div>
        <div class="min-w-0">
          <div class="gh-title">GitHub</div>
          <a class="gh-repo" :href="GITHUB" target="_blank" rel="noopener">{{ repoName }}</a>
        </div>
      </div>
      <p class="gh-desc">{{ $t('qa13_q2') }}</p>
      <div class="gh-actions">
        <a class="gh-btn gh-btn--primary" :href="GITHUB_ISSUES" target="_blank" rel="noopener">
          <IconLucideMessageSquarePlus />
          <span>{{ $t('feedback') }} · Issues</span>
        </a>
        <a class="gh-btn" :href="GITHUB" target="_blank" rel="noopener">
          <IconLucideGithub />
          <span>{{ $t('hero_cta_github') }}</span>
          <IconLucideArrowUpRight class="gh-arrow" />
        </a>
      </div>
    </section>

    <section class="tile about-cell tile-enter" style="--i: 2">
      <div class="tile-icon"><IconLineMdQuestionCircle /></div>
      <div class="">常见问题： <RouterLink to="/help">常见问题解答</RouterLink></div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.about-bento {
  width: min(100%, 52rem);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bento-gap);
}

.about-hero {
  grid-column: 1 / -1;
  padding: 2rem;

  h1 {
    margin: 0 0 0.75rem;
    font-family: var(--font-display);
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1;
    color: #fff;
  }

  p {
    margin: 0.5rem 0 0;
    line-height: 1.7;
  }

  a {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.about-github {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.gh-head {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.gh-title {
  font-weight: 700;
  color: var(--color-ink-1);
  line-height: 1.3;
}

.gh-repo {
  font-size: 0.9rem;
  font-family: var(--word-font-family);
  word-break: break-all;
}

.gh-desc {
  margin: 0;
  color: var(--color-ink-2);
  line-height: 1.7;
}

.gh-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
}

.gh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  height: 2.375rem;
  padding: 0 1rem;
  border-radius: var(--radius-control);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-main-text);
  background: var(--color-tile);
  box-shadow: inset 0 0 0 1px var(--color-stroke-strong);
  transition:
    background-color var(--dur-hover) ease,
    box-shadow var(--dur-hover) ease,
    color var(--dur-hover) ease,
    transform 160ms var(--ease-out);

  svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .gh-arrow {
    width: 0.875rem;
    height: 0.875rem;
    opacity: 0.6;
    transition: transform 220ms var(--ease-out);
  }

  &:active {
    transform: scale(0.97);
    transition-duration: var(--dur-hover), var(--dur-hover), var(--dur-hover), var(--dur-press);
  }

  &--primary {
    color: #fff;
    background: var(--color-brand);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.14) inset,
      0 6px 14px -8px rgba(var(--color-brand-rgb), 0.6);
  }
}

@media (hover: hover) and (pointer: fine) {
  .gh-btn:not(.gh-btn--primary):hover {
    background: var(--color-tile-sunken);
    box-shadow: inset 0 0 0 1px var(--color-ink-3);
    color: var(--color-ink-1);

    .gh-arrow {
      transform: translate(2px, -2px);
    }
  }

  .gh-btn--primary:hover {
    background: var(--color-brand-hover);
    color: #fff;
  }
}

.about-cell {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-height: 4.5rem;
}

@media (max-width: 640px) {
  .about-bento {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gh-btn:active {
    transform: none;
  }
}
</style>
