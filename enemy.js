"use strict";
/* ============================================================
   enemy.js - 怪物系統
   - Enemy      : 基底類別（物理、受擊、死亡、血條）
   - RobotEnemy : 礦坑機器人（巡邏 + 接觸傷害，會爆炸）
   - OrcEnemy   : 獸人戰士（巡邏 → 追擊 → 前搖攻擊）
   - EliteOrc   : 精英獸人（紅色、更快更痛、擊退抗性）
   - BossOrc    : 獸王・戈魯姆（揮擊 + 跳躍震地兩種攻擊模式）
   怪物等級由關卡區域決定 → 難度循序漸進
   ============================================================ */

class Enemy {
  /**
   * @param {number} x   出生點中心 X
   * @param {number} y   出生點腳底 Y
   * @param {number} lvl 怪物等級（影響屬性與掉落）
   */
  constructor(x, y, lvl) {
    this.lvl = lvl;
    this.vx = 0; this.vy = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.onGround = false;

    this.state = "patrol";  // patrol / chase / attack / hurt / dead
    this.dead = false;      // 死亡中（不再受擊）
    this.remove = false;    // 可從清單移除
    this.deadTimer = 0;     // 屍體淡出計時
    this.flashTimer = 0;    // 受擊白閃
    this.attackCd = 0;      // 攻擊冷卻
    this.attackHit = false; // 本次攻擊是否已命中（避免一招多判）
    this.knockResist = 0;   // 擊退抗性 0~1

    // 子類別填入 this.w/h 之後呼叫 placeAt
    this._spawnX = x; this._spawnY = y;
  }

  /** 依碰撞箱尺寸放到出生點（腳底對齊） */
  placeAt() {
    this.x = this._spawnX - this.w / 2;
    this.y = this._spawnY - this.h;
  }

  /** 依等級縮放屬性（每級 +35%） */
  levelMult() { return 1 + 0.35 * (this.lvl - 1); }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // ------------------------------------------------------------
  // 受擊
  // ------------------------------------------------------------
  /**
   * @returns {boolean} 是否因此死亡
   */
  takeDamage(dmg, dir, knock, isCrit) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flashTimer = 0.1;

    // 擊退（依抗性折減）
    const resist = 1 - this.knockResist;
    this.vx = dir * knock * resist;
    if (resist > 0.3) this.vy = -160;

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    // 硬直（打斷攻擊）：擊退抗性高的怪不會被打斷
    if (this.knockResist < 0.5) {
      this.state = "hurt";
      this.attackHit = false;
      if (this.anim && this.anim.def.anims.hurt) this.anim.setAnim("hurt", true);
      this.hurtTimer = 0.32;
    }
    return false;
  }

  die() {
    this.dead = true;
    this.state = "dead";
    this.deadTimer = 1.1;
    if (this.anim && this.anim.def.anims.death) this.anim.setAnim("death", true);
  }

  /** 共通物理 */
  applyPhysics(level, dt) {
    Physics.applyGravity(this, dt);
    Physics.applyFriction(this, dt, this.onGround);
    Collision.moveAndCollide(this, level, dt);
  }

  /** 巡邏移動：撞牆或到懸崖邊就回頭 */
  patrolMove(level, speed, dt) {
    this.vx = this.facing * speed;
    if (this.hitWall || (this.onGround && Collision.ledgeAhead(this, level, this.facing))) {
      this.facing *= -1;
      this.vx = 0;
    }
  }

  /** 追擊移動：面向玩家前進，但不會衝下懸崖 */
  chaseMove(level, player, speed) {
    this.facing = (player.x + player.w / 2 > this.cx) ? 1 : -1;
    if (this.onGround && Collision.ledgeAhead(this, level, this.facing)) {
      this.vx = 0; // 在懸崖邊停下
    } else {
      this.vx = this.facing * speed;
    }
  }

  /** 玩家距離 */
  distTo(player) {
    return {
      dx: Math.abs(player.x + player.w / 2 - this.cx),
      dy: Math.abs(player.y + player.h / 2 - this.cy),
    };
  }

  /** 血條（受過傷才顯示） */
  drawHpBar(ctx) {
    if (this.dead || this.hp >= this.maxHp) return;
    const w = Math.max(40, this.w);
    const x = this.cx - w / 2;
    const y = this.y - 14;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = "#e53935";
    ctx.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 5);
  }
}

/* ============================================================
   RobotEnemy - 礦坑機器人
   最弱的怪：只會巡邏，碰到會受傷；死亡時爆炸
   ============================================================ */
class RobotEnemy extends Enemy {
  constructor(x, y, lvl) {
    super(x, y, lvl);
    this.w = 40; this.h = 46;
    this.placeAt();
    const m = this.levelMult();
    this.maxHp = Math.round(28 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(9 * m);
    this.def = Math.round(1 * m);
    this.xpReward = Math.round(12 * m);
    this.tier = 0;
    this.anim = new Animator(SPRITE_DEFS.robot);
    this.anim.setAnim("walk");
    this.contactCd = 0;
  }

  update(game, dt) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.remove = true;
      return; // 機器人死亡即爆炸消失，不播屍體
    }

    this.contactCd -= dt;
    this.patrolMove(game.level, 85, dt);
    this.applyPhysics(game.level, dt);

    // 接觸傷害
    const p = game.player;
    if (this.contactCd <= 0 && !p.dead && Collision.overlap(this, p)) {
      p.takeDamage(this.atkPower, this.cx);
      this.contactCd = 0.8;
    }
    this.anim.update(dt);
  }

  die() {
    super.die();
    this.deadTimer = 0.05;
    // 爆炸特效
    Effects.burst(this.cx, this.cy, 30, {
      colors: ["#ffb74d", "#ff7043", "#fff176", "#90a4ae"],
      speed: 380, life: 0.5, size: 6, gravity: 500,
    });
    Effects.shake(5);
  }

  draw(ctx) {
    if (this.dead) return;
    drawActor(ctx, SPRITE_DEFS.robot, this.anim, this.cx, this.y + this.h, this.facing,
      { flash: this.flashTimer > 0 });
    this.drawHpBar(ctx);
  }
}

/* ============================================================
   OrcEnemy - 獸人戰士
   巡邏 → 發現玩家追擊 → 靠近後前搖攻擊（可被打斷）
   ============================================================ */
class OrcEnemy extends Enemy {
  constructor(x, y, lvl) {
    super(x, y, lvl);
    this.w = 58; this.h = 46;
    this.placeAt();
    this.setupStats();
    this.anim = new Animator(this.spriteDef());
    this.anim.setAnim("idle");
    this.hurtTimer = 0;
  }

  /** 供子類別覆寫 */
  spriteDef() { return SPRITE_DEFS.orc; }
  setupStats() {
    const m = this.levelMult();
    this.maxHp = Math.round(55 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(14 * m);
    this.def = Math.round(2 * m);
    this.xpReward = Math.round(22 * m);
    this.tier = 1;
    this.patrolSpeed = 60;
    this.chaseSpeed = 150;
    this.aggroRange = 380;
    this.attackRange = 82;
    this.attackDamageFrames = [3, 4]; // 攻擊動畫的生效影格
    this.attackCooldown = 1.1;
  }

  update(game, dt) {
    const level = game.level;
    const p = game.player;
    this.flashTimer -= dt;
    this.attackCd -= dt;

    // ---------- 死亡：播動畫後淡出 ----------
    if (this.dead) {
      this.applyPhysics(level, dt);
      this.anim.update(dt);
      if (this.anim.done) {
        this.deadTimer -= dt;
        if (this.deadTimer <= 0) this.remove = true;
      }
      return;
    }

    const d = this.distTo(p);

    switch (this.state) {
      case "patrol":
        this.patrolMove(level, this.patrolSpeed, dt);
        this.anim.setAnim(Math.abs(this.vx) > 5 ? "walk" : "idle");
        // 發現玩家
        if (!p.dead && d.dx < this.aggroRange && d.dy < 160) this.state = "chase";
        break;

      case "chase":
        if (p.dead || d.dx > this.aggroRange * 1.6) { this.state = "patrol"; break; }
        this.chaseMove(level, p, this.chaseSpeed);
        this.anim.setAnim(Math.abs(this.vx) > 5 ? "walk" : "idle");
        // 進入攻擊距離
        if (d.dx < this.attackRange && d.dy < 90 && this.attackCd <= 0 && this.onGround) {
          this.startAttack(p);
        }
        break;

      case "attack": {
        this.vx *= 0.8; // 攻擊時定身
        this.anim.update(dt);
        const f = this.anim.frame;
        // 生效影格：對前方矩形判定一次傷害
        if (!this.attackHit && f >= this.attackDamageFrames[0] && f <= this.attackDamageFrames[1]) {
          this.doAttackHit(game);
        }
        this.updateAttackExtra(game); // 子類掛入點（多段判定 / 收招轉場）
        if (this.anim.done && this.state === "attack") {
          this.state = "chase";
          this.attackCd = this.attackCooldown;
        }
        this.applyPhysics(level, dt);
        return; // 攻擊中已自行處理動畫

      }
      case "hurt":
        this.hurtTimer -= dt;
        if (this.hurtTimer <= 0) this.state = "chase";
        break;
    }

    this.applyPhysics(level, dt);
    this.anim.update(dt);
  }

  /** 開始攻擊：面向玩家 + 前搖警示 */
  startAttack(p) {
    this.state = "attack";
    this.attackHit = false;
    this.facing = (p.x + p.w / 2) > this.cx ? 1 : -1;
    this.anim.setAnim(Math.random() < 0.5 && this.anim.def.anims.atk2 ? "atk2" : "atk1", true);
    Effects.floatText(this.cx, this.y - 18, "!", { color: "#ffab40", size: 26, vy: -40 });
    AudioSys.sfx("warn");
  }

  /** 攻擊狀態的子類掛入點（預設無動作） */
  updateAttackExtra(game) {}

  /** 攻擊生效：檢查是否打中玩家 */
  doAttackHit(game) {
    this.attackHit = true;
    const reach = this.attackRange + 22;
    const hitbox = {
      x: this.facing > 0 ? this.x + this.w - 10 : this.x + 10 - reach,
      y: this.y - 10, w: reach, h: this.h + 20,
    };
    if (!game.player.dead && Collision.overlap(hitbox, game.player)) {
      game.player.takeDamage(this.atkPower, this.cx);
    }
  }

  draw(ctx) {
    const fade = this.dead && this.anim.done ? Math.max(0, this.deadTimer / 1.1) : 1;
    drawActor(ctx, this.spriteDef(), this.anim, this.cx, this.y + this.h, this.facing,
      { flash: this.flashTimer > 0, alpha: fade });
    this.drawHpBar(ctx);
  }
}

/* ============================================================
   EliteOrc - 精英獸人（紅色變體）
   更快、更痛、具擊退抗性，掉落至少「稀有」裝備
   ============================================================ */
class EliteOrc extends OrcEnemy {
  spriteDef() { return SPRITE_DEFS.orcElite; }
  setupStats() {
    super.setupStats();
    const m = this.levelMult();
    this.w = 64; this.h = 52;
    this.placeAt();
    this.maxHp = Math.round(130 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(20 * m);
    this.def = Math.round(4 * m);
    this.xpReward = Math.round(55 * m);
    this.tier = 2;
    this.patrolSpeed = 70;
    this.chaseSpeed = 195;
    this.aggroRange = 450;
    this.attackRange = 95;
    this.attackCooldown = 0.85;
    this.knockResist = 0.55;
  }
}

/* ============================================================
   BossOrc - 獸王・戈魯姆（最終首領）
   模式一：重揮擊　模式二：跳躍震地（範圍傷害）
   ============================================================ */
class BossOrc extends OrcEnemy {
  spriteDef() { return SPRITE_DEFS.orcBoss; }
  setupStats() {
    const m = this.levelMult();
    this.w = 100; this.h = 80;
    this.placeAt();
    this.maxHp = Math.round(750 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(26 * m);
    this.def = Math.round(6 * m);
    this.xpReward = Math.round(400 * m);
    this.tier = 3;
    this.patrolSpeed = 40;
    this.chaseSpeed = 165;
    this.aggroRange = 620;
    this.attackRange = 130;
    this.attackDamageFrames = [3, 4];
    this.attackCooldown = 1.4;
    this.knockResist = 0.9;   // 幾乎不吃擊退、不被打斷
    this.leapCd = 3;          // 震地攻擊冷卻
    this.leaping = false;
    this.awake = false;       // 玩家靠近後才甦醒
  }

  update(game, dt) {
    const p = game.player;
    const d = this.distTo(p);

    // 甦醒演出
    if (!this.awake) {
      if (!p.dead && d.dx < 560) {
        this.awake = true;
        Effects.shake(10);
        AudioSys.sfx("slam");
        Effects.floatText(this.cx, this.y - 40, "吼！！", { color: "#ff8a80", size: 34, crit: true });
      }
      this.anim.setAnim("idle");
      this.anim.update(dt);
      this.applyPhysics(game.level, dt);
      return;
    }

    this.leapCd -= dt;

    // ---------- 跳躍震地 ----------
    if (this.leaping) {
      this.anim.setAnim("walk");
      this.anim.update(dt);
      this.applyPhysics(game.level, dt);
      if (this.justLanded) {
        this.leaping = false;
        this.slamLand(game);
      }
      return;
    }
    // 中距離時發動跳躍震地
    if (!this.dead && this.state !== "attack" && this.leapCd <= 0 &&
        d.dx > 160 && d.dx < 480 && this.onGround && !p.dead) {
      this.leaping = true;
      this.leapCd = Physics.rand(3.5, 5);
      this.facing = (p.x > this.x) ? 1 : -1;
      // 朝玩家拋物線跳躍
      this.vy = -880;
      this.vx = this.facing * Math.min(420, d.dx * 1.1);
      AudioSys.sfx("warn");
      return;
    }

    super.update(game, dt);
  }

  /** 震地落地：大範圍傷害 + 震動 + 衝擊波粒子 */
  slamLand(game) {
    Effects.shake(14);
    Effects.hitstop(0.05);
    AudioSys.sfx("slam");
    Effects.burst(this.cx, this.y + this.h, 30, {
      colors: ["#a1887f", "#8d6e63", "#ffcc80"],
      angle: -Math.PI / 2, spread: Math.PI * 0.9,
      speed: 420, life: 0.5, size: 7, gravity: 900,
    });
    const p = game.player;
    const d = this.distTo(p);
    // 範圍判定：落點附近 + 玩家在地面附近才會中（跳起可迴避）
    if (!p.dead && d.dx < 210 && p.y + p.h > this.y + this.h - 60) {
      p.takeDamage(Math.round(this.atkPower * 1.3), this.cx);
    }
  }
}

/* ============================================================
   SkeletonEnemy - 骷髏劍士（守衛型）
   特性：舉盾格擋 — 正面攻擊傷害大減且不會被打斷，
         繞到背後攻擊才吃全額傷害；格擋結束後使出反擊重斬
   ============================================================ */
class SkeletonEnemy extends OrcEnemy {
  spriteDef() { return SPRITE_DEFS.skeleton; }

  setupStats() {
    const m = this.levelMult();
    this.w = 50; this.h = 78;
    this.placeAt();
    this.maxHp = Math.round(80 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(17 * m);
    this.def = Math.round(4 * m);
    this.xpReward = Math.round(32 * m);
    this.tier = 1;
    this.patrolSpeed = 40;
    this.chaseSpeed = 115;
    this.aggroRange = 400;
    this.attackRange = 92;
    this.attackDamageFrames = [5, 6]; // 8 影格重斬，斬擊在後段生效
    this.attackCooldown = 1.6;
    this.guardTimer = 0;   // 格擋剩餘時間
    this.guardCd = 0;      // 格擋冷卻
  }

  update(game, dt) {
    this.guardCd -= dt;

    // ---------- 格擋狀態：定身舉盾，結束後立即反擊 ----------
    if (this.state === "guard") {
      this.vx *= 0.7;
      this.guardTimer -= dt;
      this.anim.setAnim("shield");
      this.anim.update(dt);
      this.applyPhysics(game.level, dt);
      const p = game.player;
      this.facing = (p.x + p.w / 2 > this.cx) ? 1 : -1; // 盾牌永遠朝向玩家
      if (this.guardTimer <= 0) {
        this.guardCd = Physics.rand(2.5, 4);
        this.startAttack(p); // 反擊重斬
      }
      return;
    }

    // 追擊中且玩家在正面近距離 → 有機率舉盾（讀招）
    if (this.state === "chase" && this.guardCd <= 0 && !game.player.dead) {
      const d = this.distTo(game.player);
      if (d.dx < 170 && d.dy < 90 && Math.random() < 0.8) {
        this.state = "guard";
        this.guardTimer = Physics.rand(0.8, 1.3);
        AudioSys.sfx("equip");
        return;
      }
    }

    super.update(game, dt);
  }

  /** 格擋：正面傷害 x0.15 且不被打斷；背面全額 */
  takeDamage(dmg, dir, knock, isCrit) {
    if (this.state === "guard" && !this.dead) {
      // dir 是擊退方向（玩家在左打 → dir=+1）。玩家位於 -dir 側
      const fromFront = (this.facing === -Math.sign(dir) || dir === 0);
      if (fromFront) {
        const reduced = Math.max(1, Math.round(dmg * 0.15));
        this.hp -= reduced;
        this.flashTimer = 0.05;
        Effects.floatText(this.cx, this.y - 10, "格擋！", { color: "#90caf9", size: 14 });
        Effects.hitSpark(this.cx + this.facing * 30, this.cy, -this.facing);
        AudioSys.sfx("clink");
        if (this.hp <= 0) { this.die(); return true; }
        return false; // 不擊退、不硬直
      }
    }
    return super.takeDamage(dmg, dir, knock, isCrit);
  }
}

/* ============================================================
   GoblinEnemy - 哥布林（游擊型）
   特性：打帶跑 — 高速衝進來連砍兩刀（雙判定），
         得手後立刻向後跳開拉開距離，再伺機下一輪突襲
   ============================================================ */
class GoblinEnemy extends OrcEnemy {
  spriteDef() { return SPRITE_DEFS.goblin; }

  setupStats() {
    const m = this.levelMult();
    this.w = 38; this.h = 56;
    this.placeAt();
    this.maxHp = Math.round(38 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(11 * m);
    this.def = Math.round(1 * m);
    this.xpReward = Math.round(20 * m);
    this.tier = 1;
    this.patrolSpeed = 90;
    this.chaseSpeed = 235;      // 全場最快
    this.aggroRange = 430;
    this.attackRange = 72;
    this.attackDamageFrames = [2, 3]; // 第一刀
    this.attackCooldown = 0.55;
    this.secondHit = false;     // 第二刀判定（影格 5~6）
    this.retreatTimer = 0;
  }

  update(game, dt) {
    // ---------- 得手後撤退：背對玩家快速拉開 ----------
    if (this.state === "retreat") {
      this.retreatTimer -= dt;
      const p = game.player;
      const away = (p.x + p.w / 2 > this.cx) ? -1 : 1;
      this.facing = -away; // 面朝玩家倒退跑
      if (!(this.onGround && Collision.ledgeAhead(this, game.level, away))) {
        this.vx = away * 200;
      } else this.vx = 0;
      this.anim.setAnim("walk");
      this.anim.update(dt);
      this.applyPhysics(game.level, dt);
      if (this.retreatTimer <= 0) this.state = "chase";
      return;
    }

    super.update(game, dt);
  }

  startAttack(p) {
    super.startAttack(p);
    this.secondHit = false;
    // 突刺：攻擊起手時往前衝一小段（游擊手感）
    this.vx = this.facing * 260;
  }

  /** 覆寫攻擊流程：兩段判定 + 攻擊完轉入撤退 */
  doAttackHit(game) {
    super.doAttackHit(game); // 第一刀
  }

  /** 攻擊狀態額外處理第二刀與收招撤退 */
  updateAttackExtra(game) {
    const f = this.anim.frame;
    if (!this.secondHit && f >= 5 && f <= 6) {
      this.secondHit = true;
      const reach = this.attackRange + 18;
      const hitbox = {
        x: this.facing > 0 ? this.x + this.w - 8 : this.x + 8 - reach,
        y: this.y - 8, w: reach, h: this.h + 16,
      };
      if (!game.player.dead && Collision.overlap(hitbox, game.player)) {
        game.player.takeDamage(Math.round(this.atkPower * 0.7), this.cx);
      }
    }
    if (this.anim.done) {
      this.state = "retreat";
      this.retreatTimer = Physics.rand(0.55, 0.85);
      this.attackCd = this.attackCooldown;
    }
  }
}

/* ============================================================
   MushroomEnemy - 毒蘑菇（區域封鎖型）
   特性：行動遲緩但噴出「毒孢子雲」— 滯留原地的持續傷害區域，
         逼玩家走位；死亡時孢子爆裂造成範圍傷害
   ============================================================ */
class MushroomEnemy extends OrcEnemy {
  spriteDef() { return SPRITE_DEFS.mushroom; }

  setupStats() {
    const m = this.levelMult();
    this.w = 42; this.h = 60;
    this.placeAt();
    this.maxHp = Math.round(95 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(15 * m);
    this.def = Math.round(3 * m);
    this.xpReward = Math.round(34 * m);
    this.tier = 1;
    this.patrolSpeed = 26;
    this.chaseSpeed = 78;
    this.aggroRange = 330;
    this.attackRange = 100;      // 孢子噴發距離
    this.attackDamageFrames = [4, 5];
    this.attackCooldown = 1.9;
    this.knockResist = 0.35;
    this.clouds = [];            // 存活中的毒雲 {x, y, r, life}
    this.tickCd = 0;             // 毒傷 tick 冷卻
  }

  /** 攻擊生效：不是揮擊，而是在面前噴出毒雲 */
  doAttackHit(game) {
    this.attackHit = true;
    const cx = this.cx + this.facing * 70;
    const cy = this.y + this.h - 20;
    this.clouds.push({ x: cx, y: cy, r: 78, life: 2.6 });
    AudioSys.sfx("poof");
    // 噴發瞬間的直擊判定
    const hitbox = { x: cx - 60, y: cy - 60, w: 120, h: 90 };
    if (!game.player.dead && Collision.overlap(hitbox, game.player)) {
      game.player.takeDamage(this.atkPower, this.cx);
    }
  }

  update(game, dt) {
    // ---------- 毒雲更新（獨立於本體狀態）----------
    this.tickCd -= dt;
    for (const c of this.clouds) {
      c.life -= dt;
      // 毒雲粒子
      if (Math.random() < dt * 22) {
        Effects.burst(c.x + Physics.rand(-c.r * 0.7, c.r * 0.7), c.y + Physics.rand(-30, 8), 1, {
          colors: ["#9ccc65", "#7cb342", "#c5e1a5"],
          speed: 26, life: 0.9, size: 4, gravity: -60,
        });
      }
      // 玩家站在毒雲內 → 週期性毒傷（無擊退）
      const p = game.player;
      if (this.tickCd <= 0 && !p.dead &&
          Math.abs(p.x + p.w / 2 - c.x) < c.r && Math.abs(p.y + p.h / 2 - c.y) < 70) {
        p.takeDamage(Math.max(2, Math.round(this.atkPower * 0.45)), c.x);
        this.tickCd = 0.55;
      }
    }
    this.clouds = this.clouds.filter(c => c.life > 0);

    super.update(game, dt);
  }

  /** 死亡：孢子爆裂（近距離範圍傷害 + 大片綠色粒子） */
  die() {
    super.die();
    Effects.burst(this.cx, this.cy, 34, {
      colors: ["#9ccc65", "#689f38", "#dcedc8"],
      speed: 300, life: 0.7, size: 6, gravity: 60,
    });
    AudioSys.sfx("poof");
    if (typeof window !== "undefined" && window.game && !window.game.player.dead) {
      const p = window.game.player;
      const dx = Math.abs(p.x + p.w / 2 - this.cx);
      if (dx < 130 && Math.abs(p.y + p.h / 2 - this.cy) < 100) {
        p.takeDamage(Math.round(this.atkPower * 0.8), this.cx);
      }
    }
  }

  draw(ctx) {
    // 毒雲底層光暈
    for (const c of this.clouds) {
      const a = Math.min(0.35, c.life * 0.3);
      const g = ctx.createRadialGradient(c.x, c.y, 8, c.x, c.y, c.r);
      g.addColorStop(0, `rgba(140,195,74,${a})`);
      g.addColorStop(1, "rgba(140,195,74,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    super.draw(ctx);
  }
}

/* ============================================================
   FlyingEyeEnemy - 飛眼魔（空中俯衝型）
   特性：在高空盤旋、不受重力，玩家難以近戰；
         鎖定後短暫蓄力 → 高速俯衝穿過玩家位置 → 拉升返回高度。
         抓俯衝低飛的時機反擊，或跳躍攻擊它
   ============================================================ */
class FlyingEyeEnemy extends Enemy {
  constructor(x, y, lvl) {
    super(x, y, lvl);
    this.w = 54; this.h = 42;
    this.placeAt();
    const m = this.levelMult();
    this.maxHp = Math.round(34 * m);
    this.hp = this.maxHp;
    this.atkPower = Math.round(12 * m);
    this.def = 0;
    this.xpReward = Math.round(24 * m);
    this.tier = 1;
    this.anim = new Animator(SPRITE_DEFS.flyingEye);
    this.anim.setAnim("idle");

    this.homeX = this.cx;
    this.homeY = this.y;          // 盤旋基準高度（出生高度）
    this.hoverT = Physics.rand(0, 6); // 漂浮相位
    this.mode = "hover";          // hover / aim / dive / climb
    this.aimTimer = 0;
    this.diveVx = 0; this.diveVy = 0;
    this.diveCd = Physics.rand(1, 2);
    this.diveHit = false;
    this.hurtTimer = 0;
  }

  update(game, dt) {
    const p = game.player;
    this.flashTimer -= dt;

    // ---------- 死亡：墜落到地面後淡出 ----------
    if (this.dead) {
      Physics.applyGravity(this, dt);
      this.vx *= 0.98;
      Collision.moveAndCollide(this, game.level, dt);
      this.anim.update(dt);
      if (this.anim.done) {
        this.deadTimer -= dt;
        if (this.deadTimer <= 0) this.remove = true;
      }
      return;
    }

    this.hoverT += dt;
    this.diveCd -= dt;
    const dx = p.x + p.w / 2 - this.cx;
    const dy = p.y + p.h / 2 - this.cy;
    const dist = Math.hypot(dx, dy);

    switch (this.mode) {
      // ---------- 盤旋：在基準高度上下漂浮、緩慢橫移 ----------
      case "hover": {
        const targetY = this.homeY + Math.sin(this.hoverT * 2.2) * 26;
        // 玩家在附近時保持在其上方盤旋，否則回到出生點附近
        const anchorX = (!p.dead && Math.abs(dx) < 480) ? p.x + p.w / 2 : this.homeX;
        const wobble = Math.sin(this.hoverT * 1.1) * 70;
        this.vx = Physics.clamp((anchorX + wobble - this.cx) * 2.2, -130, 130);
        this.vy = Physics.clamp((targetY - this.y) * 4, -140, 140);
        this.facing = dx > 0 ? 1 : -1;
        this.anim.setAnim("idle");
        // 玩家進入俯衝範圍 → 鎖定蓄力
        if (!p.dead && Math.abs(dx) < 340 && dy > -40 && this.diveCd <= 0) {
          this.mode = "aim";
          this.aimTimer = 0.42;
          Effects.floatText(this.cx, this.y - 14, "!", { color: "#ff8a65", size: 24, vy: -30 });
          AudioSys.sfx("warn");
        }
        break;
      }

      // ---------- 鎖定：空中定住蓄力，記錄俯衝向量 ----------
      case "aim": {
        this.aimTimer -= dt;
        this.vx *= 0.82;
        this.vy = Math.sin(this.hoverT * 18) * 30; // 蓄力顫動
        this.facing = dx > 0 ? 1 : -1;
        if (this.aimTimer <= 0) {
          // 朝「玩家目前位置」俯衝（可被走位騙掉）
          const ang = Math.atan2(dy, dx);
          const spd = 560;
          this.diveVx = Math.cos(ang) * spd;
          this.diveVy = Math.sin(ang) * spd;
          this.mode = "dive";
          this.diveHit = false;
          this.anim.setAnim("atk1", true);
          AudioSys.sfx("swing3");
        }
        break;
      }

      // ---------- 俯衝：高速直線衝過玩家位置 ----------
      case "dive": {
        this.vx = this.diveVx;
        this.vy = this.diveVy;
        // 接觸傷害（一次）
        if (!this.diveHit && !p.dead && Collision.overlap(this, p)) {
          this.diveHit = true;
          p.takeDamage(this.atkPower, this.cx);
        }
        // 觸地 / 撞牆 / 衝過頭 → 拉升
        if (this.onGround || this.hitWall || this.anim.done) {
          this.mode = "climb";
          this.diveCd = Physics.rand(1.6, 2.6);
        }
        break;
      }

      // ---------- 拉升：回到玩家上方的盤旋高度 ----------
      case "climb": {
        const targetY = (p.dead ? this.homeY : Math.min(this.homeY, p.y - 150));
        this.vy = Physics.clamp((targetY - this.y) * 3, -220, 60);
        this.vx = Physics.clamp(((p.x + p.w / 2) - this.cx) * 1.2, -120, 120);
        this.facing = dx > 0 ? 1 : -1;
        this.anim.setAnim("idle");
        if (Math.abs(this.y - targetY) < 30) this.mode = "hover";
        break;
      }
    }

    Collision.moveAndCollide(this, game.level, dt);
    this.anim.update(dt);
  }

  /** 被打時中斷俯衝鎖定 */
  takeDamage(dmg, dir, knock, isCrit) {
    const died = super.takeDamage(dmg, dir, knock * 1.3, isCrit);
    if (!died && this.mode === "aim") { this.mode = "hover"; this.diveCd = 1.2; }
    if (this.state === "hurt") { this.state = "patrol"; this.anim.setAnim("hurt", true); }
    return died;
  }

  draw(ctx) {
    const fade = this.dead && this.anim.done ? Math.max(0, this.deadTimer / 1.1) : 1;
    drawActor(ctx, SPRITE_DEFS.flyingEye, this.anim, this.cx, this.y + this.h, this.facing,
      { flash: this.flashTimer > 0, alpha: fade });
    this.drawHpBar(ctx);
  }
}

/* ============================================================
   工廠：由關卡出生點資料建立對應怪物
   ============================================================ */
class EnemyFactory {
  static create(spawn) {
    switch (spawn.type) {
      case "robot": return new RobotEnemy(spawn.x, spawn.y, spawn.lvl);
      case "orc":   return new OrcEnemy(spawn.x, spawn.y, spawn.lvl);
      case "elite": return new EliteOrc(spawn.x, spawn.y, spawn.lvl);
      case "boss":  return new BossOrc(spawn.x, spawn.y, spawn.lvl);
      case "skel":  return new SkeletonEnemy(spawn.x, spawn.y, spawn.lvl);
      case "gob":   return new GoblinEnemy(spawn.x, spawn.y, spawn.lvl);
      case "mush":  return new MushroomEnemy(spawn.x, spawn.y, spawn.lvl);
      case "eye":   return new FlyingEyeEnemy(spawn.x, spawn.y, spawn.lvl);
      default: return null;
    }
  }
}
