<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🎬 生成视频</h1>
        <p class="subtitle">点击生成视频，完成后即可播放</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !sceneImages.length">
          {{ busy ? "正在生成视频..." : clips.length ? "重新生成视频" : "生成视频" }}
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
            (clips.length
              ? "视频素材已准备好，可以播放完整视频或单独片段。"
              : "先完成场景图生成，再在这里导出视频。")
          }}
        </div>
      </div>

      <div v-if="playableVideoUrl" class="playerCard">
        <div class="playerHeader">
          <div>
            <div class="playerEyebrow">故事视频</div>
            <h2>完整故事视频</h2>
          </div>
          <div class="playerActions">
            <button class="btn ghost" type="button" @click="playFull">播放完整视频</button>
            <button class="btn ghost" type="button" @click="playFirstClip" :disabled="!clips.length">从第一段开始</button>
          </div>
        </div>

        <video ref="playerRef" class="player" controls preload="metadata" playsinline />
      </div>

      <div v-if="clips.length" class="clipGrid">
        <article v-for="clip in clips" :key="clip.id" class="clipCard">
          <img :src="clip.coverImage" :alt="`clip ${clip.order}`" class="clipCover" />
          <div class="clipBody">
            <div class="clipTop">
              <div>
                <div class="clipIndex">Scene {{ clip.order }}</div>
                <h3>{{ sceneTitleFor(clip.order) }}</h3>
              </div>
              <span class="clipStatus" :class="clipStatusClass(clip.status)">{{ clip.status }}</span>
            </div>
            <p>{{ clip.caption }}</p>
            <p class="clipError" v-if="clip.error">{{ clip.error }}</p>
            <button class="btn ghost" type="button" @click="playClip(clip)" :disabled="!clip.videoUrl">
              播放这一段
            </button>
          </div>
        </article>
      </div>

      <div v-else class="panel emptyBig">
        还没有视频数据。点击顶部按钮后，会依次进行规划、组装和导出三个阶段。
      </div>
    </div>

    <NavigationBar :disable-next="true" />
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
const playerRef = ref(null);
const errorText = ref("");

const sceneImages = computed(() => sessionData.value?.artifacts?.sceneImages?.items || []);
const scenes = computed(() => sessionData.value?.artifacts?.scenes?.items || []);
const videoNode = computed(() => sessionData.value?.artifacts?.videoClips || null);
const clips = computed(() =>
  (videoNode.value?.items || [])
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
);
const fullVideoUrl = computed(
  () =>
    String(videoNode.value?.fullVideoUrl || sessionData.value?.artifacts?.video?.finalVideoUrl || "").trim()
);
const playableVideoUrl = computed(() => fullVideoUrl.value || clips.value.find((c) => c.videoUrl)?.videoUrl || "");

function sceneTitleFor(order) {
  return scenes.value.find((item) => Number(item?.order || 0) === Number(order || 0))?.sceneTitle || `场景 ${order}`;
}

function clipStatusClass(status) {
  const st = String(status || "").toLowerCase();
  if (st === "succeeded" || st === "done") return "ok";
  if (st === "failed") return "bad";
  return "run";
}

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
  taskStage.value = String(task?.stage || "");
}

const friendlyMessage = computed(() => {
  if (taskStage.value.startsWith("CREATE_")) return "正在提交并轮询分段视频任务...";
  if (taskProgress.value > 0) return `正在生成视频... ${taskProgress.value}%`;
  return "准备生成视频...";
});

const currentStage = computed(() => (busy.value ? "process" : "default"));

function setPlayer(url) {
  if (!playerRef.value || !url) return;
  playerRef.value.pause();
  playerRef.value.src = url;
  playerRef.value.load();
  const p = playerRef.value.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function playFull() {
  setPlayer(fullVideoUrl.value || playableVideoUrl.value);
}

function playFirstClip() {
  const first = clips.value.find((clip) => clip.videoUrl);
  if (first?.videoUrl) setPlayer(first.videoUrl);
}

function playClip(clip) {
  if (!clip?.videoUrl) return;
  setPlayer(clip.videoUrl);
}

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
  taskProgress.value = 0;
  taskStage.value = "";
  errorText.value = "";

  try {
    const { session, task } = await runTaskFlow({
      startPath: "/api/video/start",
      payload: { clipDuration: 5, watermark: true },
      onUpdate: applyTask,
      timeoutMs: 25 * 60 * 1000,
      intervalMs: 1600,
    });
    sessionData.value = session;

    if (Number(task?.result?.errors || 0) > 0) {
      errorText.value = `部分视频片段失败：${task.result.errors} 段`;
    }
    if (playableVideoUrl.value) {
      setPlayer(playableVideoUrl.value);
    }
  } catch (e) {
    errorText.value = String(e?.message || "视频生成失败");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadSession();
  if (playableVideoUrl.value) setPlayer(playableVideoUrl.value);
});
</script>

<style scoped>
.clipGrid {
  display: grid;
  gap: var(--space-lg);
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
.toolbar,
.playerHeader,
.playerActions,
.clipTop {
  display: flex;
  gap: var(--space-md);
}

.head,
.toolbar,
.playerHeader,
.clipTop {
  justify-content: space-between;
  align-items: center;
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.playerHeader h2,
.clipBody h3 {
  margin: 0;
}

.subtitle,
.hint,
.clipBody p {
  color: var(--text-secondary);
}

.toolbar,
.panel,
.playerCard,
.clipCard {
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
  background: linear-gradient(135deg, var(--primary-candy), var(--primary-sun));
}

.btn.ghost {
  background: rgba(255, 255, 255, 0.9);
}

.playerEyebrow,
.clipIndex {
  color: #c2658a;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.player {
  width: 100%;
  margin-top: var(--space-md);
  border-radius: 22px;
  background: #101722;
}

.clipGrid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.clipCard {
  display: grid;
  gap: var(--space-md);
}

.clipCover {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 18px;
}

.clipBody {
  display: grid;
  gap: 12px;
}

.clipStatus {
  padding: 8px 12px;
  border-radius: 999px;
  font-weight: 800;
}

.clipStatus.ok {
  color: #18794e;
  background: rgba(129, 199, 132, 0.28);
}

.clipStatus.run {
  color: #7a4d00;
  background: rgba(255, 183, 77, 0.3);
}

.clipStatus.bad {
  color: #b42318;
  background: rgba(255, 228, 228, 0.9);
}

.clipError {
  color: #b42318;
}

@media (max-width: 1080px) {
  .clipGrid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .head,
  .toolbar,
  .playerHeader,
  .playerActions,
  .clipTop {
    align-items: flex-start;
    flex-direction: column;
  }

  .clipGrid {
    grid-template-columns: 1fr;
  }
}
</style>
