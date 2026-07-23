"use strict";
/* ============================================================
   level.js - 關卡系統
   - MapBuilder : 以程式化指令建造磚格地圖（地面 / 平台 / 高台 / 深淵）
   - Level      : 磚格查詢、自動拼貼(autotiling)渲染、視差背景、
                  區域(Zone)難度分區、怪物與金幣出生點、檢查點
   世界構成：4 個難度遞增的區域，之間以深淵分隔，最深處為首領巢穴
   ============================================================ */

/* ============================================================
   MapBuilder - 地圖建造工具
   ============================================================ */
class MapBuilder {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.grid = new Uint8Array(w * h); // 0 空 / 1 實心 / 2 單向平台
    this.spawns = [];                  // 出生點清單
  }

  /** 設定單一磚格 */
  set(col, row, v) {
    if (col < 0 || col >= this.w || row < 0 || row >= this.h) return;
    this.grid[row * this.w + col] = v;
  }

  /** 實心矩形（世界邊界、高台、柱子） */
  box(col, row, w, h) {
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) this.set(c, r, Level.SOLID);
  }

  /** 地面：從 topRow 一路填到地圖底部（預設 topRow=15） */
  ground(c0, c1, topRow = 15) {
    for (let c = c0; c <= c1; c++)
      for (let r = topRow; r < this.h; r++) this.set(c, r, Level.SOLID);
  }

  /** 單向浮空平台 */
  plat(col, row, len) {
    for (let c = col; c < col + len; c++) this.set(c, row, Level.ONEWAY);
  }

  /** 註冊出生點（type: orc/elite/boss/robot/coin，row 為腳底所在磚列） */
  spawn(type, col, row, lvl = 1) {
    this.spawns.push({ type, x: (col + 0.5) * Level.TILE, y: row * Level.TILE, lvl });
  }

  /** 一排金幣（獎勵探索平台的玩家） */
  coinRow(col, row, count) {
    for (let i = 0; i < count; i++) this.spawn("coin", col + i, row + 1);
  }
}

/* ============================================================
   Level - 關卡本體
   ============================================================ */
class Level {
  static TILE = 64;    // 磚格繪製尺寸（素材 32px 放大 2 倍）
  static SRC = 32;     // 素材原始磚格尺寸
  static EMPTY = 0;
  static SOLID = 1;
  static ONEWAY = 2;

  constructor() {
    this.cols = 240;
    this.rows = 18;
    this.pixelW = this.cols * Level.TILE;  // 世界寬 15360px
    this.pixelH = this.rows * Level.TILE;  // 世界高 1152px

    // ---------- 難度區域（循序漸進）----------
    this.zones = [
      { x0: 2 * Level.TILE, name: "礦 坑 入 口", lvl: 1 },
      { x0: 67 * Level.TILE, name: "幽 暗 礦 道", lvl: 2 },
      { x0: 127 * Level.TILE, name: "水 晶 深 處", lvl: 3 },
      { x0: 183 * Level.TILE, name: "霸 主 巢 穴", lvl: 5 },
    ];

    this.playerSpawn = { x: 5 * Level.TILE, y: 15 * Level.TILE }; // 腳底座標
    this.build();
    this.placeDecos(); // 場景裝飾（水晶 / 石筍 / 火把）
  }

  /** 各區域的視差背景圖層（索引 0 = 最遠） */
  static ZONE_LAYERS = [
    ["bg1_p5", "bg1_p4", "bg1_p3", "bg1_p2", "bg1_p1"], // 礦坑入口：綠苔洞窟
    ["bg2_p4", "bg2_p3", "bg2_p2", "bg2_p1"],           // 幽暗礦道：地底瀑布
    ["bg3_p4", "bg3_p3", "bg3_p2", "bg3_p1"],           // 水晶深處：粉晶櫻花
    ["bg4_p5", "bg4_p4", "bg4_p3", "bg4_p2", "bg4_p1"], // 霸主巢穴：藍晶大廳
  ];

  /** 裝飾素材在 Decorations.png 中的來源矩形 [sx, sy, sw, sh] */
  static DECO_RECTS = {
    crystalS_blue:  [8, 77, 16, 19],
    crystalS_green: [40, 77, 16, 19],
    crystalS_red:   [72, 77, 16, 19],
    crystalB_red:   [99, 65, 26, 31],
    crystalB_green: [131, 65, 26, 31],
    crystalB_ice:   [163, 65, 26, 31],
    moss:           [196, 88, 25, 8],
    spikes:         [130, 97, 27, 31],  // 石筍群
    spire:          [169, 96, 14, 32],  // 細石筍
  };

  /** 各區域的水晶配色 [小水晶, 大水晶] */
  static ZONE_CRYSTALS = [
    ["crystalS_green", "crystalB_green"],
    ["crystalS_blue",  "crystalB_ice"],
    ["crystalS_red",   "crystalB_red"],
    ["crystalS_blue",  "crystalB_ice"],
  ];

  /** 取得某欄位的地表列（實心且上方為空），找不到回傳 -1 */
  surfaceRowAt(col) {
    for (let r = 1; r < this.rows; r++) {
      if (this.tileAt(col, r) === Level.SOLID && this.tileAt(col, r - 1) === Level.EMPTY) return r;
    }
    return -1;
  }

  /** 佈置場景裝飾：檢查點火把 + 依雜湊散佈的水晶 / 石筍 / 苔蘚 */
  placeDecos() {
    const T = Level.TILE;
    this.decos = [];

    // --- 檢查點與首領戰場的火把 ---
    const torchCols = this.zones.map(z => Math.round(z.x0 / T) + 1);
    torchCols.push(220, 232); // 首領擂台兩側
    for (const c of torchCols) {
      const r = this.surfaceRowAt(c);
      if (r >= 0) this.decos.push({ kind: "torch", x: (c + 0.5) * T, y: r * T, phase: Level.hash(c, 3) % 4 });
    }

    // --- 程序化散佈（同一顆種子 → 每次載入相同佈置）---
    for (let c = 3; c < this.cols - 3; c++) {
      const r = this.surfaceRowAt(c);
      if (r < 0) continue;
      const zi = this.zones.indexOf(this.zoneAt(c * T));
      const [small, big] = Level.ZONE_CRYSTALS[zi];
      const h = Level.hash(c, 101);
      const x = (c + 0.5) * T, y = r * T;
      if (h % 9 === 0)       this.decos.push({ kind: "deco", rect: small, x, y, flip: h % 2 === 0 });
      else if (h % 11 === 3) this.decos.push({ kind: "deco", rect: big, x, y, flip: h % 2 === 0 });
      else if (h % 7 === 2)  this.decos.push({ kind: "deco", rect: "moss", x, y, flip: h % 2 === 0 });
      else if (h % 13 === 5) this.decos.push({ kind: "deco", rect: h % 2 === 0 ? "spikes" : "spire", x, y });
    }
  }

  /** 建造整張地圖 */
  build() {
    const b = new MapBuilder(this.cols, this.rows);

    // ---------- 世界邊界（左右石牆）----------
    b.box(0, 0, 2, this.rows);
    b.box(this.cols - 2, 0, 2, this.rows);

    // ========== 區域 1：礦坑入口（教學區，敵人稀少）==========
    b.ground(2, 62);
    b.plat(14, 12, 4); b.coinRow(15, 11, 2);
    b.plat(22, 10, 4); b.coinRow(23, 9, 2);
    b.plat(31, 12, 5); b.coinRow(32, 11, 3);
    b.spawn("robot", 20, 15, 1);
    b.spawn("robot", 28, 15, 1);
    b.spawn("gob", 36, 15, 1);    // 哥布林：初見游擊兵
    b.spawn("orc", 42, 15, 1);
    b.spawn("eye", 48, 12, 1);    // 飛眼魔：初見空中敵人
    b.spawn("orc", 54, 15, 1);

    // ---------- 深淵 1（63~66，中途有救援平台）----------
    b.plat(64, 13, 2); b.coinRow(64, 12, 2);

    // ========== 區域 2：幽暗礦道（敵人變多）==========
    b.ground(67, 99);
    b.plat(70, 12, 4);
    b.plat(78, 10, 4); b.coinRow(79, 9, 2);
    b.plat(86, 12, 5);
    b.spawn("robot", 72, 15, 2);
    b.spawn("orc", 76, 15, 2);
    b.spawn("skel", 81, 15, 2);   // 骷髏劍士：學會繞背
    b.spawn("orc", 84, 15, 2);
    b.spawn("gob", 88, 15, 2);
    b.spawn("robot", 90, 15, 2);
    b.spawn("orc", 94, 15, 2);
    b.spawn("eye", 97, 12, 2);

    // ---------- 深淵 2（100~103）→ 高地段 ----------
    b.ground(104, 122, 14);
    b.plat(107, 11, 3); b.coinRow(108, 10, 2);
    b.spawn("orc", 108, 14, 2);
    b.spawn("orc", 113, 14, 2);
    b.spawn("elite", 118, 14, 3); // 第一隻精英：難度轉折點

    // ---------- 深淵 3（123~126）----------

    // ========== 區域 3：水晶深處（精英出沒、垂直地形）==========
    b.ground(127, 178);
    b.plat(132, 12, 4);
    b.plat(139, 10, 4);
    b.plat(146, 8, 4); b.coinRow(147, 7, 2);
    b.plat(153, 9, 3);
    b.box(158, 11, 8, 7);                 // 高台（頂在第 11 列）
    b.coinRow(160, 9, 3);
    b.spawn("orc", 134, 15, 3);
    b.spawn("mush", 137, 15, 3);          // 毒蘑菇：範圍封鎖
    b.spawn("orc", 141, 15, 3);
    b.spawn("skel", 144, 15, 3);
    b.spawn("robot", 148, 15, 3);
    b.spawn("eye", 150, 10, 3);
    b.spawn("elite", 152, 15, 4);
    b.spawn("gob", 156, 15, 3);
    b.spawn("elite", 161, 11, 4);         // 高台上的精英守衛
    b.spawn("mush", 166, 15, 3);
    b.spawn("orc", 170, 15, 3);
    b.spawn("eye", 172, 11, 3);
    b.spawn("robot", 174, 15, 3);

    // ---------- 深淵 4（179~182）----------

    // ========== 區域 4：霸主巢穴（連續戰 + 首領）==========
    b.ground(183, 237);
    b.plat(190, 12, 3);
    b.plat(200, 11, 4);
    b.plat(214, 12, 4);                   // 首領戰躲避平台
    b.plat(224, 12, 4);
    b.spawn("orc", 186, 15, 5);
    b.spawn("skel", 189, 15, 5);
    b.spawn("elite", 192, 15, 5);
    b.spawn("mush", 195, 15, 5);
    b.spawn("orc", 197, 15, 5);
    b.spawn("gob", 200, 15, 5);
    b.spawn("elite", 203, 15, 5);
    b.spawn("eye", 206, 12, 5);
    b.spawn("orc", 208, 15, 5);
    b.spawn("eye", 218, 12, 5);
    b.spawn("boss", 226, 15, 6);          // 最終首領

    this.grid = b.grid;
    this.spawns = b.spawns;
  }

  /** 查詢磚格（超出左右邊界視為實心、上下視為空） */
  tileAt(col, row) {
    if (col < 0 || col >= this.cols) return Level.SOLID;
    if (row < 0 || row >= this.rows) return Level.EMPTY;
    return this.grid[row * this.cols + col];
  }

  /** 依 X 座標取得所在區域 */
  zoneAt(x) {
    let z = this.zones[0];
    for (const zone of this.zones) if (x >= zone.x0) z = zone;
    return z;
  }

  /** 依 X 座標取得檢查點（該區域起點） */
  checkpointAt(x) {
    const z = this.zoneAt(x);
    return { x: z.x0 + Level.TILE * 1.5, y: 15 * Level.TILE };
  }

  // ------------------------------------------------------------
  // 自動拼貼：依鄰格決定素材圖中的磚格（素材為 6x4 的 32px 磚）
  // ------------------------------------------------------------

  /** 穩定雜湊（讓填充磚的花紋固定不閃爍） */
  static hash(c, r) { return ((c * 73856093) ^ (r * 19349663)) >>> 0; }

  /**
   * 計算實心磚在素材圖中的來源磚格 [srcCol, srcRow]
   * 素材佈局（6x4 @32px）：
   *   第 0 列 (0..2,0)：單磚厚平台 左/中/右（自帶水晶底邊）、(3,0)：獨立單磚
   *   (0..2, 1..3)：大地塊九宮切片（亮頂邊、暗內部、水晶底邊）
   *   第 3 行 (3,1..3)：單寬石柱 頂/中/底
   *   (4..5, 1..2)：內部填充變化磚（碎石花紋）
   */
  pickSolidTile(col, row) {
    const up = this.tileAt(col, row - 1) === Level.SOLID;
    const down = this.tileAt(col, row + 1) === Level.SOLID;
    const left = this.tileAt(col - 1, row) === Level.SOLID;
    const right = this.tileAt(col + 1, row) === Level.SOLID;
    const h = Level.hash(col, row);

    const singleCol = !left && !right; // 單寬石柱
    const singleRow = !up && !down;    // 單磚厚地層

    if (singleCol && singleRow) return [3, 0];                       // 獨立單磚
    if (singleRow) return [!left ? 0 : (!right ? 2 : 1), 0];         // 薄地層 → 平台磚
    if (singleCol) return !up ? [3, 1] : (!down ? [3, 3] : [3, 2]);  // 石柱

    if (!up) return [!left ? 0 : (!right ? 2 : 1), 1];               // 頂邊（亮色可踩面）
    if (!down) return [!left ? 0 : (!right ? 2 : 1), 3];             // 底邊（水晶垂掛）

    // 內部：左右緣用邊磚，中央用暗色填充（偶爾換花紋磚增加變化）
    if (!left) return [0, 2];
    if (!right) return [2, 2];
    const variants = [[4, 1], [5, 1], [4, 2], [5, 2]];
    return (h % 8 < 5) ? [1, 2] : variants[h % variants.length];
  }

  // ------------------------------------------------------------
  // 繪製
  // ------------------------------------------------------------

  /**
   * 繪製一組視差圖層（多層點陣圖，遠→近）
   * @param {number} alpha 整組透明度（區域交界淡入淡出用）
   */
  drawLayerSet(ctx, keys, cam, canvasW, canvasH, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    const n = keys.length;
    for (let i = 0; i < n; i++) {
      const img = Assets.img(keys[i]);
      const f = 0.05 + (n <= 1 ? 0 : i / (n - 1)) * 0.4;      // 視差係數 0.05~0.45
      const scale = (canvasH / img.height) * 1.12;             // 超掃 12% 供垂直視差
      const dw = img.width * scale, dh = img.height * scale;
      const yOff = -cam.y * f * 0.22;                          // 輕微垂直視差
      let x = -((cam.x * f) % dw);
      if (x > 0) x -= dw;
      for (; x < canvasW; x += dw) {
        ctx.drawImage(img, Math.round(x), Math.round(yOff), Math.ceil(dw), Math.ceil(dh));
      }
    }
    ctx.restore();
  }

  /** 視差背景：各區域專屬的多層點陣背景 + 天光 + 水晶微光 + 暗角 */
  drawBackground(ctx, cam, canvasW, canvasH, time) {
    // --- 底色漸層（圖層載入前的保底）---
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, "#151226");
    grad.addColorStop(0.55, "#0e0b1c");
    grad.addColorStop(1, "#070511");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // --- 依鏡頭中心決定區域，交界前 600px 淡入下一區背景 ---
    const camCx = cam.x + canvasW / 2;
    let zi = 0;
    for (let i = 0; i < this.zones.length; i++) if (camCx >= this.zones[i].x0) zi = i;
    this.drawLayerSet(ctx, Level.ZONE_LAYERS[zi], cam, canvasW, canvasH, 1);
    if (zi + 1 < this.zones.length) {
      const nx = this.zones[zi + 1].x0;
      if (camCx > nx - 600) {
        const t = Physics.clamp((camCx - (nx - 600)) / 600, 0, 1);
        this.drawLayerSet(ctx, Level.ZONE_LAYERS[zi + 1], cam, canvasW, canvasH, t);
      }
    }

    // --- 輕微壓暗背景，讓前景遊戲物件更突出 ---
    ctx.fillStyle = "rgba(8,6,20,0.22)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // --- 上方微弱天光光束（打破大面積平坦）---
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const h = Level.hash(i, 31);
      const wx = (h % this.pixelW);
      const sx = ((wx - cam.x * 0.3) % (canvasW + 600) + canvasW + 600) % (canvasW + 600) - 300;
      const sway = Math.sin(time * 0.4 + i * 2.1) * 20;
      const g = ctx.createLinearGradient(sx + sway, 0, sx + 90 + sway, canvasH * 0.8);
      g.addColorStop(0, "rgba(160,140,255,0.06)");
      g.addColorStop(1, "rgba(160,140,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx + sway, 0);
      ctx.lineTo(sx + 130 + sway, 0);
      ctx.lineTo(sx + 240 + sway, canvasH * 0.85);
      ctx.lineTo(sx + 60 + sway, canvasH * 0.85);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // --- 遠處水晶微光（視差 0.6，隨時間呼吸）---
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const h = Level.hash(i, 7);
      const wx = (h % this.pixelW);
      const wy = 80 + (h >> 8) % (this.pixelH - 300);
      const sx = wx - cam.x * 0.6;
      const sy = wy - cam.y * 0.6;
      if (sx < -50 || sx > canvasW + 50) continue;
      const glow = 0.35 + 0.25 * Math.sin(time * 2 + i * 1.7);
      ctx.globalAlpha = glow;
      ctx.fillStyle = i % 3 === 0 ? "#e874b0" : "#8f7fff";
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (h % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // --- 螢幕四角暗角（vignette）---
    const vg = ctx.createRadialGradient(
      canvasW / 2, canvasH / 2, canvasH * 0.45,
      canvasW / 2, canvasH / 2, canvasH * 0.95
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  /** 場景裝飾（在磚格之前繪製 → 位於怪物與玩家後方） */
  drawDecos(ctx, cam, canvasW, time) {
    const deco = Assets.img("deco");
    const torch = Assets.img("torch");
    const s = 2; // 32px 素材放大 2 倍與磚格一致
    for (const d of this.decos) {
      if (d.x < cam.x - 100 || d.x > cam.x + canvasW + 100) continue;

      if (d.kind === "torch") {
        // 火把：4 影格循環 + 火光光暈（隨時間閃爍）
        const fi = Math.floor(time * 8 + d.phase) % 4;
        const flick = 0.82 + 0.18 * Math.sin(time * 11 + d.phase * 2.3);
        const g = ctx.createRadialGradient(d.x, d.y - 96, 10, d.x, d.y - 96, 150 * flick);
        g.addColorStop(0, "rgba(255,170,60,0.28)");
        g.addColorStop(1, "rgba(255,170,60,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y - 96, 150 * flick, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(torch, fi * 32, 0, 32, 64, Math.round(d.x - 32), Math.round(d.y - 128), 64, 128);
      } else {
        const [sx, sy, sw, sh] = Level.DECO_RECTS[d.rect];
        const dw = sw * s, dh = sh * s;
        ctx.save();
        ctx.translate(Math.round(d.x), Math.round(d.y));
        if (d.flip) ctx.scale(-1, 1);
        ctx.drawImage(deco, sx, sy, sw, sh, Math.round(-dw / 2), -dh, dw, dh);
        ctx.restore();
      }
    }
  }

  /** 繪製可見範圍內的磚格（自動拼貼） */
  draw(ctx, cam, canvasW, canvasH, time = 0) {
    const T = Level.TILE, S = Level.SRC;
    const tiles = Assets.img("tiles");
    const c0 = Math.max(0, Math.floor(cam.x / T));
    const c1 = Math.min(this.cols - 1, Math.ceil((cam.x + canvasW) / T));
    const r0 = Math.max(0, Math.floor(cam.y / T));
    const r1 = Math.min(this.rows - 1, Math.ceil((cam.y + canvasH) / T));

    // 裝飾在磚格之前（怪物與玩家會蓋在裝飾前面）
    this.drawDecos(ctx, cam, canvasW, time);

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const t = this.tileAt(col, row);
        if (t === Level.EMPTY) continue;
        const dx = col * T, dy = row * T;

        if (t === Level.SOLID) {
          const [sc, sr] = this.pickSolidTile(col, row);
          ctx.drawImage(tiles, sc * S, sr * S, S, S, dx, dy, T, T);
        } else {
          // 單向平台：使用第 0 列的薄平台磚（自帶水晶底邊），左右緣依相鄰平台磚決定
          const l = this.tileAt(col - 1, row) === Level.ONEWAY;
          const r = this.tileAt(col + 1, row) === Level.ONEWAY;
          const sc = (!l && !r) ? 3 : (!l ? 0 : (!r ? 2 : 1));
          ctx.drawImage(tiles, sc * S, 0, S, S, dx, dy, T, T);
        }
      }
    }

    // --- 深淵警示：世界最底部的暗紅霧氣（此處為世界座標系）---
    if (cam.y + canvasH > this.pixelH - 200) {
      const g = ctx.createLinearGradient(0, this.pixelH - 200, 0, this.pixelH + 20);
      g.addColorStop(0, "rgba(120,20,40,0)");
      g.addColorStop(1, "rgba(200,40,60,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(cam.x, this.pixelH - 200, canvasW, 220);
    }
  }
}
