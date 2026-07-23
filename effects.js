"use strict";
/* ============================================================
   effects.js - 打擊感特效系統
   - 打擊停頓（hit-stop）：命中瞬間全世界凍結數十毫秒
   - 螢幕震動（screen shake）
   - 粒子（火花、塵土、死亡煙霧、撿取光點）
   - 浮動文字（傷害數字、經驗值、暴擊）
   - 揮砍弧光
   全部以世界座標運作，由 Game 在鏡頭轉換後統一繪製
   ============================================================ */

class Effects {
  static particles = [];   // 粒子清單
  static texts = [];       // 浮動文字清單
  static slashes = [];     // 揮砍弧光
  static shakeAmp = 0;     // 目前震動幅度
  static hitstopTimer = 0; // 剩餘凍結秒數

  /** 重置（重生 / 重新開始時） */
  static clear() {
    Effects.particles.length = 0;
    Effects.texts.length = 0;
    Effects.slashes.length = 0;
    Effects.shakeAmp = 0;
    Effects.hitstopTimer = 0;
  }

  // ------------------------------------------------------------
  // 打擊停頓與震動
  // ------------------------------------------------------------

  /** 觸發打擊停頓（秒）：命中 0.05 / 暴擊、擊殺 0.1 */
  static hitstop(sec) { Effects.hitstopTimer = Math.max(Effects.hitstopTimer, sec); }

  /** 觸發螢幕震動（像素） */
  static shake(amp) { Effects.shakeAmp = Math.max(Effects.shakeAmp, amp); }

  /** 取得本幀震動位移 */
  static getShakeOffset() {
    if (Effects.shakeAmp < 0.5) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * Effects.shakeAmp,
      y: (Math.random() * 2 - 1) * Effects.shakeAmp,
    };
  }

  // ------------------------------------------------------------
  // 粒子
  // ------------------------------------------------------------

  /**
   * 通用粒子噴發
   * @param {number} x,y    世界座標
   * @param {number} count  數量
   * @param {object} opt    color/colors、speed、life、size、gravity、spread(弧度)、angle
   */
  static burst(x, y, count, opt = {}) {
    const colors = opt.colors || [opt.color || "#fff"];
    for (let i = 0; i < count; i++) {
      const ang = (opt.angle !== undefined)
        ? opt.angle + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2)
        : Math.random() * Math.PI * 2;
      const spd = (opt.speed || 200) * (0.4 + Math.random() * 0.8);
      Effects.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: (opt.life || 0.4) * (0.6 + Math.random() * 0.7),
        maxLife: opt.life || 0.4,
        size: (opt.size || 4) * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: opt.gravity ?? 900,
      });
    }
  }

  /** 命中火花（依是否暴擊改變顏色與規模） */
  static hitSpark(x, y, dir, crit = false) {
    Effects.burst(x, y, crit ? 22 : 12, {
      colors: crit ? ["#ffd54f", "#ff8f00", "#fff"] : ["#fff", "#ffe082", "#ffab91"],
      angle: dir > 0 ? 0 : Math.PI,
      spread: Math.PI * 0.9,
      speed: crit ? 420 : 300,
      life: 0.35, size: crit ? 6 : 4, gravity: 600,
    });
  }

  /** 落地 / 奔跑塵土 */
  static dust(x, y, count = 6) {
    Effects.burst(x, y, count, {
      colors: ["#8a7f9c", "#5f5673", "#b0a6c4"],
      angle: -Math.PI / 2, spread: Math.PI,
      speed: 120, life: 0.4, size: 4, gravity: -60, // 微微上飄
    });
  }

  /** 敵人死亡煙霧 */
  static deathPoof(x, y, color = "#9c7bff") {
    Effects.burst(x, y, 26, {
      colors: [color, "#4a3f66", "#fff"],
      speed: 260, life: 0.6, size: 7, gravity: 200,
    });
  }

  /** 升級光環 */
  static levelUp(x, y) {
    Effects.burst(x, y, 40, {
      colors: ["#b2ff59", "#fff59d", "#69f0ae"],
      speed: 350, life: 0.8, size: 5, gravity: -250,
    });
  }

  /** 撿取閃光 */
  static sparkle(x, y, color) {
    Effects.burst(x, y, 10, { colors: [color, "#fff"], speed: 160, life: 0.4, size: 3, gravity: -300 });
  }

  // ------------------------------------------------------------
  // 浮動文字（傷害數字等）
  // ------------------------------------------------------------

  /**
   * @param {string} text  內容
   * @param {object} opt   color、size、crit（暴擊放大彈出）、vy
   */
  static floatText(x, y, text, opt = {}) {
    Effects.texts.push({
      x: x + (Math.random() - 0.5) * 20, y,
      text,
      color: opt.color || "#fff",
      size: opt.size || (opt.crit ? 30 : 20),
      crit: !!opt.crit,
      vy: opt.vy ?? -90,
      life: 0.9, maxLife: 0.9,
    });
  }

  // ------------------------------------------------------------
  // 揮砍弧光（增強攻擊視覺回饋）
  // ------------------------------------------------------------
  static slash(x, y, dir, big = false) {
    Effects.slashes.push({ x, y, dir, big, life: 0.14, maxLife: 0.14 });
  }

  // ------------------------------------------------------------
  // 更新與繪製
  // ------------------------------------------------------------
  static update(dt) {
    // 震動衰減
    Effects.shakeAmp = Math.max(0, Effects.shakeAmp - 60 * dt);

    // 粒子
    for (let i = Effects.particles.length - 1; i >= 0; i--) {
      const p = Effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) { Effects.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 2 * dt); // 阻力
    }
    // 文字
    for (let i = Effects.texts.length - 1; i >= 0; i--) {
      const t = Effects.texts[i];
      t.life -= dt;
      if (t.life <= 0) { Effects.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= (1 - 3 * dt);
    }
    // 弧光
    for (let i = Effects.slashes.length - 1; i >= 0; i--) {
      Effects.slashes[i].life -= dt;
      if (Effects.slashes[i].life <= 0) Effects.slashes.splice(i, 1);
    }
  }

  /** 於世界座標系繪製（Game 已套用鏡頭位移） */
  static draw(ctx) {
    // --- 粒子 ---
    for (const p of Effects.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + 0.5 * p.life / p.maxLife);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // --- 揮砍弧光 ---
    for (const s of Effects.slashes) {
      const t = 1 - s.life / s.maxLife; // 0→1
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.dir, 1);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = s.big ? "#ffd54f" : "#e8f4ff";
      ctx.lineWidth = s.big ? 8 : 5;
      ctx.lineCap = "round";
      const r = (s.big ? 62 : 48) + t * 26;
      ctx.beginPath();
      ctx.arc(0, 0, r, -1.15, 1.15); // 前方弧線
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // --- 浮動文字 ---
    ctx.textAlign = "center";
    for (const t of Effects.texts) {
      const alpha = Math.min(1, t.life / (t.maxLife * 0.5));
      // 暴擊文字有彈出縮放
      const pop = t.crit ? 1 + Math.max(0, t.life / t.maxLife - 0.7) * 3 : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(t.size * pop)}px "Microsoft JhengHei", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
