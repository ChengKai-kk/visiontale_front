<template>
  <section class="card">
    <header class="head">
      <div class="titleWrap">
        <h1>🎤 和小助手聊天</h1>
        <p class="subtitle">按住说话</p>
      </div>
    </header>

    <!-- 操作区（固定） -->
    <div class="panel">
      <div class="row">
        <button
          class="btn primary"
          :class="{ recording: isRecording }"
          @mousedown.prevent="onPressStart"
          @mouseup.prevent="onPressEnd"
          @mouseleave.prevent="onPressCancel"
          @touchstart.prevent="onPressStart"
          @touchend.prevent="onPressEnd"
          @touchcancel.prevent="onPressCancel"
          :disabled="busy"
          type="button"
        >
          {{ isRecording ? "🎙 正在录音... 松开发送" : busy ? "处理中..." : "按住说话" }}
        </button>

        <button class="btn ghost" type="button" @click="resetUI" :disabled="isRecording || busy">清空</button>
        <button class="btn" type="button" @click="replay" :disabled="!lastAssistantAudioUrl">🔊 重播</button>
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

      <div class="hint">
        提示：首次需要麦克风权限；建议在 HTTPS 或 localhost 下测试。若自动播放失败，点"重播"即可。
      </div>

      <div v-if="statusText && !busy" class="status" :class="{ error: statusType === 'error' }">
        {{ statusText }}
      </div>

      <!-- 音频控件 -->
      <div class="audioWrap" v-if="lastAssistantAudioUrl">
        <div class="audioMeta">
          <span class="dot"></span>
          <span>本轮语音已生成</span>
        </div>
        <audio ref="audioRef" class="audioEl" controls preload="auto" />
      </div>
    </div>

    <!-- 主体（固定高度，不滚动；内部滚动） -->
    <div class="grid">
      <!-- 左：聊天（内部滚动） -->
      <div class="panel mainPanel">
        <div class="panelTop">
          <h3 class="panelTitle">对话（session.storyDialog.messages）</h3>
          <div class="panelTopRight">
            <button class="btn small" type="button" @click="copyText(dialogAsText)" :disabled="!dialogMessages.length">复制</button>
          </div>
        </div>

        <div class="chatViewport">
          <div ref="chatScrollRef" class="chatScroll">
            <div v-if="dialogMessages.length" class="chat">
              <div v-for="(m, idx) in dialogMessages" :key="idx" class="bubble" :class="m.role === 'user' ? 'me' : 'bot'">
                <div class="bubbleRole">{{ m.role === "user" ? "你" : "小助手" }}</div>
                <div class="bubbleText">{{ m.content }}</div>
              </div>
              <div ref="chatBottomRef" style="height: 1px;"></div>
            </div>

            <div v-else class="emptyBig">还没有对话内容。按住说话开始第一轮吧～</div>
          </div>
        </div>

        <div class="row mt12">
          <div class="muted2">
            ✅ 对话历史保存在后端 session：<code class="mono">artifacts["storyDialog"].messages</code>
          </div>
        </div>
      </div>

      <!-- 右：需求/本轮信息（右侧自己滚动） -->
      <div class="panel sidePanel">
        <h3 class="panelTitle">故事需求（session.storyReq）</h3>

        <div v-if="storyReq" class="reqBox">
          <div class="reqTop">
            <span class="reqBadge" :class="{ done: !!storyReq.done }">{{ storyReq.done ? "已收集完成 ✅" : "收集中…" }}</span>
            <span class="muted2" v-if="storyReq.updatedAt">updatedAt: {{ new Date(storyReq.updatedAt).toLocaleString() }}</span>
          </div>

          <div class="reqGrid">
            <div class="reqItem"><span>类型</span><b>{{ storyReq.genre || "-" }}</b></div>
            <div class="reqItem"><span>主角</span><b>{{ storyReq.hero || "-" }}</b></div>
            <div class="reqItem"><span>地点</span><b>{{ storyReq.setting || "-" }}</b></div>
            <div class="reqItem"><span>氛围</span><b>{{ storyReq.tone || "-" }}</b></div>
            <div class="reqItem"><span>结局</span><b>{{ storyReq.ending || "-" }}</b></div>
            <div class="reqItem"><span>同伴</span><b>{{ storyReq.companion || "-" }}</b></div>
            <div class="reqItem"><span>障碍/反派</span><b>{{ storyReq.obstacle || "-" }}</b></div>
            <div class="reqItem"><span>长度</span><b>{{ storyReq.length || "-" }}</b></div>
          </div>

          <div v-if="storyReq.taboo" class="reqItem wide"><span>禁忌/不要</span><b>{{ storyReq.taboo }}</b></div>

          <div class="row mt12">
            <button class="btn small" type="button" @click="copyText(JSON.stringify(storyReq, null, 2))">复制 storyReq JSON</button>
          </div>

          <div class="row mt12" v-if="storyReq.done">
            <div class="muted2">
              ✅ 结构化需求保存在后端 session：<code class="mono">artifacts["storyReq"]</code>
            </div>
          </div>
        </div>

        <div v-else class="emptyBig">暂无 storyReq（需要先说一句，后端才会逐步写入）。</div>

        <div class="divider"></div>

        <h3 class="panelTitle">本轮结果（voice artifacts）</h3>

        <div class="block">
          <div class="blockTitle">你说（ASR）：</div>
          <div class="box">
            <div v-if="lastTranscript" class="text">{{ lastTranscript }}</div>
            <div v-else class="empty">暂无</div>
          </div>
        </div>

        <div class="block">
          <div class="blockTitle">助手回复（LLM）：</div>
          <div class="box">
            <div v-if="lastAssistantText" class="text">{{ lastAssistantText }}</div>
            <div v-else class="empty">暂无</div>
          </div>
        </div>

        <div class="block">
          <div class="blockTitle">助手语音（TTS wav url）：</div>
          <div class="box">
            <div v-if="lastAssistantAudioUrl" class="text break">{{ lastAssistantAudioUrl }}</div>
            <div v-else class="empty">暂无</div>
          </div>
        </div>

        <div class="row mt12">
          <button class="btn small" type="button" @click="copyText(lastTranscript)" :disabled="!lastTranscript">复制「你说」</button>
          <button class="btn small" type="button" @click="copyText(lastAssistantText)" :disabled="!lastAssistantText">复制「回复」</button>
          <button class="btn small ghost" type="button" @click="copyText(lastAssistantAudioUrl)" :disabled="!lastAssistantAudioUrl">
            复制「语音链接」
          </button>
        </div>
      </div>
    </div>

    <!-- 底部导航 -->
    <NavigationBar :disable-next="!storyReq?.done" />
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";

const router = useRouter();
const route = useRoute();

/** ===================== Config ===================== */
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

const sessionId = ref(getOrCreateSessionId());

/** ===================== UI State ===================== */
const busy = ref(false);
const isRecording = ref(false);

const statusText = ref("");
const statusType = ref("info");

const taskId = ref("");
const taskStatus = ref("");
const taskStage = ref("");
const taskProgress = ref(null);
const taskError = ref("");

// 友好文案映射
const friendlyMessages = {
  'ASR': '正在听你说话... 👂',
  'LLM': '小助手正在思考回答... 🤔',
  'TTS': '小助手正在说话... 🗣️',
  'PENDING': '准备中... ⏳',
  'RUNNING': '处理中... ✨',
  'DONE': '完成！🎉'
};

const friendlyMessage = computed(() => {
  const stage = taskStage.value || taskStatus.value;
  if (friendlyMessages[stage]) return friendlyMessages[stage];
  if (taskProgress.value > 0 && taskProgress.value < 100) {
    return `处理中... ${taskProgress.value}%`;
  }
  return '处理中...';
});

const currentStage = computed(() => {
  if (taskStage.value === 'ASR') return 'upload';
  if (taskStage.value === 'LLM' || taskStage.value === 'TTS') return 'process';
  return 'default';
});

const lastTranscript = ref("");
const lastAssistantText = ref("");
const lastAssistantAudioUrl = ref("");
const lastAssistantAudioCreatedAt = ref(0);
const lastAssistantAudioExpiresAt = ref(null);
const lastMimeType = ref("");

const audioRef = ref(null);

/** session-derived */
const dialogMessages = ref([]); // [{role, content}]
const storyReq = ref(null);

/** debug */
const showRaw = ref(false);
const rawSessionText = ref("");

/** chat scrolling */
const chatScrollRef = ref(null);
const chatBottomRef = ref(null);

/** ===================== Lock page scroll (只让内部滚) ===================== */
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

/**
 * ✅ 动态读取全局 header 高度 + app-main padding
 * 让 Dialog 卡片高度精准 = 视口高度 - header - main padding
 * 这样不会“被顶部进度条挡住”
 */
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

/** ===================== Recorder ===================== */
let mediaStream = null;
let recorder = null;
let chunks = [];
let pollTimer = null;
const currentTurnStartMs = ref(0);

async function onPressStart() {
  if (busy.value || isRecording.value) return;

  statusText.value = "";
  statusType.value = "info";
  taskError.value = "";

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    const options = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) options.mimeType = "audio/webm;codecs=opus";

    recorder = new MediaRecorder(mediaStream, options);
    lastMimeType.value = recorder.mimeType || options.mimeType || "unknown";

    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        await uploadAndPoll(blob, recorder.mimeType || "audio/webm");
      } catch (e) {
        setErr(e?.message || "录音处理失败");
      } finally {
        cleanupMedia();
        isRecording.value = false;
      }
    };

    recorder.start();
    isRecording.value = true;
    statusText.value = "录音中…松开发送";
    statusType.value = "info";
  } catch {
    setErr("无法开启麦克风：请检查浏览器权限或使用 HTTPS。");
    cleanupMedia();
    isRecording.value = false;
  }
}

function onPressEnd() {
  if (!isRecording.value) return;
  try {
    recorder?.stop();
    statusText.value = "已松开，正在上传并处理…";
    statusType.value = "info";
  } catch {}
}

function onPressCancel() {
  if (!isRecording.value) return;
  try {
    recorder?.stop();
  } catch {}
}

/** ===================== Upload + Poll ===================== */
async function uploadAndPoll(blob, mimeType) {
  busy.value = true;
  taskId.value = "";
  taskStatus.value = "";
  taskStage.value = "";
  taskProgress.value = null;
  taskError.value = "";

  currentTurnStartMs.value = Date.now();

  try {
    const audioBase64 = await blobToDataURL(blob);

    const res = await fetch(joinUrl(API_BASE, "/api/voice/dialog/start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
      },
      body: JSON.stringify({
        sessionId: sessionId.value,
        audioBase64,
        mimeType,
      }),
    });

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`后端返回 ${res.status}：${t || "请求失败"}`);
    }

    const data = await res.json();
    if (!data?.taskId) throw new Error("后端未返回 taskId");

    taskId.value = data.taskId;
    statusText.value = "任务已创建，轮询中…";
    statusType.value = "info";

    await pollTaskUntilDone(data.taskId);

    statusText.value = "任务完成，等待 session 写入…";
    statusType.value = "info";

    await fetchSessionUntilReady({ timeoutMs: 12000, intervalMs: 250, requireThisTurnAudio: true });

    const ok = await tryAutoPlay();
    statusText.value = ok ? "完成 ✅" : "已生成语音 ✅（自动播放可能被拦截，点“重播语音”即可）";
    statusType.value = "info";
  } catch (e) {
    setErr(e?.message || "处理失败");
  } finally {
    busy.value = false;
  }
}

async function pollTaskUntilDone(id) {
  clearPoll();
  return new Promise((resolve, reject) => {
    const start = Date.now();

    pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(joinUrl(API_BASE, `/api/task/${id}`), {
          headers: { ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}) },
        });
        if (!res.ok) throw new Error(`轮询失败 ${res.status}：${await safeText(res)}`);

        const t = await res.json();
        taskStatus.value = t.status || "";
        taskStage.value = t.stage || "";
        taskProgress.value = typeof t.progress === "number" ? t.progress : null;

        if (t.status === "FAILED") {
          taskError.value = t.error || "FAILED";
          clearPoll();
          reject(new Error(taskError.value));
          return;
        }

        if (t.status === "DONE") {
          clearPoll();
          resolve(t);
          return;
        }

        if (Date.now() - start > 120_000) {
          clearPoll();
          reject(new Error("轮询超时（>120s）"));
        }
      } catch (e) {
        clearPoll();
        reject(e);
      }
    }, 800);
  });
}

/** ===================== Session reading ===================== */
function readVoiceArtifacts(sess) {
  const artifacts = sess?.artifacts || {};
  const a_user = artifacts["voice.lastUser"];
  const a_assistant = artifacts["voice.lastAssistant"];
  const a_audio = artifacts["voice.lastAssistantAudio"];

  const transcript = typeof a_user?.text === "string" ? a_user.text : "";
  const assistantText = typeof a_assistant?.text === "string" ? a_assistant.text : "";
  const audioUrl = typeof a_audio?.url === "string" ? a_audio.url : "";
  const audioCreatedAt = typeof a_audio?.createdAt === "number" ? a_audio.createdAt : 0;
  const audioExpiresAt = a_audio?.expiresAt ?? a_audio?.expires_at ?? null;

  return { transcript, assistantText, audioUrl, audioCreatedAt, audioExpiresAt };
}

function readDialogAndReq(sess) {
  const artifacts = sess?.artifacts || {};
  const dialog = artifacts["storyDialog"];
  const req = artifacts["storyReq"];

  const msgs = Array.isArray(dialog?.messages)
    ? dialog.messages
        .filter((x) => x && typeof x.role === "string" && typeof x.content === "string")
        .map((x) => ({ role: x.role, content: x.content }))
    : [];

  return { messages: msgs, storyReq: req && typeof req === "object" ? req : null };
}

async function fetchSessionOnce({ forceRaw = false } = {}) {
  const res = await fetch(joinUrl(API_BASE, `/api/session/${sessionId.value}`), {
    headers: { ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}) },
  });
  if (!res.ok) return null;

  const sess = await res.json();

  if (showRaw.value || forceRaw) rawSessionText.value = JSON.stringify(sess, null, 2);

  const { transcript, assistantText, audioUrl, audioCreatedAt, audioExpiresAt } = readVoiceArtifacts(sess);
  if (transcript) lastTranscript.value = transcript;
  if (assistantText) lastAssistantText.value = assistantText;
  if (audioUrl) lastAssistantAudioUrl.value = audioUrl;
  if (audioCreatedAt) lastAssistantAudioCreatedAt.value = audioCreatedAt;
  lastAssistantAudioExpiresAt.value = audioExpiresAt;

  const { messages, storyReq: sr } = readDialogAndReq(sess);
  dialogMessages.value = messages;
  storyReq.value = sr;

  if (audioRef.value && lastAssistantAudioUrl.value) {
    if (audioRef.value.src !== lastAssistantAudioUrl.value) audioRef.value.src = lastAssistantAudioUrl.value;
  }

  return sess;
}

async function fetchSessionUntilReady({ timeoutMs = 8000, intervalMs = 250, requireThisTurnAudio = false } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetchSessionOnce();
      if (!requireThisTurnAudio) {
        if (dialogMessages.value.length || lastAssistantText.value || lastTranscript.value || lastAssistantAudioUrl.value) return;
      } else {
        if (
          lastAssistantAudioUrl.value &&
          lastAssistantAudioCreatedAt.value &&
          lastAssistantAudioCreatedAt.value >= currentTurnStartMs.value
        ) {
          return;
        }
      }
    } catch {}
    await sleep(intervalMs);
  }
}

async function tryAutoPlay() {
  try {
    if (!lastAssistantAudioUrl.value || !audioRef.value) return false;
    audioRef.value.src = lastAssistantAudioUrl.value;
    audioRef.value.currentTime = 0;
    await audioRef.value.play();
    return true;
  } catch {
    return false;
  }
}

function replay() {
  if (!lastAssistantAudioUrl.value || !audioRef.value) return;
  audioRef.value.src = lastAssistantAudioUrl.value;
  audioRef.value.currentTime = 0;
  audioRef.value.play?.();
}

/** ===================== Chat scroll ===================== */
async function scrollChatToBottom({ smooth = true } = {}) {
  await nextTick();
  if (chatBottomRef.value?.scrollIntoView) {
    chatBottomRef.value.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  } else if (chatScrollRef.value) {
    chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
  }
}

watch(
  () => dialogMessages.value.length,
  (n, o) => {
    if (n > o) scrollChatToBottom({ smooth: true });
  }
);

/** ===================== Computed ===================== */
const dialogAsText = computed(() => dialogMessages.value.map((m) => `${m.role === "user" ? "你" : "小助手"}：${m.content}`).join("\n"));

/** ===================== Utils ===================== */
function setErr(msg) {
  statusText.value = msg;
  statusType.value = "error";
}

function clearPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function cleanupMedia() {
  try {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  } catch {}
  recorder = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  chunks = [];
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取音频失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
  statusText.value = "已复制 ✅";
  statusType.value = "info";
}

function resetUI() {
  if (busy.value || isRecording.value) return;
  taskId.value = "";
  taskStatus.value = "";
  taskStage.value = "";
  taskProgress.value = null;
  taskError.value = "";

  lastTranscript.value = "";
  lastAssistantText.value = "";
  lastAssistantAudioUrl.value = "";
  lastAssistantAudioCreatedAt.value = 0;
  lastAssistantAudioExpiresAt.value = null;

  dialogMessages.value = [];
  storyReq.value = null;

  statusText.value = "";
  statusType.value = "info";
  rawSessionText.value = "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** ===================== Lifecycle ===================== */
onMounted(async () => {
  applySafeHeights();   // ✅ 让位给顶部全局进度条
  lockPageScroll();     // ✅ 禁止整页滚动（只允许内部滚）
  window.addEventListener("resize", applySafeHeights);

  await fetchSessionOnce();
  await scrollChatToBottom({ smooth: false });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", applySafeHeights);
  unlockPageScroll();
  clearPoll();
  cleanupMedia();
});
</script>

<style scoped>
/* 统一使用全局CSS变量 - 浅色童趣主题 */
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

  /* flex 容器，让子元素可以使用 flex: 1 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  align-items: center;
  flex: none;
  margin-bottom: var(--space-xs);
}

.titleWrap {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  font-size: var(--font-base);
  font-weight: 900;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 rgba(79, 195, 247, 0.3);
  white-space: nowrap;
}

.subtitle {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.2;
  font-size: var(--font-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muted2 {
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.badge {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-full);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  font-size: var(--font-sm);
  flex: none;
}

.panel {
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-sm);
  flex: none;
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

.btn.small {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}

.btn.ghost {
  background: transparent;
}

.btn.primary {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
  min-width: 220px;
}

.btn.next {
  background: var(--primary-sky);
  color: var(--text-white);
  border-color: var(--primary-sky);
}

.btn.primary.recording {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 183, 77, 0.6);
}

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

.hint {
  margin-top: var(--space-xs);
  font-size: 12px;
  color: var(--text-secondary);
}

.status {
  margin-top: var(--space-xs);
  font-size: var(--font-sm);
  color: var(--text-primary);
  padding: 6px var(--space-sm);
  background: var(--bg-highlight);
  border-radius: var(--radius-sm);
  border: 2px solid var(--primary-grass);
  font-weight: 700;
}

.status.error {
  color: #C62828;
  background: #FFEBEE;
  border-color: #F44336;
}

/* progress */
.progressWrap {
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 2px dashed var(--border-light);
}

.progressMeta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  font-size: var(--font-sm);
  margin-bottom: var(--space-sm);
  color: var(--text-primary);
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.bar {
  height: 10px;
  border-radius: var(--radius-full);
  background: rgba(0,0,0,0.08);
  overflow: hidden;
  border: 2px solid var(--border-light);
}

.barInner {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--primary-sun), var(--primary-candy));
  width: 0%;
  transition: width 200ms ease;
}

/* audio */
.audioWrap {
  margin-top: var(--space-sm);
  padding-top: var(--space-xs);
  border-top: 2px dashed var(--border-light);
}

.audioMeta {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  margin-bottom: var(--space-xs);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary-grass);
  display: inline-block;
}

.audioEl {
  width: 100%;
  border-radius: var(--radius-md);
}

/* grid 占据剩余高度 */
.grid {
  margin-top: var(--space-sm);
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: var(--space-sm);
  align-items: stretch;

  flex: 1;
  min-height: 0;
  overflow: hidden; /* 不让 grid 本身滚动，让内部列滚动 */
}

/* 两列容器不滚，让内部滚 */
.mainPanel,
.sidePanel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-sm);
}

.sidePanel {
  overflow: auto;
}

.panelTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-xs);
  flex: none;
  margin-bottom: var(--space-xs);
}

.panelTopRight {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.panelTitle {
  margin: 0;
  font-size: var(--font-sm);
  font-weight: 800;
  color: var(--text-primary);
}

/* 聊天区域占满剩余空间，内部滚动 */
.chatViewport {
  margin-top: var(--space-xs);
  flex: 1;
  min-height: 0;
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-light);
  background: var(--bg-panel);
  overflow: hidden;
}

.chatScroll {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-sm);
  scroll-behavior: smooth;
}

.chat {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.bubble {
  max-width: 92%;
  border-radius: var(--radius-md);
  padding: 8px var(--space-sm);
  border: 2px solid var(--border-light);
}

.bubble.me {
  margin-left: auto;
  background: rgba(79, 195, 247, 0.15);
  border-color: var(--primary-sky);
}

.bubble.bot {
  margin-right: auto;
  background: var(--bg-panel);
}

.bubbleRole {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 2px;
  font-weight: 700;
}

.bubbleText {
  white-space: pre-wrap;
  line-height: 1.4;
  color: var(--text-primary);
  font-size: var(--font-sm);
}

.emptyBig {
  color: var(--text-muted);
  padding: var(--space-lg) var(--space-md);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  text-align: center;
}

.mt12 {
  margin-top: var(--space-md);
}

/* story req */
.reqBox {
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-light);
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
  background: var(--bg-highlight);
  border: 2px solid var(--border-medium);
  font-weight: 700;
  color: var(--text-secondary);
}

.reqBadge.done {
  background: rgba(129, 199, 132, 0.3);
  border-color: var(--primary-grass);
  color: var(--text-primary);
}

.reqGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

.reqItem {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--bg-card);
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

.divider {
  margin: var(--space-md) 0;
  border-top: 2px solid var(--border-light);
}

.block {
  margin-top: var(--space-sm);
}

.blockTitle {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 700;
}

.box {
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-light);
  background: var(--bg-panel);
  min-height: 56px;
  padding: var(--space-md);
}

.text {
  white-space: pre-wrap;
  line-height: 1.5;
  color: var(--text-primary);
}

.break {
  word-break: break-all;
}

.empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

/* debug */
.debugBox {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-sm);
}

.debugTitle {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.debugPre {
  margin: 0;
  font-size: var(--font-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  max-height: 240px;
  overflow: auto;
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .card {
    padding: var(--space-sm);
    min-height: 400px;
  }

  h1 {
    font-size: var(--font-sm);
  }

  .subtitle {
    font-size: 11px;
  }

  .panelTitle {
    font-size: 12px;
  }

  .btn {
    padding: 6px 10px;
    font-size: 12px;
  }

  .btn.primary {
    min-width: 120px;
  }

  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  .mainPanel,
  .sidePanel {
    max-height: 35vh;
  }

  .reqGrid {
    grid-template-columns: 1fr;
  }

  .row {
    flex-direction: column;
    width: 100%;
  }

  .row .btn {
    width: 100%;
  }

  .titleWrap {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .subtitle {
    white-space: normal;
  }
}

/* 手机 (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .card {
    padding: var(--space-sm);
    min-height: 400px;
  }

  h1 {
    font-size: var(--font-base);
  }

  .subtitle {
    font-size: 12px;
  }

  .panelTitle {
    font-size: 12px;
  }

  .btn {
    padding: 8px 12px;
    font-size: var(--font-sm);
  }

  .btn.primary {
    min-width: 150px;
  }

  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .mainPanel,
  .sidePanel {
    max-height: 40vh;
  }

  .reqGrid {
    grid-template-columns: 1fr;
  }
}

/* 平板竖屏 (768px - 979px) */
@media (min-width: 768px) and (max-width: 979px) {
  .card {
    padding: var(--space-md);
  }

  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .mainPanel,
  .sidePanel {
    max-height: 45vh;
  }
}

/* 平板横屏/小笔记本 (980px - 1279px) - 关键优化 */
@media (min-width: 980px) and (max-width: 1279px) {
  .card {
    padding: var(--space-md);
  }

  h1 {
    font-size: var(--font-lg);
  }

  .grid {
    grid-template-columns: 1.15fr 0.85fr;
    gap: var(--space-sm);
  }
}

/* 桌面端及以上 (>= 1280px) */
@media (min-width: 1280px) {
  .card {
    padding: var(--space-lg);
  }

  .grid {
    grid-template-columns: 1.15fr 0.85fr;
  }
}
</style>
