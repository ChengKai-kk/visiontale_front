<template>
  <section class="card page">
    <header class="head">
      <div class="titleWrap">
        <h1>📚 故事书预览</h1>
        <p class="muted">可翻阅、可导出PDF</p>
      </div>
    </header>

    <div class="panel controls">
      <div class="row">
        <button class="btn primary" type="button" @click="printBook" :disabled="!storybookReady">
          导出故事书 PDF
        </button>
        <div class="pager" v-if="pages.length">
          <button class="btn ghost" type="button" @click="prevPage" :disabled="currentIndex === 0">
            ← 上一页
          </button>
          <span class="pageHint">第 {{ currentIndex + 1 }} / {{ pages.length }} 页</span>
          <button class="btn ghost" type="button" @click="nextPage" :disabled="currentIndex >= pages.length - 1">
            下一页 →
          </button>
        </div>
      </div>
      <div v-if="!storybookReady" class="status">暂无插图，请先在「生成图像」完成生成。</div>
    </div>

    <div class="scrollArea">
      <div v-if="!pages.length" class="emptyBig">
        还没有故事书内容，请先生成故事与插图。
      </div>

      <div v-else class="storybook">
        <section class="bookPage cover">
          <div class="coverImageWrapper">
            <img v-if="coverImage" :src="coverImage" alt="cover" class="coverImage" />
            <div v-else class="coverImageFallback">暂无封面图片</div>
            <div class="coverOverlay">
              <div class="coverContent">
                <div class="coverTitle">{{ storyTitle || "我的故事书" }}</div>
                <div class="coverMoral" v-if="storyMoral">{{ storyMoral }}</div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="activePage" class="bookPage spread">
          <div class="spreadImage">
            <img v-if="activePage.imageUrl" :src="activePage.imageUrl" :alt="`scene ${activePage.order}`" loading="lazy" />
            <div v-else class="imageFallback">暂无插图</div>
          </div>
          <div class="spreadText">
            <div class="spreadTitle">{{ activePage.sceneTitle || `场景 ${activePage.order}` }}</div>
            <div class="spreadBody">{{ activePage.caption }}</div>
          </div>
        </section>
      </div>
    </div>

    <!-- 打印专用内容 -->
    <div class="print-only" id="storybook-print">
      <!-- 封面：左页留白，右页封面 -->
      <section class="printSpread coverSpread">
        <div class="spreadPage leftPage blankPage"></div>
        <div class="spreadPage rightPage coverPage">
          <img v-if="coverImage" :src="coverImage" alt="cover" />
          <div v-else class="imageFallback">暂无封面图片</div>
          <div class="coverTitle">{{ storyTitle || "我的故事书" }}</div>
          <div class="coverLabel" v-if="storyMoral">{{ storyMoral }}</div>
        </div>
      </section>

      <!-- 内页：左页文字，右页插图 -->
      <section v-for="(p, idx) in pages" :key="`print_${p.order || idx}`" class="printSpread">
        <div class="spreadPage leftPage textPage">
          <div class="pageTitle">{{ p.sceneTitle || `场景 ${p.order || idx + 1}` }}</div>
          <div class="pageBody">{{ p.caption }}</div>
        </div>
        <div class="spreadPage rightPage imagePage">
          <img v-if="p.imageUrl" :src="p.imageUrl" :alt="`scene ${p.order || idx + 1}`" />
          <div v-else class="imageFallback">暂无插图</div>
        </div>
      </section>
    </div>

    <NavigationBar :disable-next="!storybookReady" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import NavigationBar from "../components/NavigationBar.vue";

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

function getSessionId() {
  const fromQuery = typeof route.query.sessionId === "string" ? route.query.sessionId : "";
  const fromLS = localStorage.getItem(LS_SESSION) || "";
  const sid = fromQuery || fromLS;
  if (fromQuery) localStorage.setItem(LS_SESSION, fromQuery);
  return sid;
}

const sessionId = ref(getSessionId());
const storyTitle = ref("");
const storyMoral = ref("");
const scenes = ref([]);
const sceneImages = ref([]);
const currentIndex = ref(0);

function normalizeScenes(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .filter(Boolean)
    .map((s, idx) => ({
      id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
      order: typeof s.order === "number" ? s.order : idx + 1,
      sceneTitle: String(s.sceneTitle || s.title || `场景 ${idx + 1}`).slice(0, 80),
      sceneText: String(s.sceneText || "").trim(),
      narration: String(s.narration || "").trim(),
    }))
    .sort((a, b) => a.order - b.order);
}

function normalizeSceneImages(node) {
  const items = Array.isArray(node?.items) ? node.items : Array.isArray(node) ? node : [];
  return items
    .filter(Boolean)
    .map((x, idx) => ({
      order: Number(x.order) || idx + 1,
      imageUrl: String(x.imageUrl || x.url || "").trim(),
      caption: String(x.caption || x.narration || "").trim(),
    }))
    .filter((x) => x.order > 0)
    .sort((a, b) => a.order - b.order);
}

const sceneByOrder = computed(() => {
  const map = {};
  for (const s of scenes.value) {
    map[s.order] = s;
  }
  return map;
});

const pages = computed(() => {
  if (sceneImages.value.length) {
    return sceneImages.value.map((item) => ({
      order: item.order,
      imageUrl: item.imageUrl,
      caption: item.caption || sceneByOrder.value[item.order]?.sceneText || "",
      sceneTitle: sceneByOrder.value[item.order]?.sceneTitle || "",
    }));
  }
  return scenes.value.map((s) => ({
    order: s.order,
    imageUrl: "",
    caption: s.sceneText || s.narration || "",
    sceneTitle: s.sceneTitle || "",
  }));
});

const coverImage = computed(() => {
  if (pages.value.length) return pages.value[0].imageUrl;
  return "";
});

const storybookReady = computed(() => sceneImages.value.some((x) => x.imageUrl));
const activePage = computed(() => pages.value[currentIndex.value] || null);

async function loadSession() {
  if (!sessionId.value) return;
  const res = await apiFetch(`/api/session/${sessionId.value}`);
  if (!res.ok) return;
  const sess = await res.json();

  const a = sess?.artifacts || {};
  storyTitle.value = String(a?.story?.title || "").trim();
  storyMoral.value = String(a?.story?.moral || "").trim();
  scenes.value = normalizeScenes(a?.scenes?.items || a?.scenes || []);
  sceneImages.value = normalizeSceneImages(a?.sceneImages);
}

function printBook() {
  window.print();
}

function prevPage() {
  if (currentIndex.value > 0) currentIndex.value -= 1;
}

function nextPage() {
  if (currentIndex.value < pages.value.length - 1) currentIndex.value += 1;
}

onMounted(async () => {
  await loadSession();
});

watch(
  () => pages.value.length,
  (len) => {
    if (len === 0) {
      currentIndex.value = 0;
      return;
    }
    if (currentIndex.value > len - 1) {
      currentIndex.value = len - 1;
    }
  }
);
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
  white-space: nowrap;
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-xs);
  line-height: 1.2;
  white-space: nowrap;
}

.panel {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);
}

.controls {
  margin-bottom: var(--space-md);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
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

.btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

.btn.primary {
  background: linear-gradient(135deg, var(--primary-sun), var(--primary-candy));
  color: var(--text-white);
  border-color: var(--primary-sun);
  box-shadow: var(--shadow-button);
}

.btn.ghost {
  background: transparent;
}

.pager {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.pageHint {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 700;
}

.status {
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  font-weight: 700;
  color: var(--text-secondary);
}

.scrollArea {
  margin-top: var(--space-md);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-highlight);
  padding: var(--space-md);

  flex: 1;
  min-height: 0;
  overflow: auto;
}

.emptyBig {
  padding: var(--space-2xl) var(--space-lg);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-medium);
  background: var(--bg-panel);
  text-align: center;
  color: var(--text-muted);
}

.storybook {
  display: grid;
  gap: var(--space-lg);
}

.bookPage {
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: var(--space-md);
}

.spread {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: stretch;
  min-height: 420px;
}

.spreadImage {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  overflow: hidden;
  background: var(--bg-panel);
  display: grid;
  place-items: center;
}

.spreadImage img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.spreadText {
  border-radius: var(--radius-md);
  border: 2px solid var(--border-light);
  background: var(--bg-panel);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-sm);
}

.spreadTitle {
  font-weight: 900;
  color: var(--text-primary);
  font-size: var(--font-lg);
}

.spreadBody {
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  max-width: 90%;
}

.imageFallback {
  padding: var(--space-lg);
  color: var(--text-muted);
}

/* 封面样式 - 图片全屏+标题叠加 */
.cover {
  border: 3px solid var(--border-accent);
  position: relative;
  overflow: hidden;
  min-height: 500px;
  display: flex;
  align-items: stretch;
}

.coverImageWrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 183, 77, 0.1), rgba(79, 195, 247, 0.1));
}

.coverImage {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}

.coverImageFallback {
  padding: var(--space-2xl);
  color: var(--text-muted);
  text-align: center;
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  z-index: 1;
}

.coverOverlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.5) 50%,
    rgba(0, 0, 0, 0.7) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.coverContent {
  text-align: center;
  padding: var(--space-xl);
  max-width: 80%;
}

.coverTitle {
  font-size: var(--font-2xl);
  font-weight: 900;
  color: white;
  text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.8),
               0 0 20px rgba(0, 0, 0, 0.5);
  margin-bottom: var(--space-md);
  line-height: 1.2;
}

.coverMoral {
  font-size: var(--font-lg);
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  line-height: 1.5;
  font-weight: 600;
}

/* 超小手机 (< 480px) */
@media (max-width: 479px) {
  .card {
    padding: var(--space-sm);
  }

  .titleWrap h1 {
    font-size: var(--font-base);
  }

  .spread {
    grid-template-columns: 1fr;
  }

  .spreadImage {
    min-height: 200px;
  }

  .spreadTitle {
    font-size: var(--font-sm);
  }

  .pager {
    width: 100%;
    justify-content: flex-start;
  }

  .cover,
  .coverImageWrapper {
    min-height: 350px;
  }

  .coverTitle {
    font-size: var(--font-xl);
  }

  .coverMoral {
    font-size: var(--font-base);
  }
}

/* 手机 (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .card {
    padding: var(--space-sm);
  }

  .titleWrap h1 {
    font-size: var(--font-base);
  }

  .spread {
    grid-template-columns: 1fr;
  }

  .spreadImage {
    min-height: 220px;
  }

  .spreadTitle {
    font-size: var(--font-base);
  }

  .pager {
    width: 100%;
    justify-content: flex-start;
  }

  .cover,
  .coverImageWrapper {
    min-height: 400px;
  }

  .coverTitle {
    font-size: var(--font-2xl);
  }

  .coverMoral {
    font-size: var(--font-base);
  }
}

/* 平板横屏/小笔记本 (900px - 1279px) - 关键优化 */
@media (min-width: 900px) and (max-width: 1279px) {
  .card {
    padding: var(--space-md);
  }
}

/* 桌面端及以上 (>= 1280px) */
@media (min-width: 1280px) {
  .card {
    padding: var(--space-lg);
  }
}

/* 打印专用容器 - 默认隐藏 */
.print-only {
  display: none;
}

@media print {
  @page {
    margin: 0;
    size: A4 landscape;
  }

  :global(html),
  :global(body) {
    background: #fff;
    width: 100%;
    height: 100%;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  :global(.app-header) {
    display: none !important;
  }

  :global(.nav-bar) {
    display: none !important;
  }

  :global(.app-main) {
    padding: 0 !important;
  }

  .head {
    display: none !important;
  }

  .panel,
  .controls,
  .status {
    display: none !important;
  }

  .scrollArea {
    display: none !important;
  }

  .card,
  .scrollArea {
    border: 0;
    box-shadow: none;
    max-height: none;
    padding: 0;
  }

  .print-only {
    display: block;
  }

  .storybook {
    display: none;
  }

  .printSpread {
    page-break-after: always;
    width: 297mm;
    height: 210mm;
    padding: 7mm 8mm;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6mm;
    background: #fff;
    break-inside: avoid;
  }

  .printSpread:last-child {
    page-break-after: auto;
  }

  .spreadPage {
    position: relative;
    overflow: hidden;
    background: #fff;
    border-radius: 18px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }

  .leftPage {
    padding: 18mm 16mm;
    display: flex;
    flex-direction: column;
    gap: 10mm;
  }

  .textPage {
    justify-content: flex-start;
  }

  .rightPage {
    background: #f3f4f6;
  }

  .coverPage,
  .imagePage {
    position: relative;
  }

  .coverPage img,
  .imagePage img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
  }

  .coverTitle {
    position: absolute;
    top: 12mm;
    right: 12mm;
    z-index: 3;
    font-size: 30pt;
    font-weight: 900;
    color: #ff7aa2;
    text-align: right;
    text-shadow:
      2px 2px 0 rgba(255, 255, 255, 0.85),
      -2px 2px 0 rgba(255, 255, 255, 0.85),
      2px -2px 0 rgba(255, 255, 255, 0.85),
      -2px -2px 0 rgba(255, 255, 255, 0.85),
      0 6px 12px rgba(0, 0, 0, 0.2);
    line-height: 1.15;
    max-width: 70%;
    word-break: break-word;
  }

  .coverLabel {
    position: absolute;
    bottom: 12mm;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    padding: 6mm 12mm;
    background: rgba(255, 255, 255, 0.88);
    border-radius: 999px;
    font-size: 14pt;
    color: #3c3c3c;
    text-align: center;
    max-width: 85%;
    line-height: 1.4;
    word-break: break-word;
  }

  .pageTitle {
    font-size: 20pt;
    font-weight: 900;
    color: #2c3e50;
    line-height: 1.3;
    word-break: break-word;
  }

  .pageBody {
    font-size: 13pt;
    line-height: 1.7;
    color: #3d4852;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .imageFallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #7a7a7a;
    z-index: 2;
    padding: 12mm;
    text-align: center;
  }
}
</style>
