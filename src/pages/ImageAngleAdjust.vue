<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🎛️ 视角转换</h1>
        <p class="muted">拖动小相机，松手自动重绘</p>
      </div>
      <button class="btn ghost" type="button" @click="goBack">← 返回插图页</button>
    </header>

    <div class="sceneMeta" v-if="sceneOrder > 0">
      <span class="pill">场景 {{ sceneOrder }}</span>
      <span class="sceneName">{{ sceneTitle || "未命名场景" }}</span>
      <span class="dirLabel">{{ directionLabel }}</span>
    </div>

    <div class="panel controls">
      <div class="joystickWrap">
        <div
          ref="padRef"
          class="pad"
          @pointerdown="onPadPointerDown"
        >
          <div class="padCross h"></div>
          <div class="padCross v"></div>
          <div class="padHint top">俯视 +</div>
          <div class="padHint bottom">仰视 -</div>
          <div class="padHint left">左</div>
          <div class="padHint right">右</div>
          <div class="knob" :style="knobStyle"></div>
        </div>
      </div>

      <div class="angles">
        <div class="kv"><span>水平 yaw</span><b>{{ yaw }}°</b></div>
        <div class="kv"><span>俯仰 pitch</span><b>{{ pitch }}°</b></div>
        <div class="tip">拖动中只预览方向，松手 400ms 后自动生成。</div>
      </div>
    </div>

    <LoadingState
      v-if="busy && taskId"
      stage="process"
      :message="loadingMessage"
      :progress="taskProgress"
      :show-progress="taskProgress > 0"
      small
    />

    <div class="compare">
      <div class="imgCol">
        <div class="subTitle">原图</div>
        <div class="imgBox">
          <img v-if="sourceImageUrl" :src="sourceImageUrl" class="img" />
          <div v-else class="empty">原图不存在</div>
        </div>
      </div>

      <div class="imgCol">
        <div class="subTitle">新视角预览</div>
        <div class="imgBox">
          <img v-if="draftImageUrl" :src="draftImageUrl" class="img" />
          <div v-else class="empty">拖动后自动生成</div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn primary" type="button" @click="retryNow" :disabled="busy || !sourceImageUrl">
        再试一次
      </button>
      <button class="btn applyBtn" type="button" @click="applyCurrentDraft" :disabled="busy || !canApply">
        应用到当前场景
      </button>
    </div>

    <div v-if="statusText" class="status" :class="{ error: statusType === 'error' }">
      {{ statusText }}
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import LoadingState from "../components/LoadingState.vue";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";

function joinUrl(base, path) {
  if (!base) return path;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const route = useRoute();
const router = useRouter();

const sessionId = ref(String(route.query?.sessionId || localStorage.getItem("visiontale_session_id") || "").trim());
const sceneOrder = ref(Math.max(1, Math.round(Number(route.query?.sceneOrder || 1))));
const sceneTitle = ref("");

const sourceImageUrl = ref("");
const draftImageUrl = ref("");
const busy = ref(false);
const taskId = ref("");
const taskProgress = ref(0);
const statusText = ref("");
const statusType = ref("info");

const yaw = ref(0);
const pitch = ref(0);
const dragTimer = ref(null);
let pollTimer = null;
let requestSeq = 0;
let queuedParams = null;

const PAD_HALF = 110;
const MAX_RADIUS = 82;
const knobX = ref(0);
const knobY = ref(0);
const padRef = ref(null);
let dragging = false;

const loadingMessage = computed(() => `正在生成新视角... ${taskProgress.value || 0}%`);
const canApply = computed(() => !!draftImageUrl.value && draftImageUrl.value !== sourceImageUrl.value);
const hasUnappliedDraft = computed(() => canApply.value);

function directionFromAngles(y, p) {
  if (p >= 18) return "顶部俯视";
  if (p <= -18) return "底部仰视";
  if (y <= -55) return "左侧";
  if (y >= 55) return "右侧";
  if (y <= -25) return "左前侧";
  if (y >= 25) return "右前侧";
  if (Math.abs(y) < 12 && Math.abs(p) < 10) return "后方";
  return "正前方";
}

const directionLabel = computed(() => directionFromAngles(yaw.value, pitch.value));

function strongViewPromptFromAngles(y, p) {
  const dir = directionFromAngles(y, p);
  if (dir === "顶部俯视") {
    return "视角变为从顶部看这个图，明显俯视，像相机在角色头顶正上方向下看。";
  }
  if (dir === "底部仰视") {
    return "视角变为从底部往上看这个图，明显仰视，像相机在角色下方向上看。";
  }
  if (dir === "左侧") {
    return "视角变为从左边看这个图，明显左侧视角，接近90度侧面观察。";
  }
  if (dir === "右侧") {
    return "视角变为从右边看这个图，明显右侧视角，接近90度侧面观察。";
  }
  if (dir === "左前侧") {
    return "视角变为从左前方看这个图，角度变化要明显，不是轻微转动。";
  }
  if (dir === "右前侧") {
    return "视角变为从右前方看这个图，角度变化要明显，不是轻微转动。";
  }
  if (dir === "后方") {
    return "视角变为从后面看这个图，看到角色背面，视角变化要非常明显。";
  }
  return "视角变为从前方看这个图，保持主体与场景一致。";
}

const knobStyle = computed(() => ({
  transform: `translate(${knobX.value}px, ${knobY.value}px)`,
}));

function setInfo(msg) {
  statusText.value = msg;
  statusType.value = "info";
}

function setErr(msg) {
  statusText.value = msg;
  statusType.value = "error";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`http_${res.status}:${text.slice(0, 700)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function syncKnobFromAngles() {
  knobX.value = clamp((yaw.value / 90) * MAX_RADIUS, -MAX_RADIUS, MAX_RADIUS);
  knobY.value = clamp((-pitch.value / 30) * MAX_RADIUS, -MAX_RADIUS, MAX_RADIUS);
}

function updateAnglesFromPointer(clientX, clientY) {
  if (!padRef.value) return;
  const rect = padRef.value.getBoundingClientRect();
  const cx = rect.left + PAD_HALF;
  const cy = rect.top + PAD_HALF;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > MAX_RADIUS && dist > 0) {
    dx = (dx / dist) * MAX_RADIUS;
    dy = (dy / dist) * MAX_RADIUS;
  }
  knobX.value = Math.round(dx);
  knobY.value = Math.round(dy);
  yaw.value = clamp(Math.round((dx / MAX_RADIUS) * 90), -90, 90);
  pitch.value = clamp(Math.round((-dy / MAX_RADIUS) * 30), -30, 30);
}

function scheduleGenerate() {
  if (dragTimer.value) {
    clearTimeout(dragTimer.value);
    dragTimer.value = null;
  }
  dragTimer.value = setTimeout(() => {
    startAngleTask();
  }, 400);
}

function onPadPointerDown(e) {
  dragging = true;
  setInfo(`当前方向：${directionLabel.value}`);
  updateAnglesFromPointer(e.clientX, e.clientY);
  scheduleGenerate();

  const onMove = (ev) => {
    if (!dragging) return;
    updateAnglesFromPointer(ev.clientX, ev.clientY);
    scheduleGenerate();
  };
  const onUp = () => {
    dragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

async function loadScene() {
  if (!sessionId.value) return;
  const sess = await fetchJson(joinUrl(API_BASE, `/api/session/${sessionId.value}`));
  const scenes = Array.isArray(sess?.artifacts?.scenes?.items) ? sess.artifacts.scenes.items : [];
  const scene = scenes.find((x) => Number(x?.order || 0) === sceneOrder.value);
  sceneTitle.value = String(scene?.sceneTitle || "").trim();

  const sceneImages = Array.isArray(sess?.artifacts?.sceneImages?.items) ? sess.artifacts.sceneImages.items : [];
  const current = sceneImages.find((x) => Number(x?.order || 0) === sceneOrder.value);
  sourceImageUrl.value = String(current?.imageUrl || "").trim();
}

async function loadLatestDraft() {
  if (!sessionId.value || !sceneOrder.value) return;
  const ret = await fetchJson(
    joinUrl(
      API_BASE,
      `/api/image/angle/latest?sessionId=${encodeURIComponent(sessionId.value)}&sceneOrder=${sceneOrder.value}`
    )
  );
  const d = ret?.draft || null;
  if (!d) return;
  if (Number.isFinite(Number(d?.yaw))) yaw.value = clamp(Math.round(Number(d.yaw)), -90, 90);
  if (Number.isFinite(Number(d?.pitch))) pitch.value = clamp(Math.round(Number(d.pitch)), -30, 30);
  syncKnobFromAngles();
  if (d?.draftImageUrl) draftImageUrl.value = String(d.draftImageUrl).trim();
}

async function pollTaskUntilDone(localTaskId, seq) {
  const startedAt = Date.now();
  const maxMs = 150000;
  const intervalMs = 1200;

  const tick = async () => {
    if (Date.now() - startedAt > maxMs) {
      throw new Error("转换超时，请点再试一次");
    }
    const t = await fetchJson(joinUrl(API_BASE, `/api/task/${localTaskId}`));
    taskProgress.value = typeof t?.progress === "number" ? t.progress : taskProgress.value;
    const st = String(t?.status || "");
    if (st === "DONE") return t?.result || {};
    if (st === "FAILED") throw new Error(t?.error || "转换失败，请重试");
    return null;
  };

  const first = await tick();
  if (first) return first;

  return new Promise((resolve, reject) => {
    pollTimer = setInterval(async () => {
      try {
        const ret = await tick();
        if (!ret) return;
        clearInterval(pollTimer);
        pollTimer = null;
        if (seq !== requestSeq) return resolve(null);
        resolve(ret);
      } catch (e) {
        clearInterval(pollTimer);
        pollTimer = null;
        reject(e);
      }
    }, intervalMs);
  });
}

async function startAngleTask(force = false) {
  if (!sessionId.value || !sceneOrder.value || !sourceImageUrl.value) return;

  const viewLabel = directionFromAngles(yaw.value, pitch.value);
  const viewPrompt = strongViewPromptFromAngles(yaw.value, pitch.value);
  const params = { yaw: yaw.value, pitch: pitch.value, viewLabel, viewPrompt };
  if (busy.value && !force) {
    queuedParams = params;
    return;
  }

  busy.value = true;
  taskProgress.value = 0;
  requestSeq += 1;
  const seq = requestSeq;
  queuedParams = null;

  try {
    const startRet = await fetchJson(joinUrl(API_BASE, "/api/image/angle/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId.value,
        sceneOrder: sceneOrder.value,
        yaw: params.yaw,
        pitch: params.pitch,
        viewLabel: params.viewLabel,
        viewPrompt: params.viewPrompt,
      }),
    });

    taskId.value = String(startRet?.taskId || "");
    if (!taskId.value) throw new Error("启动转换失败：缺少 taskId");
    setInfo(`正在生成：${params.viewLabel}`);

    const result = await pollTaskUntilDone(taskId.value, seq);
    if (seq !== requestSeq || !result) return;
    const out = String(result?.draftImageUrl || "").trim();
    if (!out) throw new Error("生成成功但未返回图片");
    draftImageUrl.value = out;
    setInfo("新视角已生成，点“应用到当前场景”即可替换。");
  } catch (e) {
    setErr(String(e?.message || e));
  } finally {
    busy.value = false;
    taskId.value = "";
    taskProgress.value = 0;
    if (queuedParams) {
      const next = queuedParams;
      queuedParams = null;
      yaw.value = next.yaw;
      pitch.value = next.pitch;
      syncKnobFromAngles();
      startAngleTask(true);
    }
  }
}

async function applyCurrentDraft() {
  if (!canApply.value) return;
  try {
    busy.value = true;
    await fetchJson(joinUrl(API_BASE, "/api/image/angle/apply"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId.value,
        sceneOrder: sceneOrder.value,
        imageUrl: draftImageUrl.value,
      }),
    });
    sourceImageUrl.value = draftImageUrl.value;
    setInfo("已应用到当前场景 ✅");
  } catch (e) {
    setErr(String(e?.message || e));
  } finally {
    busy.value = false;
  }
}

function retryNow() {
  startAngleTask(true);
}

function goBack() {
  router.push({
    path: "/images",
    query: { sessionId: sessionId.value },
  });
}

function beforeUnloadHandler(e) {
  if (!hasUnappliedDraft.value) return;
  e.preventDefault();
  e.returnValue = "";
}

onBeforeRouteLeave((_to, _from, next) => {
  if (hasUnappliedDraft.value) {
    const ok = window.confirm("你有未应用的新视角，确定离开吗？");
    if (!ok) return next(false);
  }
  next();
});

onMounted(async () => {
  if (!API_BASE) {
    setErr("VITE_API_BASE 未配置");
    return;
  }
  try {
    await loadScene();
    await loadLatestDraft();
    syncKnobFromAngles();
  } catch (e) {
    setErr(String(e?.message || e));
  }
  window.addEventListener("beforeunload", beforeUnloadHandler);
});

onBeforeUnmount(() => {
  if (dragTimer.value) clearTimeout(dragTimer.value);
  if (pollTimer) clearInterval(pollTimer);
  window.removeEventListener("beforeunload", beforeUnloadHandler);
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
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-md);
}

.titleWrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.titleWrap h1 {
  margin: 0;
  font-size: var(--font-base);
  font-weight: 900;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-xs);
}

.sceneMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.pill {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 2px solid var(--primary-grass);
  background: rgba(129, 199, 132, 0.3);
  font-weight: 800;
}

.sceneName {
  font-weight: 700;
  color: var(--text-primary);
}

.dirLabel {
  border-radius: var(--radius-full);
  background: var(--bg-highlight);
  border: 2px solid var(--border-light);
  padding: 6px 12px;
  font-size: var(--font-sm);
  font-weight: 700;
}

.panel {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);
}

.controls {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-lg);
  align-items: center;
}

.joystickWrap {
  display: grid;
  place-items: center;
}

.pad {
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 3px solid var(--border-medium);
  background:
    radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.15)),
    linear-gradient(135deg, #e3f2fd, #fff3e0);
  position: relative;
  touch-action: none;
  box-shadow: var(--shadow-sm);
}

.padCross {
  position: absolute;
  background: rgba(44, 62, 80, 0.2);
}

.padCross.h {
  top: 109px;
  left: 16px;
  right: 16px;
  height: 2px;
}

.padCross.v {
  left: 109px;
  top: 16px;
  bottom: 16px;
  width: 2px;
}

.knob {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-sky), var(--primary-candy));
  border: 3px solid #fff;
  box-shadow: var(--shadow-button);
  position: absolute;
  left: 91px;
  top: 91px;
  transition: transform 120ms ease;
}

.padHint {
  position: absolute;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.padHint.top {
  top: -26px;
  left: 86px;
}

.padHint.bottom {
  bottom: -26px;
  left: 86px;
}

.padHint.left {
  left: -18px;
  top: 100px;
}

.padHint.right {
  right: -18px;
  top: 100px;
}

.angles {
  display: grid;
  gap: var(--space-sm);
}

.kv {
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 2px solid var(--border-light);
  padding: var(--space-sm) var(--space-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.kv span {
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.kv b {
  font-size: var(--font-base);
}

.tip {
  color: var(--text-secondary);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.compare {
  margin-top: var(--space-md);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.imgCol {
  display: grid;
  gap: var(--space-xs);
}

.subTitle {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 800;
}

.imgBox {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  min-height: 220px;
  display: grid;
  place-items: center;
}

.img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.empty {
  color: var(--text-muted);
}

.actions {
  margin-top: var(--space-md);
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
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
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.btn.ghost {
  background: transparent;
}

.btn.primary {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}

.applyBtn {
  background: linear-gradient(135deg, var(--primary-grass), #66bb6a);
  color: var(--text-white);
  border-color: var(--primary-grass);
  box-shadow: var(--shadow-button);
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
  border-color: #f44336;
  background: #ffebee;
  color: #c62828;
}

@media (max-width: 900px) {
  .controls {
    grid-template-columns: 1fr;
  }
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
