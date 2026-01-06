<template>
  <section class="card">
    <header class="head">
      <div>
        <h1 class="title-fun">📷 拍照片，变漫画！</h1>
        <p class="subtitle">
          拍一张你的照片，我们帮你变成卡通形象～
        </p>
      </div>
    </header>

    <!-- Mode Switch -->
    <div class="mode">
      <button class="pill" :class="{ active: mode === 'camera' }" @click="setMode('camera')" type="button">
        📷 拍照
      </button>
      <button class="pill" :class="{ active: mode === 'upload' }" @click="setMode('upload')" type="button">
        ⬆️ 上传
      </button>
      <div class="spacer"></div>
      <button class="pill ghost" @click="resetAll" type="button" :disabled="busy || countdown > 0">
        重置
      </button>
    </div>

    <div class="grid">
      <!-- Left: input -->
      <div class="panel">
        <h3 class="panelTitle">输入照片</h3>

        <!-- Camera -->
        <div v-if="mode === 'camera'" class="cameraWrap">
          <div class="cameraBox">
            <video ref="videoRef" autoplay playsinline muted class="video"></video>

            <div v-if="countdown > 0" class="overlay countdown">
              {{ countdown }}
            </div>

            <div v-if="cameraError" class="overlay error">
              {{ cameraError }}
            </div>
          </div>

          <div class="row">
            <button class="btn" @click="startCamera" type="button" :disabled="busy || cameraOn || countdown > 0">
              开启相机
            </button>

            <button class="btn" @click="capture" type="button" :disabled="busy || !cameraOn || countdown > 0">
              📸 拍一张
            </button>

            <button class="btn btn-fun" @click="startCountdown(3)" type="button" :disabled="busy || !cameraOn || countdown > 0">
              ⏰ 倒计时拍照
            </button>

            <button class="btn ghost" @click="stopCamera" type="button" :disabled="busy">
              关闭相机
            </button>

            <button v-if="countdown > 0" class="btn ghost" @click="stopCountdown" type="button">
              取消倒计时
            </button>
          </div>

          <!-- hidden canvas for capture -->
          <canvas ref="canvasRef" class="hiddenCanvas"></canvas>
        </div>

        <!-- Upload -->
        <div v-else class="uploadWrap">
          <label class="uploadBox">
            <input
              type="file"
              accept="image/*"
              class="file"
              @change="onFileChange"
              :disabled="busy || countdown > 0"
            />
            <div class="uploadText">
              <div class="big">拖拽或点击选择图片</div>
              <div class="small">支持 jpg/png/webp，建议清晰正脸</div>
            </div>
          </label>
        </div>

        
      </div>

      <!-- Right: preview/result -->
      <div class="panel">
        <h3 class="panelTitle">预览 / 结果</h3>

        <!-- 加载状态 -->
        <LoadingState
          v-if="busy"
          :stage="currentStage"
          :message="friendlyMessage"
          :progress="taskProgress"
          :show-progress="taskProgress > 0"
        />

        <!-- 预览区域 -->
        <div v-else class="previewRow">
          <div class="previewCol">
            <div class="subTitle">原图</div>
            <div class="imgBox">
              <img v-if="photoPreview" :src="photoPreview" class="img" />
              <div v-else class="empty">暂无图片</div>
            </div>
          </div>

          <div class="previewCol">
            <div class="subTitle">漫画形象</div>
            <div class="imgBox">
              <img v-if="avatarUrl" :src="avatarUrl" class="img" />
              <div v-else class="empty">生成后显示</div>
            </div>
          </div>
        </div>

        <div class="row">
          <button class="btn btn-primary btn-fun btn-large" @click="generateAvatar" type="button" :disabled="!photoBlob || busy || countdown > 0">
            {{ busy ? "生成中..." : "开始变身！✨" }}
          </button>

          <button class="btn ghost" type="button" @click="copyAvatarUrl" :disabled="!avatarUrl">
            📋 复制结果
          </button>
        </div>

        <div v-if="statusText && !busy" class="status" :class="{ error: statusType === 'error' }">
          {{ statusText }}
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

/** ===================== Step info ===================== */
const route = useRoute();
const router = useRouter();

/** ===================== Config ===================== */
const API_BASE = import.meta.env.VITE_API_BASE || "";   // e.g. https://xxx.fcapp.run
const API_TOKEN = import.meta.env.VITE_API_TOKEN || ""; // demo token
const LS_KEY = "visiontale_state_v1";

/** ===================== Lightweight “identity” ===================== */
function getClientId() {
  const key = "visiontale_client_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
const clientId = getClientId();

function getSessionId() {
  const key = "visiontale_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
const sessionId = getSessionId();


/** ===================== Mode ===================== */
const mode = ref("camera"); // 'camera' | 'upload'
function setMode(m) {
  mode.value = m;
  statusText.value = "";
  statusType.value = "info";
  if (m !== "camera") stopCamera();
}

/** ===================== Camera ===================== */
const videoRef = ref(null);
const canvasRef = ref(null);
const cameraOn = ref(false);
const cameraError = ref("");
let mediaStream = null;

async function startCamera() {
  cameraError.value = "";
  statusText.value = "";
  statusType.value = "info";

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream;
      cameraOn.value = true;
    }
  } catch (e) {
    cameraError.value = "无法开启相机：请检查浏览器权限（本地一般没问题；线上建议 HTTPS）。";
    cameraOn.value = false;
  }
}

function stopCamera() {
  stopCountdown();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (videoRef.value) videoRef.value.srcObject = null;
  cameraOn.value = false;
}

const photoBlob = ref(null);  // Blob (image)
const photoPreview = ref(""); // objectURL

async function capture() {
  statusText.value = "";
  statusType.value = "info";

  if (!videoRef.value || !canvasRef.value) return;
  if (!cameraOn.value) {
    statusText.value = "请先开启相机";
    statusType.value = "error";
    return;
  }

  const video = videoRef.value;
  const canvas = canvasRef.value;

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) return;

  setPhotoBlob(blob);
}

/** ===================== Countdown (for camera capture) ===================== */
const countdown = ref(0); // 0 = not counting
let countdownTimer = null;

function startCountdown(seconds = 3) {
  if (busy.value) return;
  if (!cameraOn.value) {
    statusText.value = "请先开启相机";
    statusType.value = "error";
    return;
  }
  if (countdown.value > 0) return;

  statusText.value = "";
  statusType.value = "info";

  countdown.value = seconds;

  countdownTimer = window.setInterval(async () => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      stopCountdown();
      await capture();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdown.value = 0;
}

/** ===================== Upload ===================== */
function onFileChange(e) {
  statusText.value = "";
  statusType.value = "info";
  const f = e.target.files?.[0];
  if (!f) return;
  setPhotoBlob(f);
}

function setPhotoBlob(blob) {
  photoBlob.value = blob;
  avatarUrl.value = ""; // 换图就清空旧结果
  stopPolling();        // 切图时停止轮询

  if (photoPreview.value?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = URL.createObjectURL(blob);

  persistState();
}

/** ===================== Generate (task-based) ===================== */
const busy = ref(false);
const statusText = ref("");
const statusType = ref("info"); // 'info' | 'error'
const avatarUrl = ref("");
const taskProgress = ref(0); // 进度百分比

const pollingText = ref("");  // 按钮里的动态文案
let pollTimer = null;
let pollAbort = null;

// 友好文案映射
const friendlyMessage = computed(() => {
  if (pollingText.value.includes('上传')) return '正在上传照片... ⬆️';
  if (pollingText.value.includes('提交')) return '正在准备... 📋';
  if (taskProgress.value > 0 && taskProgress.value < 100) {
    return `正在变身漫画形象... ${taskProgress.value}%`;
  }
  if (pollingText.value.includes('生成')) return '正在变身漫画形象... ✨';
  return '处理中...';
});

// 当前阶段
const currentStage = computed(() => {
  if (pollingText.value.includes('上传')) return 'upload';
  if (pollingText.value.includes('生成') || taskProgress.value > 0) return 'process';
  return 'default';
});

async function generateAvatar() {
  if (!photoBlob.value) return;

  busy.value = true;
  pollingText.value = "上传中...";
  statusText.value = "";
  statusType.value = "info";
  taskProgress.value = 0; // 重置进度
  stopPolling();

  try {
    // 1) 前端直接转 dataURL（Ark 支持 data:image/...;base64,... 作为 image）
    const base64 = await blobToBase64(photoBlob.value);

    // 2) start task
    pollingText.value = "提交任务...";
    const startRes = await fetch(joinUrl(API_BASE, "/api/avatar/stylize/start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({
        sessionId,              // ✅ 新增
        imageBase64: base64,
        styleId: "comic",
        size: "2K",
      }),
    });

    if (!startRes.ok) {
      const t = await safeText(startRes);
      throw new Error(`后端返回 ${startRes.status}：${t || "请求失败"}`);
    }

    const startData = await startRes.json();
    const taskId = startData?.taskId;
    if (!taskId) throw new Error("后端未返回 taskId");

    // 3) poll task
    await pollTaskUntilDone(taskId);
  } catch (e) {
    statusText.value = e?.message || "生成失败";
    statusType.value = "error";
    busy.value = false;
    pollingText.value = "";
  }
}

async function pollTaskUntilDone(taskId) {
  pollingText.value = "生成中...";
  statusText.value = "任务已提交，正在生成...";
  statusType.value = "info";

  const maxMs = 90_000; // 90 秒上限（demo）
  const intervalMs = 1200;
  const startedAt = Date.now();

  pollAbort = new AbortController();

  // 先立即 poll 一次
  await pollOnce();

  // 再定时 poll
  pollTimer = window.setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      stopPolling();
      statusText.value = e?.message || "轮询失败";
      statusType.value = "error";
      busy.value = false;
      pollingText.value = "";
    }
  }, intervalMs);

  async function pollOnce() {
    if (Date.now() - startedAt > maxMs) {
      throw new Error("生成超时，请重试");
    }

    const res = await fetch(joinUrl(API_BASE, `/api/task/${taskId}`), {
      method: "GET",
      headers: {
        ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
        "X-Client-Id": clientId,
      },
      signal: pollAbort?.signal,
    });

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`轮询失败 ${res.status}：${t || "请求失败"}`);
    }

    const task = await res.json();
    const st = task?.status;
    const prog = typeof task?.progress === "number" ? task.progress : null;

    // 更新进度
    if (prog != null) {
      taskProgress.value = prog;
      pollingText.value = `生成中... ${prog}%`;
    }

    if (st === "DONE") {
      const url = task?.result?.avatarUrl;
      if (!url) throw new Error("任务完成但缺少 avatarUrl");

      avatarUrl.value = url;
      statusText.value = "生成成功 ✅";
      statusType.value = "info";

      persistState();
      stopPolling();
      busy.value = false;
      pollingText.value = "";
      return;
    }

    if (st === "FAILED") {
      const err = task?.error || "任务失败";
      throw new Error(err);
    }

    // PENDING / RUNNING: continue
    statusText.value = st === "PENDING" ? "排队中..." : "生成中...";
    statusType.value = "info";
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (pollAbort) {
    try { pollAbort.abort(); } catch {}
    pollAbort = null;
  }
}

/** ===================== Clipboard ===================== */
function copyAvatarUrl() {
  if (!avatarUrl.value) return;
  navigator.clipboard?.writeText(avatarUrl.value);
  statusText.value = "已复制链接 ✅";
  statusType.value = "info";
}

/** ===================== Navigation ===================== */
const canGoNext = computed(() => !!avatarUrl.value && !busy.value && countdown.value === 0);

/** ===================== Persistence ===================== */
function persistState() {
  const state = loadState();
  state.avatarUrl = avatarUrl.value;
  state.clientId = clientId;
  state.sessionId = sessionId; // ✅ 新增
  saveState(state);
}


function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveState(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

function resetAll() {
  if (busy.value) return;
  stopCountdown();
  stopCamera();
  stopPolling();

  avatarUrl.value = "";
  statusText.value = "";
  statusType.value = "info";
  pollingText.value = "";

  photoBlob.value = null;
  if (photoPreview.value?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = "";

  const newSessionId = crypto.randomUUID();
  localStorage.setItem("visiontale_session_id", newSessionId);
  saveState({ clientId, sessionId: newSessionId });
  window.location.reload(); // 或者把 sessionId ref 更新一下

}

/** ===================== Utils ===================== */
function joinUrl(base, path) {
  if (!base) return path;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob); // => data:image/jpeg;base64,...
  });
}

/** ===================== Lifecycle ===================== */
onMounted(() => {
  const state = loadState();
  if (state?.avatarUrl) avatarUrl.value = state.avatarUrl;
});

onBeforeUnmount(() => {
  stopCountdown();
  stopCamera();
  stopPolling();
  if (photoPreview.value?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.value);
});
</script>

<style scoped>
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

/* 儿童友好标题 */
.title-fun {
  font-size: var(--font-2xl);
  color: var(--text-primary);
  font-weight: 900;
  margin: 0 0 var(--space-sm);
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
}

.subtitle {
  font-size: var(--font-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.mode {
  margin-top: var(--space-md);
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  flex-wrap: wrap;
}

.spacer { flex: 1; }

.pill {
  border: 2px solid var(--border-medium);
  background: var(--bg-panel);
  color: var(--text-secondary);
  border-radius: var(--radius-full);
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  font-weight: 700;
  transition: all 200ms ease;
}

.pill.active {
  border-color: var(--primary-sky);
  background: var(--primary-sky);
  color: var(--text-white);
  transform: scale(1.05);
}

.pill.ghost {
  background: transparent;
}

.pill:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.panel {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);
}

.panelTitle {
  margin: 0 0 var(--space-md);
  font-size: var(--font-lg);
  font-weight: 800;
  color: var(--text-primary);
}

.cameraBox {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 3px dashed var(--border-medium);
  background: var(--bg-panel);
  min-height: 280px;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  min-height: 280px;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-md);
  text-align: center;
  background: rgba(0, 0, 0, 0.55);
  color: var(--text-white);
}

.overlay.error {
  background: rgba(244, 67, 54, 0.9);
}

.overlay.countdown {
  background: rgba(0, 0, 0, 0.32);
  font-size: 64px;
  font-weight: 800;
  color: var(--text-white);
  text-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}

.hiddenCanvas { display: none; }

.uploadBox {
  display: block;
  border-radius: var(--radius-md);
  border: 3px dashed var(--border-medium);
  background: var(--bg-panel);
  padding: var(--space-lg);
  min-height: 280px;
  cursor: pointer;
  transition: all 200ms ease;
}

.uploadBox:hover {
  border-color: var(--primary-sky);
  background: var(--bg-highlight);
}

.file { display: none; }

.uploadText {
  display: grid;
  place-items: center;
  height: 100%;
  gap: var(--space-sm);
  text-align: center;
  color: var(--text-secondary);
}

.uploadText .big {
  font-weight: 800;
  font-size: var(--font-lg);
  color: var(--text-primary);
}

.uploadText .small {
  font-size: var(--font-sm);
}

.previewRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

.subTitle {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 700;
  margin-bottom: var(--space-xs);
}

.imgBox {
  border-radius: var(--radius-md);
  border: 3px dashed var(--border-medium);
  background: var(--bg-panel);
  min-height: 280px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.row {
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

.btn.ghost {
  background: transparent;
}

.btn-fun {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}

.btn-fun:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.15);
}

.btn-fun:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.15);
}

.btn-primary {
  background: var(--primary-sky);
  color: var(--text-white);
  border-color: var(--primary-sky);
}

.btn-large {
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-lg);
  flex: 1;
  min-width: 200px;
}

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
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

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .previewRow { grid-template-columns: 1fr; }
}

@media (max-width: 767px) {
  .title-fun {
    font-size: var(--font-xl);
  }

  .panelTitle {
    font-size: var(--font-base);
  }

  .row {
    flex-direction: column;
  }

  .btn-large {
    width: 100%;
  }
}
</style>
