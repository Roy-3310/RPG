"use strict";
/* ============================================================
   ui.js - 使用者介面（DOM）
   - HUD：血條 / 經驗條 / 等級 / 金幣 / 裝備快捷顯示 / 首領血條
   - 背包介面：格子、裝備欄、屬性面板、提示框（含裝備比較）
   - 拾取通知（Toast）、區域橫幅、各種覆蓋畫面
   ============================================================ */

class UI {
  static game = null;

  /** 快取常用 DOM 節點 */
  static init(game) {
    UI.game = game;
    UI.el = {
      hud: document.getElementById("hud"),
      hpFill: document.getElementById("hp-fill"),
      hpText: document.getElementById("hp-text"),
      xpFill: document.getElementById("xp-fill"),
      xpText: document.getElementById("xp-text"),
      lvl: document.getElementById("lvl-badge"),
      gold: document.getElementById("gold-text"),
      hudWeapon: document.getElementById("hud-weapon"),
      hudArmor: document.getElementById("hud-armor"),
      bossBar: document.getElementById("boss-bar"),
      bossFill: document.getElementById("boss-fill"),
      banner: document.getElementById("zone-banner"),
      toasts: document.getElementById("toasts"),
      inventory: document.getElementById("inventory"),
      invGrid: document.getElementById("inv-grid"),
      invStats: document.getElementById("inv-stats"),
      eqWeapon: document.getElementById("eq-weapon"),
      eqArmor: document.getElementById("eq-armor"),
      tooltip: document.getElementById("tooltip"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayPause: document.getElementById("overlay-pause"),
      overlayDead: document.getElementById("overlay-dead"),
      overlayVictory: document.getElementById("overlay-victory"),
      deadInfo: document.getElementById("dead-info"),
      victoryStats: document.getElementById("victory-stats"),
      loadingText: document.getElementById("loading-text"),
      pressStart: document.getElementById("press-start"),
    };
  }

  // ------------------------------------------------------------
  // HUD（每幀更新）
  // ------------------------------------------------------------
  static updateHUD(player, boss) {
    const e = UI.el;
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    e.hpFill.style.width = `${hpRatio * 100}%`;
    e.hpFill.classList.toggle("low", hpRatio < 0.3);
    e.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    e.xpFill.style.width = `${(player.xp / player.xpNeed) * 100}%`;
    e.xpText.textContent = `EXP ${player.xp} / ${player.xpNeed}`;
    e.lvl.textContent = player.lvl;
    e.gold.textContent = player.gold;

    UI.renderEquipSlot(e.hudWeapon, player.weapon, "無武器");
    UI.renderEquipSlot(e.hudArmor, player.armor, "無防具");

    // 首領血條
    if (boss && boss.awake && !boss.dead) {
      e.bossBar.classList.remove("hidden");
      e.bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    } else {
      e.bossBar.classList.add("hidden");
    }
  }

  /** 小型裝備格（HUD 用）：內容沒變就不重建 DOM */
  static renderEquipSlot(el, item, emptyText) {
    const sig = item ? `${item.icon}|${item.rarity.css}` : "empty";
    if (el._sig === sig) return;
    el._sig = sig;
    if (!item) {
      el.className = "equip-slot";
      el.innerHTML = `<span class="slot-hint">${emptyText}</span>`;
      return;
    }
    el.className = `equip-slot ${item.rarity.css}`;
    el.innerHTML = item.icon;
  }

  // ------------------------------------------------------------
  // 通知 / 橫幅
  // ------------------------------------------------------------
  /** 拾取通知 */
  static toast(text, color = "#fff") {
    const div = document.createElement("div");
    div.className = "toast";
    div.style.color = color;
    div.textContent = text;
    UI.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 2600);
  }

  /** 區域名稱橫幅 */
  static zoneBanner(name) {
    const b = UI.el.banner;
    b.textContent = name;
    b.classList.remove("hidden");
    // 重新觸發 CSS 動畫
    b.style.animation = "none";
    void b.offsetWidth;
    b.style.animation = "";
    clearTimeout(UI._bannerTimer);
    UI._bannerTimer = setTimeout(() => b.classList.add("hidden"), 2900);
  }

  // ------------------------------------------------------------
  // 背包介面
  // ------------------------------------------------------------
  static openInventory() {
    UI.el.inventory.classList.remove("hidden");
    UI.renderInventory();
  }

  static closeInventory() {
    UI.el.inventory.classList.add("hidden");
    UI.hideTooltip();
  }

  /** 重繪整個背包內容 */
  static renderInventory() {
    const p = UI.game.player;

    // ---------- 已裝備欄 ----------
    UI.renderBigSlot(UI.el.eqWeapon, p.weapon, "武器", -1);
    UI.renderBigSlot(UI.el.eqArmor, p.armor, "防具", -1);

    // ---------- 背包格 ----------
    const grid = UI.el.invGrid;
    grid.innerHTML = "";
    for (let i = 0; i < Player.INV_SIZE; i++) {
      const item = p.inventory[i];
      const slot = document.createElement("div");
      if (item) {
        slot.className = `inv-slot ${item.rarity.css}`;
        slot.innerHTML = `${item.icon}<span class="ilvl">${item.ilvl}</span>`;
        // 左鍵：裝備
        slot.addEventListener("click", () => {
          p.equipFromInventory(i);
          UI.renderInventory();
          UI.updateHUD(p, UI.game.boss); // 裝備欄即時更新
        });
        // 右鍵：賣出
        slot.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          const sold = p.sellFromInventory(i);
          if (sold) UI.toast(`賣出 ${sold.fullName} +${sold.value} 金幣`, "#ffd54f");
          UI.renderInventory();
          UI.updateHUD(p, UI.game.boss); // 金幣即時更新
        });
        UI.bindTooltip(slot, item);
      } else {
        slot.className = "inv-slot empty";
      }
      grid.appendChild(slot);
    }

    // ---------- 屬性面板 ----------
    UI.el.invStats.innerHTML = `
      <h3>角色屬性</h3>
      <div>等級 <span class="stat-val">Lv.${p.lvl}</span></div>
      <div>生命 <span class="stat-val">${Math.ceil(p.hp)} / ${p.maxHp}</span></div>
      <div>攻擊力 <span class="stat-val">${p.atk}</span></div>
      <div>防禦力 <span class="stat-val">${p.def}</span></div>
      <div>暴擊率 <span class="stat-val">${Math.round(p.critChance * 100)}%</span></div>
      <div>攻擊吸血 <span class="stat-val">${Math.round(p.lifesteal * 100)}%</span></div>
      <div>移動速度 <span class="stat-val">${Math.round(p.speedMult * 100)}%</span></div>
      <div>金幣 <span class="stat-val" style="color:#ffd54f">${p.gold}</span></div>
      <div>背包 <span class="stat-val">${p.inventory.length} / ${Player.INV_SIZE}</span></div>
    `;
  }

  /** 大型裝備格（背包內的已裝備欄） */
  static renderBigSlot(el, item, label, invIndex) {
    el.innerHTML = `<span class="slot-label">${label}</span>`;
    el.className = "inv-slot equip-target";
    if (item) {
      el.classList.add(item.rarity.css);
      el.innerHTML += `${item.icon}<span class="ilvl">${item.ilvl}</span>`;
      UI.bindTooltip(el, item);
    }
  }

  // ------------------------------------------------------------
  // 物品提示框（含與已裝備的比較）
  // ------------------------------------------------------------
  static bindTooltip(el, item) {
    // 以屬性方式綁定：重複呼叫時直接覆蓋，避免監聽器累積
    el.onmouseenter = (ev) => UI.showTooltip(item, ev);
    el.onmousemove = (ev) => UI.positionTooltip(ev);
    el.onmouseleave = () => UI.hideTooltip();
  }

  static showTooltip(item, ev) {
    const p = UI.game.player;
    const equipped = item.slot === "weapon" ? p.weapon : p.armor;
    const slotName = item.slot === "weapon" ? "武器" : "防具";

    // 屬性行
    let rows = "";
    if (item.atk) rows += `<div class="tt-stat">攻擊力 +${item.atk}</div>`;
    if (item.def) rows += `<div class="tt-stat">防禦力 +${item.def}</div>`;
    if (item.hp) rows += `<div class="tt-stat">生命上限 +${item.hp}</div>`;
    if (item.bonusText) rows += `<div class="tt-bonus">★ ${item.bonusText}</div>`;

    // 與已裝備比較
    let cmp = "";
    if (equipped && equipped !== item) {
      const diff = (a, b, name) => {
        const d = (a || 0) - (b || 0);
        if (d === 0) return "";
        return `<div class="${d > 0 ? "tt-cmp-up" : "tt-cmp-down"}">${name} ${d > 0 ? "+" : ""}${d}（換裝後）</div>`;
      };
      cmp = diff(item.atk, equipped.atk, "攻擊力") +
            diff(item.def, equipped.def, "防禦力") +
            diff(item.hp, equipped.hp, "生命上限");
    }

    UI.el.tooltip.innerHTML = `
      <div class="tt-name" style="color:${item.rarity.color}">${item.name}</div>
      <div class="tt-type">${item.rarity.name} ${slotName}・物品等級 ${item.ilvl}</div>
      ${rows}${cmp}
      <div class="tt-value">賣出價：${item.value} 金幣</div>
    `;
    UI.el.tooltip.classList.remove("hidden");
    UI.positionTooltip(ev);
  }

  static positionTooltip(ev) {
    const tt = UI.el.tooltip;
    const wrap = document.getElementById("game-wrap").getBoundingClientRect();
    let x = ev.clientX - wrap.left + 18;
    let y = ev.clientY - wrap.top + 12;
    // 避免超出畫面
    if (x + 270 > wrap.width) x -= 290;
    if (y + tt.offsetHeight > wrap.height) y -= tt.offsetHeight + 20;
    tt.style.left = `${x}px`;
    tt.style.top = `${y}px`;
  }

  static hideTooltip() { UI.el.tooltip.classList.add("hidden"); }

  // ------------------------------------------------------------
  // 覆蓋畫面切換
  // ------------------------------------------------------------
  static show(name) { UI.el[name].classList.remove("hidden"); }
  static hide(name) { UI.el[name].classList.add("hidden"); }
}
