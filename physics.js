"use strict";
/* ============================================================
   physics.js - 物理系統
   重力、加速度、慣性（摩擦力）、跳躍參數
   所有單位：像素 / 秒（速度）、像素 / 秒² （加速度）
   ============================================================ */

class Physics {
  // ---------- 世界物理常數 ----------
  static GRAVITY = 2600;      // 重力加速度
  static MAX_FALL = 1500;     // 終端下落速度（避免無限加速）

  // ---------- 玩家移動參數（為了「操作流暢」而調校）----------
  static MOVE_ACCEL = 3400;   // 地面加速度
  static AIR_ACCEL = 2200;    // 空中加速度（保留空中操控）
  static FRICTION = 3000;     // 地面摩擦力（放開按鍵後的減速 → 產生慣性滑行）
  static AIR_DRAG = 500;      // 空氣阻力（空中慣性較強）
  static MAX_RUN = 400;       // 最大跑速

  // ---------- 跳躍參數 ----------
  static JUMP_VEL = -1030;    // 起跳初速（最高約 204px ≈ 3.2 格，可跳上 3 格高的平台）
  static JUMP_CUT = 0.45;     // 提早放開跳躍鍵時，上升速度乘上此值（可控跳躍高度）
  static COYOTE_TIME = 0.1;   // 土狼時間：離開平台後仍可起跳的寬限
  static JUMP_BUFFER = 0.14;  // 跳躍緩衝：落地前先按跳也能起跳

  /**
   * 套用重力到實體
   * @param {object} e  具有 vy 的實體
   * @param {number} dt 秒
   */
  static applyGravity(e, dt) {
    e.vy = Math.min(e.vy + Physics.GRAVITY * dt, Physics.MAX_FALL);
  }

  /**
   * 依輸入方向加速（含最大速度限制）
   * @param {object} e        具有 vx 的實體
   * @param {number} dir      -1 / 0 / 1 移動方向
   * @param {number} dt       秒
   * @param {boolean} onGround 是否著地（決定加速度）
   * @param {number} maxSpeed 最大速度
   */
  static accelerate(e, dir, dt, onGround, maxSpeed = Physics.MAX_RUN) {
    const accel = onGround ? Physics.MOVE_ACCEL : Physics.AIR_ACCEL;
    e.vx += dir * accel * dt;
    // 夾住最大水平速度
    if (e.vx > maxSpeed) e.vx = maxSpeed;
    if (e.vx < -maxSpeed) e.vx = -maxSpeed;
  }

  /**
   * 無輸入時套用摩擦力 → 產生自然的慣性滑行感
   */
  static applyFriction(e, dt, onGround) {
    const fric = (onGround ? Physics.FRICTION : Physics.AIR_DRAG) * dt;
    if (e.vx > 0) e.vx = Math.max(0, e.vx - fric);
    else if (e.vx < 0) e.vx = Math.min(0, e.vx + fric);
  }

  /** 線性插值（攝影機平滑跟隨等用途） */
  static lerp(a, b, t) { return a + (b - a) * t; }

  /** 夾住數值範圍 */
  static clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /** 取 [min, max) 的隨機浮點數 */
  static rand(min, max) { return min + Math.random() * (max - min); }

  /** 取 [min, max] 的隨機整數 */
  static randInt(min, max) { return Math.floor(Physics.rand(min, max + 1)); }
}
