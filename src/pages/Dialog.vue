<template>
  <section class="card">
    <header class="head">
      <div class="titleWrap">
        <h1>语音对话（多轮收集故事需求）</h1>
        <p class="muted">按住说话 → 松开发送 → ASR → LLM（带历史追问）→ TTS（wav）→ 播放</p>
      </div>
      <div class="badge">session: {{ sessionIdShort }}</div>
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
        <button class="btn ghost" type="button" @click="fetchSessionOnce({ forceRaw: true })" :disabled="isRecording || busy">
          刷新 session
        </button>
        <button class="btn" type="button" @click="replay" :disabled="!lastAssistantAudioUrl">重播语音</button>

        <button class="btn ghost" type="button" @click="showRaw = !showRaw" :disabled="busy">
          {{ showRaw ? "隐藏调试" : "显示调试" }}
        </button>
      </div>

      <!-- 进度条 -->
      <div class="progressWrap" v-if="taskId">
        <div class="progressMeta">
          <span class="muted2">task</span>
          <code class="mono">{{ taskId }}</code>
          <span class="muted2">status</span>
          <code class="mono">{{ taskStatus || "-" }}</code>
          <span class="muted2">stage</span>
          <code class="mono">{{ taskStage || "-" }}</code>
          <span class="muted2">progress</span>
          <code class="mono">{{ taskProgress != null ? taskProgress + "%" : "-" }}</code>
        </div>

        <div class="bar" aria-label="progress">
          <div class="barInner" :style="{ width: (taskProgress || 0) + '%' }"></div>
        </div>
      </div>

      <div class="hint">
        提示：首次需要麦克风权限；建议在 HTTPS 或 localhost 下测试。若自动播放失败，点“重播语音”即可。
      </div>

      <div v-if="statusText" class="status" :class="{ error: statusType === 'error' }">
        {{ statusText }}
      </div>

      <!-- 音频控件 -->
      <div class="audioWrap" v-if="lastAssistantAudioUrl">
        <div class="audioMeta">
          <span class="dot"></span>
          <span>本轮语音已生成（wav）</span>
          <span v-if="lastAssistantAudioExpiresAt" class="muted2">· expiresAt: {{ String(lastAssistantAudioExpiresAt) }}</span>
        </div>
        <audio ref="audioRef" class="audioEl" controls preload="auto" />
      </div>

      <div v-if="showRaw" class="debugBox">
        <div class="debugTitle">调试：/api/session 返回</div>
        <pre class="debugPre">{{ rawSessionText || "(尚未拉取)" }}</pre>
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

    <!-- ✅ 底部导航条：上一步/下一步（固定在卡片底部，不会被顶部 StepProgress 挡） -->
    <footer class="navBar">
      <button class="btn ghost" type="button" @click="goPrev" :disabled="!prevStep">
        ← 上一步
      </button>

      <div class="navHint">
        <span class="muted2">当前步骤：</span><b>{{ currentStepTitle }}</b>
        <span class="muted2"> · 下一步：</span><b>{{ nextStep?.title || "-" }}</b>
      </div>

      <button class="btn next" type="button" @click="goNext" :disabled="!nextStep || !storyReq?.done">
        下一步 →
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { steps } from "../router";

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
const sessionIdShort = computed(() => sessionId.value.slice(0, 8) + "...");

/** ===================== Step routing (自动，不用你改路径) ===================== */
const currentIndex = computed(() => {
  const idx = steps.findIndex((s) => s.path === route.path);
  return idx === -1 ? 0 : idx;
});
const prevStep = computed(() => (currentIndex.value > 0 ? steps[currentIndex.value - 1] : null));
const nextStep = computed(() => (currentIndex.value < steps.length - 1 ? steps[currentIndex.value + 1] : null));
const currentStepTitle = computed(() => steps[currentIndex.value]?.title || "语音对话");

function goPrev() {
  if (!prevStep.value) return;
  router.push(prevStep.value.path);
}

function goNext() {
  if (!nextStep.value) return;
  // ✅ dialog 的下一步要求：故事需求收集完成
  if (!storyReq.value?.done) {
    statusText.value = "还没收集完成～再说一句，让小助手把故事需求补齐 ✅";
    statusType.value = "info";
    return;
  }
  router.push({ path: nextStep.value.path, query: { sessionId: sessionId.value } });
}

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
/* ========= 核心：卡片高度 = 视口 - header - main padding ========= */
.card {
  height: calc(100vh - var(--vt-header-h, 0px) - var(--vt-main-pad-top, 0px) - var(--vt-main-pad-bottom, 0px));
  overflow: hidden;
  display: flex;
  flex-direction: column;

  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  padding: 22px;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex: none;
}

.titleWrap {
  min-width: 0;
}

h1 {
  margin: 0 0 6px;
  font-size: 22px;
}

.muted {
  margin: 0;
  opacity: 0.7;
}

.muted2 {
  opacity: 0.65;
  font-size: 12px;
}

.badge {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
  opacity: 0.85;
  flex: none;
}

.panel {
  margin-top: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.14);
  padding: 14px;
  flex: none;
}

.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
}

.btn.small {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.btn.primary {
  background: rgba(255, 138, 61, 0.85);
  color: rgba(20, 20, 20, 0.95);
  min-width: 220px;
}

.btn.next {
  background: rgba(140, 255, 160, 0.18);
  border: 1px solid rgba(140, 255, 160, 0.26);
}

.btn.primary.recording {
  transform: scale(1.02);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hint {
  margin-top: 10px;
  font-size: 12px;
  opacity: 0.7;
}

.status {
  margin-top: 10px;
  font-size: 13px;
  opacity: 0.85;
}

.status.error {
  color: #ffb4b4;
  opacity: 1;
}

/* progress */
.progressWrap {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
}

.progressMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.10);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.barInner {
  height: 100%;
  border-radius: 999px;
  background: rgba(255, 138, 61, 0.85);
  width: 0%;
  transition: width 200ms ease;
}

/* audio */
.audioWrap {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
}

.audioMeta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  opacity: 0.85;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: rgba(140, 255, 160, 0.9);
  display: inline-block;
}

.audioEl {
  width: 100%;
}

/* grid 占据剩余高度 */
.grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 12px;
  align-items: stretch;

  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 两列容器不滚，让内部滚 */
.mainPanel,
.sidePanel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidePanel {
  overflow: auto;
}

.panelTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex: none;
}

.panelTopRight {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panelTitle {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

/* 聊天区域占满剩余空间，内部滚动 */
.chatViewport {
  margin-top: 12px;
  flex: 1;
  min-height: 0;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.chatScroll {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  scroll-behavior: smooth;
}

.chat {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble {
  max-width: 92%;
  border-radius: 16px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.bubble.me {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.09);
}

.bubble.bot {
  margin-right: auto;
  background: rgba(0, 0, 0, 0.18);
}

.bubbleRole {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 4px;
}

.bubbleText {
  white-space: pre-wrap;
  line-height: 1.5;
}

.emptyBig {
  opacity: 0.7;
  padding: 16px 10px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.12);
}

.mt12 {
  margin-top: 12px;
}

/* story req */
.reqBox {
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.14);
  padding: 12px;
}

.reqTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.reqBadge {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.reqBadge.done {
  background: rgba(140, 255, 160, 0.16);
  border-color: rgba(140, 255, 160, 0.26);
}

.reqGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.reqItem {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  font-size: 13px;
}

.reqItem span {
  opacity: 0.75;
  min-width: 72px;
}

.reqItem.wide {
  margin-top: 10px;
}

.divider {
  margin: 14px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.block {
  margin-top: 10px;
}

.blockTitle {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 6px;
}

.box {
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.18);
  min-height: 56px;
  padding: 12px;
}

.text {
  white-space: pre-wrap;
  line-height: 1.5;
}

.break {
  word-break: break-all;
}

.empty {
  opacity: 0.6;
  font-size: 13px;
}

/* debug */
.debugBox {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
  padding: 10px;
}

.debugTitle {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 6px;
}

.debugPre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.9;
  max-height: 240px;
  overflow: auto;
}

/* ✅ 底部导航条：固定在卡片底部 */
.navBar {
  margin-top: 12px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
}

.navHint {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 6px;
  align-items: baseline;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .navHint {
    display: none;
  }
}
</style>
