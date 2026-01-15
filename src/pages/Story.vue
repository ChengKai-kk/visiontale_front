<template>
  <section class="card">
    <header class="head">
      <div class="titleWrap">
        <h1 class="title-fun">📖 故事生成</h1>
        <p class="subtitle">一键创作精彩儿童故事</p>
      </div>
    </header>

    <!-- 操作区 -->
    <div class="panel">
      <div class="row">
        <button class="btn btn-primary btn-fun" :disabled="busy || !canGenerate" @click="startGenerate">
          {{ busy ? "生成中..." : "✨ 一键生成故事" }}
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

    <!-- 主体内容 -->
    <div class="grid">
      <!-- 左：storyReq -->
      <div class="panel">
        <h3 class="panelTitle">📝 故事需求</h3>

        <div v-if="!sessionId" class="emptyBig">
          请从「语音对话」页面进入
        </div>

        <div v-else-if="loadingSession" class="emptyBig">正在加载...</div>

        <div v-else-if="storyReq" class="reqBox">
          <div class="reqTop">
            <span class="reqBadge" :class="{ done: !!storyReq.done }">
              {{ storyReq.done ? "已收集完成 ✅" : "收集中…" }}
            </span>
          </div>

          <div class="reqGrid">
            <div class="reqItem"><span>类型</span><b>{{ storyReq.genre || "-" }}</b></div>
            <div class="reqItem"><span>主角</span><b>{{ storyReq.hero || "-" }}</b></div>
            <div class="reqItem"><span>地点</span><b>{{ storyReq.setting || "-" }}</b></div>
            <div class="reqItem"><span>氛围</span><b>{{ storyReq.tone || "-" }}</b></div>
            <div class="reqItem"><span>结局</span><b>{{ storyReq.ending || "-" }}</b></div>
            <div class="reqItem"><span>同伴</span><b>{{ storyReq.companion || "-" }}</b></div>
            <div class="reqItem"><span>障碍</span><b>{{ storyReq.obstacle || "-" }}</b></div>
            <div class="reqItem"><span>长度</span><b>{{ storyReq.length || "-" }}</b></div>
          </div>

          <div v-if="storyReq.taboo" class="reqItem wide">
            <span>禁忌/不要</span><b>{{ storyReq.taboo }}</b>
          </div>

          <div v-if="!storyReq.done" class="tip">
            回到「语音对话」继续补充需求～
          </div>
        </div>

        <div v-else class="emptyBig">
          未找到故事需求，请先完成「语音对话」
        </div>
      </div>

      <!-- 右：故事展示 -->
      <div class="panel">
        <h3 class="panelTitle">📖 故事内容</h3>

        <!-- 标题 -->
        <div class="field">
          <div class="label">标题</div>
          <input class="input readonly" :value="storyTitle || '（未生成）'" readonly />
        </div>

        <!-- 正文 -->
        <div class="field">
          <div class="label">正文 <span v-if="storyText" class="muted2">（{{ storyText.length }} 字）</span></div>

          <div class="storyBox" v-if="storyText">
            <div class="storyParagraph" v-for="(p, idx) in storyParagraphs" :key="idx">
              {{ p }}
            </div>
          </div>

          <div class="emptyStory" v-else>
            还没有故事内容：点击「一键生成故事」
          </div>
        </div>

        <!-- 寓意 -->
        <div class="field">
          <div class="label">寓意（可编辑）</div>
          <input class="input" v-model="moralDraft" placeholder="例如：勇敢尝试就会成长" />
        </div>

        <div class="row">
          <button class="btn" :disabled="busy || !sessionId || !canSaveMoral" @click="saveMoral">
            保存寓意
          </button>
          <span class="muted2" v-if="saveHint">{{ saveHint }}</span>
        </div>
      </div>
    </div>

    <!-- 统一导航栏 -->
    <NavigationBar :disable-next="!storyText" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";

/** ===== 与 Dialog.vue 对齐的配置 ===== */
const API_BASE = import.meta.env.VITE_API_BASE || "";
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";
const LS_SESSION = "visiontale_session_id";

function joinUrl(base, path) {
  if (!base) return path;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

async function apiFetch(path, init = {}) {
  const url = joinUrl(API_BASE, path);
  const headers = {
    ...(init.headers || {}),
    ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
  };
  return fetch(url, { ...init, headers });
}

const route = useRoute();
const router = useRouter();

function getSessionId() {
  const fromQuery = typeof route.query.sessionId === "string" ? route.query.sessionId : "";
  const fromLS = localStorage.getItem(LS_SESSION) || "";
  const sid = fromQuery || fromLS;
  if (fromQuery) localStorage.setItem(LS_SESSION, fromQuery);
  return sid;
}

/** ===== State ===== */
const sessionId = ref(getSessionId());
const session = ref(null);
const loadingSession = ref(false);

const storyReq = ref(null);
const rawSessionText = ref("");
const showDebug = ref(false);

const busy = ref(false);
const statusText = ref("");
const statusType = ref("info");
const saveHint = ref("");

const taskId = ref("");
const taskStatus = ref("");
const taskStage = ref("");
const taskProgress = ref(null);

// 友好文案映射
const friendlyMessage = computed(() => {
  if (taskProgress.value > 0 && taskProgress.value < 100) {
    return `正在创作故事... ${taskProgress.value}%`;
  }
  if (taskStage.value === 'generate_story') return '正在创作精彩的故事... ✨📖';
  return '正在处理中...';
});

const currentStage = computed(() => {
  if (taskStage.value === 'generate_story') return 'process';
  return 'default';
});

/** ===== Story 展示专用（只读）===== */
const storyTitle = ref("");
const storyText = ref("");
const storyWasJson = ref(false);
const moralDraft = ref("");

const artifactKeys = computed(() => Object.keys(session.value?.artifacts || {}));
const canGenerate = computed(() => !!sessionId.value && !!storyReq.value && !!storyReq.value.done);
const canSaveMoral = computed(() => moralDraft.value.trim().length > 0 && !!sessionId.value);

/** ===== Utils ===== */
function short(s) {
  return s.length <= 12 ? s : s.slice(0, 8) + "…" + s.slice(-4);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function safeString(x) {
  if (typeof x === "string") return x;
  if (x == null) return "";
  try { return JSON.stringify(x); } catch { return String(x); }
}

/**
 * 后端 artifacts["story"] 可能是：
 * 1) { title, text, moral }
 * 2) { title, story, moral }
 * 3) { text: '{"title":"...","story":"..."}' }  ← 你截图里这种
 * 这里统一解析成 storyTitle/storyText/storyWasJson
 */
function normalizeStory(st) {
  storyWasJson.value = false;

  const titleCandidate = st?.title;
  let bodyCandidate = st?.text ?? st?.story ?? "";

  // 如果 bodyCandidate 是一个 JSON 字符串，尝试解析
  const bodyStr = safeString(bodyCandidate).trim();

  if (bodyStr.startsWith("{") && bodyStr.includes('"story"')) {
    try {
      const obj = JSON.parse(bodyStr);
      const t = obj?.title || obj?.name || "";
      const s = obj?.story || obj?.text || "";
      if (s && typeof s === "string") {
        storyWasJson.value = true;
        storyTitle.value = String(t || titleCandidate || "").trim() || "小朋友的故事";
        storyText.value = String(s).trim();
        moralDraft.value = String(st?.moral || obj?.moral || "").trim();
        return;
      }
    } catch {
      // 解析失败就按纯文本展示
    }
  }

  // 纯文本/结构化字段
  storyTitle.value = String(titleCandidate || "小朋友的故事").trim();
  storyText.value = bodyStr ? bodyStr : "";
  moralDraft.value = String(st?.moral || "").trim();
}

const storyParagraphs = computed(() => {
  const t = (storyText.value || "").trim();
  if (!t) return [];
  // 按空行/换行拆段
  const parts = t.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length) return parts;
  // 兜底：按单换行
  return t.split(/\n|\r\n/).map((p) => p.trim()).filter(Boolean);
});

/** ===== 从 session 中取 artifacts ===== */
function pickStoryReq(sess) {
  const a = sess?.artifacts || {};
  return a["storyReq"] || a.storyReq || a.storyDialog?.storyReq || null;
}
function pickStory(sess) {
  const a = sess?.artifacts || {};
  return a["story"] || a.story || null;
}

/** ===== Load session ===== */
async function loadSession(forceDebug = false) {
  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从 Dialog 页进入。";
    statusType.value = "error";
    return;
  }

  loadingSession.value = true;
  statusText.value = "";
  statusType.value = "info";

  try {
    const res = await apiFetch(`/api/session/${sessionId.value}`);
    if (!res.ok) {
      statusText.value = `拉取 session 失败：http_${res.status}`;
      statusType.value = "error";
      session.value = null;
      storyReq.value = null;
      return;
    }
    const sess = await res.json();
    session.value = sess;

    if (showDebug.value || forceDebug) rawSessionText.value = JSON.stringify(sess, null, 2);

    storyReq.value = pickStoryReq(sess);

    const st = pickStory(sess);
    if (st) normalizeStory(st);
    else {
      storyTitle.value = "";
      storyText.value = "";
      moralDraft.value = "";
      storyWasJson.value = false;
    }
  } catch (e) {
    statusText.value = `拉取 session 异常：${e?.message || String(e)}`;
    statusType.value = "error";
  } finally {
    loadingSession.value = false;
  }
}

/** ===== Poll task ===== */
async function pollTaskUntilDone(id) {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    const res = await apiFetch(`/api/task/${id}`);
    if (!res.ok) throw new Error(`轮询失败：http_${res.status}`);
    const t = await res.json();

    taskStatus.value = t.status || "";
    taskStage.value = t.stage || "";
    taskProgress.value = typeof t.progress === "number" ? t.progress : null;

    if (t.status === "FAILED") throw new Error(t.error || "task_failed");
    if (t.status === "DONE") return;

    await sleep(700);
  }
  throw new Error("轮询超时（>180s）");
}

/** ===== Start generate ===== */
async function startGenerate() {
  if (!canGenerate.value || busy.value) return;

  busy.value = true;
  statusText.value = "";
  statusType.value = "info";
  taskId.value = "";
  taskStatus.value = "";
  taskStage.value = "";
  taskProgress.value = null;

  try {
    const res = await apiFetch("/api/story/generate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId.value, lengthHint: "", language: "zh" }),
    });

    if (!res.ok) {
      statusText.value = `生成失败：http_${res.status}`;
      statusType.value = "error";
      return;
    }
    const data = await res.json();
    if (!data?.taskId) throw new Error("后端未返回 taskId");

    taskId.value = data.taskId;
    statusText.value = "任务已创建，轮询中…";
    statusType.value = "info";

    await pollTaskUntilDone(taskId.value);

    statusText.value = "任务完成，刷新 session…";
    statusType.value = "info";

    await loadSession(false);

    statusText.value = "完成 ✅";
    statusType.value = "info";
  } catch (e) {
    statusText.value = `生成失败：${e?.message || String(e)}`;
    statusType.value = "error";
  } finally {
    busy.value = false;
  }
}

/** ===== 只保存寓意（不改标题/正文） =====
 * 复用后端通用接口 /api/session/:id/artifacts/story
 * 注意：这里只写 moral，不覆盖 storyText/title（避免用户误操作）
 */
async function saveMoral() {
  if (!canSaveMoral.value || busy.value) return;
  saveHint.value = "";

  try {
    const payload = { moral: moralDraft.value.trim(), source: "moral_only" };

    const res = await apiFetch(`/api/session/${sessionId.value}/artifacts/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`http_${res.status}`);

    saveHint.value = "已保存 ✅";
    await loadSession(false);
  } catch (e) {
    saveHint.value = `保存失败：${e?.message || String(e)}`;
  }
}

/** ===== Mount ===== */
onMounted(async () => {
  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从 Dialog 页进入（它会写入 localStorage）。";
    statusType.value = "error";
    return;
  }
  await loadSession(false);
});
</script>

<style scoped>
.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-md);
  min-height: 50vh;
  max-height: var(--content-available-height);
  box-shadow: var(--shadow-md);

  /* 固定上下布局 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-xs);
}

.titleWrap {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.title-fun {
  font-size: var(--font-base);
  color: var(--text-primary);
  font-weight: 900;
  margin: 0;
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
  white-space: nowrap;
}

.subtitle {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);
}

.row {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
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

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

.btn-fun {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}

.btn-primary {
  background: var(--primary-sky);
  color: var(--text-white);
  border-color: var(--primary-sky);
}

.status {
  margin-top: var(--space-sm);
  font-size: var(--font-base);
  color: var(--text-primary);
  font-weight: 700;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-highlight);
  border-radius: var(--radius-sm);
  border: 2px solid var(--primary-grass);
}

.status.error {
  background: #FFEBEE;
  border-color: #F44336;
  color: #C62828;
}

.grid {
  margin-top: var(--space-md);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);

  /* 可滚动区域 */
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panelTitle {
  margin: 0 0 var(--space-md);
  font-size: var(--font-lg);
  font-weight: 800;
  color: var(--text-primary);
}

.emptyBig {
  padding: var(--space-lg) var(--space-md);
  color: var(--text-muted);
  text-align: center;
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}

/* 故事需求展示 */
.reqBox {
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  padding: var(--space-md);
}

.reqTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.reqBadge {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid var(--border-medium);
  font-weight: 700;
  color: var(--text-secondary);
}

.reqBadge.done {
  background: rgba(140, 255, 160, 0.3);
  border-color: var(--primary-grass);
  color: var(--text-primary);
}

.reqGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.reqItem {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.6);
  border: 2px solid var(--border-light);
  font-size: var(--font-sm);
}

.reqItem span {
  color: var(--text-secondary);
  font-weight: 600;
}

.reqItem b {
  color: var(--text-primary);
  font-weight: 800;
}

.reqItem.wide {
  grid-column: 1 / -1;
  margin-top: var(--space-sm);
}

.tip {
  margin-top: var(--space-md);
  font-size: var(--font-sm);
  color: var(--text-secondary);
  padding: var(--space-sm) var(--space-md);
  background: rgba(255, 200, 100, 0.2);
  border-radius: var(--radius-sm);
  border: 2px solid rgba(255, 200, 100, 0.4);
}

/* 表单字段 */
.field {
  margin-top: var(--space-md);
}

.label {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 700;
  margin-bottom: var(--space-xs);
  display: block;
}

.input {
  width: 100%;
  box-sizing: border-box;
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-base);
  outline: none;
  background: rgba(255, 255, 255, 0.8);
  color: var(--text-primary);
  font-weight: 600;
}

.input.readonly {
  opacity: 0.8;
  background: var(--bg-panel);
  cursor: default;
}

/* 故事展示框 */
.storyBox {
  border: 3px solid var(--border-medium);
  background: rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  min-height: 200px;
  max-height: 400px;
  overflow: auto;
  color: var(--text-primary);
  line-height: 1.8;
  font-size: var(--font-base);
}

.storyParagraph {
  margin-bottom: var(--space-md);
  text-indent: 2em;
}

.storyParagraph:last-child {
  margin-bottom: 0;
}

.emptyStory {
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: var(--space-lg) var(--space-md);
  color: var(--text-muted);
  text-align: center;
}

.muted2 {
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .card {
    padding: var(--space-sm);
    min-height: 400px;
  }

  .title-fun {
    font-size: var(--font-base);
  }

  .panelTitle {
    font-size: var(--font-sm);
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .reqGrid {
    grid-template-columns: 1fr;
  }
}

/* 手机 (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .card {
    padding: var(--space-sm);
  }

  .title-fun {
    font-size: var(--font-base);
  }

  .panelTitle {
    font-size: var(--font-base);
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .reqGrid {
    grid-template-columns: 1fr;
  }
}

/* 平板竖屏/小平板横屏 (768px - 899px) */
@media (min-width: 768px) and (max-width: 899px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .reqGrid {
    grid-template-columns: 1fr 1fr;
  }
}

/* 平板横屏/小笔记本 (900px - 1279px) - 关键优化 */
@media (min-width: 900px) and (max-width: 1279px) {
  .card {
    padding: var(--space-md);
  }

  .title-fun {
    font-size: var(--font-lg);
  }

  .grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }
}

/* 桌面端及以上 (>= 1280px) */
@media (min-width: 1280px) {
  .card {
    padding: var(--space-lg);
  }
}
</style>
