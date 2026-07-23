"use strict";
/* ============================================================
   item.js - 物品與戰利品系統（打寶核心）
   - RARITY     : 稀有度分級（普通 / 稀有 / 史詩 / 傳說）
   - Equipment  : 裝備資料（武器 / 防具，隨機屬性）
   - DropEntity : 掉落在地上的物品實體（彈跳物理、磁吸、稀有度光柱）
   - LootSystem : 依怪物種類與等級擲骰產生掉落
   ============================================================ */

/* ---------- 稀有度定義 ---------- */
const RARITY = [
  { id: "common", name: "普通", color: "#b8c2cc", mult: 1.0, weight: 62, css: "r-common" },
  { id: "rare",   name: "稀有", color: "#4da6ff", mult: 1.4, weight: 26, css: "r-rare" },
  { id: "epic",   name: "史詩", color: "#b968ff", mult: 1.9, weight: 9,  css: "r-epic" },
  { id: "legend", name: "傳說", color: "#ffa726", mult: 2.6, weight: 3,  css: "r-legend" },
];

/* ---------- 裝備基底型（名稱 / 圖示 / 屬性傾向） ---------- */
const WEAPON_BASES = [
  { name: "短劍", icon: "🗡️", atkMod: 0.9 },
  { name: "鐵劍", icon: "⚔️", atkMod: 1.0 },
  { name: "獵斧", icon: "🪓", atkMod: 1.15 },
  { name: "長槍", icon: "🔱", atkMod: 1.05 },
];
const ARMOR_BASES = [
  { name: "皮甲", icon: "🥋", defMod: 0.9, hpMod: 1.1 },
  { name: "鎖環甲", icon: "⛓️", defMod: 1.0, hpMod: 1.0 },
  { name: "騎士鎧", icon: "🛡️", defMod: 1.15, hpMod: 0.95 },
];

/* ---------- 傳說裝備專屬名與特效字首 ---------- */
const LEGEND_NAMES = {
  weapon: ["「碎星」", "「獸王之牙」", "「暗紅黎明」", "「礦脈終結者」"],
  armor: ["「不滅核心」", "「深淵行者」", "「水晶聖殿」"],
};
const PREFIXES = ["精良的", "淬鍊的", "咆哮的", "遠古的", "深淵的", "水晶的"];

/* ---------- 傳說附加詞綴（額外能力） ---------- */
const LEGEND_BONUSES = [
  { id: "crit", text: "暴擊率 +10%", crit: 0.10 },
  { id: "lifesteal", text: "攻擊吸血 6%", lifesteal: 0.06 },
  { id: "speed", text: "移動速度 +12%", speed: 0.12 },
];

/* ============================================================
   Equipment - 一件裝備
   ============================================================ */
class Equipment {
  /**
   * @param {string} slot   "weapon" | "armor"
   * @param {number} ilvl   物品等級（來自怪物等級）
   * @param {object} rarity RARITY 中的一項
   */
  constructor(slot, ilvl, rarity) {
    this.slot = slot;
    this.ilvl = ilvl;
    this.rarity = rarity;
    this.atk = 0; this.def = 0; this.hp = 0;
    this.crit = 0; this.lifesteal = 0; this.speed = 0;
    this.bonusText = null;

    const roll = () => Physics.rand(0.9, 1.15); // 屬性浮動：同物等也有極品之分

    if (slot === "weapon") {
      const base = WEAPON_BASES[Physics.randInt(0, WEAPON_BASES.length - 1)];
      this.icon = base.icon;
      this.atk = Math.max(1, Math.round((5 + 3.2 * ilvl) * base.atkMod * rarity.mult * roll()));
      this.name = base.name;
    } else {
      const base = ARMOR_BASES[Physics.randInt(0, ARMOR_BASES.length - 1)];
      this.icon = base.icon;
      this.def = Math.max(1, Math.round((2 + 1.7 * ilvl) * base.defMod * rarity.mult * roll()));
      this.hp = Math.round((12 + 7 * ilvl) * base.hpMod * rarity.mult * roll());
      this.name = base.name;
    }

    // 命名：傳說 = 專屬名 + 附加詞綴；稀有以上 = 加字首
    if (rarity.id === "legend") {
      const pool = LEGEND_NAMES[slot];
      this.name = pool[Physics.randInt(0, pool.length - 1)] + this.name;
      const bonus = LEGEND_BONUSES[Physics.randInt(0, LEGEND_BONUSES.length - 1)];
      this.crit = bonus.crit || 0;
      this.lifesteal = bonus.lifesteal || 0;
      this.speed = bonus.speed || 0;
      this.bonusText = bonus.text;
    } else if (rarity.id !== "common") {
      this.name = PREFIXES[Physics.randInt(0, PREFIXES.length - 1)] + this.name;
    }

    // 賣出價值
    this.value = Math.round((4 + 2.5 * ilvl) * Math.pow(rarity.mult, 1.6));
  }

  /** 顯示用完整名稱 */
  get fullName() { return `${this.name} (${this.rarity.name})`; }
}

/* ============================================================
   DropEntity - 掉落在地上的物品
   type: "coin" | "potion" | "gear"
   ============================================================ */
class DropEntity {
  constructor(type, x, y, payload = null) {
    this.type = type;
    this.payload = payload;          // gear → Equipment；coin → 金額
    this.w = type === "gear" ? 26 : 18;
    this.h = this.w;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    // 掉落時向上彈出，帶隨機水平速度（噴寶的爽感）
    this.vx = Physics.rand(-160, 160);
    this.vy = Physics.rand(-620, -380);
    this.onGround = false;
    this.age = 0;
    this.life = type === "coin" ? 25 : 60; // 存在秒數
    this.magnet = false;                    // 是否已被磁吸
    this.dead = false;
  }

  /** 稀有度顏色（非裝備用預設色） */
  get color() {
    if (this.type === "coin") return "#ffd54f";
    if (this.type === "potion") return "#ff6e88";
    return this.payload.rarity.color;
  }

  update(dt, level, player) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const dist = Math.hypot(pcx - cx, pcy - cy);

    // 靠近時磁吸飛向玩家（撿寶流暢感）；裝備需落地後才可吸
    const magnetRange = this.type === "gear" ? 60 : 140;
    if (dist < magnetRange && this.age > 0.35 && !player.dead) this.magnet = true;

    if (this.magnet) {
      const ang = Math.atan2(pcy - cy, pcx - cx);
      const spd = 620;
      this.x += Math.cos(ang) * spd * dt;
      this.y += Math.sin(ang) * spd * dt;
    } else {
      // 一般物理：重力 + 彈跳
      Physics.applyGravity(this, dt);
      Physics.applyFriction(this, dt, this.onGround);
      Collision.moveAndCollide(this, level, dt);
      if (this.justLanded && Math.abs(this.vy) < 5) {
        this.vy = 0;
      }
      // 掉進深淵的戰利品彈回地圖內（避免損失爽感）
      if (this.y > level.pixelH + 40) {
        this.y = level.pixelH - 200;
        this.vy = -900;
      }
    }
  }

  draw(ctx, time) {
    const cx = this.x + this.w / 2;
    const bob = Math.sin(time * 4 + this.x) * 3; // 上下漂浮
    const cy = this.y + this.h / 2 + (this.onGround ? bob : 0);

    // --- 史詩以上：垂直光柱（遠處就看得到好貨）---
    if (this.type === "gear") {
      const r = this.payload.rarity;
      if (r.id === "epic" || r.id === "legend") {
        const beam = ctx.createLinearGradient(0, cy - 220, 0, cy);
        beam.addColorStop(0, "rgba(0,0,0,0)");
        beam.addColorStop(1, r.color + "66");
        ctx.fillStyle = beam;
        ctx.fillRect(cx - 10, cy - 220, 20, 220);
      }
      // 稀有度光暈
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 5);
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(cx, cy, this.w * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 圖示
      ctx.font = "22px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.payload.icon, cx, cy);
      return;
    }

    if (this.type === "coin") {
      // 金幣：旋轉橢圓
      const squash = Math.abs(Math.sin(time * 6 + this.x * 0.1));
      ctx.fillStyle = "#ffca28";
      ctx.strokeStyle = "#ff8f00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 8 * Math.max(0.45, squash), 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    // 藥水：紅瓶
    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🧪", cx, cy);
  }
}

/* ============================================================
   LootSystem - 掉落擲骰
   ============================================================ */
class LootSystem {
  /**
   * 依權重擲出稀有度
   * @param {number} minTier 最低稀有度索引（精英 1、首領 2）
   * @param {number} luckBonus 越深的區域越容易出好貨
   */
  static rollRarity(minTier = 0, luckBonus = 0) {
    // 幸運加成：把權重向高稀有度傾斜
    const weights = RARITY.map((r, i) => (i < minTier ? 0 : r.weight * (1 + i * luckBonus)));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < RARITY.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return RARITY[i];
    }
    return RARITY[0];
  }

  /**
   * 產生某隻怪物的掉落物
   * @param {Enemy} enemy 被擊殺的怪物
   * @returns {DropEntity[]}
   */
  static rollDrops(enemy) {
    const drops = [];
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;
    const lvl = enemy.lvl;
    const luck = lvl * 0.12; // 深區幸運加成

    // --- 金幣（必掉）---
    const coins = Physics.randInt(2, 4) + enemy.tier * 2;
    for (let i = 0; i < coins; i++) {
      drops.push(new DropEntity("coin", cx, cy, Physics.randInt(2, 4) * lvl));
    }

    // --- 藥水 ---
    if (Math.random() < 0.14 + enemy.tier * 0.05) {
      drops.push(new DropEntity("potion", cx, cy));
    }

    // --- 裝備 ---
    // 機器人 20% / 獸人 38% / 精英 75%（至少稀有）/ 首領 100% x3（至少史詩+保底傳說）
    if (enemy.tier === 3) {
      drops.push(new DropEntity("gear", cx, cy, new Equipment(Math.random() < 0.5 ? "weapon" : "armor", lvl, RARITY[3])));
      drops.push(new DropEntity("gear", cx, cy, new Equipment("weapon", lvl, LootSystem.rollRarity(2, luck))));
      drops.push(new DropEntity("gear", cx, cy, new Equipment("armor", lvl, LootSystem.rollRarity(2, luck))));
    } else {
      const gearChance = [0.2, 0.38, 0.75][enemy.tier] || 0.3;
      if (Math.random() < gearChance) {
        const minTier = enemy.tier === 2 ? 1 : 0;
        const slot = Math.random() < 0.5 ? "weapon" : "armor";
        drops.push(new DropEntity("gear", cx, cy, new Equipment(slot, lvl, LootSystem.rollRarity(minTier, luck))));
      }
    }
    return drops;
  }
}
