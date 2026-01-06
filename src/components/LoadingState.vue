<template>
  <div class="loading-state" :class="{ 'loading-state--small': small }">
    <!-- 动画区域 -->
    <div class="loading-animation">
      <!-- 上传阶段 -->
      <div v-if="stage === 'upload'" class="animation animation--upload">
        <div class="emoji cloud">☁️</div>
        <div class="emoji arrow">⬆️</div>
      </div>

      <!-- 处理阶段 -->
      <div v-else-if="stage === 'process'" class="animation animation--process">
        <div class="emoji magic">✨</div>
        <div class="emoji spinner">🌟</div>
      </div>

      <!-- 默认阶段 -->
      <div v-else class="animation animation--default">
        <div class="emoji sun">☀️</div>
      </div>
    </div>

    <!-- 提示文字 -->
    <div class="loading-text">{{ message }}</div>

    <!-- 进度条（可选） -->
    <div v-if="showProgress && progress > 0" class="loading-progress">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: progress + '%' }"
        >
          <div class="progress-shimmer"></div>
        </div>
      </div>
      <div class="progress-text">{{ progress }}%</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  // 加载阶段：upload, process, default
  stage: {
    type: String,
    default: 'default'
  },
  // 提示文字
  message: {
    type: String,
    default: '正在处理中...'
  },
  // 进度百分比 (0-100)
  progress: {
    type: Number,
    default: 0
  },
  // 是否显示进度条
  showProgress: {
    type: Boolean,
    default: true
  },
  // 小尺寸模式
  small: {
    type: Boolean,
    default: false
  }
});
</script>

<style scoped>
.loading-state {
  padding: var(--space-xl);
  text-align: center;
  background: var(--bg-highlight);
  border-radius: var(--radius-md);
  border: 3px dashed var(--primary-sun);
}

.loading-state--small {
  padding: var(--space-lg);
}

.loading-animation {
  margin-bottom: var(--space-lg);
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-state--small .loading-animation {
  height: 60px;
  margin-bottom: var(--space-md);
}

.animation {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.emoji {
  font-size: 64px;
  line-height: 1;
}

.loading-state--small .emoji {
  font-size: 48px;
}

.loading-text {
  font-size: var(--font-lg);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: var(--space-md);
}

.loading-state--small .loading-text {
  font-size: var(--font-base);
  margin-bottom: var(--space-sm);
}

.loading-progress {
  max-width: 400px;
  margin: 0 auto;
}

.progress-bar {
  height: 24px;
  background: var(--bg-card);
  border-radius: var(--radius-full);
  border: 3px solid var(--border-medium);
  overflow: hidden;
  margin-bottom: var(--space-sm);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--primary-sky),
    var(--primary-sun)
  );
  border-radius: var(--radius-full);
  transition: width 500ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.progress-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.5),
    transparent
  );
  animation: shimmer 1.5s infinite;
}

.progress-text {
  font-size: var(--font-lg);
  font-weight: 900;
  color: var(--primary-sky);
}

/* 动画定义 */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 上传动画 */
.animation--upload .cloud {
  animation: float 2s ease-in-out infinite;
}

.animation--upload .arrow {
  animation: arrowUp 1s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}

@keyframes arrowUp {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  50% {
    transform: translateY(-40px);
    opacity: 0.3;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 处理动画 */
.animation--process .magic,
.animation--process .spinner {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 默认动画 */
.animation--default .sun {
  animation: bounce 1.5s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-25px); }
}

/* 响应式 */
@media (max-width: 767px) {
  .emoji {
    font-size: 48px;
  }

  .loading-state--small .emoji {
    font-size: 36px;
  }

  .loading-text {
    font-size: var(--font-base);
  }

  .progress-bar {
    height: 20px;
  }
}
</style>
