const appBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
const basePath = `${appBase}demo/dental-fear`;

export const DEMO_ID = "dental_fear_v1";
export const DEMO_SESSION_ID = "visiontale-demo-dental-fear";
export const DEMO_SCHEMA_VERSION = 3;

export const assistantImageUrl = `${basePath}/assistant/assistant.png`;

export const characterDefinitions = [
  {
    id: "child",
    name: "安安",
    role: "child",
    description: "害怕看牙却又努力鼓起勇气的小朋友。",
    prompt:
      "儿童绘本角色设计，一个圆脸短发的小朋友，穿着柔软的黄色毛衣，眼神紧张但可爱，线条温柔，色彩明亮。",
    imageUrl: `${basePath}/characters/child.png`,
  },
  {
    id: "dentist",
    name: "林医生",
    role: "dentist",
    description: "会蹲下来和孩子轻声说话的温柔牙医。",
    prompt:
      "儿童绘本角色设计，一位笑容亲切的牙医，穿着浅蓝色工作服，姿态耐心，整体气质安全温暖。",
    imageUrl: `${basePath}/characters/dentist.png`,
  },
  {
    id: "father",
    name: "爸爸",
    role: "father",
    description: "稳稳牵着孩子的手，用玩笑缓解紧张感。",
    prompt:
      "儿童绘本角色设计，一位高大温和的父亲，穿着深绿色外套，眼神可靠，色彩柔和。",
    imageUrl: `${basePath}/characters/father.png`,
  },
  {
    id: "mother",
    name: "妈妈",
    role: "mother",
    description: "一直陪在旁边，用轻柔的声音安抚孩子。",
    prompt:
      "儿童绘本角色设计，一位温柔微笑的母亲，穿着珊瑚粉针织衫，气质细腻亲近，画风明亮。",
    imageUrl: `${basePath}/characters/mother.png`,
  },
  {
    id: "tooth_fairy",
    name: "牙仙子",
    role: "fairy",
    description: "只在孩子的想象里出现，代表勇气和奖励。",
    prompt:
      "儿童绘本角色设计，一位发光的小小牙仙子，穿薄荷色翅膀和星光裙摆，神情俏皮，梦幻又安全。",
    imageUrl: `${basePath}/characters/tooth_fairy.png`,
  },
];

export const storyReqTemplate = {
  demoId: DEMO_ID,
  done: true,
  genre: "成长治愈",
  hero: "小朋友安安",
  setting: "明亮友好的儿童牙科诊所",
  tone: "温暖安心",
  ending: "安安顺利完成拔牙，不再害怕看牙",
  companion: "爸爸、妈妈和想象中的牙仙子",
  obstacle: "对拔牙的紧张和想象中的担忧",
  length: "中等",
  taboo: "不要疼痛细节，不要恐怖画面",
};

export const storyTemplate = {
  demoId: DEMO_ID,
  title: "安安和勇气亮晶晶的牙仙子",
  moral: "勇气不是不害怕，而是害怕时也愿意慢慢往前走。",
  text: [
    "安安一听到“明天要去看牙”，就把小脸埋进了枕头里。他总觉得牙科诊所里会有奇怪的灯、会发出嗡嗡声的工具，还会让人一下子紧张起来。爸爸轻轻拍着他的背，妈妈把一杯温水放到床头，说林医生是一位会认真解释每一步的医生，不会让安安一个人面对害怕。",
    "第二天到了诊所，等待区并没有安安想象中那样可怕。墙上贴着会微笑的小牙齿贴纸，角落里还有软软的小玩具。林医生蹲下来和安安打招呼，先给他看了要用到的小镜子和小灯，还说如果安安觉得紧张，随时可以举手告诉大家。",
    "可是真正躺到牙椅上的时候，安安还是把手握得紧紧的。就在这时，他仿佛看见一位亮晶晶的牙仙子落在灯边，朝他眨眨眼。牙仙子没有说“你一点都别怕”，而是悄悄告诉他：害怕的时候，可以先慢慢吸气，再慢慢呼气，把勇气一点一点装进心里。",
    "妈妈在旁边轻轻哼着歌，爸爸握住安安的脚尖，林医生则一边做准备一边告诉他下一步会发生什么。安安发现，当每个人都把事情说得清清楚楚时，那些原来在脑海里膨胀的可怕想象，也慢慢变小了。",
    "拔牙结束得比安安想象中快得多。林医生竖起大拇指，说安安做得特别棒。牙仙子像一颗会跳舞的小星星一样，在安安的想象里转了个圈，夸他把勇气藏进了每一次深呼吸里。",
    "回家的路上，安安摸着脸颊，发现自己虽然还有一点点累，却没有昨天那样害怕了。晚上他把那颗掉下来的牙放进小盒子，悄悄对牙仙子说谢谢。第二天，当朋友提起看牙时，安安已经能认真地说：原来只要有人陪着，害怕也可以慢慢变成勇敢。",
  ].join("\n\n"),
  source: "demo-fixed",
};

export const sceneTemplates = [
  {
    id: "scene-1",
    order: 1,
    sceneTitle: "出发前的小紧张",
    sceneText: "安安在家得知要去看牙，抱着靠枕不愿抬头。爸爸和妈妈在一旁温柔安慰。",
    narration: "安安心里像有一团皱巴巴的小云，但家人的声音让那团云慢慢松开了。",
    characterIds: ["child", "father", "mother"],
    referenceNote: "use child+father+mother",
    imagePrompt:
      "儿童绘本风格，客厅晨光柔和，安安抱着靠枕坐在沙发角落，爸爸妈妈蹲下来安慰他，表情温暖，画面干净明亮。",
    imageUrl: `${basePath}/scenes/scene-1.png`,
  },
  {
    id: "scene-2",
    order: 2,
    sceneTitle: "诊所门口的第一声问候",
    sceneText: "一家人来到儿童牙科诊所，林医生微笑着欢迎他们，让环境显得安全又友好。",
    narration: "当林医生先打招呼、先解释的时候，安安发现陌生的地方也可以很温柔。",
    characterIds: ["child", "father", "mother", "dentist"],
    referenceNote: "use child+father+mother+dentist",
    imagePrompt:
      "儿童绘本风格，明亮的儿童牙科诊所前台，林医生弯下腰向安安打招呼，爸爸妈妈陪在旁边，色彩清新，氛围友善。",
    imageUrl: `${basePath}/scenes/scene-2.png`,
  },
  {
    id: "scene-3",
    order: 3,
    sceneTitle: "牙椅上的想象伙伴",
    sceneText: "安安躺上牙椅时再次紧张起来，发光的牙仙子在他的想象里悄悄出现。",
    narration: "牙仙子没有把害怕赶走，而是提醒安安，勇气可以一口一口地呼吸出来。",
    characterIds: ["child", "dentist", "tooth_fairy"],
    referenceNote: "use child+dentist+tooth_fairy",
    imagePrompt:
      "儿童绘本风格，诊疗灯柔和照亮牙椅，安安紧张地躺着，林医生在旁边准备工具，梦幻的牙仙子在空中发出微光，安全治愈。",
    imageUrl: `${basePath}/scenes/scene-3.png`,
  },
  {
    id: "scene-4",
    order: 4,
    sceneTitle: "每一步都被说清楚",
    sceneText: "林医生耐心解释拔牙步骤，妈妈轻轻握着安安的手，整个过程变得可以预期。",
    narration: "当未知被一句一句说明白，安安的肩膀也慢慢放松下来。",
    characterIds: ["child", "mother", "dentist"],
    referenceNote: "use child+mother+dentist",
    imagePrompt:
      "儿童绘本风格，近景构图，林医生指着小镜子和牙椅灯做解释，妈妈坐在安安身边安抚他，画面细节温柔，色彩安静。",
    imageUrl: `${basePath}/scenes/scene-4.png`,
  },
  {
    id: "scene-5",
    order: 5,
    sceneTitle: "勇气亮了一下",
    sceneText: "拔牙顺利结束后，林医生夸奖安安很勇敢，牙仙子在想象里为他撒下星星光点。",
    narration: "原来勇敢不是一下子变强，而是在害怕时也愿意继续相信身边的人。",
    characterIds: ["child", "dentist", "tooth_fairy"],
    referenceNote: "use child+dentist+tooth_fairy",
    imagePrompt:
      "儿童绘本风格，诊疗结束后的轻松时刻，林医生竖起大拇指，安安松了一口气，牙仙子在空中洒下细小星光，气氛欢快。",
    imageUrl: `${basePath}/scenes/scene-5.png`,
  },
  {
    id: "scene-6",
    order: 6,
    sceneTitle: "回家后的笑脸",
    sceneText: "晚上回到家，安安和爸爸妈妈一起把牙齿放进小盒子里，牙仙子在想象中守护着他。",
    narration: "那颗小小的牙齿像一枚勋章，提醒安安：下次再害怕，也能慢慢变勇敢。",
    characterIds: ["child", "father", "mother", "tooth_fairy"],
    referenceNote: "use child+father+mother+tooth_fairy",
    imagePrompt:
      "儿童绘本风格，夜晚卧室暖灯，小盒子放在床头，安安和爸爸妈妈一起微笑看着它，牙仙子在窗边轻轻发光，结尾温暖完整。",
    imageUrl: `${basePath}/scenes/scene-6.png`,
  },
];

export const videoAsset = {
  fullVideoUrl: `${basePath}/video/full.mp4`,
  clipUrlByOrder: {
    1: `${basePath}/video/clip-1.mp4`,
    2: `${basePath}/video/clip-2.mp4`,
    3: `${basePath}/video/clip-3.mp4`,
    4: `${basePath}/video/clip-4.mp4`,
    5: `${basePath}/video/clip-5.mp4`,
    6: `${basePath}/video/clip-6.mp4`,
  },
};

export function cloneDemoValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBaseSession() {
  return {
    sessionId: DEMO_SESSION_ID,
    stage: "DIALOG_READY",
    artifacts: {},
  };
}

export function buildCharactersArtifact(nowTs = Date.now()) {
  return {
    demoId: DEMO_ID,
    items: characterDefinitions.map((item, index) => ({
      ...cloneDemoValue(item),
      createdAt: nowTs + index,
    })),
  };
}

export function buildStoryReqArtifact(nowTs = Date.now()) {
  return {
    ...cloneDemoValue(storyReqTemplate),
    updatedAt: nowTs,
  };
}

export function buildStoryArtifact() {
  return cloneDemoValue(storyTemplate);
}

export function buildScenesArtifact() {
  return {
    demoId: DEMO_ID,
    items: cloneDemoValue(sceneTemplates),
  };
}

export function buildSceneImagesArtifact(nowTs = Date.now()) {
  const characterMap = Object.fromEntries(characterDefinitions.map((item) => [item.id, item]));
  const items = sceneTemplates.map((scene, index) => {
    const characters = scene.characterIds.map((id) => characterMap[id]).filter(Boolean);
    const names = characters.map((item) => item.name);
    const usedRefImages = characters.map((item) => item.imageUrl);
    const finalPrompt = [
      "儿童绘本风格，色彩温暖、光线柔和、不要出现文字或水印。",
      `场景：${scene.sceneTitle}。${scene.sceneText}`,
      `角色参考：${names.join("、")}。`,
      `只允许使用这些角色图像作为参考：${names.join("、")}。`,
      scene.imagePrompt,
    ].join(" ");

    return {
      id: `scene-image-${scene.order}`,
      sceneId: scene.id,
      order: scene.order,
      imageUrl: scene.imageUrl,
      caption: scene.narration,
      usedCharacterIds: cloneDemoValue(scene.characterIds),
      usedCharacterNames: names,
      usedRefImages,
      finalPrompt,
      createdAt: nowTs + index,
    };
  });

  return {
    demoId: DEMO_ID,
    items,
    source: "demo-fixed",
    updatedAt: nowTs,
  };
}

export function buildVideoClipsArtifact(nowTs = Date.now()) {
  return {
    demoId: DEMO_ID,
    items: sceneTemplates.map((scene, index) => ({
      id: `video-clip-${scene.order}`,
      sceneId: scene.id,
      order: scene.order,
      status: "done",
      caption: scene.narration,
      videoUrl: videoAsset.clipUrlByOrder[scene.order] || videoAsset.fullVideoUrl,
      coverImage: scene.imageUrl,
      createdAt: nowTs + index,
    })),
    fullVideoUrl: videoAsset.fullVideoUrl,
    updatedAt: nowTs,
  };
}
