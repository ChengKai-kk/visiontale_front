<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🖼️ 生成图像</h1>
        <p class="subtitle">并发生成插图并实时回显</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !canStart">
          {{ busy ? "正在生成插图..." : sceneImages.length ? "重新生成插图" : "生成插图" }}
        </button>

        <LoadingState
          v-if="busy"
          :stage="currentStage"
          :message="friendlyMessage"
          :progress="taskProgress"
          :show-progress="taskProgress > 0"
          small
        />

        <div v-else class="hint">
          {{
            errorText ||
            (sceneImages.length
              ? `已生成 ${doneImagesCount} / ${scenes.length} 张场景图。`
              : "请先生成角色和分镜，再在这里逐幕生成插图。")
          }}
        </div>
      </div>

      <div v-if="scenes.length" class="sceneList">
        <article v-for="scene in scenes" :key="scene.id" class="sceneCard">
          <div class="sceneTop">
            <div class="sceneOrder">0{{ scene.order }}</div>
            <div class="sceneHeading">
              <h3>{{ scene.sceneTitle }}</h3>
              <p>{{ scene.sceneText }}</p>
            </div>
            <span class="stateTag" :class="stateClass(scene.order)">
              {{ stateLabel(scene.order) }}
            </span>
          </div>

          <div class="sceneGrid">
            <div class="imagePanel">
              <img
                v-if="imageByOrder[scene.order]?.imageUrl"
                :src="imageByOrder[scene.order].imageUrl"
                :alt="scene.sceneTitle"
                class="sceneImage"
              />
              <div v-else class="imagePlaceholder">
                <div v-if="sceneStatus(scene.order) === 'running' || sceneStatus(scene.order) === 'queued'" class="spinner"></div>
                <span>{{ placeholderText(scene.order) }}</span>
              </div>
            </div>

            <div class="metaPanel">
              <div class="metaBlock">
                <span class="metaLabel">场景旁白</span>
                <p>{{ imageByOrder[scene.order]?.caption || scene.narration }}</p>
              </div>

              <div class="metaBlock">
                <span class="metaLabel">引用角色</span>
                <div class="chips">
                  <span v-for="id in scene.characterIds || []" :key="id" class="chip">
                    {{ nameFor(id) }}
                  </span>
                </div>
              </div>

              <div class="metaBlock" v-if="imageByOrder[scene.order]">
                <span class="metaLabel">usedCharacterIds</span>
                <code>{{ (imageByOrder[scene.order].usedCharacterIds || []).join(", ") }}</code>
              </div>

              <div class="metaBlock" v-if="imageByOrder[scene.order]">
                <span class="metaLabel">usedRefImages</span>
                <div class="refList">
                  <code v-for="refUrl in imageByOrder[scene.order].usedRefImages || []" :key="refUrl">
                    {{ shortRef(refUrl) }}
                  </code>
                </div>
              </div>

              <div class="metaBlock" v-if="imageByOrder[scene.order]?.error">
                <span class="metaLabel">错误信息</span>
                <code>{{ imageByOrder[scene.order].error }}</code>
              </div>
            </div>
          </div>

          <details class="details" v-if="imageByOrder[scene.order]">
            <summary>查看 finalPrompt</summary>
            <pre>{{ imageByOrder[scene.order].finalPrompt }}</pre>
          </details>
        </article>
      </div>

      <div v-else class="panel emptyBig">
        还没有分镜数据。请先到上一页生成分镜，系统才能把角色图引用映射到场景图。
      </div>
    </div>

    <NavigationBar :disable-next="!scenes.length || doneImagesCount <= 0" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";
import { fetchSession, isNotFoundError, pollTask, startTask } from "../services/backendApi";

const sessionData = ref({ artifacts: {} });
const busy = ref(false);
const taskProgress = ref(0);
const errorText = ref("");
let sessionRefreshTimer = 0;

const scenes = computed(() => sessionData.value?.artifacts?.scenes?.items || []);
const characters = computed(() => sessionData.value?.artifacts?.characters?.items || []);
const sceneImages = computed(() => sessionData.value?.artifacts?.sceneImages?.items || []);

const canStart = computed(() => scenes.value.length > 0 && characters.value.length > 0);

const nameMap = computed(() =>
  Object.fromEntries(
    characters.value.map((item) => [String(item?.id || "").trim(), String(item?.name || "").trim()])
  )
);

const imageByOrder = computed(() => {
  const map = {};
  sceneImages.value.forEach((item) => {
    map[Number(item?.order || 0)] = item;
  });
  return map;
});

const doneImagesCount = computed(
  () => sceneImages.value.filter((item) => String(item?.imageUrl || "").trim()).length
);

function nameFor(id) {
  return nameMap.value[id] || id;
}

function shortRef(url) {
  const text = String(url || "");
  if (text.length <= 64) return text;
  return `${text.slice(0, 26)}...${text.slice(-28)}`;
}

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
}

const friendlyMessage = computed(() => {
  if (taskProgress.value > 0) return `并发渲染中 ${doneImagesCount.value}/${scenes.value.length} · ${taskProgress.value}%`;
  return "准备并发生成插图...";
});

const currentStage = computed(() => (busy.value ? "process" : "default"));

async function loadSession() {
  try {
    sessionData.value = await fetchSession();
  } catch (e) {
    if (isNotFoundError(e)) {
      sessionData.value = { artifacts: {} };
      return;
    }
    errorText.value = String(e?.message || "读取会话失败");
  }
}

function sceneStatus(order) {
  const raw = String(imageByOrder.value[Number(order)]?.status || "").toLowerCase();
  if (raw === "done" || raw === "failed" || raw === "running" || raw === "queued") return raw;
  if (String(imageByOrder.value[Number(order)]?.imageUrl || "").trim()) return "done";
  return busy.value ? "queued" : "waiting";
}

function stateLabel(order) {
  const st = sceneStatus(order);
  if (st === "done") return "已生成";
  if (st === "failed") return "失败";
  if (st === "running") return "生成中";
  if (st === "queued") return "排队中";
  return "等待中";
}

function stateClass(order) {
  const st = sceneStatus(order);
  return {
    done: st === "done",
    failed: st === "failed",
    running: st === "running",
    queued: st === "queued" || st === "waiting",
  };
}

function placeholderText(order) {
  const st = sceneStatus(order);
  if (st === "failed") return "本幕生成失败";
  if (st === "running") return "本幕渲染中...";
  if (st === "queued") return "等待分配渲染任务...";
  return "尚未生成";
}

function stopSessionRefresh() {
  if (sessionRefreshTimer) {
    window.clearInterval(sessionRefreshTimer);
    sessionRefreshTimer = 0;
  }
}

function startSessionRefresh() {
  stopSessionRefresh();
  sessionRefreshTimer = window.setInterval(() => {
    loadSession().catch(() => {});
  }, 1000);
}

async function startGenerate() {
  busy.value = true;
  taskProgress.value = 0;
  errorText.value = "";

  try {
    const started = await startTask("/api/image/scenes/start", {
      size: "2K",
      watermark: false,
      concurrency: 3,
    });
    const taskId = String(started?.taskId || "").trim();
    if (!taskId) throw new Error("missing_task_id");

    startSessionRefresh();
    const task = await pollTask(taskId, {
      onUpdate: applyTask,
      timeoutMs: 12 * 60 * 1000,
      intervalMs: 1300,
    });

    await loadSession();

    if (Number(task?.result?.errors || 0) > 0) {
      errorText.value = `部分场景生成失败：${task.result.errors} 幕`;
    }
  } catch (e) {
    errorText.value = String(e?.message || "场景图生成失败");
  } finally {
    stopSessionRefresh();
    busy.value = false;
  }
}

onMounted(async () => {
  await loadSession();
});

onBeforeUnmount(() => {
  stopSessionRefresh();
});
</script>

<style scoped>
.sceneList,
.sceneCard,
.metaPanel {
  display: grid;
  gap: var(--space-md);
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space-md);
}

.contentScroll {
  gap: var(--space-md);
}

.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.head,
.sceneTop {
  display: flex;
  gap: var(--space-md);
}

.head,
.sceneTop {
  justify-content: space-between;
  align-items: center;
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.sceneHeading h3 {
  margin: 0;
}

.subtitle,
.hint,
.sceneHeading p,
.metaPanel p {
  color: var(--text-secondary);
}

.sceneHeading p,
.metaPanel p {
  margin: 6px 0 0;
}

.toolbar,
.panel,
.sceneCard {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.82);
  border: 2px solid rgba(255, 213, 79, 0.55);
  padding: var(--space-lg);
}

.btn {
  padding: 12px 18px;
  border: 0;
  border-radius: 18px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.btn.primary {
  color: var(--text-white);
  background: linear-gradient(135deg, var(--primary-sky), var(--primary-grass));
}

.sceneOrder,
.stateTag,
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 800;
}

.sceneOrder {
  min-width: 58px;
  height: 58px;
  color: var(--text-white);
  background: linear-gradient(135deg, var(--primary-sky), var(--primary-candy));
}

.sceneGrid {
  display: grid;
  grid-template-columns: minmax(320px, 480px) 1fr;
  gap: var(--space-lg);
}

.imagePanel {
  min-height: 280px;
}

.sceneImage,
.imagePlaceholder {
  width: 100%;
  min-height: 280px;
  aspect-ratio: 16 / 9;
  border-radius: 22px;
  border: 3px solid rgba(255, 213, 79, 0.5);
}

.sceneImage {
  object-fit: cover;
  background: rgba(255, 249, 230, 0.6);
}

.imagePlaceholder {
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--text-secondary);
  background: rgba(255, 249, 230, 0.68);
}

.spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 4px solid rgba(79, 195, 247, 0.18);
  border-top-color: var(--primary-sky);
  animation: spin 1s linear infinite;
}

.chips,
.refList {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chip {
  padding: 8px 12px;
  background: rgba(79, 195, 247, 0.16);
  color: #1d7593;
}

.stateTag {
  padding: 8px 12px;
  color: var(--text-secondary);
  background: rgba(255, 183, 77, 0.18);
}

.stateTag.done {
  color: #18794e;
  background: rgba(129, 199, 132, 0.28);
}

.stateTag.running {
  color: #7a4d00;
  background: rgba(255, 183, 77, 0.32);
}

.stateTag.failed {
  color: #b42318;
  background: rgba(255, 228, 228, 0.9);
}

.metaBlock {
  display: grid;
  gap: 8px;
}

.metaLabel {
  font-size: 14px;
  color: var(--text-secondary);
}

.details summary {
  cursor: pointer;
  font-weight: 800;
}

.details pre {
  margin: 12px 0 0;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 249, 230, 0.74);
  white-space: pre-wrap;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .sceneGrid {
    grid-template-columns: 1fr;
  }

  .sceneTop {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
