<template>
  <section class="card page">
    <header class="head noPrint">
      <div class="titleWrap">
        <h1>📚 故事书导出</h1>
        <p class="subtitle">左图右文排版，一键导出 PDF</p>
      </div>
    </header>

    <div class="contentScroll">
      <div class="toolbar panel noPrint">
        <button class="btn primary" type="button" @click="printBook" :disabled="!storybookReady">
          导出故事书 PDF
        </button>
        <button class="btn ghost" type="button" @click="refreshSession">
          刷新数据
        </button>
      </div>

      <div v-if="pages.length" class="storybook">
        <section v-for="page in pages" :key="page.order" class="spread">
          <div class="spreadImageWrap">
            <img :src="page.imageUrl" :alt="page.sceneTitle" class="spreadImage" />
          </div>
          <div class="spreadText">
            <h3>{{ page.sceneTitle }}</h3>
            <p>{{ page.caption }}</p>
          </div>
        </section>
      </div>

      <div v-else class="panel emptyBig noPrint">
        {{ errorText || "还没有完整的故事书数据。请先生成故事、分镜和场景图。" }}
      </div>
    </div>

    <NavigationBar class="noPrint" :disable-next="!storybookReady" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import NavigationBar from "../components/NavigationBar.vue";
import { fetchSession, isNotFoundError } from "../services/backendApi";

const sessionData = ref({ artifacts: {} });
const errorText = ref("");

const scenes = computed(() => sessionData.value?.artifacts?.scenes?.items || []);
const sceneImages = computed(() => sessionData.value?.artifacts?.sceneImages?.items || []);

const sceneByOrder = computed(() => {
  const map = {};
  scenes.value.forEach((item) => {
    map[Number(item?.order || 0)] = item;
  });
  return map;
});

const pages = computed(() =>
  sceneImages.value
    .filter((item) => String(item?.imageUrl || "").trim())
    .map((item) => ({
      order: Number(item?.order || 0),
      imageUrl: item.imageUrl,
      caption: item.caption || sceneByOrder.value[item.order]?.sceneText || "",
      sceneTitle: sceneByOrder.value[item.order]?.sceneTitle || `场景 ${item.order}`,
    }))
    .sort((a, b) => a.order - b.order)
);

const storybookReady = computed(() => pages.value.length > 0);

async function refreshSession() {
  errorText.value = "";
  try {
    sessionData.value = await fetchSession();
  } catch (e) {
    if (isNotFoundError(e)) {
      sessionData.value = { artifacts: {} };
      return;
    }
    errorText.value = String(e?.message || "会话读取失败");
  }
}

function printBook() {
  window.print();
}

onMounted(async () => {
  await refreshSession();
});
</script>

<style scoped>
.storybook {
  display: grid;
  gap: var(--space-lg);
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space-md);
}

.contentScroll {
  gap: var(--space-md);
}

.card {
  border-radius: var(--radius-lg);
  border: 3px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.head,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.titleWrap {
  display: grid;
  gap: 4px;
}

.titleWrap h1,
.spreadText h3 {
  margin: 0;
}

.subtitle,
.spreadText p {
  color: var(--text-secondary);
}

.toolbar,
.spread,
.panel {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.82);
  border: 2px solid rgba(255, 213, 79, 0.55);
  padding: var(--space-lg);
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
  background: linear-gradient(135deg, var(--primary-grass), var(--primary-sky));
}

.btn.ghost {
  background: rgba(255, 255, 255, 0.9);
}

.spread {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: var(--space-lg);
  min-height: 420px;
}

.spreadImageWrap {
  min-height: 100%;
}

.spreadImage {
  width: 100%;
  height: 100%;
  border-radius: 22px;
  object-fit: cover;
  background: rgba(255, 249, 230, 0.6);
}

.spreadText {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-md);
}

.spreadText p {
  margin: 0;
  line-height: 1.8;
  font-size: 20px;
}

@media (max-width: 920px) {
  .head,
  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .spread {
    grid-template-columns: 1fr;
  }
}

@media print {
  @page {
    size: A4 landscape;
    margin: 10mm;
  }

  .page {
    background: #fff;
    border: 0;
    box-shadow: none;
    padding: 0;
  }

  .contentScroll {
    overflow: visible;
    padding: 0;
    gap: 0;
  }

  .noPrint,
  :deep(.nav-bar) {
    display: none !important;
  }

  .storybook {
    gap: 0;
  }

  .spread {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: #fff;
    padding: 0;
    min-height: 0;
    height: calc(100vh - 20mm);
    break-after: page;
    page-break-after: always;
  }

  .spread:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .spreadImage {
    border-radius: 0;
  }
}
</style>
