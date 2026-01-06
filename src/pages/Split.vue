<template>
  <section class="vtPage">
    <div class="vtCard">
      <!-- 顶部固定区 -->
      <div class="vtTop">
        <header class="vtHeader">
          <div class="vtHeaderLeft">
            <div class="vtTitle">拆分文本</div>
            <div class="vtSub">
              将故事拆分为 6～8 个场景（可编辑、排序），保存到 artifacts["scenes"].items，用于后续生成图像。
            </div>
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

        <div class="vtToolbar">
          <button class="btn primary" :disabled="busy || !canSplit" @click="startSplit">
            {{ busy ? "拆分中..." : "一键拆分场景" }}
          </button>

          <button class="btn ghost" :disabled="busy || !sessionId" @click="loadSession(true)">
            刷新 session
          </button>

          <div class="control">
            <div class="labelMini">场景数（6～8）</div>
            <div class="controlRow">
              <input class="range" type="range" min="6" max="8" step="1" v-model.number="maxScenes" :disabled="busy" />
              <div class="rangeVal mono">{{ maxScenes }}</div>
            </div>
          </div>

          <button class="btn ghost" :disabled="busy" @click="showDebug = !showDebug">
            {{ showDebug ? "隐藏调试" : "显示调试" }}
          </button>

          <div class="spacer"></div>

          <div class="hint" v-if="statusText" :class="{ error: statusType === 'error' }">
            {{ statusText }}
          </div>

          <div class="okPill" v-if="scenes.length">完成 ✅</div>
        </div>

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

        <div class="vtDebug" v-if="showDebug">
          <div class="debugTitle">调试：/api/session 返回</div>
          <pre class="debugPre">{{ rawSessionText || "(尚未拉取)" }}</pre>
        </div>
      </div>

      <!-- 中间可滚动区（左右面板各自滚动） -->
      <div class="vtMid">
        <div class="vtGrid">
          <!-- 左：故事（只读） -->
          <div class="panel">
            <div class="panelTop">
              <div class="panelTitle">故事内容（只读）</div>
              <div class="panelMeta" v-if="storyText">
                字数：<span class="mono">{{ storyText.length }}</span>
              </div>
            </div>

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
            <div class="panelTop">
              <div class="panelTitle">场景列表（可编辑）</div>
              <div class="panelMeta">
                <span v-if="scenes.length">共 {{ scenes.length }} 个</span>
                <span v-else>暂无</span>
              </div>
            </div>

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
              <button class="btn" :disabled="busy" @click="saveScenes">保存场景</button>
              <span class="muted" v-if="saveHint">{{ saveHint }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部固定导航：左下/右下 -->
      <div class="vtBottom">
        <button class="btn ghost" :disabled="!prevStep" @click="goPrev">← 上一步</button>
        <div class="navHint">
          <span class="muted">当前步骤：</span><b>拆分文本</b>
          <span class="sep">·</span>
          <span class="muted">下一步：</span><b>{{ nextStep?.title || "-" }}</b>
        </div>
        <button class="btn next" :disabled="!nextStep || !scenes.length" @click="goNext">下一步 →</button>
      </div>
    </div>

    <div class="vtBg"></div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

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

/** ===== scroll lock：整页不滚，只有中间滚 ===== */
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

/** ===== mount ===== */
onMounted(async () => {
  lockScroll();
  if (!sessionId.value) {
    statusText.value = "缺少 sessionId：请从前一页进入。";
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
/* 顶部预留，避免与全局进度条重叠 */
.vtPage {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 88px 14px 14px;
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

.vtCard {
  max-width: 1220px;
  margin: 0 auto;
  height: calc(100vh - 88px - 14px - 14px); /* 视口高度 - 页面 padding */
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(17, 19, 23, 0.88);
  box-shadow: 0 18px 55px rgba(0,0,0,0.45);
  display: flex;
  flex-direction: column;
}

/* 顶部固定区域 */
.vtTop {
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

/* 中间区域：占满剩余，内部网格 */
.vtMid {
  flex: 1 1 auto;
  overflow: hidden; /* 让 panel 自己滚 */
}

/* 底部固定导航 */
.vtBottom {
  flex: 0 0 auto;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(17, 19, 23, 0.92);
}

/* Header */
.vtHeader {
  padding: 16px 18px;
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

.okPill{
  margin-left: 6px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(16,185,129,0.18);
  border: 1px solid rgba(16,185,129,0.30);
  color: rgba(255,255,255,0.88);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* Toolbar */
.vtToolbar {
  padding: 12px 18px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.spacer { flex: 1; }

.hint { font-size: 13px; color: rgba(255,255,255,0.70); }
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
.btn.primary { background: rgba(255, 140, 70, 0.20); border-color: rgba(255, 140, 70, 0.35); }
.btn.ghost { background: rgba(255,255,255,0.05); }
.btn.next { background: rgba(99, 102, 241, 0.18); border-color: rgba(99, 102, 241, 0.30); }

/* maxScenes */
.control {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  padding: 8px 10px;
  border-radius: 12px;
}
.labelMini { font-size: 12px; color: rgba(255,255,255,0.55); margin-bottom: 6px; }
.controlRow { display: flex; align-items: center; gap: 10px; }
.range { width: 140px; }
.rangeVal { min-width: 18px; text-align: right; color: rgba(255,255,255,0.80); }

/* progress */
.vtProgress {
  padding: 10px 18px 14px 18px;
  border-top: 1px solid rgba(255,255,255,0.08);
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
.fill { height: 100%; width: 0%; background: rgba(255, 140, 70, 0.65); transition: width 0.2s ease; }

/* debug */
.vtDebug {
  padding: 12px 18px;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.debugTitle { font-weight: 800; font-size: 12px; margin-bottom: 8px; color: rgba(255,255,255,0.60); }
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

/* mid grid */
.vtGrid {
  height: 100%;
  padding: 14px;
  display: grid;
  grid-template-columns: 0.95fr 1.05fr;
  gap: 14px;
}
@media (max-width: 960px) {
  .vtGrid { grid-template-columns: 1fr; }
}

/* panels: 自己滚动 */
.panel {
  height: 100%;
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
.panelTitle { font-weight: 800; font-size: 14px; color: rgba(255,255,255,0.88); }
.panelMeta { font-size: 12px; color: rgba(255,255,255,0.50); }
.emptyBig { padding: 18px 10px; color: rgba(255,255,255,0.48); }

.storyBox {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.30);
  border-radius: 14px;
  padding: 12px;
  color: rgba(255,255,255,0.88);
  line-height: 1.7;
  font-size: 14px;
}
.storyTitle { font-weight: 900; margin-bottom: 10px; }
.storyParagraph + .storyParagraph { margin-top: 10px; }

/* scenes */
.sceneList { display: flex; flex-direction: column; gap: 12px; }
.sceneCard {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.28);
  border-radius: 14px;
  padding: 12px;
}
.sceneTop { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.sceneIdx { color: rgba(255,255,255,0.75); font-weight: 800; }
.sceneOps { display: flex; gap: 8px; }
.miniBtn {
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.80);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.miniBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.miniBtn.danger { border-color: rgba(255,120,120,0.35); background: rgba(255,120,120,0.14); }

.field { margin-top: 10px; }
.label { font-size: 12px; color: rgba(255,255,255,0.60); margin-bottom: 6px; }
.input, .textarea {
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
.textarea { resize: vertical; }

.row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.muted { color: rgba(255,255,255,0.55); font-size: 12px; }
.sep { margin: 0 10px; opacity: 0.6; }
.tinyTip { margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.45); }
</style>
