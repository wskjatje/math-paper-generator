/**
 * 一次性写入：小学人教/统编 语文 + PEP 英语（三年级起点）缺册。
 * 来源：公开教辅/电子课本站点转载目录（非出版社授权 API，可能非最新换版）。
 * 数学人教小学各册若已有 units 则跳过。
 *
 *   node scripts/fill-pep-primary-web-toc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authPath = path.join(root, "data", "textbook-directory.authoritative.json");
const runtimePath = path.join(root, "data", "textbook-directory.json");

/** @type {Record<string, string[]>} */
const UNITS = {
  // —— 统编语文（课文/识字题名聚合，公开目录整理）——
  "pep-chinese-pri_g2-s1": [
    "小蝌蚪找妈妈",
    "我是什么",
    "植物妈妈有办法",
    "场景歌",
    "树之歌",
    "拍手歌",
    "田家四季歌",
    "彩虹",
    "去外婆家",
    "数星星的孩子",
    "古诗二首",
    "黄山奇石",
    "日月潭",
    "葡萄沟",
    "坐井观天",
    "寒号鸟",
    "我要的是葫芦",
    "八角楼上",
    "朱德的扁担",
    "难忘的泼水节",
    "刘胡兰",
    "江雪",
    "敕勒歌",
    "雾在哪里",
    "雪孩子",
    "称赞",
    "纸船和风筝",
    "快乐的小河",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g2-s2": [
    "古诗二首",
    "找春天",
    "开满鲜花的小路",
    "邓小平爷爷植树",
    "雷雨",
    "要是你在野外迷了路",
    "太空生活趣事多",
    "彩色的梦",
    "枫树上的喜鹊",
    "小屋里的彩虹",
    "大象的耳朵",
    "蜘蛛开店",
    "青蛙卖泥塘",
    "小毛虫",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g3-s1": [
    "大青树下的小学",
    "花的学校",
    "不懂就要问",
    "古诗三首",
    "铺满金色巴掌的水泥道",
    "秋天的雨",
    "听听秋的声音",
    "在牛肚子里旅行",
    "一块奶酪",
    "总也倒不了的老树",
    "小狗学叫",
    "搭船的鸟",
    "金色的草地",
    "大自然的声音",
    "父亲、树林和鸟",
    "带刺的朋友",
    "立秋",
    "美丽的小兴安岭",
    "富饶的西沙群岛",
    "海滨小城",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g3-s2": [
    "古诗三首",
    "燕子",
    "荷花",
    "昆虫备忘录",
    "守株待兔",
    "陶罐和铁罐",
    "鹿角和鹿腿",
    "池子与河流",
    "古诗三首（二）",
    "皂荚树",
    "我不能失信",
    "一道数学题",
    "海底世界",
    "火烧云",
    "赵州桥",
    "一幅名扬中外的画",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g4-s1": [
    "观潮",
    "走月亮",
    "现代诗二首",
    "繁星",
    "一个豆荚里的五粒豆",
    "夜间飞行的秘密",
    "呼风唤雨的世纪",
    "蝴蝶的家",
    "古诗三首",
    "爬山虎的脚",
    "蟋蟀的住宅",
    "盘古开天地",
    "精卫填海",
    "普罗米修斯",
    "女娲补天",
    "牛和鹅",
    "一只窝囊的大老虎",
    "陀螺",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g4-s2": [
    "古诗词三首",
    "乡下人家",
    "天窗",
    "三月桃花水",
    "琥珀",
    "飞向蓝天的恐龙",
    "纳米技术就在我们身边",
    "千年梦圆在今朝",
    "短诗三首",
    "绿",
    "白桦",
    "在天晴了的时候",
    "文言文二则",
    "囊萤夜读",
    "铁杵成针",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g5-s1": [
    "白鹭",
    "落花生",
    "桂花雨",
    "珍珠鸟",
    "猎人海力布",
    "牛郎织女",
    "古诗三首",
    "小岛",
    "太阳",
    "松鼠",
    "慈母情深",
    "父爱之舟",
    "「精彩极了」和「糟糕透了」",
    "古人谈读书",
    "忆读书",
    "我的「长生果」",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g5-s2": [
    "古诗三首",
    "祖父的园子",
    "月是故乡明",
    "梅花魂",
    "草船借箭",
    "景阳冈",
    "猴王出世",
    "红楼春趣",
    "人物描写一组",
    "刷子李",
    "他像一棵挺脱的树",
    "两茎灯草",
    "自相矛盾",
    "田忌赛马",
    "跳水",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g6-s1": [
    "草原",
    "丁香结",
    "古诗词三首",
    "花之歌",
    "七律·长征",
    "狼牙山五壮士",
    "开国大典",
    "灯光",
    "竹节人",
    "宇宙生命之谜",
    "故宫博物院",
    "语文园地",
    "快乐读书吧",
  ],
  "pep-chinese-pri_g6-s2": [
    "北京的春节",
    "腊八粥",
    "古诗三首",
    "藏戏",
    "鲁滨逊漂流记（节选）",
    "骑鹅旅行记（节选）",
    "汤姆·索亚历险记（节选）",
    "文言文二则",
    "真理诞生于一百个问号之后",
    "表里的生物",
    "他们那时候多有趣啊",
    "语文园地",
    "快乐读书吧",
  ],

  // —— PEP 英语三年级起点（公开目录常见 Unit 名）——
  "pep-english-pri_g3-s1": [
    "Hello!",
    "Colours",
    "Look at me!",
    "We love animals",
    "Let's eat!",
    "Happy birthday!",
    "Recycle",
  ],
  "pep-english-pri_g3-s2": [
    "Welcome back to school!",
    "My family",
    "At the zoo",
    "Where is my car?",
    "Do you like pears?",
    "How many?",
    "Recycle",
  ],
  "pep-english-pri_g4-s1": [
    "My classroom",
    "My schoolbag",
    "My friends",
    "My home",
    "Dinner's ready",
    "Meet my family!",
    "Recycle",
  ],
  "pep-english-pri_g4-s2": [
    "My school",
    "What time is it?",
    "Weather",
    "At the farm",
    "My clothes",
    "Shopping",
    "Recycle",
  ],
  "pep-english-pri_g5-s1": [
    "What's he like?",
    "My week",
    "What would you like?",
    "What can you do?",
    "There is a big bed",
    "In a nature park",
    "Recycle",
  ],
  "pep-english-pri_g5-s2": [
    "My day",
    "My favourite season",
    "My school calendar",
    "When is Easter?",
    "Whose dog is it?",
    "Work quietly!",
    "Recycle",
  ],
  "pep-english-pri_g6-s1": [
    "How can I get there?",
    "Ways to go to school",
    "My weekend plan",
    "I have a pen pal",
    "What does he do?",
    "How do you feel?",
    "Recycle",
  ],
  "pep-english-pri_g6-s2": [
    "How tall are you?",
    "Last weekend",
    "Where did you go?",
    "Then and now",
    "Recycle",
  ],
};

function toUnits(bookId, labels) {
  return labels.map((label, i) => ({ id: `${bookId}-u${i + 1}`, label }));
}

function applyFile(filePath, { pruneEmpty = false } = {}) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  let applied = 0;
  const skipped = [];
  data.textbooks = (data.textbooks || []).map((b) => {
    const labels = UNITS[b.id];
    if (!labels) return b;
    if (Array.isArray(b.units) && b.units.length > 0) {
      skipped.push(b.id);
      return b;
    }
    applied += 1;
    return { ...b, units: toUnits(b.id, labels) };
  });
  if (pruneEmpty) {
    data.textbooks = data.textbooks.filter((b) => Array.isArray(b.units) && b.units.length > 0);
  }
  data.updatedAt = new Date().toISOString();
  data.note =
    "含公开网页整理的小学人教/统编语文与 PEP 英语目录（web-public-toc）；非出版社实时授权，换版请复核。";
  data.source = "web-public-toc+local";
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { applied, skipped, listed: data.textbooks.length };
}

const auth = applyFile(authPath);
// 运行时：合并权威中有 units 的 pep 小学语数英
const authData = JSON.parse(readFileSync(authPath, "utf8"));
const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
const byId = new Map((runtime.textbooks || []).map((b) => [b.id, b]));
let merged = 0;
for (const b of authData.textbooks || []) {
  if (!b?.id || !Array.isArray(b.units) || !b.units.length) continue;
  if (!(b.id in UNITS) && !/^pep-(chinese|math|english)-pri_g/.test(b.id)) continue;
  if (b.id in UNITS || (b.editionId === "pep" && ["chinese", "math", "english"].includes(b.subjectId))) {
    byId.set(b.id, b);
    merged += 1;
  }
}
runtime.textbooks = [...byId.values()];
runtime.updatedAt = new Date().toISOString();
runtime.note = authData.note;
runtime.source = "web-public-toc+local";
writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      auth,
      runtimeBooks: runtime.textbooks.length,
      runtimeMergedTouch: merged,
      hint: "刷新课件页；英语一二年级人教槽位未填（PEP 多为三年级起点）",
    },
    null,
    2,
  ),
);
