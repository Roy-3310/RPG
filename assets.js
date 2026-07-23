"use strict";
/* ============================================================
   assets.js - 資源載入與精靈圖（Sprite）系統
   1. Assets      : 圖片載入器（支援色調變化，用於精英/首領怪）
   2. SPRITE_DEFS : 各角色的動畫定義（影格數、FPS、錨點）
   3. Animator    : 動畫播放器
   4. drawActor   : 將角色以「腳底錨點」繪製到畫布（支援翻轉）
   ============================================================ */

// ---------- 素材路徑 ----------
const CHAR_DIR =
  "遊戲素材/Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/" +
  "Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Characters(100x100 split)";
const TILE_DIR = "遊戲素材/Mine Tileset/FREE/5. Mine Tileset - Starter Pack 32p";
const ROBOT_DIR = "遊戲素材/Mine Tileset/FREE/6. Character Animations 32p/Anim_Robot_Walk1_v1.1_frames";
const MON_DIR = "遊戲素材/Monsters_Creatures_Fantasy";   // LuizMelo 怪物包（CC0）
const BG_DIR = "遊戲素材/Crystal Cave BG";               // Craftpix 水晶洞穴視差背景
const DECO_DIR = "遊戲素材/Foozle Cave";                 // Foozle 洞穴裝飾（CC0）

/** 所有需要載入的圖片清單：key → 路徑 */
const ASSET_MANIFEST = {
  // 玩家（士兵）
  soldier_idle:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Idle.png`,
  soldier_walk:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Walk.png`,
  soldier_atk1:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Attack01.png`,
  soldier_atk2:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Attack02.png`,
  soldier_atk3:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Attack03.png`,
  soldier_hurt:  `${CHAR_DIR}/Soldier/Soldier/Soldier_Hurt.png`,
  soldier_death: `${CHAR_DIR}/Soldier/Soldier/Soldier_Death.png`,
  // 獸人
  orc_idle:  `${CHAR_DIR}/Orc/Orc/Orc_Idle.png`,
  orc_walk:  `${CHAR_DIR}/Orc/Orc/Orc_Walk.png`,
  orc_atk1:  `${CHAR_DIR}/Orc/Orc/Orc_Attack01.png`,
  orc_atk2:  `${CHAR_DIR}/Orc/Orc/Orc_Attack02.png`,
  orc_hurt:  `${CHAR_DIR}/Orc/Orc/Orc_Hurt.png`,
  orc_death: `${CHAR_DIR}/Orc/Orc/Orc_Death.png`,
  // 地形
  tiles:    `${TILE_DIR}/1_Mine_Tileset_1.png`,
  tiles_bg: `${TILE_DIR}/2_Mine_Tileset_1_Background.png`,
  far_bg:   `${TILE_DIR}/3_Far_Background_Tile.png`,
  // 礦坑機器人（獨立影格 1~6）
  robot_1: `${ROBOT_DIR}/1.png`, robot_2: `${ROBOT_DIR}/2.png`,
  robot_3: `${ROBOT_DIR}/3.png`, robot_4: `${ROBOT_DIR}/4.png`,
  robot_5: `${ROBOT_DIR}/5.png`, robot_6: `${ROBOT_DIR}/6.png`,

  // ---------- 新怪物（LuizMelo Monsters Creatures Fantasy，150x150 影格）----------
  // 骷髏劍士（有盾牌格擋動畫）
  skel_idle:  `${MON_DIR}/Skeleton/Idle.png`,
  skel_walk:  `${MON_DIR}/Skeleton/Walk.png`,
  skel_atk:   `${MON_DIR}/Skeleton/Attack.png`,
  skel_shield:`${MON_DIR}/Skeleton/Shield.png`,
  skel_hurt:  `${MON_DIR}/Skeleton/Take Hit.png`,
  skel_death: `${MON_DIR}/Skeleton/Death.png`,
  // 哥布林
  gob_idle:  `${MON_DIR}/Goblin/Idle.png`,
  gob_run:   `${MON_DIR}/Goblin/Run.png`,
  gob_atk:   `${MON_DIR}/Goblin/Attack.png`,
  gob_hurt:  `${MON_DIR}/Goblin/Take Hit.png`,
  gob_death: `${MON_DIR}/Goblin/Death.png`,
  // 毒蘑菇
  mush_idle:  `${MON_DIR}/Mushroom/Idle.png`,
  mush_run:   `${MON_DIR}/Mushroom/Run.png`,
  mush_atk:   `${MON_DIR}/Mushroom/Attack.png`,
  mush_hurt:  `${MON_DIR}/Mushroom/Take Hit.png`,
  mush_death: `${MON_DIR}/Mushroom/Death.png`,
  // 飛眼魔
  eye_flight: `${MON_DIR}/Flying eye/Flight.png`,
  eye_atk:    `${MON_DIR}/Flying eye/Attack.png`,
  eye_hurt:   `${MON_DIR}/Flying eye/Take Hit.png`,
  eye_death:  `${MON_DIR}/Flying eye/Death.png`,

  // ---------- 區域視差背景（Craftpix，576x324，Plan 數字越大越遠）----------
  bg1_p1: `${BG_DIR}/bg1/Plan 1.png`, bg1_p2: `${BG_DIR}/bg1/Plan 2.png`,
  bg1_p3: `${BG_DIR}/bg1/Plan 3.png`, bg1_p4: `${BG_DIR}/bg1/Plan 4.png`,
  bg1_p5: `${BG_DIR}/bg1/Plan 5.png`,
  bg2_p1: `${BG_DIR}/bg2/Plan 1.png`, bg2_p2: `${BG_DIR}/bg2/Plan 2.png`,
  bg2_p3: `${BG_DIR}/bg2/Plan 3.png`, bg2_p4: `${BG_DIR}/bg2/Plan 4.png`,
  bg3_p1: `${BG_DIR}/bg3/Plan 1.png`, bg3_p2: `${BG_DIR}/bg3/Plan 2.png`,
  bg3_p3: `${BG_DIR}/bg3/Plan 3.png`, bg3_p4: `${BG_DIR}/bg3/Plan 4.png`,
  bg4_p1: `${BG_DIR}/bg4/Plan 1.png`, bg4_p2: `${BG_DIR}/bg4/Plan 2.png`,
  bg4_p3: `${BG_DIR}/bg4/Plan 3.png`, bg4_p4: `${BG_DIR}/bg4/Plan 4.png`,
  bg4_p5: `${BG_DIR}/bg4/Plan 5.png`,

  // ---------- 場景裝飾（Foozle）----------
  deco:       `${DECO_DIR}/Decorations.png`,     // 水晶 / 石筍 / 苔蘚
  torch:      `${DECO_DIR}/Standing Torch.png`,  // 立式火把（4 影格 32x64）
};

/* ============================================================
   Assets - 圖片載入器
   ============================================================ */
class Assets {
  /** @type {Map<string, HTMLImageElement|HTMLCanvasElement>} */
  static images = new Map();

  /** 載入 ASSET_MANIFEST 中所有圖片，全部完成後 resolve */
  static load() {
    const jobs = Object.entries(ASSET_MANIFEST).map(([key, path]) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { Assets.images.set(key, img); resolve(); };
        img.onerror = () => reject(new Error(`素材載入失敗: ${path}`));
        img.src = encodeURI(path); // 路徑含空白 / 中文，需編碼
      })
    );
    return Promise.all(jobs).then(() => Assets.buildTinted());
  }

  /** 取得圖片 */
  static img(key) { return Assets.images.get(key); }

  /**
   * 建立「染色版」精靈圖：
   * 精英獸人 = 紅色調、首領獸人 = 紫色調（同一素材做出視覺變體）
   */
  static buildTinted() {
    const orcSheets = ["idle", "walk", "atk1", "atk2", "hurt", "death"];
    for (const name of orcSheets) {
      Assets.tint(`orc_${name}`, `orcElite_${name}`, "rgba(255,40,40,0.42)");
      Assets.tint(`orc_${name}`, `orcBoss_${name}`, "rgba(150,40,255,0.45)");
    }
  }

  /** 複製圖片並疊上色彩（僅套用在不透明像素上） */
  static tint(srcKey, dstKey, color) {
    const src = Assets.img(srcKey);
    const cv = document.createElement("canvas");
    cv.width = src.width; cv.height = src.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-atop"; // 只染在既有像素上
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cv.width, cv.height);
    Assets.images.set(dstKey, cv);
  }
}

/* ============================================================
   SPRITE_DEFS - 精靈定義
   scale : 繪製倍率
   cx    : 影格中「身體中心」的 X（像素）
   footY : 影格中「腳底」的 Y（像素）→ 對齊碰撞箱底部
   anims : 各動畫（key=圖片鍵 / keys=逐張影格、frames、fps、loop）
   ============================================================ */
const SPRITE_DEFS = {
  soldier: {
    scale: 3, frameW: 100, frameH: 100, cx: 50, footY: 60,
    anims: {
      idle:  { key: "soldier_idle",  frames: 6, fps: 8,  loop: true },
      walk:  { key: "soldier_walk",  frames: 8, fps: 13, loop: true },
      atk1:  { key: "soldier_atk1",  frames: 6, fps: 17, loop: false },
      atk2:  { key: "soldier_atk2",  frames: 6, fps: 17, loop: false },
      atk3:  { key: "soldier_atk3",  frames: 9, fps: 15, loop: false },
      hurt:  { key: "soldier_hurt",  frames: 4, fps: 14, loop: false },
      death: { key: "soldier_death", frames: 4, fps: 9,  loop: false },
    },
  },
  orc: {
    scale: 3, frameW: 100, frameH: 100, cx: 53, footY: 57,
    anims: {
      idle:  { key: "orc_idle",  frames: 6, fps: 7,  loop: true },
      walk:  { key: "orc_walk",  frames: 8, fps: 11, loop: true },
      atk1:  { key: "orc_atk1",  frames: 6, fps: 10, loop: false },
      atk2:  { key: "orc_atk2",  frames: 6, fps: 10, loop: false },
      hurt:  { key: "orc_hurt",  frames: 4, fps: 13, loop: false },
      death: { key: "orc_death", frames: 4, fps: 9,  loop: false },
    },
  },
  // 精英 / 首領使用染色後的圖片鍵（於 Assets.buildTinted 產生）
  orcElite: null, // 於下方以程式產生
  orcBoss: null,
  robot: {
    scale: 2, frameW: 32, frameH: 32, cx: 16, footY: 31,
    anims: {
      walk: { keys: ["robot_1", "robot_2", "robot_3", "robot_4", "robot_5", "robot_6"], frames: 6, fps: 10, loop: true },
    },
  },

  // ---------- 新怪物（150x150 影格；cx / footY 依實測像素邊界）----------
  // 骷髏劍士：素材面向右
  skeleton: {
    scale: 2, frameW: 150, frameH: 150, cx: 82, footY: 101,
    anims: {
      idle:   { key: "skel_idle",   frames: 4, fps: 6,  loop: true },
      walk:   { key: "skel_walk",   frames: 4, fps: 8,  loop: true },
      atk1:   { key: "skel_atk",    frames: 8, fps: 12, loop: false },
      shield: { key: "skel_shield", frames: 4, fps: 8,  loop: true },
      hurt:   { key: "skel_hurt",   frames: 4, fps: 14, loop: false },
      death:  { key: "skel_death",  frames: 4, fps: 9,  loop: false },
    },
  },
  // 哥布林：素材面向左 → flipX
  goblin: {
    scale: 2, frameW: 150, frameH: 150, cx: 74, footY: 101, flipX: true,
    anims: {
      idle:  { key: "gob_idle",  frames: 4, fps: 7,  loop: true },
      walk:  { key: "gob_run",   frames: 8, fps: 15, loop: true },
      atk1:  { key: "gob_atk",   frames: 8, fps: 15, loop: false },
      hurt:  { key: "gob_hurt",  frames: 4, fps: 14, loop: false },
      death: { key: "gob_death", frames: 4, fps: 9,  loop: false },
    },
  },
  // 毒蘑菇：素材面向左 → flipX
  mushroom: {
    scale: 2, frameW: 150, frameH: 150, cx: 75, footY: 101, flipX: true,
    anims: {
      idle:  { key: "mush_idle",  frames: 4, fps: 6,  loop: true },
      walk:  { key: "mush_run",   frames: 8, fps: 9,  loop: true },
      atk1:  { key: "mush_atk",   frames: 8, fps: 11, loop: false },
      hurt:  { key: "mush_hurt",  frames: 4, fps: 13, loop: false },
      death: { key: "mush_death", frames: 4, fps: 9,  loop: false },
    },
  },
  // 飛眼魔：素材面向右
  flyingEye: {
    scale: 2, frameW: 150, frameH: 150, cx: 77, footY: 92,
    anims: {
      idle:  { key: "eye_flight", frames: 8, fps: 13, loop: true },
      atk1:  { key: "eye_atk",    frames: 8, fps: 15, loop: false },
      hurt:  { key: "eye_hurt",   frames: 4, fps: 14, loop: false },
      death: { key: "eye_death",  frames: 4, fps: 9,  loop: false },
    },
  },
};

/** 依 orc 定義產生精英 / 首領變體（換圖片鍵、調整倍率） */
(function buildOrcVariants() {
  const clone = (prefix, scale) => {
    const def = JSON.parse(JSON.stringify(SPRITE_DEFS.orc));
    def.scale = scale;
    for (const a of Object.values(def.anims)) a.key = a.key.replace("orc_", prefix + "_");
    return def;
  };
  SPRITE_DEFS.orcElite = clone("orcElite", 3.4);
  SPRITE_DEFS.orcBoss = clone("orcBoss", 5.2);
  SPRITE_DEFS.orcBoss.anims.walk.fps = 8; // 首領步伐較沉重
})();

/* ============================================================
   Animator - 動畫播放器
   ============================================================ */
class Animator {
  /** @param {object} def SPRITE_DEFS 中的角色定義 */
  constructor(def) {
    this.def = def;
    this.name = null;   // 目前動畫名稱
    this.time = 0;      // 已播放秒數
    this.done = false;  // 非循環動畫是否播完
    this.setAnim(Object.keys(def.anims)[0]);
  }

  /** 切換動畫（同名不重置，force=true 可強制重播） */
  setAnim(name, force = false) {
    if (this.name === name && !force) return;
    this.name = name;
    this.time = 0;
    this.done = false;
  }

  /** 前進動畫時間 */
  update(dt) {
    const a = this.def.anims[this.name];
    this.time += dt;
    if (!a.loop && this.time >= a.frames / a.fps) {
      this.time = a.frames / a.fps - 0.0001;
      this.done = true;
    }
  }

  /** 目前影格索引 */
  get frame() {
    const a = this.def.anims[this.name];
    return Math.min(Math.floor(this.time * a.fps), a.frames - 1) % a.frames;
  }

  /** 目前動畫定義 */
  get anim() { return this.def.anims[this.name]; }
}

/* ============================================================
   drawActor - 通用角色繪製
   以（cxWorld, bottomWorld）＝碰撞箱底部中心為錨點
   facing < 0 時水平翻轉
   ============================================================ */
function drawActor(ctx, def, animator, cxWorld, bottomWorld, facing, opts = {}) {
  const a = animator.anim;
  const fi = animator.frame;
  const img = a.keys ? Assets.img(a.keys[fi]) : Assets.img(a.key);
  const sx = a.keys ? 0 : fi * def.frameW; // 逐張影格時 sx 固定為 0
  const s = def.scale;

  ctx.save();
  ctx.translate(Math.round(cxWorld), Math.round(bottomWorld));
  // flipX 的素材原始面向為左 → 翻轉邏輯相反
  const face = def.flipX ? -facing : facing;
  if (face < 0) ctx.scale(-1, 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.flash) ctx.filter = "brightness(2.6) saturate(0.4)"; // 受擊白閃
  ctx.drawImage(
    img,
    sx, 0, def.frameW, def.frameH,
    -def.cx * s, -def.footY * s,   // 讓身體中心 / 腳底對準錨點
    def.frameW * s, def.frameH * s
  );
  ctx.restore();
}
