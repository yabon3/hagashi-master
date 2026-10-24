'use strict';

// ===== 設定 =====
// 判定の幅は秒数で固定。1秒でも10秒でも、ずれの大きさはほぼ同じだった（2026-09-27 の試し打ち）
const DIFFS = {
  easy:   { tol: 0.15, name: 'イージー' },
  normal: { tol: 0.10, name: 'ノーマル' },
  hard:   { tol: 0.05, name: 'ハード' },
};
const SHARE_URL = 'https://yabon3.github.io/hagashi-master/';
const REGULAR = [1, 1, 2, 2, 3, 3, 4, 4, 5]; // 並びは毎回シャッフル。合計は固定（太客と合わせて10人）
const BOSS = 10;                                             // 最後の1人（太客）
const YEN_PER_TICKET = 1000;

const T_ENTER = 900;     // 登場して券を見せる
const T_APPROACH = 1000; // 手が近づく（等速なので触れる瞬間が読める）
const T_TALK = 1600;     // 判定と台詞を見せる（ファンはその場に残る）
const T_LEAVE = 400;     // ファンが台詞ごとはけていく

// 担当アイドル。絵は Flow で生成（art/ に元画像とプロンプト）
// 性格の違いは台詞と機嫌の動き方だけ。スコアはタイミングだけで決まるので、誰で遊んでも比べられる（2026-10-23）
//   up＝ピッタリで機嫌が上がる倍率、down＝遅れで下がる倍率
//   result＝結果画面の一言（機嫌 85以上／65以上／45以上／25以上／それ未満）
// 3人とも note のシニアアイドル企画が原案（中身は50歳前後のおじさん）。（ ）の台詞は心の声＝中の人の声
const IDOLS = [
  { id: 'janako', name: 'じゃな子', color: '#5441ce', img: 'img/idol-janako.webp',
    up: 1, down: 0.5, // 気さくで紳士。遅れに寛容（原案：山本蛇内さん・歯笛アイドル・ジャージ・🐍）
    lines: {
      perfect: ['ありがとだYO！', '歯笛で祝うね♪', 'また会おうぞ、卿！'],
      goodLate: ['（ま、いっか〜）', '（歯笛の練習しとこ）'],
      badLate: ['おーい、剥がしさん？', '長いわ、蛇みたいに', '（中の山本が出そう）'],
      timeout: ['ファゴォォォーッ！', '（歯笛で抗議中）'],
      result: ['最高のチームワークだYO！', 'おつかれっす！', 'まあまあかな〜', 'もうちょい気合い！', '……（歯笛がかすれた）'],
    } },
  { id: 'kanmi', name: '寒美', color: '#6b80f2', img: 'img/idol-kanmi.webp',
    up: 0.5, down: 0.5, // クールで動じない（原案：コーサクさん・氷川寒美・寒いダジャレ・🏉・好物はらい丼）
    lines: {
      perfect: ['握手…あ、くしゅん！', 'アリが10匹〜！', '凍えるほど応援してね'],
      goodLate: ['（秒がびょーんと…）', '（シーン……）'],
      badLate: ['剥がしさん、はがゆい！', '長すぎ…ナガスクジラ', '（場が凍りついた）'],
      timeout: ['苦情はハガキで出す！', '（らい丼、冷めちゃう）'],
      result: ['凍えるほど、ありがとう！', 'おつかれサマー…冬だけど', 'まあまあ…マーマレード', '……（ダジャレも出ない）', 'あなたとは、もう氷河期'],
    } },
  { id: 'shibakoma', name: 'しばこま', color: '#e6b000', img: 'img/idol-shibakoma.webp',
    up: 1.5, down: 1.5, // 犬らしく一喜一憂（原案：しばこま・愛犬がモチーフ・妄想族の五十男）
    lines: {
      perfect: ['わん！ありがと〜！', '採点甘めで100点！', '（推しの気分…！）'],
      goodLate: ['（くぅ〜ん）', '（妄想に出張してた）'],
      badLate: ['わぅ…剥がして〜', 'う〜…まだ？', '（しっぽが下がった）'],
      timeout: ['ワン！ワン！！', '（素の五十男が出た）'],
      result: ['今日の剥がしさん、だいすき！', 'おつかれさまわん！', 'まあいいわ、及第点', '……（有給、返して）', 'がるる……'],
    } },
];

const FAN_FACES = ['🧑', '👨', '👩', '🧔', '👱', '🧓', '👴', '👦', '👧', '👵'];
const BOSS_FACE = '🤵';

// ファンの台詞（アイドルの台詞は IDOLS の lines）
const LINES = {
  perfectFan:  ['最高の{s}秒でした…', '一生の思い出です', 'また来ます！！', '神対応…'],
  goodEarly:   ['あれ、もう？', 'もうちょっとだけ…'],
  badEarly:    ['えっ、まだ{r}秒あるんだけど！？', '券、返して！', '運営に言うからな！'],
};

// ===== 保存（使えなくても動く） =====
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても続行 */ } },
};
// BGM・効果音は切った状態で始め、本人が入れたら保存する（2026-10-24）。
// 最初の版（bgm / sfx）は入れたつもりがなくても true が保存されていたので、名前を変えて捨てる
const settings = Object.assign({ diff: 'easy', showWatch: true, offset: 0, idol: 'janako', bgmOn: false, sfxOn: false }, store.get('hagashi.settings', {}));
delete settings.bgm; delete settings.sfx;
Sound.set('bgm', settings.bgmOn);
Sound.set('sfx', settings.sfxOn);
const curIdol = () => IDOLS.find((d) => d.id === settings.idol) || IDOLS[0];
const saveSettings = () => store.set('hagashi.settings', settings);
// ハイスコアは難易度×時計あり／なしで分ける（2026-10-23。人と比べるとき、時計ありが勝ってしまうため）。
// 分ける前の記録は時計ありのキーに残す（当時の既定は時計あり）
const bestKey = () => 'hagashi.best.' + settings.diff + (settings.showWatch ? '' : '.nowatch');
const condLabel = () => DIFFS[settings.diff].name + '・時計' + (settings.showWatch ? 'あり' : 'なし');

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
  // BGM はタイトルとアイドル選択と結果だけ（結果は finish でジングルのあとに始める）
  if (id === 'title' || id === 'select') Sound.bgmStart();
  else if (id !== 'result') Sound.bgmStop();
}
let current = 'title';

// ===== タイトル =====
function refreshTitle() {
  for (const b of $('segDiff').children) b.classList.toggle('on', b.dataset.v === settings.diff);
  for (const b of $('segWatch').children) b.classList.toggle('on', (b.dataset.v === '1') === settings.showWatch);
  $('offsetLabel').textContent = (settings.offset >= 0 ? '+' : '−') + Math.abs(settings.offset / 1000).toFixed(3) + '秒';
  $('bestLabel').textContent = store.get(bestKey(), 0);
  $('btnBgm').classList.toggle('mute', !settings.bgmOn);
  $('btnSfx').classList.toggle('mute', !settings.sfxOn);
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
$('btnBgm').addEventListener('click', () => {
  settings.bgmOn = !settings.bgmOn; saveSettings(); refreshTitle();
  Sound.set('bgm', settings.bgmOn);
  if (settings.bgmOn) Sound.bgmStart();
});
$('btnSfx').addEventListener('click', () => {
  settings.sfxOn = !settings.sfxOn; saveSettings(); refreshTitle();
  Sound.set('sfx', settings.sfxOn);
});

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
  Sound.play('enter');
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
      G.tick = 0;
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
    if (settings.showWatch) {
      drawClock(Math.max(0, (now - G.t0 - settings.offset) / 1000));
      // 針が12時を通る時刻に鳴らす。1コマ遅れないよう、少し前に予約する
      const next = G.t0 + settings.offset + (G.tick + 1) * 1000;
      if (next - now < 80) { Sound.play('tick', { at: next }); G.tick++; }
    }
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
  const combo0 = G.combo, marks0 = idolMarks(G.idol);
  let elapsed = null, j;

  if (pressTime === null) {
    j = { rank: 'timeout', err: null };
  } else {
    elapsed = (pressTime - G.t0 - settings.offset) / 1000;
    j = judge(target, elapsed);
  }

  let pts = 0, word, cls, idolLine = null, fanLine = null;
  const d = curIdol();
  const up = (v) => Math.round(v * d.up), down = (v) => Math.round(v * d.down);
  switch (j.rank) {
    case 'perfect':
      pts = (100 + Math.round(50 * (1 - Math.abs(j.err) / j.tol)) + G.combo * 10) * mult;
      G.combo++;
      G.idol += up(6); G.fan += 6;
      word = 'ピッタリ！'; cls = 'perfect';
      if (Math.random() < 0.5) fanLine = pick(LINES.perfectFan); else idolLine = pick(d.lines.perfect);
      break;
    case 'goodEarly':
      pts = 40 * mult; G.combo = 0; G.fan -= 5;
      word = 'ちょい早'; cls = 'early'; fanLine = pick(LINES.goodEarly);
      break;
    case 'goodLate':
      pts = 40 * mult; G.combo = 0; G.idol -= down(5);
      word = 'ちょい遅'; cls = 'late'; idolLine = pick(d.lines.goodLate);
      break;
    case 'badEarly':
      G.combo = 0; G.fan -= 15 * mult;
      word = '早すぎ！'; cls = 'early'; fanLine = pick(LINES.badEarly);
      break;
    case 'badLate':
      G.combo = 0; G.idol -= down(15 * mult);
      word = '遅すぎ！'; cls = 'late'; idolLine = pick(d.lines.badLate);
      break;
    case 'timeout':
      G.combo = 0; G.idol -= down(25 * mult);
      word = '剥がして！'; cls = 'late'; idolLine = pick(d.lines.timeout);
      break;
  }
  G.idol = clamp(G.idol, 0, 100);
  G.fan = clamp(G.fan, 0, 100);
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  G.score += pts;
  G.log.push({ n: G.i + 1, target, elapsed, err: j.err, rank: j.rank, word, cls });

  // 音：押した音 → 判定 → 本音が変わったら少し遅れて
  if (pressTime !== null) Sound.play('press');
  if (j.rank === 'perfect') Sound.play('perfect', { delay: 0.04, up: Math.min(combo0, 12) }); // 連続で半音ずつ上がる
  else Sound.play({ goodEarly: 'good', goodLate: 'good', badEarly: 'bad', badLate: 'bad', timeout: 'timeout' }[j.rank], { delay: 0.04 });
  const marks1 = idolMarks(G.idol);
  if (MARK_ORDER.indexOf(marks1) > MARK_ORDER.indexOf(marks0)) Sound.play('angry', { delay: 0.35 });
  else if (marks1 === '💕' && marks0 !== '💕') Sound.play('love', { delay: 0.35 });

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
const MARK_ORDER = ['💕', '', '💦', '💢', '💢💢']; // 良い順
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

  G.res = { perfects, n: log.length, mean };
  const best = store.get(bestKey(), 0);
  const isNew = G.score > best;
  if (isNew) store.set(bestKey(), G.score);

  $('resScore').textContent = G.score;
  $('resCond').textContent = condLabel();
  $('resNew').classList.toggle('hidden', !isNew);
  $('resPerfect').textContent = perfects + '/' + log.length;
  $('resCombo').textContent = G.maxCombo;
  $('resSales').textContent = '¥' + sales.toLocaleString();
  $('resFans').textContent = '+' + newFans;
  $('resMean').textContent = sgn2(mean) + '秒';
  $('resSpread').textContent = sd.toFixed(2) + '秒';
  showMarks($('resMarks'), G.idol);
  $('resLine').textContent = curIdol().lines.result[G.idol >= 85 ? 0 : G.idol >= 65 ? 1 : G.idol >= 45 ? 2 : G.idol >= 25 ? 3 : 4];

  $('resRows').innerHTML = log.map((r) =>
    '<tr><td>' + r.n + '</td><td>' + f2(r.target) + '</td><td>' +
    (r.elapsed === null ? '—' : f2(r.elapsed)) + '</td><td>' +
    (r.err === null ? '—' : sgn2(r.err)) + '</td><td class="' + r.cls + '">' + r.word + '</td></tr>'
  ).join('');

  show('result');
  Sound.play('finish');
  if (isNew) Sound.play('best', { delay: 1.3 });
  Sound.bgmStart(2.6);
}

function copyLog() {
  if (!G) return;
  const head = '難易度\t' + settings.diff + '\t時計\t' + (settings.showWatch ? 'あり' : 'なし') + '\t調整\t' + (settings.offset / 1000).toFixed(3) + '\tスコア\t' + G.score;
  const rows = G.log.map((r) => [r.n, r.target, r.elapsed === null ? '' : r.elapsed.toFixed(3), r.err === null ? '' : r.err.toFixed(3), r.word].join('\t'));
  const text = [head, '#\t目標\t押した\t差\t判定', ...rows].join('\n');
  const done = () => flashCopied($('btnCopy'));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
// 結果をシェア：スマホなら共有の画面（LINE・X など）、出せなければ文章をコピーする
function shareResult() {
  if (!G || !G.res) return;
  const r = G.res;
  const text = 'はがしの達人で ' + G.score + '点！（' + condLabel() + '）\n' +
    'ピッタリ ' + r.perfects + '/' + r.n + '・平均のずれ ' + sgn2(r.mean) + '秒\n' +
    '担当：' + curIdol().name + '\n#はがしの達人';
  const done = () => flashCopied($('btnShare'));
  if (navigator.share) {
    navigator.share({ text, url: SHARE_URL }).catch(() => { /* 閉じただけ */ });
    return;
  }
  const all = text + '\n' + SHARE_URL;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(all).then(done, () => fallbackCopy(all, done));
  } else fallbackCopy(all, done);
}
// ボタンの中身（アイコン）を一瞬「コピーしました」に替えて戻す
function flashCopied(b) {
  if (b.dataset.icon) return;
  b.dataset.icon = b.innerHTML;
  b.textContent = 'コピーしました';
  setTimeout(() => { b.innerHTML = b.dataset.icon; delete b.dataset.icon; }, 1500);
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
$('btnShare').addEventListener('click', shareResult);

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

// ブラウザは画面に触れるまで音を出させない。触れたら音を起こし、タイトルなら BGM を始める
// （BGM のアイコンを押したときは、そのボタンの処理に任せる。切るつもりの BGM が一瞬鳴るのを避ける）
for (const type of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(type, (e) => {
    Sound.unlock();
    if ((current === 'title' || current === 'select') && !(e.target.closest && e.target.closest('#btnBgm'))) Sound.bgmStart();
  }, true);
}
// 画面のボタンを押した音（効果音を切った直後のアイコンは、もう鳴らない）
document.addEventListener('click', (e) => { if (e.target.closest('button')) Sound.play('ui'); });

refreshTitle();

