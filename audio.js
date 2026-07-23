"use strict";
/* ============================================================
   audio.js - 音效與背景音樂系統
   使用 Web Audio API 程序化合成（不需外部音檔）
   - sfx(name)  : 播放對應音效
   - startBGM() : 啟動循環背景音樂（小調分解和弦 + 低音）
   - 瀏覽器限制：需在第一次使用者輸入後才能啟動 AudioContext
   ============================================================ */

class AudioSys {
  static ctx = null;        // AudioContext
  static master = null;     // 主音量
  static musicGain = null;  // 音樂音量
  static sfxGain = null;    // 音效音量
  static muted = false;
  static bgmTimer = null;   // BGM 排程計時器
  static step = 0;          // BGM 目前拍點

  /** 於第一次使用者互動時呼叫（解除瀏覽器自動播放限制） */
  static init() {
    if (AudioSys.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    AudioSys.ctx = new AC();
    AudioSys.master = AudioSys.ctx.createGain();
    AudioSys.master.gain.value = 0.85;
    AudioSys.master.connect(AudioSys.ctx.destination);

    AudioSys.musicGain = AudioSys.ctx.createGain();
    AudioSys.musicGain.gain.value = 0.32;
    AudioSys.musicGain.connect(AudioSys.master);

    AudioSys.sfxGain = AudioSys.ctx.createGain();
    AudioSys.sfxGain.gain.value = 0.9;
    AudioSys.sfxGain.connect(AudioSys.master);
  }

  /** 靜音切換（M 鍵） */
  static toggleMute() {
    if (!AudioSys.ctx) return;
    AudioSys.muted = !AudioSys.muted;
    AudioSys.master.gain.value = AudioSys.muted ? 0 : 0.85;
    return AudioSys.muted;
  }

  // ------------------------------------------------------------
  // 低階合成工具
  // ------------------------------------------------------------

  /** 播放單一振盪器音（freq 可為陣列 → 滑音） */
  static tone(type, freq, dur, vol = 0.3, when = 0, dest = null) {
    if (!AudioSys.ctx) return;
    const t0 = AudioSys.ctx.currentTime + when;
    const osc = AudioSys.ctx.createOscillator();
    const g = AudioSys.ctx.createGain();
    osc.type = type;
    if (Array.isArray(freq)) {
      osc.frequency.setValueAtTime(freq[0], t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), t0 + dur);
    } else {
      osc.frequency.value = freq;
    }
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); // 指數衰減包絡
    osc.connect(g).connect(dest || AudioSys.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 播放白噪音（打擊 / 揮砍質感） */
  static noise(dur, vol = 0.2, filterFreq = 2000, when = 0) {
    if (!AudioSys.ctx) return;
    const t0 = AudioSys.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(AudioSys.ctx.sampleRate * dur));
    const buf = AudioSys.ctx.createBuffer(1, len, AudioSys.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = AudioSys.ctx.createBufferSource();
    src.buffer = buf;
    const filter = AudioSys.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const g = AudioSys.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(AudioSys.sfxGain);
    src.start(t0);
  }

  // ------------------------------------------------------------
  // 遊戲音效
  // ------------------------------------------------------------
  static sfx(name) {
    if (!AudioSys.ctx) return;
    switch (name) {
      case "swing":   AudioSys.noise(0.12, 0.16, 3200); break;                       // 揮劍破空
      case "swing3":  AudioSys.noise(0.18, 0.22, 2200); AudioSys.tone("sawtooth", [300, 90], 0.16, 0.08); break;
      case "hit":     AudioSys.noise(0.08, 0.3, 1400); AudioSys.tone("square", [420, 160], 0.09, 0.22); break;
      case "crit":    AudioSys.noise(0.14, 0.4, 900);  AudioSys.tone("square", [260, 60], 0.18, 0.3); break;
      case "kill":    AudioSys.tone("sawtooth", [330, 40], 0.35, 0.22); AudioSys.noise(0.25, 0.25, 600); break;
      case "hurt":    AudioSys.tone("square", [200, 70], 0.22, 0.3); AudioSys.noise(0.12, 0.2, 800); break;
      case "die":     AudioSys.tone("sawtooth", [220, 30], 0.9, 0.3); AudioSys.noise(0.5, 0.2, 400); break;
      case "jump":    AudioSys.tone("square", [280, 520], 0.14, 0.12); break;
      case "land":    AudioSys.noise(0.06, 0.12, 500); break;
      case "coin":    AudioSys.tone("square", 1320, 0.06, 0.14); AudioSys.tone("square", 1760, 0.12, 0.14, 0.06); break;
      case "pickup":  AudioSys.tone("triangle", [520, 1040], 0.16, 0.2); break;
      case "epic":    for (let i = 0; i < 3; i++) AudioSys.tone("triangle", 660 * Math.pow(1.335, i), 0.18, 0.2, i * 0.07); break;
      case "potion":  AudioSys.tone("sine", [420, 840], 0.25, 0.22); break;
      case "equip":   AudioSys.tone("square", 660, 0.05, 0.14); AudioSys.noise(0.05, 0.1, 3000, 0.03); break;
      case "sell":    AudioSys.tone("square", 990, 0.05, 0.12); AudioSys.tone("square", 660, 0.08, 0.12, 0.06); break;
      case "levelup": for (let i = 0; i < 5; i++) AudioSys.tone("triangle", 440 * Math.pow(1.26, i), 0.22, 0.22, i * 0.08); break;
      case "warn":    AudioSys.tone("square", [880, 440], 0.2, 0.12); break;                 // 敵人攻擊前搖
      case "clink":   AudioSys.tone("triangle", [1800, 900], 0.08, 0.18); AudioSys.noise(0.04, 0.12, 5200); break; // 盾牌格擋
      case "poof":    AudioSys.noise(0.25, 0.18, 700); AudioSys.tone("sine", [300, 120], 0.3, 0.15); break;        // 孢子噴發
      case "slam":    AudioSys.noise(0.3, 0.5, 300); AudioSys.tone("sine", [120, 35], 0.4, 0.4); break;
      case "select":  AudioSys.tone("square", 880, 0.04, 0.1); break;
      case "pause":   AudioSys.tone("square", [660, 330], 0.14, 0.12); break;
      case "respawn": AudioSys.tone("triangle", [220, 880], 0.5, 0.2); break;
      case "victory": for (let i = 0; i < 6; i++) AudioSys.tone("triangle", [523, 659, 784, 1047, 784, 1047][i], 0.3, 0.22, i * 0.14); break;
    }
  }

  // ------------------------------------------------------------
  // 背景音樂：16 步循環（a 小調），低音 + 分解和弦 + 節奏底鼓
  // ------------------------------------------------------------
  static startBGM() {
    if (!AudioSys.ctx || AudioSys.bgmTimer) return;
    const BPM = 108;
    const stepDur = 60 / BPM / 2; // 八分音符
    // 低音進行：Am → F → C → G（每小節 4 步）
    const bassLine = [110, 110, 110, 110, 87.3, 87.3, 87.3, 87.3, 130.8, 130.8, 130.8, 130.8, 98, 98, 98, 98];
    // 分解和弦音（高八度）
    const arps = [
      [220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2],
      [261.6, 329.6, 392, 523.3], [196, 246.9, 293.7, 392],
    ];
    let nextTime = AudioSys.ctx.currentTime + 0.1;

    const schedule = () => {
      // 排程未來 0.3 秒內的拍點（lookahead 排程法，避免計時抖動）
      while (nextTime < AudioSys.ctx.currentTime + 0.3) {
        const s = AudioSys.step % 16;
        const when = nextTime - AudioSys.ctx.currentTime;
        // 低音（三角波，厚實）
        AudioSys.tone("triangle", bassLine[s], stepDur * 1.8, 0.30, when, AudioSys.musicGain);
        // 分解和弦（每步一音）
        const chord = arps[Math.floor(s / 4)];
        AudioSys.tone("square", chord[s % 4], stepDur * 0.9, 0.05, when, AudioSys.musicGain);
        // 每 4 步一個底鼓
        if (s % 4 === 0) AudioSys.tone("sine", [150, 45], 0.12, 0.35, when, AudioSys.musicGain);
        AudioSys.step++;
        nextTime += stepDur;
      }
    };
    schedule();
    AudioSys.bgmTimer = setInterval(schedule, 120);
  }
}
