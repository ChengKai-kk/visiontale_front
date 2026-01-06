<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🖼️ 生成精彩插图！</h1>
        <p class="muted">
          点击开始后，小精灵会逐场景绘制插图，请耐心等待～
        </p>
      </div>
    </header>

    <!-- 操作区 -->
    <div class="panel">
      <div class="row">
        <button class="btn primary" type="button" @click="startGenerate" :disabled="busy || !canStart">
          {{ busy ? "生成中..." : "🖼️ 开始生成图像" }}
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

      <div v-if="statusText && !busy" class="status" :class="{ error: statusType === 'error' }">
        {{ statusText }}
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
            <span class="muted2">场景数</span><b>{{ orderedScenes.length }}</b>
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

    <!-- 统一导航栏 -->
    <NavigationBar :disable-next="!canGoNext" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";

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

// 友好文案映射
const friendlyMessage = computed(() => {
  if (taskProgress.value > 0 && taskProgress.value < 100) {
    return `正在画图中... ${taskProgress.value}%`;
  }
  if (taskStage.value === 'generate_images') return '小精灵正在绘制精彩插图... 🎨✨';
  if (taskStage.value) return `正在${taskStage.value}... 🖼️`;
  return '正在处理中...';
});

const currentStage = computed(() => {
  if (taskStage.value === 'generate_images' || taskProgress.value > 0) return 'process';
  return 'default';
});

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
/* 统一使用全局CSS变量 - 浅色童趣主题 */
.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-lg);
  min-height: 60vh;
  max-height: calc(100vh - 120px);
  box-shadow: var(--shadow-md);

  /* 固定上下布局 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  align-items: flex-start;
  margin-bottom: var(--space-md);
}
.titleWrap h1 {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-2xl);
  font-weight: 900;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
}
.muted { margin: 0; color: var(--text-secondary); }
.muted2 { color: var(--text-secondary); }

.badge {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  font-size: var(--font-sm);
  min-width: 220px;
}
.badgeLine { display: flex; justify-content: space-between; gap: 10px; }

.panel {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
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
.btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

.btn.ghost {
  background: transparent;
}
.btn.primary {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}
.btn.small { padding: 8px 10px; border-radius: var(--radius-sm); font-size: var(--font-sm); }

.taskBox{
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-sm);
}
.taskGrid{
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr 0.6fr;
  gap: 10px;
  margin-bottom: 10px;
}
.kv .k{
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.kv .v{
  font-size: var(--font-sm);
  color: var(--text-primary);
  word-break: break-all;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
}

.bar {
  height: 10px;
  width: 100%;
  background: rgba(0,0,0,.08);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.barInner {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-sun), var(--primary-candy));
  border-radius: var(--radius-full);
  transition: width 220ms ease;
}

.status {
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--primary-grass);
  background: var(--bg-highlight);
  font-weight: 700;
}
.status.error {
  border-color: #F44336;
  background: #FFEBEE;
  color: #C62828;
}

.debugBox {
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-medium);
  background: var(--bg-panel);
  padding: var(--space-sm);
}
.debugTitle { font-weight: 800; margin-bottom: var(--space-sm); color: var(--text-primary); }
.debugPre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
  font-size: var(--font-sm);
  color: var(--text-primary);
}

.scrollArea {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);

  /* 可滚动区域 */
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.emptyBig {
  padding: var(--space-2xl) var(--space-lg);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  text-align: center;
  color: var(--text-muted);
}

.bookMeta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm);
  border-bottom: 2px solid var(--border-light);
  margin-bottom: var(--space-md);
}
.metaLine { display: flex; gap: var(--space-sm); align-items: baseline; }
.dotSep { opacity: .6; }

.sceneList { display: grid; gap: var(--space-md); }

.scene {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-card);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
}
.scene:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.sceneTop {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  padding: var(--space-md);
  border-bottom: 2px solid var(--border-light);
}

.sceneIdx {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  font-weight: 900;
  background: var(--bg-highlight);
  border: 2px solid var(--border-medium);
  color: var(--text-primary);
}

.sceneTitle { flex: 1; min-width: 0; }
.sceneTitleText { font-weight: 900; color: var(--text-primary); }
.sceneSub { margin-top: 4px; font-size: var(--font-sm); line-height: 1.4; }

.sceneRight { display: flex; align-items: center; gap: var(--space-sm); }
.pill {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 2px solid var(--primary-grass);
  background: rgba(129, 199, 132, 0.3);
  font-weight: 700;
  color: var(--text-primary);
}
.mutedPill {
  border-color: var(--border-medium);
  background: var(--bg-panel);
  color: var(--text-secondary);
}

.imgWrap { padding: var(--space-md); }
.imgBox {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
}
.img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.imgPlaceholder {
  height: 320px;
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--text-muted);
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--border-medium);
  border-top-color: var(--primary-sun);
  animation: spin 900ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.caption {
  padding: 0 var(--space-md) var(--space-md);
  display: grid;
  gap: 6px;
}
.capLabel { font-size: var(--font-sm); color: var(--text-secondary); font-weight: 700; }
.capText {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-sm) var(--space-md);
  line-height: 1.55;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.details { padding: 0 var(--space-md) var(--space-md); }
.details summary {
  cursor: pointer;
  color: var(--text-primary);
  padding: var(--space-sm);
  font-weight: 700;
}

.promptBox {
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-sm);
}
.promptPre {
  margin: 0 0 var(--space-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
  font-size: var(--font-sm);
  color: var(--text-primary);
}

@media (max-width: 767px) {
  .titleWrap h1 {
    font-size: var(--font-xl);
  }
}
</style>
