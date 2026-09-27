'use strict';

// ===== 設定 =====
// 判定の幅は秒数で固定。1秒でも10秒でも、ずれの大きさはほぼ同じだった（2026-09-27 の試し打ち）
const DIFFS = {
  easy:   { tol: 0.15 },
  normal: { tol: 0.10 },
  hard:   { tol: 0.05 },
};
const REGULAR = [1, 1, 2, 2, 3, 3, 4, 4, 5]; // 並びは毎回シャッフル。合計は固定（太客と合わせて10人）
const BOSS = 10;                                             // 最後の1人（太客）
const YEN_PER_TICKET = 1000;

const T_ENTER = 900;     // 登場して券を見せる
const T_APPROACH = 1000; // 手が近づく（等速なので触れる瞬間が読める）
const T_TALK = 1600;     // 判定と台詞を見せる（ファンはその場に残る）
const T_LEAVE = 400;     // ファンが台詞ごとはけていく

// 担当アイドル。絵は Flow で生成（art/ に元画像とプロンプト）
const IDOLS = [
  { id: 'red',    name: 'あいり', color: '#ff4d6d', img: 'img/idol-red.webp' },
  { id: 'blue',   name: 'みお',   color: '#4d8dff', img: 'img/idol-blue.webp' },
  { id: 'yellow', name: 'ひなた', color: '#f5a300', img: 'img/idol-yellow.webp' },
];

const FAN_FACES = ['🧑', '👨', '👩', '🧔', '👱', '🧓', '👴', '👦', '👧', '👵'];
const BOSS_FACE = '🤵';

const LINES = {
  perfectFan:  ['最高の{s}秒でした…', '一生の思い出です', 'また来ます！！', '神対応…'],
  perfectIdol: ['ありがとう〜♡', 'また来てね！', 'うれしい〜！'],
  goodEarly:   ['あれ、もう？', 'もうちょっとだけ…'],
  goodLate:    ['（ちょっと長いかも）', '（手、あったかいね…）'],
  badEarly:    ['えっ、まだ{r}秒あるんだけど！？', '券、返して！', '運営に言うからな！'],
  badLate:     ['……剥がして？', '（笑顔がひきつる）', 'ちょっと、剥がしさん？'],
  timeout:     ['ねえ、剥がし！！', '（アイドル、真顔）'],
};

// ===== 保存（使えなくても動く） =====
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても続行 */ } },
};
const settings = Object.assign({ diff: 'easy', showWatch: true, offset: 0, idol: 'red' }, store.get('hagashi.settings', {}));
const curIdol = () => IDOLS.find((d) => d.id === settings.idol) || IDOLS[0];
const saveSettings = () => store.set('hagashi.settings', settings);
const bestKey = () => 'hagashi.best.' + settings.diff;

// ===== 小道具 =====
const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const f2 = (v) => v.toFixed(2);
const sgn2 = (v) => {
  const s = Math.abs(v).toFixed(2);
  return s === '0.00' ? '±0.00' : (v > 0 ? '+' : '−') + s;
};

// 押した瞬間の時刻。event.timeStamp は処理が遅れても押した時刻を指す
function eventTime(e) {
  const now = performance.now();
  const ts = e && e.timeStamp;
  return ts > 0 && Math.abs(ts - now) < 1000 ? ts : now;
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  current = id;
  if (document.activeElement) document.activeElement.blur();
}
let current = 'title';

// ===== タイトル =====
function refreshTitle() {
  for (const b of $('segDiff').children) b.classList.toggle('on', b.dataset.v === settings.diff);
  for (const b of $('segWatch').children) b.classList.toggle('on', (b.dataset.v === '1') === settings.showWatch);
  $('offsetLabel').textContent = (settings.offset >= 0 ? '+' : '−') + Math.abs(settings.offset / 1000).toFixed(3) + '秒';
  $('bestLabel').textContent = store.get(bestKey(), 0);
}
$('segDiff').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  settings.diff = b.dataset.v; saveSettings(); refreshTitle();
});
$('segWatch').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  settings.showWatch = b.dataset.v === '1'; saveSettings(); refreshTitle();
});
$('btnStart').addEventListener('click', openSelect);

// ===== 担当アイドルを選ぶ =====
function openSelect() {
  $('idolList').innerHTML = IDOLS.map((d) =>
    '<button class="idol-card' + (d.id === settings.idol ? ' on' : '') + '" data-id="' + d.id + '" style="--member:' + d.color + '">' +
    '<img src="' + d.img + '" alt=""><span class="idol-name">' + d.name + '</span></button>'
  ).join('');
  show('select');
}
$('idolList').addEventListener('click', (e) => {
  const b = e.target.closest('.idol-card'); if (!b) return;
  settings.idol = b.dataset.id; saveSettings();
  startGame();
});
$('btnSelectBack').addEventListener('click', () => { refreshTitle(); show('title'); });

function applyIdol() {
  const d = curIdol();
  $('idolImg').src = d.img;
  $('idolPlate').textContent = d.name;
  $('idolPlate').style.setProperty('--member', d.color);
  $('resImg').src = d.img;
  $('resFace').style.setProperty('--member', d.color);
}
// 押し間違いで消えないよう、2回押して消す
let clearArmed = null;
$('btnClearBest').addEventListener('click', () => {
  const b = $('btnClearBest');
  if (clearArmed) {
    clearTimeout(clearArmed); clearArmed = null;
    store.set(bestKey(), 0);
    b.textContent = 'クリア';
    refreshTitle();
    return;
  }
  b.textContent = 'もう一度';
  clearArmed = setTimeout(() => { clearArmed = null; b.textContent = 'クリア'; }, 2000);
});
$('btnCalib').addEventListener('click', startCalib);

// ===== ゲーム本体 =====
let G = null;

function startGame() {
  const seq = shuffle(REGULAR.slice());
  seq.push(BOSS);
  G = { seq, i: -1, score: 0, combo: 0, maxCombo: 0, idol: 70, fan: 70, log: [], phase: '', t: 0, t0: 0 };
  applyIdol();
  show('play');
  updateHud();
  nextFan(performance.now());
  requestAnimationFrame(loop);
}

function nextFan(now) {
  G.i++;
  if (G.i >= G.seq.length) { finish(); return; }
  const n = G.seq[G.i];
  const boss = G.i === G.seq.length - 1;

  const fan = $('fan');
  fan.classList.remove('out', 'talking');
  fan.classList.add('enter');
  fan.classList.toggle('boss', boss);
  $('fanFace').textContent = boss ? BOSS_FACE : pick(FAN_FACES);
  $('tickets').innerHTML =
    (boss ? '<span class="tag">太客</span>' : '') +
    '<span class="icons" style="grid-template-columns: repeat(' + Math.min(n, 5) + ', auto)">' + '<i>🎫</i>'.repeat(n) + '</span>' +
    '<span class="sec">' + n + '秒</span>';
  void fan.offsetWidth; // 入場の動きを最初から
  fan.classList.remove('enter');

  const hand = $('fanHand');
  hand.style.setProperty('--p', 0);
  hand.classList.remove('hidden');
  $('idolHand').classList.remove('hidden');
  $('shake').classList.add('hidden');
  $('judge').classList.add('hidden');
  $('swLayer').classList.add('hidden');
  $('bubbleIdol').classList.add('hidden');
  $('bubbleFan').classList.add('hidden');

  G.phase = 'enter';
  G.t = now;
  updateHud();
}

function loop(now) {
  if (!G || current !== 'play') return;
  const el = now - G.t;
  if (G.phase === 'enter' && el >= T_ENTER) {
    G.phase = 'approach';
    G.t += T_ENTER; // 予定時刻で進める（フレームの遅れを持ち越さない）
  }
  if (G.phase === 'approach') {
    const p = clamp((now - G.t) / T_APPROACH, 0, 1);
    $('fanHand').style.setProperty('--p', p);
    if (now - G.t >= T_APPROACH) {
      G.t0 = G.t + T_APPROACH; // 握手が始まった瞬間（画面の予定時刻）
      G.phase = 'hold';
      $('fanHand').classList.add('hidden');
      $('idolHand').classList.add('hidden');
      $('shake').classList.remove('hidden');
      if (settings.showWatch) {
        placeClock();
        drawClock(0);
        $('swWord').textContent = '';
        $('swDiff').textContent = '';
        $('swLayer').classList.remove('hidden');
      }
    }
  } else if (G.phase === 'hold') {
    // 判定と同じくタイミング調整ぶんを引く。引かないと、押して止めた瞬間に針が調整ぶん跳び戻る
    if (settings.showWatch) drawClock(Math.max(0, (now - G.t0 - settings.offset) / 1000));
    const target = G.seq[G.i];
    const limit = (target + Math.max(1.5, target * 0.5)) * 1000;
    if (now - G.t0 - settings.offset > limit) resolve(null);
  } else if (G.phase === 'result') {
    if (!G.leaving && el >= T_TALK) {
      G.leaving = true;
      $('fan').classList.add('out');
      $('bubbleIdol').classList.add('hidden');
    }
    if (el >= T_TALK + T_LEAVE) nextFan(now);
  }
  if (G && G.phase !== 'done') requestAnimationFrame(loop);
}

// ===== ストップウォッチ（1周＝1秒） =====
(function buildTicks() {
  const g = $('swTicks');
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const r1 = i % 5 === 0 ? 70 : 80;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 88 * Math.sin(a)); l.setAttribute('y1', -88 * Math.cos(a));
    l.setAttribute('x2', r1 * Math.sin(a)); l.setAttribute('y2', -r1 * Math.cos(a));
    l.setAttribute('stroke-width', i % 5 === 0 ? 5 : 3);
    g.appendChild(l);
  }
})();

function piePath(f) {
  if (f <= 0) return '';
  const a = f * Math.PI * 2;
  const x = 88 * Math.sin(a), y = -88 * Math.cos(a);
  return 'M0,0 L0,-88 A88,88 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ',' + y.toFixed(2) + ' Z';
}

// アイドル（将来はイラスト）と券に重ならないよう、その間に時計を置く。券の段数は人ごとに違う
function placeClock() {
  const stageH = $('stage').clientHeight;
  const idol = $('idol');
  const top = idol.offsetTop + idol.offsetHeight + 6;
  const ticketsTop = $('fan').offsetTop + $('tickets').offsetTop;
  $('swBox').style.top = top + 'px';
  $('swBox').style.bottom = (stageH - ticketsTop + 6) + 'px';
}

function drawClock(sec) {
  const f = sec - Math.floor(sec);
  $('swNeedle').setAttribute('transform', 'rotate(' + (f * 360).toFixed(2) + ')');
  $('swPie').setAttribute('d', piePath(f));
  $('swDig').textContent = f2(sec);
}

function judge(target, elapsed) {
  const tol = DIFFS[settings.diff].tol;
  const err = elapsed - target;
  const a = Math.abs(err);
  if (a <= tol) return { rank: 'perfect', err, tol };
  if (a <= tol * 2.5) return { rank: err < 0 ? 'goodEarly' : 'goodLate', err, tol };
  return { rank: err < 0 ? 'badEarly' : 'badLate', err, tol };
}

function resolve(pressTime) {
  const target = G.seq[G.i];
  const boss = G.i === G.seq.length - 1;
  const mult = boss ? 3 : 1;
  let elapsed = null, j;

  if (pressTime === null) {
    j = { rank: 'timeout', err: null };
  } else {
    elapsed = (pressTime - G.t0 - settings.offset) / 1000;
    j = judge(target, elapsed);
  }

  let pts = 0, word, cls, idolLine = null, fanLine = null;
  switch (j.rank) {
    case 'perfect':
      pts = (100 + Math.round(50 * (1 - Math.abs(j.err) / j.tol)) + G.combo * 10) * mult;
      G.combo++;
      G.idol += 6; G.fan += 6;
      word = 'ピッタリ！'; cls = 'perfect';
      if (Math.random() < 0.5) fanLine = pick(LINES.perfectFan); else idolLine = pick(LINES.perfectIdol);
      break;
    case 'goodEarly':
      pts = 40 * mult; G.combo = 0; G.fan -= 5;
      word = 'ちょい早'; cls = 'early'; fanLine = pick(LINES.goodEarly);
      break;
    case 'goodLate':
      pts = 40 * mult; G.combo = 0; G.idol -= 5;
      word = 'ちょい遅'; cls = 'late'; idolLine = pick(LINES.goodLate);
      break;
    case 'badEarly':
      G.combo = 0; G.fan -= 15 * mult;
      word = '早すぎ！'; cls = 'early'; fanLine = pick(LINES.badEarly);
      break;
    case 'badLate':
      G.combo = 0; G.idol -= 15 * mult;
      word = '遅すぎ！'; cls = 'late'; idolLine = pick(LINES.badLate);
      break;
    case 'timeout':
      G.combo = 0; G.idol -= 25 * mult;
      word = '剥がして！'; cls = 'late'; idolLine = pick(LINES.timeout);
      break;
  }
  G.idol = clamp(G.idol, 0, 100);
  G.fan = clamp(G.fan, 0, 100);
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  G.score += pts;
  G.log.push({ n: G.i + 1, target, elapsed, err: j.err, rank: j.rank, word, cls });

  // 判定表示。時計ありなら時計を止めて答え合わせ、なしなら判定の文字と黒い四角
  if (settings.showWatch) {
    if (elapsed !== null) drawClock(elapsed);
    $('swWord').textContent = word;
    $('swWord').className = 'sw-word jword ' + cls;
    $('swDiff').textContent = '/ ' + f2(target) + (elapsed === null ? '' : '  ' + sgn2(j.err));
  } else {
    const jw = $('jword');
    jw.textContent = word;
    jw.className = 'jword ' + cls;
    $('watchMain').textContent = elapsed === null ? '--.--' : f2(elapsed);
    $('watchTarget').textContent = '/ ' + f2(target);
    $('watchDiff').textContent = elapsed === null ? '' : sgn2(j.err);
    $('judge').classList.remove('hidden');
  }

  const fill = (s) => s.replace('{s}', target).replace('{r}', elapsed === null ? '' : Math.max(0, target - elapsed).toFixed(1));
  if (idolLine) { $('bubbleIdol').textContent = fill(idolLine); $('bubbleIdol').classList.remove('hidden'); }
  if (fanLine) { $('bubbleFan').textContent = fill(fanLine); $('bubbleFan').classList.remove('hidden'); }

  $('shake').classList.add('hidden');
  $('fan').classList.add('talking');

  G.phase = 'result';
  G.leaving = false;
  G.t = performance.now();
  updateHud();
}

// 顔はいつも笑顔。本音は顔の横のマークで出す
function idolMarks(m) {
  if (m >= 85) return '💕';
  if (m >= 65) return '';
  if (m >= 45) return '💦';
  if (m >= 25) return '💢';
  return '💢💢';
}

function showMarks(el, m) {
  const t = idolMarks(m);
  el.textContent = t;
  el.classList.toggle('hidden', !t);
}

function updateHud() {
  $('hudLeft').textContent = G.seq.length - Math.max(0, G.i) - (G.phase === 'result' ? 1 : 0);
  $('hudScore').textContent = G.score;
  $('hudCombo').textContent = G.combo;
  $('barIdol').style.width = G.idol + '%';
  $('barFan').style.width = G.fan + '%';
  showMarks($('idolMarks'), G.idol);
}

// ===== 結果 =====
function finish() {
  G.phase = 'done';
  const log = G.log;
  const perfects = log.filter((r) => r.rank === 'perfect').length;
  const earlyMiss = log.filter((r) => r.rank === 'badEarly').length;
  const totalTickets = G.seq.reduce((a, b) => a + b, 0);
  const sales = Math.round(totalTickets * YEN_PER_TICKET * (G.fan / 100) / 100) * 100;
  const newFans = Math.max(0, perfects * 3 + G.maxCombo * 2 - earlyMiss * 2);

  // ずれは秒で見る（判定の幅も秒で決めている）
  const errs = log.filter((r) => r.elapsed !== null).map((r) => r.err);
  const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
  const sd = errs.length > 1 ? Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / (errs.length - 1)) : 0;

  const best = store.get(bestKey(), 0);
  const isNew = G.score > best;
  if (isNew) store.set(bestKey(), G.score);

  $('resScore').textContent = G.score;
  $('resNew').classList.toggle('hidden', !isNew);
  $('resPerfect').textContent = perfects + '/' + log.length;
  $('resCombo').textContent = G.maxCombo;
  $('resSales').textContent = '¥' + sales.toLocaleString();
  $('resFans').textContent = '+' + newFans;
  $('resMean').textContent = sgn2(mean) + '秒';
  $('resSpread').textContent = sd.toFixed(2) + '秒';
  showMarks($('resMarks'), G.idol);
  $('resLine').textContent =
    G.idol >= 85 ? '今日の剥がしさん、最高！' :
    G.idol >= 65 ? 'おつかれさま〜' :
    G.idol >= 45 ? 'まあ、こんなもんかな' :
    G.idol >= 25 ? '……（無言で帰った）' :
    '剥がし、変えてもらえます？';

  $('resRows').innerHTML = log.map((r) =>
    '<tr><td>' + r.n + '</td><td>' + f2(r.target) + '</td><td>' +
    (r.elapsed === null ? '—' : f2(r.elapsed)) + '</td><td>' +
    (r.err === null ? '—' : sgn2(r.err)) + '</td><td class="' + r.cls + '">' + r.word + '</td></tr>'
  ).join('');

  show('result');
}

function copyLog() {
  if (!G) return;
  const head = '難易度\t' + settings.diff + '\t調整\t' + (settings.offset / 1000).toFixed(3) + '\tスコア\t' + G.score;
  const rows = G.log.map((r) => [r.n, r.target, r.elapsed === null ? '' : r.elapsed.toFixed(3), r.err === null ? '' : r.err.toFixed(3), r.word].join('\t'));
  const text = [head, '#\t目標\t押した\t差\t判定', ...rows].join('\n');
  const done = () => { $('btnCopy').textContent = 'コピーしました'; setTimeout(() => { $('btnCopy').textContent = '記録をコピー'; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* コピー不可 */ }
  ta.remove();
}

$('btnAgain').addEventListener('click', startGame);
$('btnToTitle').addEventListener('click', () => { refreshTitle(); show('title'); });
$('btnCopy').addEventListener('click', copyLog);

// ===== タイミング調整 =====
// 等速で近づく手が触れる瞬間に押してもらい、押した時刻とのずれの中央値を端末の遅れとみなす
const C_PERIOD = 1200, C_APPROACH = 1000, C_TAPS = 12, C_SKIP = 2;
let C = null;

function startCalib() {
  C = { start: performance.now() + 300, taps: [] };
  $('calibCount').textContent = '0 / ' + C_TAPS;
  $('calibResult').innerHTML = '&nbsp;';
  show('calib');
  requestAnimationFrame(calibLoop);
}

function calibLoop(now) {
  if (!C || current !== 'calib') return;
  const t = now - C.start;
  if (t >= 0) {
    const ph = t % C_PERIOD;
    const touching = ph >= C_APPROACH;
    $('calibHand').style.setProperty('--p', Math.min(1, ph / C_APPROACH));
    $('calibHand').classList.toggle('hidden', touching);
    $('calibIdolHand').classList.toggle('hidden', touching);
    $('calibShake').classList.toggle('hidden', !touching);
  }
  if (C.taps.length < C_TAPS) requestAnimationFrame(calibLoop);
}

function calibTap(ts) {
  if (!C || C.taps.length >= C_TAPS) return;
  const k = Math.round((ts - C.start - C_APPROACH) / C_PERIOD);
  if (k < 0) return;
  C.taps.push(ts - (C.start + C_APPROACH + k * C_PERIOD));
  $('calibCount').textContent = C.taps.length + ' / ' + C_TAPS;
  if (C.taps.length >= C_TAPS) {
    const d = C.taps.slice(C_SKIP).sort((a, b) => a - b);
    const mid = d.length / 2;
    const med = d.length % 2 ? d[Math.floor(mid)] : (d[mid - 1] + d[mid]) / 2;
    settings.offset = Math.round(clamp(med, -250, 250));
    saveSettings();
    $('calibResult').textContent = (settings.offset >= 0 ? '+' : '−') + Math.abs(settings.offset / 1000).toFixed(3) + '秒';
    $('calibHand').classList.add('hidden');
    $('calibShake').classList.add('hidden');
  }
}

$('calibRetry').addEventListener('click', (e) => { e.stopPropagation(); startCalib(); });
$('calibReset').addEventListener('click', (e) => {
  e.stopPropagation();
  settings.offset = 0; saveSettings();
  $('calibResult').textContent = '+0.000秒';
});
$('calibDone').addEventListener('click', (e) => { e.stopPropagation(); C = null; refreshTitle(); show('title'); });
for (const b of document.querySelectorAll('#calib button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());

// ===== 入力 =====
function press(ts) {
  if (current === 'play' && G && G.phase === 'hold') resolve(ts);
  else if (current === 'calib') calibTap(ts);
}
$('play').addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') press(eventTime(e)); });
$('calib').addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') press(eventTime(e)); });
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return;
  if (current !== 'play' && current !== 'calib') return;
  e.preventDefault();
  if (!e.repeat) press(eventTime(e));
});

refreshTitle();

