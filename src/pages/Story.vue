<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>📖 生成故事</h1>
        <p class="subtitle">根据设定生成完整故事文本</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !storyReq">
          {{ busy ? "正在生成故事..." : story ? "重新生成故事" : "生成故事" }}
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
          {{ errorText || (story ? "故事已就绪，可继续生成分镜。" : "先从上一页生成故事设定，再在这里生成故事。") }}
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h3 class="panelTitle">故事需求</h3>
          <div v-if="storyReq" class="reqGrid">
            <div class="reqItem"><span>主角</span><b>{{ storyReq.hero }}</b></div>
            <div class="reqItem"><span>地点</span><b>{{ storyReq.setting }}</b></div>
            <div class="reqItem"><span>氛围</span><b>{{ storyReq.tone }}</b></div>
            <div class="reqItem"><span>障碍</span><b>{{ storyReq.obstacle }}</b></div>
            <div class="reqItem wide"><span>同伴</span><b>{{ storyReq.companion }}</b></div>
            <div class="reqItem wide"><span>结局</span><b>{{ storyReq.ending }}</b></div>
          </div>
          <div v-else class="emptyBig">尚未生成 storyReq，请回到上一页开始对话。</div>
        </div>

        <div class="panel storyPanel">
          <div class="storyTop">
            <h3 class="panelTitle">故事正文</h3>
            <span class="badge" :class="{ done: !!story }">{{ story ? "已写入" : "待生成" }}</span>
          </div>

          <div v-if="story" class="storyContent">
            <div class="storyField">
              <span class="fieldLabel">标题</span>
              <div class="storyTitle">{{ story.title }}</div>
            </div>

            <div class="storyField">
              <span class="fieldLabel">正文</span>
              <div class="storyParagraph" v-for="(paragraph, index) in storyParagraphs" :key="index">
                {{ paragraph }}
              </div>
            </div>

            <div class="storyField">
              <span class="fieldLabel">寓意</span>
              <input class="input" v-model="moralDraft" placeholder="请输入寓意" />
              <div class="row">
                <button class="btn ghost" type="button" @click="saveMoral" :disabled="!moralDraft.trim()">
                  保存寓意
                </button>
                <span class="saveHint" v-if="saveHint">{{ saveHint }}</span>
              </div>
            </div>
          </div>

          <div v-else class="emptyBig">
            点击顶部按钮后，这里会生成完整故事文本。页面刷新后会自动恢复。
          </div>
        </div>
      </div>
    </div>

    <NavigationBar :disable-next="!story" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";
import {
  fetchSession,
  isNotFoundError,
  runTaskFlow,
  saveArtifact,
} from "../services/backendApi";

const sessionData = ref({ artifacts: {} });
const busy = ref(false);
const taskProgress = ref(0);
const taskStage = ref("");
const saveHint = ref("");
const errorText = ref("");

const storyReq = computed(() => sessionData.value?.artifacts?.storyReq || null);
const story = computed(() => sessionData.value?.artifacts?.story || null);
const moralDraft = ref("");

const storyParagraphs = computed(() => {
  const text = String(story.value?.text || "").trim();
  return text ? text.split(/\n{2,}/).filter(Boolean) : [];
});

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
  taskStage.value = String(task?.stage || "");
}

const friendlyMessage = computed(() => {
  if (taskStage.value === "LOAD_SESSION" || taskStage.value === "LOAD_STORY") return "正在准备故事素材...";
  if (taskStage.value === "LLM") return "正在生成故事内容...";
  if (taskProgress.value > 0) return `正在生成故事... ${taskProgress.value}%`;
  return "准备生成故事...";
});

const currentStage = computed(() => (busy.value ? "process" : "default"));

function syncMoralDraft() {
  moralDraft.value = String(story.value?.moral || "").trim();
}

async function loadSession() {
  try {
    sessionData.value = await fetchSession();
    syncMoralDraft();
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
  saveHint.value = "";
  errorText.value = "";
  taskProgress.value = 0;
  taskStage.value = "";

  try {
    const { session } = await runTaskFlow({
      startPath: "/api/story/generate/start",
      payload: { language: "zh", lengthHint: storyReq.value?.length || "" },
      onUpdate: applyTask,
      timeoutMs: 3 * 60 * 1000,
      intervalMs: 1200,
    });
    sessionData.value = session;
    syncMoralDraft();
  } catch (e) {
    errorText.value = String(e?.message || "故事生成失败");
  } finally {
    busy.value = false;
  }
}

async function saveMoral() {
  if (!story.value) return;
  try {
    await saveArtifact("story", {
      ...story.value,
      moral: String(moralDraft.value || "").trim(),
      updatedAt: Date.now(),
    });
    await loadSession();
    saveHint.value = "寓意已保存";
    window.setTimeout(() => {
      saveHint.value = "";
    }, 1600);
  } catch (e) {
    errorText.value = String(e?.message || "寓意保存失败");
  }
}

onMounted(async () => {
  await loadSession();
});
</script>

<style scoped>
.storyContent,
.storyField {
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
.storyTop,
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.panelTitle {
  margin: 0;
}

.subtitle,
.hint,
.saveHint,
.fieldLabel,
.reqItem span {
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
  grid-template-columns: 0.9fr 1.1fr;
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
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
}

.btn.ghost {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid rgba(255, 213, 79, 0.85);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.reqGrid {
  display: grid;
  gap: var(--space-sm);
}

.reqItem {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 249, 230, 0.68);
}

.reqItem.wide {
  grid-column: 1 / -1;
}

.storyTitle {
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 900;
  color: #b95b7f;
}

.storyParagraph,
.emptyBig {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 249, 230, 0.68);
  line-height: 1.72;
}

.input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid rgba(255, 213, 79, 0.8);
  border-radius: 16px;
  font: inherit;
}

.badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 183, 77, 0.18);
  font-size: 14px;
  font-weight: 800;
  color: var(--text-secondary);
}

.badge.done {
  color: #18794e;
  background: rgba(129, 199, 132, 0.28);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
