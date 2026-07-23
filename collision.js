"use strict";
/* ============================================================
   collision.js - 碰撞系統
   - AABB 矩形重疊判定
   - 實體 vs 地形（實心磚 / 單向平台）逐軸掃描碰撞
   - 世界邊界限制
   實體需求欄位：x, y, w, h, vx, vy
   輸出欄位：onGround, hitWall, hitCeiling
   ============================================================ */

class Collision {
  /** AABB 矩形重疊判定 */
  static overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** 兩實體中心距離 */
  static centerDist(a, b) {
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  /**
   * 移動實體並處理地形碰撞（逐軸處理，避免斜向穿牆）
   * @param {object} e     實體
   * @param {Level} level  關卡（提供 tileAt 查詢）
   * @param {number} dt    秒
   */
  static moveAndCollide(e, level, dt) {
    const T = Level.TILE;
    e.hitWall = false;
    e.hitCeiling = false;
    const wasOnGround = e.onGround;
    e.onGround = false;

    // ---------- X 軸 ----------
    e.x += e.vx * dt;

    // 世界邊界（左右）
    if (e.x < 0) { e.x = 0; e.vx = 0; e.hitWall = true; }
    if (e.x + e.w > level.pixelW) { e.x = level.pixelW - e.w; e.vx = 0; e.hitWall = true; }

    // 與實心磚碰撞（單向平台不擋水平移動）
    {
      const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
      if (e.vx > 0) {
        const col = Math.floor((e.x + e.w) / T);
        for (let row = y0; row <= y1; row++) {
          if (level.tileAt(col, row) === Level.SOLID) {
            e.x = col * T - e.w - 0.01;
            e.vx = 0; e.hitWall = true;
            break;
          }
        }
      } else if (e.vx < 0) {
        const col = Math.floor(e.x / T);
        for (let row = y0; row <= y1; row++) {
          if (level.tileAt(col, row) === Level.SOLID) {
            e.x = (col + 1) * T + 0.01;
            e.vx = 0; e.hitWall = true;
            break;
          }
        }
      }
    }

    // ---------- Y 軸 ----------
    const prevBottom = e.y + e.h; // 移動前的腳底位置（單向平台判定用）
    e.y += e.vy * dt;

    {
      const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
      if (e.vy > 0) {
        // 下落：實心磚 & 單向平台都會擋
        const row = Math.floor((e.y + e.h) / T);
        for (let col = x0; col <= x1; col++) {
          const t = level.tileAt(col, row);
          if (t === Level.SOLID ||
              // 單向平台：只有「從上方落下」且沒有按下穿越時才生效
              (t === Level.ONEWAY && prevBottom <= row * T + 1 && !e.dropThrough)) {
            e.y = row * T - e.h - 0.01;
            e.vy = 0;
            e.onGround = true;
            break;
          }
        }
      } else if (e.vy < 0) {
        // 上升：只有實心磚會擋（可從下方穿過單向平台）
        const row = Math.floor(e.y / T);
        for (let col = x0; col <= x1; col++) {
          if (level.tileAt(col, row) === Level.SOLID) {
            e.y = (row + 1) * T + 0.01;
            e.vy = 0; e.hitCeiling = true;
            break;
          }
        }
      }
    }

    // 回傳「是否剛落地」讓呼叫端做落地塵土 / 音效
    e.justLanded = !wasOnGround && e.onGround;
  }

  /**
   * 巡邏 AI 用：檢查實體前方腳下是否為懸崖（無地面）
   * @returns {boolean} true = 前方是懸崖，該轉向了
   */
  static ledgeAhead(e, level, dir) {
    const T = Level.TILE;
    const probeX = dir > 0 ? e.x + e.w + 4 : e.x - 4;      // 前方一點
    const col = Math.floor(probeX / T);
    const row = Math.floor((e.y + e.h + 8) / T);            // 腳下一點
    const t = level.tileAt(col, row);
    return t !== Level.SOLID && t !== Level.ONEWAY;
  }
}
