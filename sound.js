'use strict';

// ===== 音 =====
// 全部ブラウザの中で合成する（音源ファイルなし）。候補の聴き比べは art/sound/samples.html（手元だけ）、2026-10-24 に決定
// 握手中は BGM を流さない。拍がメトロノームになり、心の中で数える遊びが消えるため
// 握手が始まる瞬間にも音を出さない。Bluetooth イヤホンだと音が遅れ、数え始めがずれるため
const Sound = (() => {
  let ac = null, sfxOut = null, bgmOut = null;
  let enabled = { bgm: true, sfx: true };

  const NOTE = (n) => { // 'C5' → Hz
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    const k = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, (k + (+m[3] + 1) * 12 - 69) / 12);
  };

  // ブラウザは画面に触れるまで音を出させない。最初の操作で作る
  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      sfxOut = ac.createGain(); sfxOut.connect(ac.destination);
      bgmOut = ac.createGain(); bgmOut.gain.value = 0.6; bgmOut.connect(ac.destination);
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    return ac;
  }

  // --- 部品 ---
  function tone(out, t, o) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    const a = o.a || 0.005, peak = o.v || 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  }

  let noiseBuf = null;
  function noise(out, t, o) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.value = o.f || 1000;
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.v || 0.3, t + (o.a || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.02);
  }

  // 鐘：基音＋高い倍音を短く
  function bell(out, t, f, dur, v) {
    tone(out, t, { f, dur, v });
    tone(out, t, { f: f * 2.01, dur: dur * 0.5, v: v * 0.35 });
    tone(out, t, { f: f * 3.98, dur: dur * 0.25, v: v * 0.12 });
  }

  // --- 効果音 ---
  const SFX = {
    press: (o, t) => tone(o, t, { f: 900, f2: 450, dur: 0.09, v: 0.35 }),                    // ポン
    perfect: (o, t, up) => {                                                                   // ピンポン（連続で半音ずつ上がる）
      const k = Math.pow(2, up / 12);
      bell(o, t, NOTE('E6') * k, 0.5, 0.22); bell(o, t + 0.11, NOTE('B6') * k, 0.7, 0.22);
    },
    good: (o, t) => tone(o, t, { f: 620, dur: 0.16, v: 0.3, type: 'triangle' }),              // ポッ
    bad: (o, t) => tone(o, t, { f: 700, f2: 160, dur: 0.5, glide: 0.45, v: 0.28, type: 'triangle', a: 0.01 }), // ヒュ〜ン
    timeout: (o, t) => {                                                                       // ブブー（長め）
      for (let i = 0; i < 3; i++) tone(o, t + i * 0.2, { f: 130, dur: i === 2 ? 0.5 : 0.16, v: 0.13, type: 'square', a: 0.004 });
    },
    enter: (o, t) => tone(o, t, { f: 1760, dur: 0.07, v: 0.14 }),                             // ピッ
    angry: (o, t) => tone(o, t, { f: 300, f2: 900, dur: 0.14, glide: 0.08, v: 0.25 }),        // プンッ
    love: (o, t) => {                                                                          // キュン
      tone(o, t, { f: NOTE('A5'), f2: NOTE('E6'), dur: 0.25, glide: 0.1, v: 0.18 });
      tone(o, t + 0.12, { f: NOTE('A6'), dur: 0.3, v: 0.1 });
    },
    tick: (o, t) => noise(o, t, { filter: 'highpass', f: 3000, q: 1, dur: 0.025, v: 0.15 }),  // カチ
    finish: (o, t) => {                                                                        // ジャジャーン
      [['C5', 0], ['E5', 0.12], ['G5', 0.24], ['C6', 0.36]].forEach(([n, d]) => tone(o, t + d, { f: NOTE(n), dur: d === 0.36 ? 0.9 : 0.14, v: 0.09, type: 'square' }));
      ['C4', 'G4', 'E5'].forEach((n) => tone(o, t + 0.36, { f: NOTE(n), dur: 0.9, v: 0.08, type: 'triangle' }));
    },
    best: (o, t) => ['C6', 'E6', 'G6', 'C7', 'E7', 'G7', 'C8'].forEach((n, i) => bell(o, t + i * 0.07, NOTE(n), 0.6, 0.08)), // キラキラ長め
    ui: (o, t) => tone(o, t, { f: 1200, dur: 0.05, v: 0.12 }),                                // ポッ（小）
  };

  // delay：今から何秒後に鳴らすか。at：その時刻（performance.now）に鳴らす
  function play(name, opt = {}) {
    if (!enabled.sfx || !ac) return;
    let t = ac.currentTime + 0.005 + (opt.delay || 0);
    if (opt.at !== undefined) t = ac.currentTime + Math.max(0.005, (opt.at - performance.now()) / 1000);
    SFX[name](sfxOut, t, opt.up || 0);
  }

  // --- BGM：アイドルポップ（150）。タイトル・アイドル選択・結果で流す ---
  // 譜面は [音, 長さ（8分音符いくつ）]
  const MELODY = [
    [['E5', 2], ['G5', 1], ['A5', 1], ['G5', 2], ['E5', 2]],
    [['D5', 2], ['G5', 1], ['D5', 1], ['B4', 2], ['D5', 2]],
    [['C5', 2], ['E5', 1], ['A5', 1], ['B5', 2], ['A5', 2]],
    [['A5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['F5', 2], ['A5', 2]],
    [['G5', 2], ['E5', 1], ['G5', 1], ['C6', 2], ['B5', 1], ['A5', 1]],
    [['B5', 2], ['G5', 1], ['D5', 1], ['G5', 2], ['A5', 2]],
    [['A5', 1], ['C6', 1], ['A5', 1], ['G5', 1], ['F5', 2], ['E5', 1], ['D5', 1]],
    [['D5', 2], ['E5', 1], ['F5', 1], ['G5', 4]],
  ];
  const ROOTS = ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'F2', 'G2'];
  const E = 60 / 150 / 2; // 8分音符

  // 1小節ずつ先読みして予約する（1周まとめてだと、止めたあとも最大12秒鳴り続ける）
  function bar(out, t, b) {
    let k = 0;
    for (const [n, l] of MELODY[b]) { tone(out, t + k * E, { f: NOTE(n), dur: l * E * 0.95, v: 0.07, type: 'square' }); k += l; }
    const r = NOTE(ROOTS[b]);
    for (let i = 0; i < 8; i++) {
      const s = t + i * E;
      tone(out, s, { f: i % 2 ? r * 2 : r, dur: E * 0.9, v: 0.16, type: 'triangle' });
      if (i % 4 === 0) tone(out, s, { f: 150, f2: 45, dur: 0.12, v: 0.45, a: 0.001 });
      if (i % 4 === 2) noise(out, s, { f: 1800, q: 0.7, dur: 0.1, v: 0.18 });
      noise(out, s, { filter: 'highpass', f: 7000, dur: 0.03, v: i % 2 ? 0.05 : 0.08 });
    }
  }

  let bgm = null; // { out, t, b, timer }
  function bgmStart(delay = 0) {
    if (bgm || !enabled.bgm || !ac) return;
    const out = ac.createGain(); out.connect(bgmOut);
    bgm = { out, t: ac.currentTime + 0.05 + delay, b: 0, timer: 0 };
    const cur = bgm;
    const sched = () => {
      if (bgm !== cur) return;
      while (cur.t < ac.currentTime + 1) { bar(out, cur.t, cur.b); cur.t += 8 * E; cur.b = (cur.b + 1) % MELODY.length; }
      cur.timer = setTimeout(sched, 300);
    };
    sched();
  }
  function bgmStop() {
    if (!bgm) return;
    clearTimeout(bgm.timer);
    const o = bgm.out;
    o.gain.setTargetAtTime(0, ac.currentTime, 0.08);
    setTimeout(() => o.disconnect(), 600);
    bgm = null;
  }

  // 別のタブに移ったら止め、戻ったら続ける
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });

  return {
    play,
    bgmStart, bgmStop,
    // 画面に触れるたびに呼ぶ（最初の1回で音が出せるようになる。止まっていれば起こす）
    unlock: ctx,
    set(kind, on) {
      enabled[kind] = on;
      if (kind === 'bgm' && !on) bgmStop();
    },
  };
})();
