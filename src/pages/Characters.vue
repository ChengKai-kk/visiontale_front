<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🧚 角色生成</h1>
        <p class="subtitle">生成角色图，后续场景自动引用</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !storyReq">
          {{ busy ? "正在生成角色..." : characters.length ? "重新生成角色" : "生成角色" }}
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
          {{ errorText || (characters.length ? "角色结果已就绪，后续每幕会按角色引用自动调用角色图。" : "先在上一页生成故事设定，再在这里生成角色。") }}
        </div>
      </div>

      <div class="panel referencePanel">
        <div class="referenceTitle">角色到场景的自动关联</div>
        <div class="referenceText">
          系统会在后续分镜中标记每幕涉及角色，并在图像生成时自动调用对应角色图作为参考。
        </div>
      </div>

      <div v-if="characters.length" class="characterGrid">
        <article v-for="item in characters" :key="item.id" class="characterCard">
          <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" class="characterImg" />
          <div v-else class="characterImg failed">生成失败</div>
          <div class="cardBody">
            <div class="cardTop">
              <div>
                <h3>{{ item.name }}</h3>
                <span class="roleTag">{{ item.role }}</span>
              </div>
            </div>
            <p>{{ item.description }}</p>
            <p class="errorText" v-if="item.error">{{ item.error }}</p>
            <details>
              <summary>查看角色 Prompt</summary>
              <p>{{ item.prompt }}</p>
            </details>
          </div>
        </article>
      </div>

      <div v-else class="panel emptyBig">
        点击顶部按钮后，会按阶段完成角色规划、主角渲染和辅助角色渲染，最终生成角色集合。
      </div>
    </div>

    <NavigationBar :disable-next="!characters.length" />
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
} from "../services/backendApi";

const sessionData = ref({ artifacts: {} });
const busy = ref(false);
const taskProgress = ref(0);
const taskStage = ref("");
const errorText = ref("");

const storyReq = computed(() => sessionData.value?.artifacts?.storyReq || null);
const characters = computed(() => sessionData.value?.artifacts?.characters?.items || []);

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
  taskStage.value = String(task?.stage || "");
}

const friendlyMessage = computed(() => {
  if (taskStage.value === "PLAN_CHARACTERS") return "正在规划角色清单与造型提示词...";
  if (taskStage.value.startsWith("RENDER_")) return "正在渲染角色图...";
  if (taskProgress.value > 0) return `正在生成角色... ${taskProgress.value}%`;
  return "准备生成角色...";
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
    const { session, task } = await runTaskFlow({
      startPath: "/api/characters/generate/start",
      payload: { size: "2K", watermark: true },
      onUpdate: applyTask,
      timeoutMs: 8 * 60 * 1000,
      intervalMs: 1400,
    });
    sessionData.value = session;

    const hasPartial = Number(task?.result?.errors || 0) > 0;
    if (hasPartial) {
      errorText.value = `部分角色生成失败：${task.result.errors} 个`;
    }
  } catch (e) {
    errorText.value = String(e?.message || "角色生成失败");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadSession();
});
</script>

<style scoped>
.characterGrid,
.characterCard,
.cardBody {
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
.referencePanel,
.cardTop {
  display: flex;
  gap: var(--space-md);
}

.head {
  justify-content: space-between;
  align-items: center;
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.cardBody h3 {
  margin: 0;
}

.subtitle,
.hint,
.referenceText,
.cardBody p {
  color: var(--text-secondary);
}

.toolbar,
.panel,
.characterCard {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.8);
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
  background: linear-gradient(135deg, var(--primary-candy), var(--primary-sky));
}

.referencePanel {
  align-items: flex-start;
  flex-direction: column;
}

.referenceTitle {
  font-weight: 900;
  color: #9d5d8e;
}

.characterGrid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.characterCard {
  overflow: hidden;
  padding: 0;
}

.characterImg {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: rgba(255, 249, 230, 0.6);
  border: 0;
}

.characterImg.failed {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #b42318;
}

.cardBody {
  padding: 18px;
}

.roleTag {
  display: inline-flex;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(79, 195, 247, 0.16);
  color: #1d7593;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

.cardBody details summary {
  cursor: pointer;
  font-weight: 800;
}

.errorText {
  color: #b42318;
}

.emptyBig {
  color: var(--text-secondary);
}

@media (max-width: 1180px) {
  .characterGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .characterGrid {
    grid-template-columns: 1fr;
  }
}
</style>
