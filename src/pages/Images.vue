<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>生成图像</h1>
        <p class="muted">
          点击开始后，后端会逐场景生成插图，并逐张写回 session，页面会自动刷新显示。
        </p>
      </div>

      <div class="badge">
        <div class="badgeLine"><span class="muted2">session</span> <b>{{ sessionIdShort }}</b></div>
        <div class="badgeLine" v-if="taskId"><span class="muted2">task</span> <b class="mono">{{ taskIdShort }}</b></div>
      </div>
    </header>

    <!-- 操作区 -->
    <div class="panel">
      <div class="row">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !canStart">
          {{ busy ? "生成中..." : "🖼️ 开始生成图像" }}
        </button>

        <button class="btn ghost" type="button" @click="fetchSessionOnce({ forceRaw: true })" :disabled="busy">
          刷新 session
        </button>

        <button class="btn ghost" type="button" @click="showRaw = !showRaw" :disabled="busy">
          {{ showRaw ? "隐藏调试" : "显示调试" }}
        </button>
      </div>

      <!-- ✅ task 信息：明确显示 taskId -->
      <div class="taskBox" v-if="taskId">
        <div class="taskGrid">
          <div class="kv">
            <div class="k">taskId</div>
            <div class="v mono">{{ taskId }}</div>
          </div>
          <div class="kv">
            <div class="k">status</div>
            <div class="v mono">{{ taskStatus || "-" }}</div>
          </div>
          <div class="kv">
            <div class="k">stage</div>
            <div class="v mono">{{ taskStage || "-" }}</div>
          </div>
          <div class="kv">
            <div class="k">progress</div>
            <div class="v mono">{{ taskProgress != null ? taskProgress + "%" : "-" }}</div>
          </div>
        </div>

        <div class="bar" aria-label="progress">
          <div class="barInner" :style="{ width: (taskProgress || 0) + '%' }"></div>
        </div>
      </div>

      <div v-if="statusText" class="status" :class="{ error: statusType === 'error' }">
        {{ statusText }}
      </div>

      <div v-if="showRaw" class="debugBox">
        <div class="debugTitle">调试：/api/session 返回</div>
        <pre class="debugPre">{{ rawSessionText || "(尚未拉取)" }}</pre>
      </div>
    </div>

    <!-- 中间可滚动 -->
    <div class="scrollArea">
      <div v-if="!scenes.length" class="emptyBig">
        还没有场景数据（请先到「拆分文本」生成并保存 scenes）
      </div>

      <div v-else class="book">
        <div class="bookMeta">
          <div class="metaLine">
            <span class="muted2">场景数</span><b>{{ scenes.length }}</b>
            <span class="dotSep">·</span>
            <span class="muted2">已生成</span><b>{{ generatedCount }}</b>
          </div>
          <div class="hint muted2">图像会一张一张出现；你可以边等边往下翻 📖</div>
        </div>

        <div class="sceneList">
          <article v-for="s in orderedScenes" :key="s.id" class="scene">
            <div class="sceneTop">
              <div class="sceneIdx">{{ s.order }}</div>

              <div class="sceneTitle">
                <div class="sceneTitleText">{{ s.sceneTitle }}</div>
                <div class="sceneSub muted2" v-if="s.sceneText">{{ s.sceneText }}</div>
              </div>

              <div class="sceneRight">
                <span class="pill" v-if="imageByOrder[s.order]?.imageUrl">已生成</span>
                <span class="pill mutedPill" v-else>等待中</span>
              </div>
            </div>

            <div class="imgWrap">
              <div v-if="imageByOrder[s.order]?.imageUrl" class="imgBox">
                <img class="img" :src="imageByOrder[s.order].imageUrl" :alt="`scene ${s.order}`" loading="lazy" />
              </div>

              <div v-else class="imgPlaceholder">
                <div class="spinner"></div>
                <div class="muted2">
                  {{ taskId ? `正在生成中（${taskStage || "..." }）` : `尚未开始生成` }}
                </div>
              </div>
            </div>

            <div class="caption">
              <div class="capLabel">字幕</div>
              <div class="capText">{{ captionFor(s.order, s.narration) }}</div>
            </div>

            <details class="details">
              <summary>查看该场景 Prompt（可复制）</summary>
              <div class="promptBox">
                <pre class="promptPre">{{ s.imagePrompt || "(无 prompt)" }}</pre>
                <button class="btn small ghost" type="button" @click="copyText(s.imagePrompt || '')" :disabled="!s.imagePrompt">
                  复制 Prompt
                </button>
              </div>
            </details>
          </article>
        </div>
      </div>
    </div>

    <!-- 底部固定导航 -->
    <footer class="navBar">
      <button class="btn ghost" type="button" @click="goPrev" :disabled="!prevStep">← 上一步</button>
      <div class="navHint">
        <span class="muted2">当前：</span><b>{{ currentStepTitle }}</b>
        <span class="muted2"> · 下一步：</span><b>{{ nextStep?.title || "-" }}</b>
      </div>
      <button class="btn next" type="button" @click="goNext" :disabled="!nextStep || !canGoNext">
        下一步 →
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";
const LS_SESSION = "visiontale_session_id";

function joinUrl(base, path) {
  if (!base) return path;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

function getOrCreateSessionId() {
  let sid = localStorage.getItem(LS_SESSION);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(LS_SESSION, sid);
  }
  return sid;
}

const router = useRouter();
const route = useRoute();

const sessionId = ref(getOrCreateSessionId());
const sessionIdShort = computed(() => sessionId.value.slice(0, 8) + "...");

function applySessionIdFromRoute() {
  const qid = route.query?.sessionId;
  if (typeof qid === "string" && qid.trim()) {
    sessionId.value = qid.trim();
    localStorage.setItem(LS_SESSION, sessionId.value);
  }
}

/** steps */
const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});
const prevStep = computed(() => (currentIndex.value > 0 ? steps[currentIndex.value - 1] : null));
const nextStep = computed(() => (currentIndex.value < steps.length - 1 ? steps[currentIndex.value + 1] : null));
const currentStepTitle = computed(() => steps[currentIndex.value]?.title || "生成图像");

function goPrev() {
  if (!prevStep.value) return;
  router.push({ path: prevStep.value.path, query: { sessionId: sessionId.value } });
}
function goNext() {
  if (!nextStep.value) return;
  router.push({ path: nextStep.value.path, query: { sessionId: sessionId.value } });
}

/** UI state */
const busy = ref(false);
const statusText = ref("");
const statusType = ref("info");

const taskId = ref("");
const taskStatus = ref("");
const taskStage = ref("");
const taskProgress = ref(null);
const taskError = ref("");

const taskIdShort = computed(() => (taskId.value ? taskId.value.slice(0, 8) + "..." : ""));

const showRaw = ref(false);
const rawSessionText = ref("");

/** data */
const scenes = ref([]);
const sceneImages = ref([]);

/** helpers */
function setErr(msg) {
  statusText.value = msg;
  statusType.value = "error";
}
function setInfo(msg) {
  statusText.value = msg;
  statusType.value = "info";
}
function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
  setInfo("已复制 ✅");
}

function normalizeScenes(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .filter(Boolean)
    .map((s, idx) => ({
      id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
      order: typeof s.order === "number" ? s.order : idx + 1,
      sceneTitle: String(s.sceneTitle || s.title || `场景 ${idx + 1}`).slice(0, 80),
      sceneText: String(s.sceneText || "").trim(),
      imagePrompt: String(s.imagePrompt || "").trim(),
      narration: String(s.narration || "").trim(),
    }))
    .sort((a, b) => a.order - b.order);
}

function normalizeSceneImages(node) {
  // 你的真实结构：artifacts.sceneImages.items:[{order,imageUrl,caption,includeHero,usedRef,createdAt,...}]
  const items = Array.isArray(node?.items) ? node.items : Array.isArray(node) ? node : [];
  return items
    .filter(Boolean)
    .map((x) => ({
      order: Number(x.order) || 0,
      imageUrl: String(x.imageUrl || x.url || "").trim(),
      caption: String(x.caption || x.narration || "").trim(),
      includeHero: !!x.includeHero,
      usedRef: String(x.usedRef || "").trim(),
      createdAt: x.createdAt || null,
      error: String(x.error || "").trim(),
    }))
    .filter((x) => x.order > 0)
    .sort((a, b) => a.order - b.order);
}

/** computed */
const orderedScenes = computed(() => normalizeScenes(scenes.value));
const canStart = computed(() => orderedScenes.value.length > 0);

const imageByOrder = computed(() => {
  const map = {};
  for (const it of sceneImages.value) {
    if (!it || !it.order) continue;
    map[it.order] = it;
  }
  return map;
});

const generatedCount = computed(() => sceneImages.value.filter((x) => x.imageUrl).length);
const canGoNext = computed(() => generatedCount.value > 0);

function captionFor(order, fallbackNarration) {
  const it = imageByOrder.value[order];
  const err = (it?.error || "").trim();
  if (err && !it?.imageUrl) return `（生成失败）${err}`;
  const cap = (it?.caption || "").trim();
  if (cap) return cap;
  const fb = String(fallbackNarration || "").trim();
  return fb || "（无字幕）";
}

/** api */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`http_${res.status}:${text.slice(0, 600)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchSessionOnce({ forceRaw = false } = {}) {
  const sess = await fetchJson(joinUrl(API_BASE, `/api/session/${sessionId.value}`));
  if (!sess) return null;

  if (showRaw.value || forceRaw) rawSessionText.value = JSON.stringify(sess, null, 2);

  const a = sess?.artifacts || {};
  scenes.value = normalizeScenes(a?.scenes?.items || a?.scenes || []);
  sceneImages.value = normalizeSceneImages(a?.sceneImages);

  return sess;
}

async function pollTaskOnce() {
  if (!taskId.value) return null;
  const t = await fetchJson(joinUrl(API_BASE, `/api/task/${taskId.value}`));
  if (!t) return null;

  taskStatus.value = t.status || "";
  taskStage.value = t.stage || "";
  taskProgress.value = typeof t.progress === "number" ? t.progress : null;
  taskError.value = t.error || "";

  if (t.status === "FAILED") {
    busy.value = false;
    setErr(`任务失败：${taskError.value || "unknown_error"}`);
  }
  if (t.status === "DONE") {
    busy.value = false;
    setInfo("任务完成 ✅（图片会持续写回 session）");
  }
  return t;
}

/** start */
async function startGenerate() {
  statusText.value = "";
  taskError.value = "";

  if (!canStart.value) {
    setErr("没有可用场景：请先到「拆分文本」生成并保存 scenes。");
    return;
  }
  if (!API_BASE) {
    setErr("VITE_API_BASE 未配置：请检查 .env.local");
    return;
  }

  busy.value = true;

  try {
    const url = joinUrl(API_BASE, `/api/image/scenes/start`);
    console.log("[images] POST", url);

    const ret = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId.value,
        size: "2K",
        watermark: true,
      }),
    });

    if (!ret?.taskId) {
      busy.value = false;
      setErr("启动失败：后端未返回 taskId");
      return;
    }

    taskId.value = ret.taskId;
    taskStatus.value = ret.status || "PENDING";
    taskStage.value = "";
    taskProgress.value = 0;

    console.log("[images] started taskId:", taskId.value);
    setInfo(`已启动生成任务 ✅ taskId=${taskId.value}`);
  } catch (e) {
    busy.value = false;
    setErr(`启动失败：${e?.message || String(e)}`);
  }
}

/** polling loop */
let timer = null;

async function tick() {
  try {
    // 先拉 session（让图片逐张出现）
    await fetchSessionOnce();

    // 再拉 task
    if (taskId.value) {
      await pollTaskOnce();
    }

    // 全部生成完成可停止轮询（可选）
    if (orderedScenes.value.length > 0 && generatedCount.value >= orderedScenes.value.length) {
      if (timer) clearInterval(timer);
      timer = null;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    if (!statusText.value) setErr(`拉取失败：${msg}`);
  }
}

onMounted(async () => {
  applySessionIdFromRoute();
  await fetchSessionOnce({ forceRaw: false });

  timer = setInterval(tick, 1500);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.card {
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--card);
  padding: 18px;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.titleWrap h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
.muted { margin: 0; color: var(--muted); }
.muted2 { color: rgba(255,255,255,0.62); }

.badge {
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  font-size: 12px;
  opacity: .95;
  min-width: 220px;
}
.badgeLine { display: flex; justify-content: space-between; gap: 10px; }

.panel {
  margin-top: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.14);
  padding: 12px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(255,255,255,0.14);
  color: var(--text);
  transition: transform 120ms ease, background 120ms ease, border 120ms ease;
}
.btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.18); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

.btn.ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
}
.btn.primary {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  color: #1a1a1a;
  font-weight: 800;
}
.btn.small { padding: 8px 10px; border-radius: 10px; font-size: 12px; }

.taskBox{
  margin-top: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  padding: 10px;
}
.taskGrid{
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr 0.6fr;
  gap: 10px;
  margin-bottom: 10px;
}
.kv .k{
  font-size: 11px;
  color: rgba(255,255,255,0.58);
  margin-bottom: 4px;
}
.kv .v{
  font-size: 12px;
  color: rgba(255,255,255,0.92);
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
}

.bar {
  height: 8px;
  width: 100%;
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  overflow: hidden;
}
.barInner {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  border-radius: 999px;
  transition: width 220ms ease;
}

.status {
  margin-top: 10px;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
}
.status.error {
  border-color: rgba(255, 90, 90, 0.45);
  background: rgba(255, 90, 90, 0.08);
}

.debugBox {
  margin-top: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.18);
  padding: 10px;
}
.debugTitle { font-weight: 800; margin-bottom: 8px; }
.debugPre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
  font-size: 12px;
  color: rgba(255,255,255,0.86);
}

.scrollArea {
  margin-top: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.10);
  padding: 12px;
  overflow: auto;
  max-height: calc(100vh - 320px);
  padding-bottom: 84px;
}

.emptyBig {
  padding: 28px 16px;
  border-radius: 14px;
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.12);
  text-align: center;
  color: rgba(255,255,255,0.72);
}

.bookMeta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 2px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.12);
  margin-bottom: 12px;
}
.metaLine { display: flex; gap: 8px; align-items: baseline; }
.dotSep { opacity: .6; }

.sceneList { display: grid; gap: 14px; }

.scene {
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  overflow: hidden;
}

.sceneTop {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.10);
}

.sceneIdx {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 900;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14);
}

.sceneTitle { flex: 1; min-width: 0; }
.sceneTitleText { font-weight: 900; }
.sceneSub { margin-top: 4px; font-size: 13px; line-height: 1.4; }

.sceneRight { display: flex; align-items: center; gap: 8px; }
.pill {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,138,61,0.45);
  background: rgba(255,138,61,0.10);
}
.mutedPill {
  border-color: rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.75);
}

.imgWrap { padding: 12px; }
.imgBox {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.22);
}
.img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.imgPlaceholder {
  height: 320px;
  border-radius: 14px;
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.12);
  display: grid;
  place-items: center;
  gap: 10px;
  color: rgba(255,255,255,0.72);
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.18);
  border-top-color: rgba(255,138,61,0.9);
  animation: spin 900ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.caption {
  padding: 0 12px 14px;
  display: grid;
  gap: 6px;
}
.capLabel { font-size: 12px; color: rgba(255,255,255,0.62); }
.capText {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.16);
  padding: 10px 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.details { padding: 0 12px 12px; }
.details summary { cursor: pointer; color: rgba(255,255,255,0.80); padding: 8px 2px; }

.promptBox {
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.16);
  padding: 10px;
}
.promptPre {
  margin: 0 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
  font-size: 12px;
  color: rgba(255,255,255,0.86);
}

.navBar {
  position: sticky;
  bottom: 0;
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(10, 14, 22, 0.78);
  backdrop-filter: blur(10px);
}

.navHint {
  text-align: center;
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  display: none;
}
.btn.next {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  color: #1a1a1a;
  font-weight: 900;
}

@media (min-width: 860px) {
  .navHint { display: block; }
}
</style>
