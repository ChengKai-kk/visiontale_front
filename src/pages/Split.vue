<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>✂️ 生成分镜</h1>
        <p class="subtitle">拆分 6 幕分镜并绑定角色</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !story || !characters.length">
          {{ busy ? "正在生成分镜..." : scenes.length ? "重新生成分镜" : "生成分镜" }}
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
            (scenes.length
              ? "每幕都带有 characterIds，可直接作为图像生成输入。"
              : "先完成角色和故事生成，再在这里生成分镜。")
          }}
        </div>
      </div>

      <div class="grid">
        <div class="panel sidePanel">
          <h3 class="panelTitle">故事概要</h3>
          <div v-if="story" class="storySummary">
            <div class="summaryTitle">{{ story.title }}</div>
            <div class="summaryText">{{ story.moral }}</div>
            <div class="summaryMeta">
              <span>{{ storyReq?.hero }}</span>
              <span>·</span>
              <span>{{ storyReq?.setting }}</span>
            </div>
          </div>
          <div v-else class="emptyBig">还没有故事内容，请先回上一页生成故事。</div>
        </div>

        <div class="panel">
          <div class="panelTop">
            <h3 class="panelTitle">分镜列表</h3>
            <span class="badge" :class="{ done: scenes.length > 0 }">
              {{ scenes.length ? `${scenes.length} 幕` : "待生成" }}
            </span>
          </div>

          <div v-if="scenes.length" class="sceneList">
            <article v-for="scene in scenes" :key="scene.id" class="sceneCard">
              <div class="sceneTop">
                <div class="sceneOrder">0{{ scene.order }}</div>
                <div>
                  <div class="sceneTitle">{{ scene.sceneTitle }}</div>
                  <div class="sceneText">{{ scene.sceneText }}</div>
                </div>
              </div>

              <div class="chips">
                <span v-for="id in scene.characterIds || []" :key="id" class="chip">
                  {{ nameFor(id) }}
                </span>
              </div>

              <div class="sceneBlock">
                <span class="blockLabel">旁白</span>
                <p>{{ scene.narration }}</p>
              </div>

              <details class="sceneDetails">
                <summary>查看场景 Prompt 与引用说明</summary>
                <div class="detailsBody">
                  <p><b>Prompt</b>：{{ scene.imagePrompt }}</p>
                  <p><b>Reference Note</b>：{{ scene.referenceNote }}</p>
                </div>
              </details>
            </article>
          </div>

          <div v-else class="emptyBig">
            点击顶部按钮后，这里会生成 6 幕分镜，并明确写出每幕使用哪些角色。
          </div>
        </div>
      </div>
    </div>

    <NavigationBar :disable-next="!scenes.length" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";
import { fetchSession, isNotFoundError, runTaskFlow } from "../services/backendApi";

const sessionData = ref({ artifacts: {} });
const busy = ref(false);
const taskProgress = ref(0);
const taskStage = ref("");
const errorText = ref("");

const storyReq = computed(() => sessionData.value?.artifacts?.storyReq || null);
const story = computed(() => sessionData.value?.artifacts?.story || null);
const scenes = computed(() => sessionData.value?.artifacts?.scenes?.items || []);
const characters = computed(() => sessionData.value?.artifacts?.characters?.items || []);

const nameMap = computed(() =>
  Object.fromEntries(
    characters.value.map((item) => [String(item?.id || "").trim(), String(item?.name || "").trim()])
  )
);

function nameFor(id) {
  return nameMap.value[id] || id;
}

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
  taskStage.value = String(task?.stage || "");
}

const friendlyMessage = computed(() => {
  if (taskStage.value === "LOAD_STORY") return "正在读取故事内容...";
  if (taskStage.value === "LLM") return "正在拆分分镜与角色引用...";
  if (taskProgress.value > 0) return `正在生成分镜... ${taskProgress.value}%`;
  return "准备生成分镜...";
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

async function startGenerate() {
  busy.value = true;
  errorText.value = "";
  taskProgress.value = 0;
  taskStage.value = "";

  try {
    const { session } = await runTaskFlow({
      startPath: "/api/story/split/start",
      payload: { maxScenes: 6 },
      onUpdate: applyTask,
      timeoutMs: 3 * 60 * 1000,
      intervalMs: 1200,
    });
    sessionData.value = session;
  } catch (e) {
    errorText.value = String(e?.message || "分镜生成失败");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadSession();
});
</script>

<style scoped>
.sceneList,
.sceneCard,
.storySummary {
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
.panelTop,
.sceneTop {
  display: flex;
  gap: var(--space-md);
}

.head,
.panelTop {
  justify-content: space-between;
  align-items: center;
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.panelTitle,
.summaryTitle,
.sceneTitle {
  margin: 0;
}

.subtitle,
.hint,
.sceneText,
.summaryText,
.detailsBody p {
  color: var(--text-secondary);
}

.toolbar,
.panel {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(255, 213, 79, 0.55);
  padding: var(--space-lg);
}

.grid {
  display: grid;
  grid-template-columns: 0.72fr 1.28fr;
  gap: var(--space-lg);
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

.storySummary,
.sceneCard,
.emptyBig {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 249, 230, 0.68);
}

.summaryMeta,
.chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.sceneOrder,
.chip,
.badge {
  border-radius: 999px;
  font-weight: 800;
}

.sceneOrder {
  min-width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  color: var(--text-white);
  background: linear-gradient(135deg, var(--primary-sky), var(--primary-candy));
}

.chip {
  padding: 8px 12px;
  background: rgba(79, 195, 247, 0.16);
  color: #1d7593;
}

.sceneBlock {
  display: grid;
  gap: 6px;
}

.sceneBlock p {
  margin: 0;
}

.blockLabel {
  font-size: 14px;
  color: var(--text-secondary);
}

.sceneDetails summary {
  cursor: pointer;
  font-weight: 800;
}

.detailsBody {
  margin-top: 12px;
}

.badge {
  padding: 8px 12px;
  background: rgba(255, 183, 77, 0.18);
  color: var(--text-secondary);
}

.badge.done {
  color: #18794e;
  background: rgba(129, 199, 132, 0.28);
}

@media (max-width: 920px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
