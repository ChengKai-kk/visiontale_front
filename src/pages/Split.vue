<template>
  <section class="card">
    <header class="head">
      <div class="titleWrap">
        <h1 class="title-fun">✂️ 拆分场景</h1>
        <p class="subtitle">拆分为6～8个精彩场景</p>
      </div>
    </header>

    <!-- 操作区 -->
    <div class="panel">
      <div class="row">
        <button class="btn btn-primary btn-fun" :disabled="busy || !canSplit" @click="startSplit">
          {{ busy ? "拆分中..." : "✨ 一键拆分场景" }}
        </button>

        <div class="control">
          <div class="labelMini">场景数（6～8）</div>
          <div class="controlRow">
            <input class="range" type="range" min="6" max="8" step="1" v-model.number="maxScenes" :disabled="busy" />
            <div class="rangeVal mono">{{ maxScenes }}</div>
          </div>
        </div>

        <div class="spacer"></div>

        <span v-if="scenes.length" class="okPill">完成 ✅</span>
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
      <!-- 左：故事（只读） -->
      <div class="panel">
        <h3 class="panelTitle">📖 故事内容（只读）</h3>

        <div v-if="loadingSession" class="emptyBig">正在加载 session...</div>

        <div v-else-if="storyText" class="storyBox">
          <div class="storyTitle">{{ storyTitle }}</div>
          <div class="storyParagraph" v-for="(p, idx) in storyParagraphs" :key="idx">
            {{ p }}
          </div>
        </div>

        <div v-else class="emptyBig">
          未找到故事：请先在「生成故事」页生成并写入 artifacts["story"]（字段 text）。
        </div>
      </div>

      <!-- 右：场景列表 -->
      <div class="panel">
        <h3 class="panelTitle">🎬 场景列表（可编辑）</h3>

        <div v-if="!scenes.length" class="emptyBig">
          还没有场景：点击「一键拆分场景」生成 6～8 个。
          <div class="tinyTip">
            后端写入：artifacts["scenes"].items（每项含 sceneTitle/sceneText/imagePrompt/narration）
          </div>
        </div>

        <div v-else class="sceneList">
          <div class="sceneCard" v-for="(s, idx) in scenes" :key="s.id">
            <div class="sceneTop">
              <div class="sceneIdx mono">#{{ idx + 1 }}</div>
              <div class="sceneOps">
                <button class="miniBtn" :disabled="busy || idx === 0" @click="moveUp(idx)">上移</button>
                <button class="miniBtn" :disabled="busy || idx === scenes.length - 1" @click="moveDown(idx)">下移</button>
                <button class="miniBtn danger" :disabled="busy" @click="removeScene(idx)">删除</button>
              </div>
            </div>

            <div class="field">
              <div class="label">场景标题（sceneTitle）</div>
              <input class="input" v-model="s.sceneTitle" placeholder="例如：踏上冒险岛的木桥" />
            </div>

            <div class="field">
              <div class="label">场景概括（sceneText，1～3 句）</div>
              <textarea class="textarea" rows="4" v-model="s.sceneText" placeholder="该场景发生了什么？"></textarea>
            </div>

            <div class="field">
              <div class="label">旁白（narration，1～2 句）</div>
              <textarea class="textarea" rows="3" v-model="s.narration" placeholder="例如：小朋友鼓起勇气，带着小狗继续前进。"></textarea>
            </div>

            <div class="field">
              <div class="label">文生图提示词（imagePrompt）</div>
              <textarea
                class="textarea"
                rows="4"
                v-model="s.imagePrompt"
                placeholder="例如：儿童绘本风格，主角小朋友+小狗，动作/环境/氛围清晰，色彩温暖明亮，细腻插画"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="row" v-if="scenes.length">
          <button class="btn" :disabled="busy" @click="addScene">+ 添加一个场景</button>
          <button class="btn btn-primary" :disabled="busy" @click="saveScenes">保存场景</button>
          <span class="muted2" v-if="saveHint">{{ saveHint }}</span>
        </div>
      </div>
    </div>

    <!-- 底部导航 -->
    <NavigationBar :disable-next="!scenes.length" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";

/** ===== 与 Dialog/Story 对齐配置 ===== */
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

/** ===== router / step ===== */
const route = useRoute();
const router = useRouter();

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

function getSessionId() {
  const fromQuery = typeof route.query.sessionId === "string" ? route.query.sessionId : "";
  const fromLS = localStorage.getItem(LS_SESSION) || "";
  const sid = fromQuery || fromLS;
  if (fromQuery) localStorage.setItem(LS_SESSION, fromQuery);
  return sid;
}

/** ===== state ===== */
const sessionId = ref(getSessionId());
const loadingSession = ref(false);

const storyTitle = ref("");
const storyText = ref("");

const scenes = reactive([]); // [{id,order,sceneTitle,sceneText,imagePrompt,narration}]
const maxScenes = ref(6); // ✅ 限制 6~8

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
    return `正在拆分场景... ${taskProgress.value}%`;
  }
  if (taskStage.value === 'split_scenes') return '正在拆分故事场景... ✂️📝';
  return '正在处理中...';
});

const currentStage = computed(() => {
  if (taskStage.value === 'split_scenes') return 'process';
  return 'default';
});

const showDebug = ref(false);
const rawSessionText = ref("");

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

/** ===== parse story artifact ===== */
function normalizeStory(st) {
  const titleCandidate = st?.title;
  const bodyCandidate = st?.text ?? st?.story ?? "";
  const bodyStr = safeString(bodyCandidate).trim();

  storyTitle.value = String(titleCandidate || "小朋友的故事").trim();
  storyText.value = bodyStr;
}

const storyParagraphs = computed(() => {
  const t = (storyText.value || "").trim();
  if (!t) return [];
  const parts = t.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : t.split(/\n|\r\n/).map((p) => p.trim()).filter(Boolean);
});

/** ===== pick artifacts：对齐后端真实结构 ===== */
function pickStory(sess) {
  const a = sess?.artifacts || {};
  return a["story"] || a.story || null; // 后端写的是 artifacts.story {title,text,moral}
}

// ✅ 你的后端写的是 artifacts.scenes = { items: [...] }
function pickScenesNode(sess) {
  const a = sess?.artifacts || {};
  return a["scenes"] || a.scenes || null;
}

function loadScenesIntoUI(node) {
  // node 可能是 {items:[...]}，也可能后续你会直接写成数组，所以两种都兼容
  const items = Array.isArray(node) ? node : Array.isArray(node?.items) ? node.items : [];
  scenes.splice(0, scenes.length);
  items.forEach((s, idx) => {
    scenes.push({
      id: String(s.id || `${Date.now()}_${idx}`),
      order: Number(s.order || idx + 1),
      sceneTitle: String(s.sceneTitle || `场景 ${idx + 1}`).slice(0, 80),
      sceneText: String(s.sceneText || "").trim(),
      imagePrompt: String(s.imagePrompt || "").trim(),
      narration: String(s.narration || "").trim(),
    });
  });
}

/** ===== canSplit ===== */
const canSplit = computed(() => !!sessionId.value && !!storyText.value.trim());

/** ===== load session ===== */
async function loadSession(forceDebug = false) {
  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从前一页进入。";
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
      return;
    }
    const sess = await res.json();
    if (showDebug.value || forceDebug) rawSessionText.value = JSON.stringify(sess, null, 2);

    const st = pickStory(sess);
    if (st) normalizeStory(st);

    const scenesNode = pickScenesNode(sess);
    if (scenesNode) loadScenesIntoUI(scenesNode);
  } catch (e) {
    statusText.value = `拉取 session 异常：${e?.message || String(e)}`;
    statusType.value = "error";
  } finally {
    loadingSession.value = false;
  }
}

/** ===== poll task ===== */
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

/** ===== start split ===== */
async function startSplit() {
  if (!canSplit.value || busy.value) return;

  // ✅ 强制限制 6~8（你希望的范围）
  const n = Math.min(8, Math.max(6, Math.round(Number(maxScenes.value) || 6)));
  maxScenes.value = n;

  busy.value = true;
  statusText.value = "";
  statusType.value = "info";
  saveHint.value = "";

  taskId.value = "";
  taskStatus.value = "";
  taskStage.value = "";
  taskProgress.value = null;

  try {
    const res = await apiFetch("/api/story/split/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId.value, maxScenes: n }),
    });

    if (!res.ok) {
      statusText.value = `拆分失败：http_${res.status}`;
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
    statusText.value = `拆分失败：${e?.message || String(e)}`;
    statusType.value = "error";
  } finally {
    busy.value = false;
  }
}

/** ===== edit ops ===== */
function moveUp(idx) {
  if (idx <= 0) return;
  const tmp = scenes[idx - 1];
  scenes[idx - 1] = scenes[idx];
  scenes[idx] = tmp;
}
function moveDown(idx) {
  if (idx >= scenes.length - 1) return;
  const tmp = scenes[idx + 1];
  scenes[idx + 1] = scenes[idx];
  scenes[idx] = tmp;
}
function removeScene(idx) {
  scenes.splice(idx, 1);
}
function addScene() {
  scenes.push({
    id: String(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`),
    order: scenes.length + 1,
    sceneTitle: `场景 ${scenes.length + 1}`,
    sceneText: "",
    imagePrompt: "",
    narration: "",
  });
}

/** ===== save scenes：写回 artifacts["scenes"] = { items: [...] }（完全对齐后端） ===== */
async function saveScenes() {
  if (!sessionId.value || busy.value) return;
  saveHint.value = "";

  try {
    // 保持后端同款结构：{ items: [...] }
    const items = scenes.map((s, i) => ({
      id: s.id || `${Date.now()}_${i}`,
      order: i + 1,
      sceneTitle: String(s.sceneTitle || `场景 ${i + 1}`).trim().slice(0, 80),
      sceneText: String(s.sceneText || "").trim(),
      imagePrompt: String(s.imagePrompt || "").trim(),
      narration: String(s.narration || "").trim(),
    }));

    const payload = {
      items,
      source: "user_edit",
      updatedAt: Date.now(),
    };

    const res = await apiFetch(`/api/session/${sessionId.value}/artifacts/scenes`, {
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

/** ===== 响应式高度计算（与 Dialog 对齐） ===== */
let _prevBodyOverflow = "";
let _prevHtmlOverflow = "";
let _prevBodyOverscroll = "";
let _prevHtmlOverscroll = "";

function lockPageScroll() {
  const body = document.body;
  const html = document.documentElement;

  _prevBodyOverflow = body.style.overflow;
  _prevHtmlOverflow = html.style.overflow;
  _prevBodyOverscroll = body.style.overscrollBehavior;
  _prevHtmlOverscroll = html.style.overscrollBehavior;

  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  html.style.overscrollBehavior = "none";
}

function unlockPageScroll() {
  const body = document.body;
  const html = document.documentElement;

  body.style.overflow = _prevBodyOverflow || "";
  html.style.overflow = _prevHtmlOverflow || "";
  body.style.overscrollBehavior = _prevBodyOverscroll || "";
  html.style.overscrollBehavior = _prevHtmlOverscroll || "";
}

function applySafeHeights() {
  const html = document.documentElement;
  const header = document.querySelector(".app-header");
  const main = document.querySelector(".app-main");

  const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
  let padTop = 0;
  let padBottom = 0;
  if (main) {
    const cs = getComputedStyle(main);
    padTop = parseFloat(cs.paddingTop || "0") || 0;
    padBottom = parseFloat(cs.paddingBottom || "0") || 0;
  }

  html.style.setProperty("--vt-header-h", `${headerH}px`);
  html.style.setProperty("--vt-main-pad-top", `${padTop}px`);
  html.style.setProperty("--vt-main-pad-bottom", `${padBottom}px`);
}

/** ===== mount ===== */
onMounted(async () => {
  applySafeHeights();
  lockPageScroll();
  window.addEventListener("resize", applySafeHeights);

  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从前一页进入。";
    statusType.value = "error";
    return;
  }
  await loadSession(false);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", applySafeHeights);
  unlockPageScroll();
});
</script>

<style scoped>
/* 统一使用全局CSS变量 */
.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-md);
  box-shadow: var(--shadow-md);

  /* 响应式高度：使用全局变量 */
  height: var(--content-available-height);
  max-height: var(--content-available-height);
  min-height: 500px;

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

.control {
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
}
.labelMini { font-size: var(--font-sm); color: var(--text-secondary); margin-bottom: 6px; font-weight: 700; }
.controlRow { display: flex; align-items: center; gap: 10px; }
.range { width: 140px; }
.rangeVal { min-width: 18px; text-align: right; color: var(--text-primary); font-weight: 700; }

.spacer { flex: 1; }

.okPill {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: rgba(129, 199, 132, 0.3);
  border: 2px solid var(--primary-grass);
  color: var(--text-primary);
  font-weight: 700;
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

  /* 占据剩余高度 */
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.grid > .panel {
  /* 每个面板独立滚动 */
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

.tinyTip {
  margin-top: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-secondary);
}

.storyBox {
  border: 2px solid var(--border-medium);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  color: var(--text-primary);
  line-height: 1.7;
  font-size: var(--font-base);

  /* 占据剩余空间并滚动 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.storyTitle {
  font-weight: 900;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
}
.storyParagraph {
  margin-bottom: var(--space-md);
  text-indent: 2em;
}
.storyParagraph:last-child {
  margin-bottom: 0;
}

.sceneList {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-right: var(--space-sm);

  /* 占据剩余空间并滚动 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sceneCard {
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  transition: all 200ms ease;
}
.sceneCard:hover {
  box-shadow: var(--shadow-sm);
}

.sceneTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}
.sceneIdx {
  color: var(--text-primary);
  font-weight: 800;
  font-size: var(--font-base);
}
.sceneOps { display: flex; gap: var(--space-sm); }
.miniBtn {
  border: 0;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: var(--font-sm);
  cursor: pointer;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 2px solid var(--border-medium);
  font-weight: 700;
  transition: all 200ms ease;
}
.miniBtn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.miniBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.miniBtn.danger {
  border-color: #F44336;
  background: #FFEBEE;
  color: #C62828;
}

.field {
  margin-top: var(--space-sm);
}
.label {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-bottom: 6px;
  display: block;
  font-weight: 700;
}
.input, .textarea {
  width: 100%;
  box-sizing: border-box;
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-base);
  outline: none;
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
}
.textarea {
  resize: vertical;
  font-family: inherit;
}

.muted2 {
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .card {
    padding: var(--space-sm);
    min-height: 350px;
  }

  .title-fun {
    font-size: var(--font-sm);
  }

  .subtitle {
    font-size: 12px;
  }

  .panel {
    padding: var(--space-sm);
  }

  .panelTitle {
    font-size: var(--font-sm);
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .grid > .panel {
    max-height: 35vh;
  }

  .sceneCard {
    padding: var(--space-sm);
  }

  .sceneTop {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .sceneOps {
    width: 100%;
    justify-content: space-between;
  }

  .miniBtn {
    flex: 1;
    font-size: 11px;
    padding: 4px 6px;
  }

  .row {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    width: 100%;
  }

  .control {
    width: 100%;
  }
}

/* 手机 (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .card {
    padding: var(--space-sm);
    min-height: 400px;
  }

  .title-fun {
    font-size: var(--font-base);
  }

  .subtitle {
    font-size: var(--font-sm);
  }

  .panelTitle {
    font-size: var(--font-base);
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .grid > .panel {
    max-height: 40vh;
  }

  .row {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    width: 100%;
  }

  .control {
    width: 100%;
  }
}

/* 平板竖屏 (768px - 899px) */
@media (min-width: 768px) and (max-width: 899px) {
  .card {
    padding: var(--space-md);
  }

  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  .grid > .panel {
    max-height: 45vh;
  }

  .storyBox {
    max-height: 35vh;
  }

  .sceneList {
    max-height: 35vh;
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
