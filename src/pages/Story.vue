<template>
  <section class="vtPage">
    <div class="vtCard">
      <!-- 顶部说明栏 -->
      <header class="vtHeader">
        <div class="vtHeaderLeft">
          <div class="vtTitle">生成故事</div>
          <div class="vtSub">根据刚才的对话结果（storyReq）生成一个儿童故事（标题/正文只读）。</div>
        </div>

        <div class="vtHeaderRight">
          <div class="vtPill">
            <span class="k">API</span>
            <span class="v mono">{{ API_BASE || "(same-origin /api)" }}</span>
          </div>
          <div class="vtPill">
            <span class="k">SID</span>
            <span class="v mono">{{ sessionId ? short(sessionId) : "-" }}</span>
          </div>
        </div>
      </header>

      <!-- 操作区 -->
      <div class="vtToolbar">
        <button class="btn primary" :disabled="busy || !canGenerate" @click="startGenerate">
          {{ busy ? "生成中..." : "一键生成故事" }}
        </button>

        <button class="btn ghost" :disabled="busy || !sessionId" @click="loadSession(true)">
          刷新 session
        </button>

        <button class="btn ghost" :disabled="busy" @click="showDebug = !showDebug">
          {{ showDebug ? "隐藏调试" : "显示调试" }}
        </button>

        <div class="spacer"></div>

        <div class="hint" v-if="statusText" :class="{ error: statusType === 'error' }">
          {{ statusText }}
        </div>
      </div>

      <!-- 任务进度 -->
      <div class="vtProgress" v-if="taskId">
        <div class="meta">
          <span class="mono">task: {{ taskId }}</span>
          <span class="dot">•</span>
          <span class="mono">status: {{ taskStatus || "-" }}</span>
          <span class="dot">•</span>
          <span class="mono">stage: {{ taskStage || "-" }}</span>
          <span class="dot">•</span>
          <span class="mono">progress: {{ taskProgress != null ? taskProgress + "%" : "-" }}</span>
        </div>
        <div class="bar">
          <div class="fill" :style="{ width: (taskProgress || 0) + '%' }"></div>
        </div>
      </div>

      <!-- Debug -->
      <div class="vtDebug" v-if="showDebug">
        <div class="debugTitle">调试：/api/session 返回</div>
        <pre class="debugPre">{{ rawSessionText || "(尚未拉取)" }}</pre>
      </div>

      <!-- 主体内容 -->
      <div class="vtGrid">
        <!-- 左：storyReq -->
        <div class="panel">
          <div class="panelTop">
            <div class="panelTitle">故事需求（artifacts["storyReq"]）</div>
            <div class="panelMeta" v-if="artifactKeys.length">
              keys: <span class="mono">{{ artifactKeys.join(", ") }}</span>
            </div>
          </div>

          <div v-if="!sessionId" class="emptyBig">
            缺少 sessionId：请从 Dialog 页正常进入（它会写入 localStorage: "visiontale_session_id"）
          </div>

          <div v-else-if="loadingSession" class="emptyBig">正在加载 session...</div>

          <div v-else-if="storyReq" class="reqBox">
            <div class="reqTop">
              <span class="badge" :class="{ ok: !!storyReq.done }">
                {{ storyReq.done ? "已收集完成 ✅" : "收集中…" }}
              </span>
              <span class="muted" v-if="storyReq.updatedAt">
                updatedAt: {{ new Date(storyReq.updatedAt).toLocaleString() }}
              </span>
            </div>

            <pre class="json">{{ JSON.stringify(storyReq, null, 2) }}</pre>

            <div v-if="!storyReq.done" class="tip">
              需求还没 done：回到“语音对话”补充一下，让小助手把 storyReq 补齐。
            </div>
          </div>

          <div v-else class="emptyBig">
            未找到 storyReq：请确认 Dialog 页是否把需求写入 artifacts["storyReq"]，并且当前页面用的是同一个 sessionId。
          </div>
        </div>

        <!-- 右：故事展示（只读） -->
        <div class="panel">
          <div class="panelTop">
            <div class="panelTitle">故事内容（只读）</div>
            <div class="panelMeta" v-if="storyText">
              字数：<span class="mono">{{ storyText.length }}</span>
            </div>
          </div>

          <!-- 标题（只读） -->
          <div class="field">
            <div class="label">标题</div>
            <input class="input readonly" :value="storyTitle || '（未生成）'" readonly />
          </div>

          <!-- 正文（只读，非 textarea，避免看起来像可编辑） -->
          <div class="field">
            <div class="label">正文</div>

            <div class="storyBox" v-if="storyText">
              <div class="storyParagraph" v-for="(p, idx) in storyParagraphs" :key="idx">
                {{ p }}
              </div>
            </div>

            <div class="emptyStory" v-else>
              还没有故事内容：点击「一键生成故事」。
            </div>

            <div class="tinyTip" v-if="storyText && storyWasJson">
              （已自动从 JSON 结构中解析为可读文本）
            </div>
          </div>

          <!-- 寓意（可编辑，可保存） -->
          <div class="field">
            <div class="label">寓意（可选，可编辑）</div>
            <input class="input" v-model="moralDraft" placeholder="例如：勇敢尝试就会成长" />
          </div>

          <div class="row">
            <button class="btn" :disabled="busy || !sessionId || !canSaveMoral" @click="saveMoral">
              保存寓意
            </button>
            <span class="muted" v-if="saveHint">{{ saveHint }}</span>
          </div>

          <div class="navBar">
            <button class="btn ghost" :disabled="!prevStep" @click="goPrev">← 上一步</button>
            <div class="navHint">
              <span class="muted">下一步：</span>
              <b>{{ nextStep?.title || "-" }}</b>
            </div>
            <button class="btn next" :disabled="!nextStep || !storyText" @click="goNext">
              下一步 →
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="vtBg"></div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

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

/** ===== Step 导航 ===== */
const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});
const prevStep = computed(() => (currentIndex.value > 0 ? steps[currentIndex.value - 1] : null));
const nextStep = computed(() => (currentIndex.value < steps.length - 1 ? steps[currentIndex.value + 1] : null));

function goPrev() {
  if (!prevStep.value) return;
  router.push(prevStep.value.path);
}
function goNext() {
  if (!nextStep.value) return;
  router.push({ path: nextStep.value.path, query: { sessionId: sessionId.value } });
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

/** ===== Story 展示专用（只读）===== */
const storyTitle = ref("");
const storyText = ref("");
const storyWasJson = ref(false);
const moralDraft = ref("");

const artifactKeys = computed(() => Object.keys(session.value?.artifacts || {}));
const canGenerate = computed(() => !!sessionId.value && !!storyReq.value && !!storyReq.value.done);
const canSaveMoral = computed(() => moralDraft.value.trim().length > 0 && !!sessionId.value);

/** ===== Scroll lock：避免整页滚动，和 Dialog 一致体验 ===== */
let prevBodyOverflow = "";
let prevHtmlOverflow = "";
function lockScroll() {
  prevBodyOverflow = document.body.style.overflow;
  prevHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
}
function unlockScroll() {
  document.body.style.overflow = prevBodyOverflow || "";
  document.documentElement.style.overflow = prevHtmlOverflow || "";
}

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
  lockScroll();
  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从 Dialog 页进入（它会写入 localStorage）。";
    statusType.value = "error";
    return;
  }
  await loadSession(false);
});

onBeforeUnmount(() => {
  unlockScroll();
});
</script>

<style scoped>
/* ===== 避免和全局顶部进度条重叠：给页面预留顶部空间 ===== */
.vtPage {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 88px 14px 14px; /* ⬅️ 顶部 88px 预留给全局进度条/导航 */
  position: relative;
}

.vtBg {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(1200px 700px at 20% 0%, rgba(255, 140, 70, 0.14), transparent 60%),
    radial-gradient(1000px 600px at 80% 15%, rgba(99, 102, 241, 0.10), transparent 60%),
    linear-gradient(to bottom, rgba(0,0,0,0.65), rgba(0,0,0,0.75));
}

/* ===== 外层卡片：深色风格对齐 Dialog ===== */
.vtCard {
  max-width: 1220px;
  margin: 0 auto;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(17, 19, 23, 0.88);
  box-shadow: 0 18px 55px rgba(0,0,0,0.45);
}

/* Header */
.vtHeader {
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}
.vtTitle {
  font-size: 18px;
  font-weight: 800;
  color: rgba(255,255,255,0.92);
}
.vtSub {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(255,255,255,0.55);
}
.vtHeaderRight {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}
.vtPill {
  font-size: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);
  padding: 6px 10px;
  border-radius: 999px;
  display: flex;
  gap: 8px;
  max-width: 520px;
}
.vtPill .k { color: rgba(255,255,255,0.55); }
.vtPill .v { color: rgba(255,255,255,0.82); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* Toolbar */
.vtToolbar {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.spacer { flex: 1; }

.hint {
  font-size: 13px;
  color: rgba(255,255,255,0.70);
}
.hint.error { color: rgba(255, 120, 120, 0.95); }

.btn {
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.86);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 14px;
  cursor: pointer;
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }

.btn.primary {
  background: rgba(255, 140, 70, 0.20);
  border-color: rgba(255, 140, 70, 0.35);
}
.btn.ghost {
  background: rgba(255,255,255,0.05);
}
.btn.next {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.30);
}

/* Progress */
.vtProgress {
  padding: 10px 18px 14px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.vtProgress .meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
}
.dot { opacity: 0.6; }
.bar {
  margin-top: 8px;
  height: 10px;
  background: rgba(255,255,255,0.10);
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  width: 0%;
  background: rgba(255, 140, 70, 0.65);
  transition: width 0.2s ease;
}

/* Debug */
.vtDebug {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.debugTitle {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 8px;
  color: rgba(255,255,255,0.60);
}
.debugPre {
  margin: 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 12px;
  color: rgba(255,255,255,0.78);
  max-height: 220px;
  overflow: auto;
}

/* Grid */
.vtGrid {
  padding: 14px;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 14px;
}
@media (max-width: 960px) {
  .vtGrid { grid-template-columns: 1fr; }
}

/* Panels */
.panel {
  height: calc(100vh - 340px);
  overflow: auto;
  border-radius: 16px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(8, 10, 13, 0.55);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
}

.panelTop {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.panelTitle {
  font-weight: 800;
  font-size: 14px;
  color: rgba(255,255,255,0.88);
}
.panelMeta {
  font-size: 12px;
  color: rgba(255,255,255,0.50);
}

.emptyBig {
  padding: 18px 10px;
  color: rgba(255,255,255,0.48);
}

/* Req */
.reqBox { display: flex; flex-direction: column; gap: 10px; }
.reqTop { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.78);
}
.badge.ok { background: rgba(16,185,129,0.18); color: rgba(255,255,255,0.88); }

.muted { color: rgba(255,255,255,0.55); font-size: 12px; }

.json {
  margin: 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255,255,255,0.78);
  overflow: auto;
}
.tip {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
}

/* Form */
.field { margin-top: 12px; }
.label { font-size: 12px; color: rgba(255,255,255,0.60); margin-bottom: 6px; }

.input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.88);
}
.input.readonly {
  opacity: 0.9;
  background: rgba(255,255,255,0.04);
}

/* Story read-only box */
.storyBox {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.30);
  border-radius: 14px;
  padding: 12px;
  min-height: 240px;
  max-height: 520px;
  overflow: auto;
  color: rgba(255,255,255,0.88);
  line-height: 1.7;
  font-size: 14px;
}
.storyParagraph + .storyParagraph {
  margin-top: 10px;
}

.emptyStory {
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.03);
  border-radius: 14px;
  padding: 14px 12px;
  color: rgba(255,255,255,0.55);
}

.tinyTip {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.45);
}

.row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Bottom nav */
.navBar {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.10);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.navHint {
  font-size: 13px;
  color: rgba(255,255,255,0.62);
}
</style>
