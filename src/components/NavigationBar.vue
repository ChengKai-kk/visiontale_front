<template>
  <nav class="nav-bar">
    <!-- 上一步按钮 -->
    <button
      class="nav-btn nav-btn--prev"
      :disabled="!prevStep"
      @click="handlePrev"
      type="button"
    >
      <span class="nav-btn__icon">←</span>
      <span class="nav-btn__text">{{ prevStep?.title || '返回' }}</span>
    </button>

    <!-- 中间状态显示 -->
    <div class="nav-center">
      <div class="nav-step">
        <span class="nav-step__emoji">{{ stepEmoji }}</span>
        <span class="nav-step__text">{{ currentStep?.title }}</span>
      </div>
      <div class="nav-progress">
        第 {{ currentIndex + 1 }} 步，共 {{ totalSteps }} 步
      </div>
    </div>

    <!-- 下一步按钮 -->
    <button
      class="nav-btn nav-btn--next"
      :disabled="!canGoNext"
      @click="handleNext"
      type="button"
    >
      <span class="nav-btn__text">{{ nextStep?.title || '继续' }}</span>
      <span class="nav-btn__icon">→</span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { steps } from '../router';

const props = defineProps({
  // 父组件可以禁用下一步（例如未完成必要操作）
  disableNext: {
    type: Boolean,
    default: false
  },
  // 跳转前的自定义验证函数
  beforeNext: {
    type: Function,
    default: null
  }
});

const router = useRouter();
const route = useRoute();

// 步骤 Emoji 映射
const stepEmojis = {
  photo: '📷',
  dialog: '🎤',
  story: '📖',
  split: '✂️',
  images: '🖼️',
  storybook: '📚',
  video: '🎬'
};

const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});

const currentStep = computed(() => steps[currentIndex.value]);
const prevStep = computed(() =>
  currentIndex.value > 0 ? steps[currentIndex.value - 1] : null
);
const nextStep = computed(() =>
  currentIndex.value < steps.length - 1 ? steps[currentIndex.value + 1] : null
);
const totalSteps = computed(() => steps.length);
const stepEmoji = computed(() =>
  stepEmojis[currentStep.value?.key] || '✨'
);

const canGoNext = computed(() => {
  return !!nextStep.value && !props.disableNext;
});

function handlePrev() {
  if (!prevStep.value) return;
  router.push(prevStep.value.path);
}

async function handleNext() {
  if (!canGoNext.value) return;

  // 如果有自定义验证，先执行
  if (props.beforeNext) {
    const result = await props.beforeNext();
    if (result === false) return; // 验证失败，阻止跳转
  }

  router.push(nextStep.value.path);
}
</script>

<style scoped>
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-md);
  background: var(--bg-card);
  border-top: 4px solid var(--border-accent);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  margin-top: var(--space-md);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 3px solid currentColor;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  font-size: var(--font-base);
  font-weight: 700;
  cursor: pointer;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-button);
  min-width: 120px;
  position: relative;
}

.nav-btn--prev {
  color: var(--primary-sky);
  border-color: var(--primary-sky);
}

.nav-btn--prev:hover:not(:disabled) {
  background: var(--primary-sky);
  color: var(--text-white);
  transform: translateY(-3px);
  box-shadow: 0 7px 0 rgba(0, 0, 0, 0.15);
}

.nav-btn--next {
  background: linear-gradient(
    135deg,
    var(--primary-sun) 0%,
    var(--primary-candy) 100%
  );
  color: var(--text-white);
  border-color: var(--primary-sun);
}

.nav-btn--next:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    #FFA726 0%,
    #F06292 100%
  );
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 7px 0 rgba(0, 0, 0, 0.15);
}

.nav-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.15);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  border-color: var(--border-light);
  color: var(--text-muted);
  background: var(--bg-panel);
}

.nav-btn__icon {
  font-size: var(--font-xl);
  font-weight: 900;
  line-height: 1;
}

.nav-btn__text {
  font-size: var(--font-sm);
}

.nav-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.nav-step {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.nav-step__emoji {
  font-size: var(--font-lg);
  line-height: 1;
}

.nav-step__text {
  font-size: var(--font-base);
  font-weight: 800;
  color: var(--text-primary);
}

.nav-progress {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  font-weight: 600;
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .nav-bar {
    padding: var(--space-sm) var(--space-xs);
    gap: var(--space-xs);
    margin-top: var(--space-sm);
  }

  .nav-btn {
    min-width: 50px;
    padding: var(--space-xs) var(--space-sm);
    justify-content: center;
  }

  .nav-btn__text {
    display: none;
  }

  .nav-btn__icon {
    font-size: var(--font-xl);
  }

  .nav-step__emoji {
    font-size: var(--font-base);
  }

  .nav-step__text {
    font-size: var(--font-xs);
  }

  .nav-progress {
    font-size: 10px;
  }
}

/* 手机 (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .nav-bar {
    padding: var(--space-sm) var(--space-sm);
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .nav-btn {
    min-width: 60px;
    padding: var(--space-sm);
    justify-content: center;
  }

  .nav-btn__text {
    display: none;
  }

  .nav-btn__icon {
    font-size: var(--font-2xl);
  }

  .nav-step__emoji {
    font-size: var(--font-lg);
  }

  .nav-step__text {
    font-size: var(--font-sm);
  }

  .nav-progress {
    font-size: 11px;
  }
}

/* 平板竖屏 (768px - 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  .nav-bar {
    padding: var(--space-sm) var(--space-md);
    gap: var(--space-sm);
  }

  .nav-btn {
    min-width: 100px;
    padding: var(--space-sm) var(--space-md);
  }

  .nav-btn__text {
    font-size: var(--font-sm);
  }

  .nav-step__text {
    font-size: var(--font-base);
  }
}

/* 平板横屏/小笔记本 (1024px - 1279px) - 关键优化 */
@media (min-width: 1024px) and (max-width: 1279px) {
  .nav-bar {
    padding: var(--space-sm) var(--space-lg);
    gap: var(--space-md);
  }

  .nav-btn {
    min-width: 110px;
    padding: var(--space-sm) var(--space-md);
  }

  .nav-btn__icon {
    font-size: var(--font-lg);
  }

  .nav-step__emoji {
    font-size: var(--font-lg);
  }
}

/* 桌面端及以上 (>= 1280px) */
@media (min-width: 1280px) {
  .nav-bar {
    padding: var(--space-md) var(--space-lg);
  }

  .nav-btn {
    min-width: 130px;
  }
}
</style>
