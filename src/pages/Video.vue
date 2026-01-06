<template>
  <div class="page">
    <div class="card">
      <div class="head">
        <div>
          <h2>生成视频</h2>
          <p class="muted">
            生成 N 段视频（按场景图动态决定），点击一次即可顺序连续播放。后端生成较久，请留意进度条。
          </p>
        </div>

        <div class="meta">
          <div class="kv">
            <span class="k">session</span>
            <span class="v mono">{{ sessionId }}</span>
          </div>
          <div class="kv" v-if="taskId">
            <span class="k">task</span>
            <span class="v mono">{{ taskId }}</span>
          </div>
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
            {{ busy ? "生成中…" : "开始生成视频" }}
          </button>

          <button class="btn" @click="refreshSession" :disabled="busy || !sessionId">
            刷新数据
          </button>

          <button class="btn" @click="playAll" :disabled="!playableClips.length">
            播放全部
          </button>
        </div>

        <div class="hint" v-if="hint">{{ hint }}</div>
        <div class="err" v-if="errorMsg">{{ errorMsg }}</div>
      </div>

      <!-- Overall progress -->
      <div class="progressWrap" v-if="taskId">
        <div class="progressTop">
          <div class="muted2">
            总进度：<b>{{ taskProgress }}%</b>
            <span v-if="taskStage"> · {{ taskStage }}</span>
            <span v-if="clipCount != null"> · clips={{ clipCount }}</span>
          </div>
          <div class="muted2" v-if="taskStatus">状态：<b>{{ taskStatus }}</b></div>
        </div>

        <div class="barOuter" role="progressbar" :aria-valuenow="taskProgress" aria-valuemin="0" aria-valuemax="100">
          <div class="barInner" :style="{ width: taskProgress + '%' }"></div>
        </div>
      </div>

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
        暂无 clips 数据。点击“开始生成视频”后，后端会将每段结果写回 session.artifacts.videoClips.items。
      </div>
    </div>

    <!-- ✅ 底部固定操作栏：上一步 -->
    <div class="bottomBar">
      <button class="btn" @click="goPrev">上一步</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const API_BASE = "https://visiont-backend-sptpcpjygm.cn-beijing.fcapp.run";

const route = useRoute();
const router = useRouter();

// ✅ 约定：从路由 query 里读 sessionId，例如 /video?sessionId=xxx
const sessionId = ref(String(route.query.sessionId || "").trim());

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
/* ✅ 不要白色大背景：改成浅灰，和你前面页面统一 */
.page {
  padding: 16px;
  padding-top: 76px;      /* ✅ 预留顶部全局进度条高度（你可按实际调 64~96） */
  padding-bottom: 86px;   /* ✅ 预留底部固定按钮栏高度 */
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background: #f6f7f9;
}

.card {
  width: 100%;
  max-width: 1100px;
  background: #fff;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 6px 24px rgba(0,0,0,.06);
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

h2 {
  margin: 0 0 6px 0;
  font-size: 20px;
}

.muted { color: rgba(0,0,0,.6); margin: 0; line-height: 1.4; }
.muted2 { color: rgba(0,0,0,.55); }
.small { font-size: 12px; }
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
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0,0,0,.03);
  border: 1px solid rgba(0,0,0,.06);
}

.formRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field.inline { flex-direction: row; align-items: center; margin-top: 18px; }
.label { font-size: 12px; color: rgba(0,0,0,.6); }

.input {
  width: 110px;
  padding: 8px 10px;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: 10px;
  outline: none;
}

.btn {
  border: 1px solid rgba(0,0,0,.14);
  background: #fff;
  border-radius: 10px;
  padding: 9px 12px;
  cursor: pointer;
}

.btn.primary {
  border-color: rgba(0,0,0,.18);
  background: rgba(0,0,0,.88);
  color: #fff;
}

.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn.small { padding: 7px 10px; font-size: 12px; }

.hint { margin-top: 10px; color: rgba(0,0,0,.65); font-size: 13px; }
.err { margin-top: 10px; color: #b42318; font-size: 13px; }

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
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,.06);
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
  border-radius: 12px;
  background: rgba(0,0,0,.06);
}

.clips {
  margin-top: 14px;
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

@media (max-width: 980px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .head { flex-direction: column; align-items: flex-start; }
  .meta { align-items: flex-start; }
  .grid { grid-template-columns: 1fr; }
}

.clipCard {
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.clipTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.tag {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.10);
}

.tag.ok { background: rgba(22, 163, 74, .10); border-color: rgba(22, 163, 74, .22); }
.tag.run { background: rgba(234, 179, 8, .12); border-color: rgba(234, 179, 8, .22); }
.tag.bad { background: rgba(220, 38, 38, .10); border-color: rgba(220, 38, 38, .22); }
.tag.muted { background: rgba(0,0,0,.04); }

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
  margin-top: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed rgba(0,0,0,.15);
  background: rgba(0,0,0,.02);
}

/* ✅ 底部固定栏：上一步 */
.bottomBar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  background: rgba(246, 247, 249, 0.92);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(0,0,0,.08);
  display: flex;
  justify-content: flex-start;
  z-index: 50;
}
</style>
