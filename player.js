"use strict";
/* ============================================================
   player.js - 玩家角色
   - 移動 / 跳躍（土狼時間、跳躍緩衝、可變跳高、下穿平台）
   - 三段連擊近戰（前衝、揮砍弧光、打擊停頓、暴擊）
   - 屬性（HP / 攻擊 / 防禦）、經驗值升級、金幣
   - 受傷（無敵幀 + 擊退）、死亡與重生
   - 背包與裝備（武器 / 防具，穿上後提升屬性）
   ============================================================ */

class Player {
  static INV_SIZE = 24; // 背包格數

  /** 各段連擊的參數：動畫 / 傷害倍率 / 前衝力 / 生效影格區間 */
  static COMBO = [
    { anim: "atk1", dmg: 1.0, lunge: 210, active: [2, 3], knock: 260 },
    { anim: "atk2", dmg: 1.1, lunge: 240, active: [2, 3], knock: 300 },
    { anim: "atk3", dmg: 1.7, lunge: 340, active: [4, 6], knock: 520 }, // 終結技
  ];

  constructor(spawn) {
    // ---------- 碰撞箱（世界座標）----------
    this.w = 32; this.h = 56;
    this.x = spawn.x - this.w / 2;
    this.y = spawn.y - this.h;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.dropThrough = false;

    // ---------- 基礎屬性（升級成長）----------
    this.lvl = 1;
    this.baseMaxHp = 100;
    this.baseAtk = 12;
    this.baseDef = 2;
    this.xp = 0;
    this.gold = 0;
    this.hp = this.maxHp;

    // ---------- 裝備與背包 ----------
    this.weapon = new Equipment("weapon", 1, RARITY[0]); // 新手武器
    this.weapon.name = "新兵短劍";
    this.armor = null;
    this.inventory = [];

    // ---------- 狀態機 ----------
    this.state = "normal"; // normal / attack / hurt / dead
    this.anim = new Animator(SPRITE_DEFS.soldier);
    this.anim.setAnim("idle");

    // ---------- 計時器 ----------
    this.coyoteTimer = 0;    // 土狼時間
    this.jumpBufferTimer = 0;// 跳躍緩衝
    this.invulnTimer = 0;    // 受傷無敵
    this.flashTimer = 0;     // 受擊白閃
    this.dropTimer = 0;      // 下穿平台
    this.dustTimer = 0;      // 奔跑塵土節流

    // ---------- 連擊 ----------
    this.comboIndex = -1;    // 目前第幾段（-1 = 未攻擊）
    this.comboBuffered = false; // 是否已預輸入下一段
    this.hitSet = new Set(); // 本段已命中的敵人（避免一段多次傷害）
    this.slashed = false;    // 本段是否已產生弧光

    this.deadTimer = 0;
  }

  // ------------------------------------------------------------
  // 合計屬性（基礎 + 裝備加成）
  // ------------------------------------------------------------
  get maxHp() { return this.baseMaxHp + (this.armor ? this.armor.hp : 0); }
  get atk() { return this.baseAtk + (this.weapon ? this.weapon.atk : 0); }
  get def() { return this.baseDef + (this.armor ? this.armor.def : 0); }
  get critChance() {
    return 0.08 + (this.weapon ? this.weapon.crit : 0) + (this.armor ? this.armor.crit : 0);
  }
  get lifesteal() {
    return (this.weapon ? this.weapon.lifesteal : 0) + (this.armor ? this.armor.lifesteal : 0);
  }
  get speedMult() {
    return 1 + (this.weapon ? this.weapon.speed : 0) + (this.armor ? this.armor.speed : 0);
  }
  /** 升級所需經驗 */
  get xpNeed() { return Math.round(50 * Math.pow(this.lvl, 1.6)); }

  // ------------------------------------------------------------
  // 主要更新
  // ------------------------------------------------------------
  /**
   * @param {Input} input 輸入
   * @param {Level} level 關卡
   * @param {Game} game   遊戲主體（取得敵人清單等）
   * @param {number} dt   秒
   */
  update(input, level, game, dt) {
    // ---------- 死亡狀態：只播動畫 ----------
    if (this.state === "dead") {
      this.anim.update(dt);
      Physics.applyGravity(this, dt);
      Physics.applyFriction(this, dt, this.onGround);
      Collision.moveAndCollide(this, level, dt);
      return;
    }

    // ---------- 計時器 ----------
    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    this.invulnTimer -= dt;
    this.flashTimer -= dt;
    this.dropTimer -= dt;
    this.dropThrough = this.dropTimer > 0;

    const attacking = this.state === "attack";
    const hurting = this.state === "hurt";

    // ---------- 水平移動（攻擊/受傷時鎖操作，保留慣性）----------
    let dir = 0;
    if (!attacking && !hurting) {
      if (input.held("left")) dir -= 1;
      if (input.held("right")) dir += 1;
    }
    if (dir !== 0) {
      Physics.accelerate(this, dir, dt, this.onGround, Physics.MAX_RUN * this.speedMult);
      this.facing = dir;
    } else {
      Physics.applyFriction(this, dt, this.onGround);
    }

    // ---------- 跳躍（緩衝 + 土狼時間 + 可變跳高）----------
    if (this.onGround) this.coyoteTimer = Physics.COYOTE_TIME;
    if (input.pressed("jump")) this.jumpBufferTimer = Physics.JUMP_BUFFER;

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !hurting) {
      if (input.held("down") && this.standingOnOneway(level)) {
        // S + 跳：下穿單向平台
        this.dropTimer = 0.22;
        this.dropThrough = true;
        this.y += 2;
      } else {
        this.vy = Physics.JUMP_VEL;
        AudioSys.sfx("jump");
        Effects.dust(this.x + this.w / 2, this.y + this.h, 5);
      }
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
    }
    // 放開跳躍鍵 → 縮短跳躍（可控高度）
    if (input.released("jump") && this.vy < 0) this.vy *= Physics.JUMP_CUT;

    // ---------- 攻擊輸入 ----------
    if (input.pressed("attack") && !hurting) {
      if (!attacking) this.startCombo(0);
      else this.comboBuffered = true; // 預輸入下一段
    }

    // ---------- 物理與碰撞 ----------
    Physics.applyGravity(this, dt);
    Collision.moveAndCollide(this, level, dt);

    // 落地回饋
    if (this.justLanded) {
      AudioSys.sfx("land");
      Effects.dust(this.x + this.w / 2, this.y + this.h, 6);
    }
    // 奔跑塵土
    this.dustTimer -= dt;
    if (this.onGround && Math.abs(this.vx) > 250 && this.dustTimer <= 0) {
      Effects.dust(this.x + this.w / 2 - this.facing * 12, this.y + this.h, 2);
      this.dustTimer = 0.18;
    }

    // ---------- 攻擊狀態處理 ----------
    if (attacking) this.updateAttack(game, dt);

    // ---------- 受傷狀態結束 ----------
    if (hurting && this.anim.done) this.state = "normal";

    // ---------- 掉入深淵 ----------
    if (this.y > level.pixelH + 60) this.kill(game, true);

    // ---------- 動畫選擇 ----------
    if (this.state === "normal") {
      if (!this.onGround) this.anim.setAnim(Math.abs(this.vx) > 40 ? "walk" : "idle");
      else this.anim.setAnim(Math.abs(this.vx) > 40 ? "walk" : "idle");
    }
    this.anim.update(dt);
  }

  /** 是否站在單向平台上（決定能否下穿） */
  standingOnOneway(level) {
    const T = Level.TILE;
    const row = Math.floor((this.y + this.h + 4) / T);
    const c0 = Math.floor(this.x / T), c1 = Math.floor((this.x + this.w) / T);
    for (let c = c0; c <= c1; c++) {
      if (level.tileAt(c, row) === Level.SOLID) return false;
    }
    for (let c = c0; c <= c1; c++) {
      if (level.tileAt(c, row) === Level.ONEWAY) return true;
    }
    return false;
  }

  // ------------------------------------------------------------
  // 連擊系統
  // ------------------------------------------------------------
  startCombo(index) {
    this.state = "attack";
    this.comboIndex = index;
    this.comboBuffered = false;
    this.hitSet.clear();
    this.slashed = false;
    const c = Player.COMBO[index];
    this.anim.setAnim(c.anim, true);
    // 前衝：讓攻擊有推進力
    this.vx = Physics.clamp(this.vx + this.facing * c.lunge, -520, 520);
    AudioSys.sfx(index === 2 ? "swing3" : "swing");
  }

  updateAttack(game, dt) {
    const c = Player.COMBO[this.comboIndex];
    const frame = this.anim.frame;

    // 生效影格：產生弧光 + 傷害判定
    if (frame >= c.active[0] && frame <= c.active[1]) {
      if (!this.slashed) {
        this.slashed = true;
        Effects.slash(
          this.x + this.w / 2 + this.facing * 30,
          this.y + this.h * 0.45,
          this.facing,
          this.comboIndex === 2
        );
      }
      this.checkAttackHits(game, c);
    }

    // 動畫結束：接續連段或收招
    if (this.anim.done) {
      if (this.comboBuffered && this.comboIndex < Player.COMBO.length - 1) {
        this.startCombo(this.comboIndex + 1);
      } else {
        this.state = "normal";
        this.comboIndex = -1;
      }
    }
  }

  /** 攻擊命中判定（攻擊框 = 面向前方的矩形） */
  checkAttackHits(game, combo) {
    const reach = this.comboIndex === 2 ? 112 : 92;
    const hitbox = {
      x: this.facing > 0 ? this.x + this.w - 8 : this.x + 8 - reach,
      y: this.y - 10,
      w: reach,
      h: this.h + 20,
    };

    for (const enemy of game.enemies) {
      if (enemy.dead || this.hitSet.has(enemy)) continue;
      if (!Collision.overlap(hitbox, enemy)) continue;
      this.hitSet.add(enemy);

      // ---------- 傷害計算 ----------
      const isCrit = Math.random() < this.critChance;
      let dmg = this.atk * combo.dmg * Physics.rand(0.9, 1.1);
      if (isCrit) dmg *= 1.7;
      dmg = Math.max(1, Math.round(dmg - enemy.def * 0.5));

      const killed = enemy.takeDamage(dmg, this.facing, combo.knock, isCrit);

      // ---------- 打擊感回饋 ----------
      const ex = enemy.x + enemy.w / 2, ey = enemy.y + enemy.h * 0.4;
      Effects.hitSpark(ex, ey, this.facing, isCrit);
      Effects.floatText(ex, ey - 20, String(dmg), {
        color: isCrit ? "#ffd54f" : "#fff",
        crit: isCrit,
      });
      Effects.hitstop(killed ? 0.1 : (isCrit ? 0.09 : 0.05)); // 命中凍結
      Effects.shake(killed ? 9 : (isCrit ? 7 : 4));            // 螢幕震動
      AudioSys.sfx(killed ? "kill" : (isCrit ? "crit" : "hit"));

      // 吸血詞綴
      if (this.lifesteal > 0) this.heal(Math.ceil(dmg * this.lifesteal), false);
    }
  }

  // ------------------------------------------------------------
  // 受傷 / 死亡 / 治療
  // ------------------------------------------------------------
  /**
   * @param {number} amount 原始傷害
   * @param {number} fromX  傷害來源 X（決定擊退方向）
   */
  takeDamage(amount, fromX) {
    if (this.invulnTimer > 0 || this.state === "dead") return;
    const dmg = Math.max(1, Math.round(amount - this.def * 0.6));
    this.hp -= dmg;
    this.invulnTimer = 1.0;
    this.flashTimer = 0.12;

    // 擊退 + 回饋
    const dir = (this.x + this.w / 2) < fromX ? -1 : 1;
    this.vx = dir * 420;
    this.vy = -320;
    Effects.floatText(this.x + this.w / 2, this.y - 10, `-${dmg}`, { color: "#ff5252", size: 24 });
    Effects.shake(8);
    Effects.hitstop(0.06);
    AudioSys.sfx("hurt");

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.anim.setAnim("death", true);
      AudioSys.sfx("die");
    } else if (this.state !== "attack") {
      this.state = "hurt";
      this.anim.setAnim("hurt", true);
    }
  }

  /** 直接死亡（深淵） */
  kill(game, byAbyss = false) {
    if (this.state === "dead") return;
    this.hp = 0;
    this.state = "dead";
    this.anim.setAnim("death", true);
    AudioSys.sfx("die");
    if (byAbyss) {
      // 深淵死亡：固定在深淵上緣播動畫沒意義，直接標記
      this.y = game.level.pixelH + 100;
    }
  }

  /** 重生於檢查點 */
  respawn(checkpoint) {
    this.x = checkpoint.x - this.w / 2;
    this.y = checkpoint.y - this.h;
    this.vx = 0; this.vy = 0;
    this.hp = this.maxHp;
    this.state = "normal";
    this.invulnTimer = 2.0;
    this.anim.setAnim("idle", true);
    AudioSys.sfx("respawn");
  }

  heal(amount, showText = true) {
    if (this.state === "dead") return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const gained = Math.round(this.hp - before);
    if (gained > 0 && showText) {
      Effects.floatText(this.x + this.w / 2, this.y - 14, `+${gained}`, { color: "#69f0ae" });
    }
  }

  // ------------------------------------------------------------
  // 經驗值 / 金幣
  // ------------------------------------------------------------
  gainXP(amount) {
    this.xp += amount;
    Effects.floatText(this.x + this.w / 2, this.y + 10, `+${amount} EXP`, { color: "#b2ff59", size: 15 });
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.lvl++;
      // 升級成長 + 回滿血
      this.baseMaxHp += 18;
      this.baseAtk += 3;
      this.baseDef += 1;
      this.hp = this.maxHp;
      Effects.levelUp(this.x + this.w / 2, this.y + this.h / 2);
      Effects.floatText(this.x + this.w / 2, this.y - 30, `LEVEL UP! Lv.${this.lvl}`, { color: "#fff59d", size: 28, crit: true });
      Effects.shake(6);
      AudioSys.sfx("levelup");
    }
  }

  gainGold(amount) { this.gold += amount; }

  // ------------------------------------------------------------
  // 裝備操作
  // ------------------------------------------------------------
  /**
   * 從背包穿上裝備，原裝備放回背包
   * @param {number} invIndex 背包索引
   */
  equipFromInventory(invIndex) {
    const item = this.inventory[invIndex];
    if (!item) return;
    const old = item.slot === "weapon" ? this.weapon : this.armor;
    if (item.slot === "weapon") this.weapon = item;
    else this.armor = item;
    // 換裝：舊裝備放回原本格子
    if (old) this.inventory[invIndex] = old;
    else this.inventory.splice(invIndex, 1);
    // 防具影響最大 HP：避免超出上限
    this.hp = Math.min(this.hp, this.maxHp);
    AudioSys.sfx("equip");
  }

  /** 賣出背包物品換金幣 */
  sellFromInventory(invIndex) {
    const item = this.inventory[invIndex];
    if (!item) return;
    this.inventory.splice(invIndex, 1);
    this.gainGold(item.value);
    AudioSys.sfx("sell");
    return item;
  }

  // ------------------------------------------------------------
  // 繪製
  // ------------------------------------------------------------
  draw(ctx) {
    // 無敵幀閃爍
    let alpha = 1;
    if (this.invulnTimer > 0 && this.state !== "dead") {
      alpha = Math.sin(this.invulnTimer * 40) > 0 ? 0.35 : 0.9;
    }
    drawActor(
      ctx, SPRITE_DEFS.soldier, this.anim,
      this.x + this.w / 2, this.y + this.h,
      this.facing,
      { alpha, flash: this.flashTimer > 0 }
    );
  }
}
