import { createRouter, createWebHistory } from "vue-router";

import Photo from "../pages/Photo.vue";
import Dialog from "../pages/Dialog.vue";
import Story from "../pages/Story.vue";
import Split from "../pages/Split.vue";
import Images from "../pages/Images.vue";
import Storybook from "../pages/Storybook.vue";
import Video from "../pages/Video.vue";

export const steps = [
  { key: "photo",  title: "拍照/漫画形象", path: "/photo" },
  { key: "dialog", title: "语音对话",     path: "/dialog" },
  { key: "story",  title: "生成故事",     path: "/story" },
  { key: "split",  title: "拆分文本",     path: "/split" },
  { key: "images", title: "生成图像",     path: "/images" },
  { key: "storybook", title: "故事书预览", path: "/storybook" },
  { key: "video",  title: "生成视频",     path: "/video" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: "/photo" },
    { path: "/photo", component: Photo },
    { path: "/dialog", component: Dialog },
    { path: "/story", component: Story },
    { path: "/split", component: Split },
    { path: "/images", component: Images },
    { path: "/storybook", component: Storybook },
    { path: "/video", component: Video },
  ],
});


export default router;
