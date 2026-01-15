<template>
  <div class="page">
    <div class="card">
      <div class="head">
        <div class="titleWrap">
          <h2>🎬 生成视频</h2>
          <p class="muted">逐场景生成视频片段</p>
        </div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <div class="formRow">
          <label class="field">
            <span class="label">每段时长（秒）</span>
            <input
              class="input"
              type="number"
              min="1"
              max="10"
              step="1"
              v-model.number="clipDuration"
              :disabled="busy"
            />
          </label>

          <label class="field inline">
            <input type="checkbox" v-model="watermark" :disabled="busy" />
            <span class="label">watermark</span>
          </label>

          <button class="btn primary" @click="start" :disabled="busy || !sessionId">
            {{ busy ? "生成中…" : "🎬 开始生成视频" }}
          </button>

          <button class="btn" @click="playAll" :disabled="!playableClips.length">
            播放全部
          </button>
        </div>

        <!-- 加载状态 -->
        <LoadingState
          v-if="busy && taskId"
          :stage="currentStage"
          :message="friendlyMessage"
          :progress="taskProgress"
          :show-progress="taskProgress > 0"
          small
        />

        <div class="hint" v-if="hint && !busy">{{ hint }}</div>
        <div class="err" v-if="errorMsg">{{ errorMsg }}</div>
      </div>

      <!-- 可滚动内容区域 -->
      <div class="contentScroll">
        <!-- Player -->
        <div class="playerWrap" v-if="playableClips.length">
        <div class="playerHead">
          <div>
            <b>播放器</b>
            <span class="muted2" v-if="playingIndex >= 0">
              · 正在播放第 {{ playingIndex + 1 }} / {{ playableClips.length }} 段
            </span>
          </div>
          <div class="muted2" v-if="currentPlayOrder != null">
            scene order：<b>{{ currentPlayOrder }}</b>
          </div>
        </div>

        <video
          ref="playerRef"
          class="player"
          controls
          playsinline
          preload="metadata"
          @ended="onEnded"
          @error="onPlayerError"
        ></video>

        <div class="muted2 small" v-if="currentSrc">
          当前视频源：<span class="mono">{{ shortUrl(currentSrc) }}</span>
        </div>
      </div>

      <!-- Clips list -->
      <div class="clips" v-if="clips.length">
        <div class="clipsHead">
          <b>分段视频</b>
          <span class="muted2">（按 order 排序）</span>
        </div>

        <div class="grid">
          <div class="clipCard" v-for="c in clips" :key="c.sceneId + '_' + c.order">
            <div class="clipTop">
              <div class="mono"><b>#{{ c.order }}</b></div>
              <span class="tag" :class="tagClass(c.status)">{{ c.status || "unknown" }}</span>
            </div>

            <div class="clipBody">
              <div class="row">
                <span class="muted2">sceneId</span>
                <span class="mono">{{ shortId(c.sceneId) }}</span>
              </div>
              <div class="row" v-if="c.arkTaskId">
                <span class="muted2">arkTaskId</span>
                <span class="mono">{{ c.arkTaskId }}</span>
              </div>
              <div class="row" v-if="c.videoUrl">
                <span class="muted2">video</span>
                <a class="link" :href="c.videoUrl" target="_blank" rel="noreferrer">打开</a>
              </div>
            </div>

            <div class="clipActions">
              <button class="btn small" @click="playOne(c)" :disabled="!c.videoUrl">播放此段</button>
            </div>
          </div>
        </div>
      </div>

      <div class="empty muted2" v-else>
        暂无 clips 数据。点击"开始生成视频"后，后端会将每段结果写回 session.artifacts.videoClips.items。
      </div>
      </div>
      <!-- 可滚动内容区域结束 -->

      <!-- 统一导航栏 -->
      <NavigationBar :disable-next="true" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const LS_SESSION = "visiontale_session_id";

const route = useRoute();
const router = useRouter();

// ✅ 从路由 query 或 localStorage 读取 sessionId
function getSessionId() {
  const fromQuery = typeof route.query.sessionId === "string" ? route.query.sessionId : "";
  const fromLS = localStorage.getItem(LS_SESSION) || "";
  const sid = (fromQuery || fromLS).trim();
  if (fromQuery) localStorage.setItem(LS_SESSION, fromQuery);
  return sid;
}

const sessionId = ref(getSessionId());

const clipDuration = ref(5);
const watermark = ref(true);

const busy = ref(false);
const hint = ref("");
const errorMsg = ref("");

// task state
const taskId = ref("");
const taskStatus = ref("");
const taskProgress = ref(0);
const taskStage = ref("");
const clipCount = ref(null);

// 友好文案映射
const friendlyMessage = computed(() => {
  if (taskProgress.value > 0 && taskProgress.value < 100) {
    return `正在制作视频... ${taskProgress.value}%`;
  }
  if (taskStage.value === 'generate_videos') return '小精灵正在制作精彩视频... 🎬✨';
  if (clipCount.value != null) return `正在生成第 ${clipCount.value} 段视频... 🎥`;
  return '正在处理中...';
});

const currentStage = computed(() => {
  if (taskStage.value === 'generate_videos' || taskProgress.value > 0) return 'process';
  return 'default';
});

// session state
const clips = ref([]); // videoClips.items
const stage = ref("");

// player
const playerRef = ref(null);
const playingIndex = ref(-1);
const currentSrc = ref("");
const currentPlayOrder = ref(null);

let pollTimer = null;
let sessionTimer = null;

function goPrev() {
  // ✅ 按你的要求：底部固定“上一步”
  // 如果你项目里有固定路由（比如 /images），可以改成 router.push('/images')
  router.back();
}

function shortId(id) {
  if (!id) return "";
  return id.length > 10 ? id.slice(0, 8) + "…" : id;
}
function shortUrl(u) {
  if (!u) return "";
  return u.length > 80 ? u.slice(0, 80) + "…" : u;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg = j?.error || t || `HTTP_${r.status}`;
    throw new Error(msg);
  }
  return j;
}

async function refreshSession() {
  if (!sessionId.value) return;
  const s = await fetchJson(`${API_BASE}/api/session/${encodeURIComponent(sessionId.value)}`);
  stage.value = s?.stage || "";
  const items = s?.artifacts?.videoClips?.items || [];
  clips.value = Array.isArray(items) ? items.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0)) : [];
}

const playableClips = computed(() => {
  return clips.value
    .filter((c) => c && c.videoUrl && (c.status === "succeeded" || c.status === "SUCCEEDED" || c.status === "done"))
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
});

function tagClass(st) {
  const s = String(st || "").toLowerCase();
  if (s === "succeeded" || s === "done" || s === "success") return "ok";
  if (s === "polling" || s === "creating" || s === "running") return "run";
  if (s === "failed" || s === "error") return "bad";
  return "muted";
}

async function start() {
  errorMsg.value = "";
  hint.value = "";
  if (!sessionId.value) {
    errorMsg.value = "缺少 sessionId（请从路由 query 传入，例如 /video?sessionId=xxx）";
    return;
  }

  busy.value = true;
  hint.value = "正在启动任务…";

  try {
    const body = {
      sessionId: sessionId.value,
      clipDuration: Number(clipDuration.value || 5),
      watermark: !!watermark.value,
    };

    const r = await fetchJson(`${API_BASE}/api/video/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    taskId.value = r?.taskId || "";
    clipCount.value = r?.clipCount ?? null;

    taskStatus.value = r?.status || "PENDING";
    taskProgress.value = 0;
    taskStage.value = "PENDING";

    hint.value = "任务已启动，正在生成视频（会自动刷新进度）…";

    // 立刻拉一次 session（让列表先出现 creating）
    await refreshSession();

    beginPolling();
  } catch (e) {
    errorMsg.value = `启动失败：${e?.message || String(e)}`;
    busy.value = false;
    hint.value = "";
  }
}

function beginPolling() {
  stopPolling();

  // poll task
  pollTimer = setInterval(async () => {
    if (!taskId.value) return;
    try {
      const t = await fetchJson(`${API_BASE}/api/task/${encodeURIComponent(taskId.value)}`);
      taskStatus.value = t?.status || taskStatus.value;
      taskProgress.value = Number(t?.progress ?? taskProgress.value ?? 0);
      taskStage.value = t?.stage || taskStage.value;

      if (t?.error) {
        errorMsg.value = `任务失败：${t.error}`;
      }

      if (String(t?.status).toUpperCase() === "SUCCEEDED") {
        hint.value = "生成完成 ✅ 你可以点击“播放全部”。";
        busy.value = false;
        await refreshSession(); // 最终刷新一次
        stopPolling();
      } else if (String(t?.status).toUpperCase() === "FAILED") {
        busy.value = false;
        stopPolling();
      }
    } catch (e) {
      // task 轮询失败不立刻停（可能短暂网络波动）
      errorMsg.value = `轮询任务失败：${e?.message || String(e)}`;
    }
  }, 2000);

  // poll session (clips)
  sessionTimer = setInterval(async () => {
    try {
      await refreshSession();
    } catch (e) {
      errorMsg.value = `读取 session 失败：${e?.message || String(e)}（可能是函数实例切换导致内存 session 丢失）`;
    }
  }, 2500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (sessionTimer) clearInterval(sessionTimer);
  pollTimer = null;
  sessionTimer = null;
}

function setPlayerSrc(url, order = null) {
  const el = playerRef.value;
  if (!el) return;
  currentSrc.value = url || "";
  currentPlayOrder.value = order;

  el.pause();
  el.src = url || "";
  el.load();
  el.play().catch(() => {
    hint.value = "浏览器阻止了自动播放，请在播放器上点击播放。";
  });
}

function playAll() {
  if (!playableClips.value.length) return;
  errorMsg.value = "";
  hint.value = "开始连续播放…";

  playingIndex.value = 0;
  const first = playableClips.value[0];
  setPlayerSrc(first.videoUrl, first.order);
}

function playOne(c) {
  if (!c?.videoUrl) return;
  errorMsg.value = "";
  hint.value = `播放第 ${c.order} 段`;
  playingIndex.value = -1;
  setPlayerSrc(c.videoUrl, c.order);
}

function onEnded() {
  if (playingIndex.value < 0) return;
  const next = playingIndex.value + 1;
  if (next >= playableClips.value.length) {
    hint.value = "播放完成 ✅";
    playingIndex.value = -1;
    return;
  }
  playingIndex.value = next;
  const c = playableClips.value[next];
  setPlayerSrc(c.videoUrl, c.order);
}

function onPlayerError() {
  hint.value = "播放器加载失败（可能链接过期或网络问题），你可以刷新数据或重新生成。";
}

onMounted(async () => {
  if (sessionId.value) {
    try {
      await refreshSession();
    } catch {
      // ignore
    }
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<style scoped>
/* 统一使用全局CSS变量 */
.page {
  /* 不需要设置背景色,使用body的全局背景 */
  min-height: 60vh;
}

.card {
  width: 100%;
  max-width: 1100px;
  background: var(--bg-card);
  border: 3px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-md);

  /* 固定上下布局 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: var(--content-available-height);
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-xs);
}

.titleWrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

h2 {
  margin: 0;
  font-size: var(--font-base);
  font-weight: 900;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
  white-space: nowrap;
}

.muted {
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.2;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.muted2 { color: var(--text-secondary); }
.small { font-size: var(--font-sm); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.kv { display: flex; gap: 8px; align-items: baseline; }
.k { color: rgba(0,0,0,.5); font-size: 12px; }
.v { font-size: 12px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.controls {
  margin-top: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: var(--bg-highlight);
  border: 2px solid var(--border-light);
}

.formRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field.inline { flex-direction: row; align-items: center; margin-top: 18px; }
.label { font-size: var(--font-sm); color: var(--text-secondary); font-weight: 700; }

.input {
  width: 110px;
  padding: var(--space-sm);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-weight: 600;
}

.btn {
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-weight: 700;
  border: 2px solid var(--border-medium);
  transition: all 200ms ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.btn.primary {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}

.btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
.btn.small { padding: 8px 12px; font-size: var(--font-sm); }

.hint {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}
.err {
  margin-top: 10px;
  color: #C62828;
  font-size: var(--font-sm);
  background: #FFEBEE;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  border: 2px solid #F44336;
  font-weight: 700;
}

/* 可滚动内容区域 */
.contentScroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: var(--space-md);
}

.progressWrap {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,.06);
}

.progressTop {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.barOuter {
  height: 10px;
  background: rgba(0,0,0,.08);
  border-radius: 999px;
  overflow: hidden;
}

.barInner {
  height: 100%;
  background: rgba(0,0,0,.75);
  width: 0%;
  transition: width .25s ease;
}

.playerWrap {
  margin-top: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
}

.playerHead {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.player {
  width: 100%;
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}

.clips {
  margin-top: var(--space-md);
}

.clipsHead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .card {
    padding: var(--space-sm);
  }

  h2 {
    font-size: var(--font-base);
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

/* 手机 (480px - 640px) */
@media (min-width: 480px) and (max-width: 640px) {
  .card {
    padding: var(--space-sm);
  }

  .head {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta {
    align-items: flex-start;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

/* 平板竖屏 (641px - 979px) */
@media (min-width: 641px) and (max-width: 979px) {
  .card {
    padding: var(--space-md);
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 平板横屏/小笔记本 (980px - 1279px) - 关键优化 */
@media (min-width: 980px) and (max-width: 1279px) {
  .card {
    padding: var(--space-md);
  }

  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* 桌面端及以上 (>= 1280px) */
@media (min-width: 1280px) {
  .card {
    padding: var(--space-lg);
  }
}

.clipCard {
  border: 2px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
}

.clipCard:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.clipTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.tag {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 2px solid var(--border-medium);
  font-weight: 700;
}

.tag.ok {
  background: rgba(129, 199, 132, 0.3);
  border-color: var(--primary-grass);
  color: var(--text-primary);
}
.tag.run {
  background: rgba(255, 183, 77, 0.3);
  border-color: var(--primary-sun);
  color: var(--text-primary);
}
.tag.bad {
  background: #FFEBEE;
  border-color: #F44336;
  color: #C62828;
}
.tag.muted {
  background: var(--bg-panel);
  color: var(--text-secondary);
}

.clipBody {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
  font-size: 12px;
}

.link {
  font-size: 12px;
  color: rgba(0,0,0,.85);
  text-decoration: underline;
}

.clipActions { margin-top: 10px; display: flex; justify-content: flex-end; }

.empty {
  margin-top: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  color: var(--text-muted);
  text-align: center;
}
</style>
