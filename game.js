"use strict";
/* ============================================================
   game.js - 遊戲主體
   - Input  : 鍵盤輸入（按住 / 剛按下 / 剛放開）
   - Camera : 攝影機跟隨（平滑 + 視線前瞻 + 震動 + 世界邊界夾制）
   - Game   : 主迴圈、狀態機（標題/遊玩/暫停/背包/死亡/勝利）、
              實體管理（怪物/掉落物）、拾取、擊殺結算、區域與檢查點
   ============================================================ */

/* ============================================================
   Input - 鍵盤輸入
   ============================================================ */
class Input {
  static BINDINGS = {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    down: ["ArrowDown", "KeyS"],
    jump: ["Space", "KeyW", "ArrowUp"],
    attack: ["KeyJ", "KeyX"],
    inventory: ["KeyI"],
    pause: ["Escape", "KeyP"],
    mute: ["KeyM"],
  };

  constructor() {
    this.down = new Set();      // 目前按住
    this.pressedSet = new Set();// 本幀剛按下
    this.releasedSet = new Set();// 本幀剛放開
    this.anyKey = false;        // 本幀有任意鍵（標題畫面用）

    window.addEventListener("keydown", (e) => {
      // 在使用者手勢事件內初始化音訊（瀏覽器自動播放限制）
      AudioSys.init();
      if (AudioSys.ctx && AudioSys.ctx.state === "suspended") AudioSys.ctx.resume();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      this.anyKey = true;
      // 避免空白鍵捲動頁面
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    // 視窗失焦時清空按鍵（避免卡鍵）
    window.addEventListener("blur", () => this.down.clear());
  }

  held(action) { return Input.BINDINGS[action].some((c) => this.down.has(c)); }
  pressed(action) { return Input.BINDINGS[action].some((c) => this.pressedSet.has(c)); }
  released(action) { return Input.BINDINGS[action].some((c) => this.releasedSet.has(c)); }

  /** 每幀結尾清除邊緣狀態 */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.anyKey = false;
  }
}

/* ============================================================
   Camera - 攝影機
   ============================================================ */
class Camera {
  constructor(viewW, viewH, level) {
    this.viewW = viewW; this.viewH = viewH;
    this.level = level;
    this.x = 0; this.y = 0;
  }

  /** 平滑跟隨玩家（含面向前瞻），並夾在世界邊界內 */
  update(player, dt) {
    // 前瞻：看向玩家面對的方向 + 依速度延伸
    const lookahead = player.facing * 110 + player.vx * 0.18;
    const tx = player.x + player.w / 2 + lookahead - this.viewW / 2;
    const ty = player.y + player.h / 2 - this.viewH * 0.58;

    const t = Math.min(1, 6 * dt); // 平滑係數
    this.x = Physics.lerp(this.x, tx, t);
    this.y = Physics.lerp(this.y, ty, t * 1.2);

    // 世界邊界
    this.x = Physics.clamp(this.x, 0, this.level.pixelW - this.viewW);
    this.y = Physics.clamp(this.y, 0, this.level.pixelH - this.viewH);
  }

  /** 直接置中（重生時避免鏡頭飛越地圖） */
  snapTo(player) {
    this.x = Physics.clamp(player.x - this.viewW / 2, 0, this.level.pixelW - this.viewW);
    this.y = Physics.clamp(player.y - this.viewH * 0.5, 0, this.level.pixelH - this.viewH);
  }
}

/* ============================================================
   Game - 主體
   ============================================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false; // 像素風不要模糊

    this.state = "loading"; // loading / title / playing / paused / inventory / dead / victory
    this.input = new Input();
    this.time = 0;          // 遊戲時間（動畫用）
    this.lastTs = 0;
    this.killCount = 0;

    UI.init(this);

    // 載入素材後進入標題畫面
    Assets.load()
      .then(() => {
        this.setup();
        UI.el.loadingText.classList.add("hidden");
        UI.el.pressStart.classList.remove("hidden");
        this.state = "title";
      })
      .catch((err) => {
        UI.el.loadingText.textContent = `載入失敗：${err.message}（請確認「遊戲素材」資料夾位置）`;
      });

    requestAnimationFrame((ts) => this.loop(ts));
  }

  /** 建立世界 */
  setup() {
    this.level = new Level();
    this.player = new Player(this.level.playerSpawn);
    this.camera = new Camera(this.canvas.width, this.canvas.height, this.level);
    this.camera.snapTo(this.player);

    // 由出生點建立怪物與場景金幣
    this.enemies = [];
    this.drops = [];
    this.boss = null;
    for (const sp of this.level.spawns) {
      if (sp.type === "coin") {
        const c = new DropEntity("coin", sp.x, sp.y, 5);
        c.vx = 0; c.vy = 0;
        this.drops.push(c);
      } else {
        const e = EnemyFactory.create(sp);
        if (e) {
          this.enemies.push(e);
          if (sp.type === "boss") this.boss = e;
        }
      }
    }

    this.currentZone = null;
    this.checkpoint = { ...this.level.playerSpawn };
    this.deadDelay = 0;
  }

  // ------------------------------------------------------------
  // 主迴圈
  // ------------------------------------------------------------
  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0); // 上限避免跳幀爆衝
    this.lastTs = ts;

    this.handleGlobalKeys();

    if (this.state === "playing") {
      // 打擊停頓：凍結世界但仍然計時
      if (Effects.hitstopTimer > 0) {
        Effects.hitstopTimer -= dt;
      } else {
        this.update(dt);
      }
    } else if (this.state === "dead") {
      this.updateDead(dt);
    }

    this.draw();
    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** 全域按鍵（狀態切換） */
  handleGlobalKeys() {
    const inp = this.input;

    switch (this.state) {
      case "title":
        if (inp.anyKey) {
          AudioSys.init();
          AudioSys.startBGM();
          UI.hide("overlayTitle");
          UI.show("hud");
          this.state = "playing";
          UI.zoneBanner(this.level.zones[0].name);
          this.currentZone = this.level.zones[0];
        }
        break;

      case "playing":
        if (inp.pressed("pause")) {
          this.state = "paused";
          UI.show("overlayPause");
          AudioSys.sfx("pause");
        } else if (inp.pressed("inventory")) {
          this.state = "inventory";
          UI.openInventory();
          AudioSys.sfx("select");
        }
        break;

      case "paused":
        if (inp.pressed("pause")) {
          this.state = "playing";
          UI.hide("overlayPause");
          AudioSys.sfx("pause");
        }
        break;

      case "inventory":
        if (inp.pressed("inventory") || inp.pressed("pause")) {
          this.state = "playing";
          UI.closeInventory();
          AudioSys.sfx("select");
        }
        break;

      case "victory":
        if (inp.anyKey) {
          this.state = "playing";
          UI.hide("overlayVictory");
        }
        break;
    }

    if (inp.pressed("mute")) {
      const muted = AudioSys.toggleMute();
      UI.toast(muted ? "🔇 已靜音" : "🔊 已開啟音效", "#bbb");
    }
  }

  // ------------------------------------------------------------
  // 世界更新
  // ------------------------------------------------------------
  update(dt) {
    this.time += dt;

    // ---------- 實體 ----------
    this.player.update(this.input, this.level, this, dt);

    for (const e of this.enemies) e.update(this, dt);

    // ---------- 深淵結算：被擊退掉進深淵的怪直接死亡（給經驗、不掉寶）----------
    for (const e of this.enemies) {
      if (!e.dead && e.y > this.level.pixelH + 150) {
        e.dead = true;
        e.lootDropped = true; // 不掉寶（寶物會卡在深淵）
        e.remove = true;
        this.killCount++;
        this.player.gainXP(e.xpReward);
        Effects.floatText(this.player.x + this.player.w / 2, this.player.y - 40, "深淵擊殺！", { color: "#ff8a80", size: 18 });
      }
    }

    // ---------- 擊殺結算：掉寶 + 經驗 ----------
    for (const e of this.enemies) {
      if (e.dead && !e.lootDropped) {
        e.lootDropped = true;
        this.killCount++;
        Effects.deathPoof(e.cx, e.cy, e.tier >= 2 ? "#ff6d6d" : "#9c7bff");
        this.drops.push(...LootSystem.rollDrops(e));
        this.player.gainXP(e.xpReward);
        if (e.tier === 3) this.onBossDefeated();
      }
    }
    this.enemies = this.enemies.filter((e) => !e.remove);

    // ---------- 掉落物與拾取 ----------
    for (const d of this.drops) {
      d.update(dt, this.level, this.player);
      if (!d.dead && !this.player.dead && Collision.overlap(d, this.player)) this.pickup(d);
    }
    this.drops = this.drops.filter((d) => !d.dead);

    // ---------- 區域切換（橫幅 + 檢查點）----------
    const zone = this.level.zoneAt(this.player.x);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.checkpoint = this.level.checkpointAt(this.player.x);
      UI.zoneBanner(zone.name);
    }

    // ---------- 玩家死亡 ----------
    if (this.player.state === "dead" && this.state === "playing") {
      this.state = "dead";
      this.deadDelay = 2.4;
      const lost = Math.floor(this.player.gold * 0.1);
      this.player.gold -= lost;
      UI.el.deadInfo.textContent = lost > 0 ? `遺失了 ${lost} 金幣...` : "小心深淵與獸人的利刃...";
      UI.show("overlayDead");
    }

    // ---------- 特效與鏡頭 ----------
    Effects.update(dt);
    this.camera.update(this.player, dt);
    UI.updateHUD(this.player, this.boss);
  }

  /** 死亡等待重生 */
  updateDead(dt) {
    Effects.update(dt);
    this.player.anim.update(dt);
    this.deadDelay -= dt;
    if (this.deadDelay <= 0) {
      UI.hide("overlayDead");
      this.player.respawn(this.checkpoint);
      this.camera.snapTo(this.player);
      Effects.clear();
      this.state = "playing";
    }
  }

  /** 撿取掉落物 */
  pickup(drop) {
    const p = this.player;
    switch (drop.type) {
      case "coin": {
        const value = drop.payload || 3;
        p.gainGold(value);
        AudioSys.sfx("coin");
        Effects.floatText(p.x + p.w / 2, p.y - 6, `+${value}`, { color: "#ffd54f", size: 15 });
        break;
      }
      case "potion":
        p.heal(Math.round(p.maxHp * 0.3));
        AudioSys.sfx("potion");
        UI.toast("🧪 喝下治療藥水", "#ff8a80");
        break;
      case "gear": {
        // 背包滿了就撿不起來
        if (p.inventory.length >= Player.INV_SIZE) {
          if (!drop.fullNotified) {
            drop.fullNotified = true;
            UI.toast("背包已滿！按 I 整理背包", "#ff8a80");
          }
          return;
        }
        const item = drop.payload;
        p.inventory.push(item);
        AudioSys.sfx(item.rarity.id === "epic" || item.rarity.id === "legend" ? "epic" : "pickup");
        UI.toast(`獲得 ${item.fullName}`, item.rarity.color);
        Effects.sparkle(p.x + p.w / 2, p.y, item.rarity.color);
        break;
      }
    }
    drop.dead = true;
  }

  /** 首領被擊敗 */
  onBossDefeated() {
    AudioSys.sfx("victory");
    Effects.shake(16);
    setTimeout(() => {
      if (this.state === "playing") {
        this.state = "victory";
        UI.el.victoryStats.textContent =
          `等級 Lv.${this.player.lvl}｜擊殺 ${this.killCount} 隻怪物｜金幣 ${this.player.gold}`;
        UI.show("overlayVictory");
      }
    }, 1200);
  }

  // ------------------------------------------------------------
  // 繪製
  // ------------------------------------------------------------
  draw() {
    const { ctx, canvas } = this;
    if (this.state === "loading") {
      ctx.fillStyle = "#0b0916";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // ---------- 背景（含視差）----------
    this.level.drawBackground(ctx, this.camera, canvas.width, canvas.height, this.time);

    // ---------- 世界座標系（鏡頭 + 震動）----------
    const shake = Effects.getShakeOffset();
    ctx.save();
    ctx.translate(Math.round(-this.camera.x + shake.x), Math.round(-this.camera.y + shake.y));

    this.level.draw(ctx, this.camera, canvas.width, canvas.height, this.time);
    for (const d of this.drops) d.draw(ctx, this.time);
    for (const e of this.enemies) e.draw(ctx);
    this.player.draw(ctx);
    Effects.draw(ctx);

    ctx.restore();

    // ---------- 低血量紅暈警示 ----------
    if (this.player.hp / this.player.maxHp < 0.3 && this.player.hp > 0) {
      const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.75
      );
      g.addColorStop(0, "rgba(180,0,0,0)");
      g.addColorStop(1, `rgba(180,0,0,${0.25 + 0.12 * Math.sin(this.time * 6)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}

// ---------- 啟動 ----------
window.addEventListener("load", () => { window.game = new Game(); });
