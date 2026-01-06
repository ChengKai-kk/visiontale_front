<template>
  <div class="stepbar">
    <div class="stepbar-track">
      <div class="stepbar-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>

    <div class="stepbar-steps">
      <button
        v-for="(s, idx) in steps"
        :key="s.key"
        class="stepbar-step"
        :class="{
          active: idx === currentIndex,
          done: idx < currentIndex,
          locked: idx > currentIndex,
        }"
        type="button"
        :disabled="idx > currentIndex"
        :title="idx > currentIndex ? '请先完成前面的步骤' : s.title"
        @click="go(idx, s.path)"
      >
        <span class="dot"></span>
        <span class="label">{{ s.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

const route = useRoute();
const router = useRouter();

const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});

const progressPercent = computed(() => {
  if (steps.length <= 1) return 0;
  return (currentIndex.value / (steps.length - 1)) * 100;
});

function go(idx, path) {
  // 未来步骤：不允许跳
  if (idx > currentIndex.value) return;
  router.push(path);
}
</script>

<style scoped>
/* 你如果之前 StepProgress.vue 没写样式，这段可直接加；
   如果你把样式放在 global.css 里，那就把下面这段挪到 global.css 即可。 */

.stepbar {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stepbar-track {
  height: 8px;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.stepbar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  border-radius: 999px;
  transition: width 250ms ease;
}

.stepbar-steps {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stepbar-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border 120ms ease;
}

.stepbar-step:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.06);
}

.stepbar-step.active {
  color: var(--text);
  border-color: rgba(255, 138, 61, 0.55);
}

.stepbar-step.done {
  color: rgba(255, 255, 255, 0.75);
}

.stepbar-step.locked {
  opacity: 0.45;
}

.stepbar-step:disabled {
  cursor: not-allowed;
  transform: none;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
}

.stepbar-step.active .dot {
  background: var(--accent);
}

.stepbar-step.done .dot {
  background: rgba(255, 138, 61, 0.7);
}
</style>
