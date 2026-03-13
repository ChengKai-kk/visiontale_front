<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>🎤 语音对话</h1>
        <p class="subtitle">按住录音，实时更新故事设定</p>
      </div>
      <button class="btn ghost" type="button" @click="handleReset" :disabled="busy || isRecording">
        重置流程
      </button>
    </header>

    <div class="contentScroll">
      <div class="grid">
        <div class="panel heroPanel">
          <div class="assistantArt">
            <img :src="assistantImageUrl" alt="assistant" class="assistantImg" />
          </div>

          <div class="heroCopy">
            <div class="eyebrow">智能故事助手</div>
            <h2>按住说话，逐步完善故事设定</h2>
            <p>每一轮都会保留对话上下文，并自动补全故事主题、角色、场景与结局等要素。</p>
          </div>

          <div class="heroActions">
            <button
              class="btn primary heroBtn"
              type="button"
              :disabled="busy"
              @mousedown.prevent="startRecord"
              @mouseup.prevent="stopRecord"
              @mouseleave.prevent="cancelRecord"
              @touchstart.prevent="startRecord"
              @touchend.prevent="stopRecord"
              @touchcancel.prevent="cancelRecord"
            >
              {{ isRecording ? "松开发送" : busy ? "处理中..." : "按住说话" }}
            </button>
            <button class="btn ghost" type="button" :disabled="!lastAssistantAudioUrl" @click="replayAudio">
              播放回复
            </button>
          </div>

          <LoadingState
            v-if="busy"
            :stage="currentStage"
            :message="friendlyMessage"
            :progress="taskProgress"
            :show-progress="taskProgress > 0"
            small
          />

          <div v-else class="statusLine" :class="{ success: !!storyReq, error: !!errorText }">
            {{ errorText || statusText }}
          </div>

          <audio ref="audioRef" class="audioEl" controls preload="auto" v-if="lastAssistantAudioUrl"></audio>

          <div class="chatList" v-if="dialogMessages.length">
            <div
              v-for="(msg, idx) in dialogMessages"
              :key="`${msg.role}-${idx}`"
              class="chatBubble"
              :class="{ me: msg.role === 'user', bot: msg.role !== 'user' }"
            >
              <div class="bubbleRole">{{ msg.role === "user" ? "你" : "助手" }}</div>
              <div class="bubbleText">{{ msg.content }}</div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panelTop">
            <h3 class="panelTitle">结构化故事设定</h3>
            <span class="badge" :class="{ done: !!storyReq?.done }">
              {{ storyReq?.done ? "已完成" : "收集中" }}
            </span>
          </div>

          <div v-if="storyReq" class="reqGrid">
            <div class="reqItem"><span>主题</span><b>{{ storyReq.genre }}</b></div>
            <div class="reqItem"><span>主角</span><b>{{ storyReq.hero }}</b></div>
            <div class="reqItem"><span>地点</span><b>{{ storyReq.setting }}</b></div>
            <div class="reqItem"><span>氛围</span><b>{{ storyReq.tone }}</b></div>
            <div class="reqItem"><span>同伴</span><b>{{ storyReq.companion }}</b></div>
            <div class="reqItem"><span>障碍</span><b>{{ storyReq.obstacle }}</b></div>
            <div class="reqItem"><span>结局</span><b>{{ storyReq.ending }}</b></div>
            <div class="reqItem"><span>长度</span><b>{{ storyReq.length }}</b></div>
            <div class="reqItem wide"><span>禁忌</span><b>{{ storyReq.taboo }}</b></div>
            <div class="reqItem wide"><span>更新时间</span><b>{{ formatTime(storyReq.updatedAt) }}</b></div>
          </div>

          <div v-else class="emptyBig">
            先按住左侧按钮说一句话，系统会开始收集故事需求。
          </div>
        </div>
      </div>
    </div>

    <NavigationBar :disable-next="!storyReq?.done" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import NavigationBar from "../components/NavigationBar.vue";
import LoadingState from "../components/LoadingState.vue";
import {
  ensureSessionId,
  fetchSession,
  getSessionId,
  isNotFoundError,
  pollTask,
  resetSessionId,
  startTask,
} from "../services/backendApi";

const appBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
const assistantImageUrl = `${appBase}demo/dental-fear/assistant/assistant.png`;

const sessionData = ref({ sessionId: getSessionId(), stage: "INIT", artifacts: {} });
const busy = ref(false);
const isRecording = ref(false);
const taskProgress = ref(0);
const taskStage = ref("");
const statusText = ref("按住“按住说话”开始采集故事需求。");
const errorText = ref("");

const audioRef = ref(null);

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];

const storyReq = computed(() => sessionData.value?.artifacts?.storyReq || null);
const dialogMessages = computed(() => {
  const msgs = sessionData.value?.artifacts?.storyDialog?.messages;
  if (!Array.isArray(msgs)) return [];
  return msgs
    .map((m) => ({
      role: String(m?.role || ""),
      content: String(m?.content || "").trim(),
    }))
    .filter((m) => m.role && m.content);
});
const lastAssistantAudioUrl = computed(() =>
  String(sessionData.value?.artifacts?.["voice.lastAssistantAudio"]?.url || "").trim()
);

const friendlyMessage = computed(() => {
  if (taskStage.value === "ASR") return "正在识别语音...";
  if (taskStage.value === "LLM") return "正在理解对话并更新故事设定...";
  if (taskStage.value === "TTS") return "正在生成语音回复...";
  if (taskProgress.value > 0) return `处理中... ${taskProgress.value}%`;
  return "正在处理...";
});

const currentStage = computed(() => (busy.value ? "process" : "default"));

watch(lastAssistantAudioUrl, (url) => {
  if (!audioRef.value || !url) return;
  audioRef.value.src = url;
});

function formatTime(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "-";
  }
}

function applyTask(task) {
  taskProgress.value = Number(task?.progress || 0);
  taskStage.value = String(task?.stage || "");
}

async function loadSession() {
  const sid = ensureSessionId();
  try {
    sessionData.value = await fetchSession(sid);
    statusText.value = storyReq.value?.done
      ? "故事设定已完成，可进入下一步。"
      : "继续录音可逐步补全故事设定。";
  } catch (e) {
    if (isNotFoundError(e)) {
      sessionData.value = { sessionId: sid, stage: "INIT", artifacts: {} };
      return;
    }
    errorText.value = String(e?.message || "读取会话失败");
  }
}

function pickRecorderMimeType() {
  const cands = [
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const cand of cands) {
    if (window.MediaRecorder?.isTypeSupported?.(cand)) return cand;
  }
  return "";
}

async function startRecord() {
  if (busy.value || isRecording.value) return;
  errorText.value = "";

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mimeType = pickRecorderMimeType();

    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);

    chunks = [];
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    mediaRecorder.onstop = async () => {
      const type = mediaRecorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      chunks = [];
      await submitAudio(blob, type);
      cleanupRecorder();
    };

    mediaRecorder.start();
    isRecording.value = true;
    statusText.value = "录音中，松开即可发送。";
  } catch (e) {
    errorText.value = String(e?.message || "无法开启麦克风，请检查浏览器权限");
    cleanupRecorder();
  }
}

function stopRecord() {
  if (!isRecording.value) return;
  try {
    mediaRecorder?.stop();
  } catch {}
  isRecording.value = false;
}

function cancelRecord() {
  if (!isRecording.value) return;
  try {
    mediaRecorder?.stop();
  } catch {}
  isRecording.value = false;
}

function cleanupRecorder() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
  }
  mediaStream = null;
  mediaRecorder = null;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("音频读取失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function submitAudio(blob, mimeType) {
  if (!blob || blob.size <= 0) return;
  busy.value = true;
  taskProgress.value = 0;
  taskStage.value = "";
  errorText.value = "";

  try {
    const audioBase64 = await blobToDataURL(blob);
    const sid = ensureSessionId();
    const startRet = await startTask(
      "/api/voice/dialog/start",
      { audioBase64, mimeType },
      sid
    );
    const taskId = String(startRet?.taskId || "").trim();
    if (!taskId) throw new Error("后端未返回 taskId");

    await pollTask(taskId, {
      onUpdate: applyTask,
      timeoutMs: 3 * 60 * 1000,
      intervalMs: 1200,
    });

    await loadSession();
    statusText.value = "已完成本轮对话。";
    await replayAudio();
  } catch (e) {
    errorText.value = String(e?.message || "语音处理失败");
  } finally {
    busy.value = false;
  }
}

async function replayAudio() {
  if (!audioRef.value || !lastAssistantAudioUrl.value) return;
  audioRef.value.src = lastAssistantAudioUrl.value;
  audioRef.value.load();
  const p = audioRef.value.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {});
  }
}

function handleReset() {
  resetSessionId();
  taskProgress.value = 0;
  taskStage.value = "";
  busy.value = false;
  isRecording.value = false;
  statusText.value = "流程已重置，请重新按住说话。";
  errorText.value = "";
  sessionData.value = { sessionId: getSessionId(), stage: "INIT", artifacts: {} };
  cleanupRecorder();
}

onMounted(async () => {
  await loadSession();
});

onBeforeUnmount(() => {
  cleanupRecorder();
});
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space-md);
}

.contentScroll {
  gap: 0;
}

.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.head,
.panelTop,
.heroActions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.titleWrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.titleWrap h1,
.heroCopy h2 {
  margin: 0;
}

.subtitle,
.heroCopy p {
  margin: 0;
  color: var(--text-secondary);
}

.grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: var(--space-lg);
}

.panel {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.74);
  border: 2px solid rgba(255, 213, 79, 0.55);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
}

.heroPanel {
  display: grid;
  gap: var(--space-md);
  background:
    radial-gradient(circle at top left, rgba(82, 199, 255, 0.2), transparent 34%),
    radial-gradient(circle at bottom right, rgba(255, 137, 198, 0.2), transparent 34%),
    rgba(255, 255, 255, 0.82);
}

.assistantArt {
  display: flex;
  justify-content: center;
}

.assistantImg {
  width: min(100%, 320px);
  border-radius: 28px;
  border: 4px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 40px rgba(79, 195, 247, 0.2);
}

.eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(79, 195, 247, 0.16);
  color: #1d7593;
  font-weight: 700;
}

.heroBtn {
  min-width: 220px;
}

.btn {
  padding: 12px 18px;
  border: 0;
  border-radius: 18px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.btn.primary {
  color: var(--text-white);
  background: linear-gradient(135deg, var(--primary-sky), var(--primary-candy));
}

.btn.ghost {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.86);
  border: 2px solid rgba(255, 213, 79, 0.85);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.panelTitle {
  margin: 0;
}

.badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-secondary);
  background: rgba(255, 183, 77, 0.18);
}

.badge.done {
  color: #18794e;
  background: rgba(129, 199, 132, 0.28);
}

.reqGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.reqItem {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 249, 230, 0.7);
}

.reqItem span {
  font-size: 14px;
  color: var(--text-secondary);
}

.reqItem.wide {
  grid-column: 1 / -1;
}

.statusLine,
.emptyBig {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 249, 230, 0.72);
  color: var(--text-secondary);
}

.statusLine.success {
  color: #19714b;
  background: rgba(195, 243, 201, 0.6);
}

.statusLine.error {
  color: #b42318;
  background: rgba(255, 228, 228, 0.8);
}

.audioEl {
  width: 100%;
}

.chatList {
  display: grid;
  gap: 10px;
  max-height: 260px;
  overflow: auto;
  padding-right: 4px;
}

.chatBubble {
  border-radius: 14px;
  padding: 10px 12px;
}

.chatBubble.me {
  background: rgba(79, 195, 247, 0.16);
}

.chatBubble.bot {
  background: rgba(255, 183, 77, 0.18);
}

.bubbleRole {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.bubbleText {
  color: var(--text-primary);
  line-height: 1.45;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
