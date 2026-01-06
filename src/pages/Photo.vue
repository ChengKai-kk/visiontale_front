<template>
  <section class="card">
    <header class="head">
      <div>
        <h1>拍照 / 生成漫画形象</h1>
        <p class="muted">
          支持拍照或上传图片。生成成功后会保存漫画 URL 到本地（localStorage），后续页面可直接复用。
        </p>
      </div>
      <div class="badge">{{ stepText }}</div>
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
              立即拍照
            </button>

            <button class="btn primary" @click="startCountdown(3)" type="button" :disabled="busy || !cameraOn || countdown > 0">
              倒计时 3 秒拍照
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

        <div class="previewRow">
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
          <button class="btn primary" @click="generateAvatar" type="button" :disabled="!photoBlob || busy || countdown > 0">
            {{ busy ? (pollingText || "生成中...") : "生成漫画形象" }}
          </button>

          <button class="btn ghost" type="button" @click="copyAvatarUrl" :disabled="!avatarUrl">
            复制结果链接
          </button>
        </div>

        <div v-if="statusText" class="status" :class="{ error: statusType === 'error' }">
          {{ statusText }}
        </div>

        <div class="meta">
          <div class="kv"><span>clientId</span><code>{{ clientId }}</code></div>
          <div class="kv"><span>API</span><code>{{ apiHint }}</code></div>
          <div class="kv"><span>session</span><code>{{ sessionId }}</code></div>
        </div>
      </div>
    </div>

    <footer class="foot">
      <button class="btn ghost" :disabled="true" type="button">上一步</button>
      <button class="btn" @click="goNext" type="button" :disabled="!canGoNext">
        下一步：语音对话
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

/** ===================== Step info ===================== */
const route = useRoute();
const router = useRouter();

const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});
const stepText = computed(() => `${currentIndex.value + 1} / ${steps.length}`);

/** ===================== Config ===================== */
const API_BASE = import.meta.env.VITE_API_BASE || "";   // e.g. https://xxx.fcapp.run
const API_TOKEN = import.meta.env.VITE_API_TOKEN || ""; // demo token（你后端若不校验可留空）
const LS_KEY = "visiontale_state_v1";

const apiHint = computed(() => (API_BASE ? API_BASE : "(VITE_API_BASE 未配置，默认同域)"));

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

const pollingText = ref("");  // 按钮里的动态文案
let pollTimer = null;
let pollAbort = null;

async function generateAvatar() {
  if (!photoBlob.value) return;

  busy.value = true;
  pollingText.value = "上传中...";
  statusText.value = "";
  statusType.value = "info";
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

    // 按钮文案更新
    if (prog != null) pollingText.value = `生成中... ${prog}%`;

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

function goNext() {
  if (!canGoNext.value) return;
  router.push("/dialog");
}

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
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  padding: 22px;
  min-height: 60vh;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

h1 { margin: 0 0 6px; font-size: 22px; }
.muted { margin: 0; opacity: .7; }

.badge {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  font-size: 12px;
  opacity: .85;
}

.mode {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.spacer { flex: 1; }

.pill {
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.78);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}
.pill.active {
  border-color: rgba(255,138,61,0.55);
  color: rgba(255,255,255,0.92);
}
.pill.ghost { background: transparent; }
.pill:disabled { opacity: .45; cursor: not-allowed; }

.grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel {
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.14);
  padding: 14px;
}

.panelTitle {
  margin: 0 0 12px;
  font-size: 14px;
  opacity: .9;
}

.cameraBox {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.2);
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
  padding: 14px;
  text-align: center;
  background: rgba(0,0,0,0.55);
}

.overlay.error { color: #ffb4b4; }
.overlay.countdown {
  background: rgba(0,0,0,0.32);
  font-size: 64px;
  font-weight: 800;
  color: rgba(255,255,255,0.96);
  text-shadow: 0 8px 24px rgba(0,0,0,0.55);
}

.hiddenCanvas { display: none; }

.uploadBox {
  display: block;
  border-radius: 14px;
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.18);
  padding: 18px;
  min-height: 280px;
  cursor: pointer;
}
.file { display: none; }

.uploadText {
  display: grid;
  place-items: center;
  height: 100%;
  gap: 6px;
  text-align: center;
  opacity: .9;
}
.uploadText .big { font-weight: 600; }
.uploadText .small { font-size: 12px; opacity: .7; }

.hint {
  margin-top: 10px;
  font-size: 12px;
  opacity: .7;
}

.previewRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.subTitle {
  font-size: 12px;
  opacity: .75;
  margin-bottom: 6px;
}

.imgBox {
  border-radius: 14px;
  border: 1px dashed rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.18);
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

.empty { opacity: .6; font-size: 13px; }

.row {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(255,255,255,0.14);
  color: rgba(255,255,255,0.9);
}
.btn.ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
}
.btn.primary {
  background: rgba(255,138,61,0.85);
  color: rgba(20,20,20,0.95);
}
.btn:disabled { opacity: .45; cursor: not-allowed; }

.status {
  margin-top: 10px;
  font-size: 13px;
  opacity: .85;
}
.status.error { color: #ffb4b4; opacity: 1; }

.meta {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  opacity: .85;
}
.kv {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}
.kv span { width: 56px; opacity: .7; }
.kv code {
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.foot {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .previewRow { grid-template-columns: 1fr; }
}
</style>
