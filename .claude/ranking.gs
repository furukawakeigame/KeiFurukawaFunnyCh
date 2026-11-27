// ゲームのランキング（今日・全期間）を保存・返す Google Apps Script（無料）。
// スコアはこのスクリプトを入れたスプレッドシートの「scores」シートに1行ずつたまる。
// 変な名前やズルの記録は、シートの行を消せば消える。
// 同じ人がまた送ってくるときは「ban」シートの A 列に、その名前か端末（scores の dev 列）を書く。
// 同じ端末（dev）の記録は一番良いものだけ載せ、名前はその端末で最後に登録した名前で表示する。
//
// 設定手順（最初の1回だけ）:
//   1. Google ドライブで新しいスプレッドシートを作る（名前は何でもよい。例: ゲームランキング）
//   2. メニューの「拡張機能」→「Apps Script」を開き、このファイルの中身を全部貼って保存
//   3. 右上の「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
//      実行するユーザー: 自分 ／ アクセスできるユーザー: 全員 → 「デプロイ」→ 権限を承認
//   4. 表示された「ウェブアプリの URL」（https://script.google.com/macros/s/.../exec）を、
//      ゲームの index.html の RANK_URL に入れる
//   コードを書き換えたときは「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」で更新する（URLは変わらない）。
//
// ズル対策（数字を書き換えて送るだけの偽装を通さない）:
//   ・ゲームを始めた時に整理券（start）をもらい、ウェーブをクリアするたびにサーバーへ知らせる（wave）。
//   ・サーバーは「本当にその時間がたったか」「ウェーブが1つずつ進んだか」「倒した数がウェーブの敵の数と合うか」を確かめる。
//     ゲームの時間は実際の時間より速く進まないので、正直に遊んだ人が弾かれることはない。
//   ・整理券は1回だけ使える。ウェーブ150より上、1日3000件より多い登録は受け付けない。
//
// 距離で競うゲーム（どこまで車輪: wheel-road / wheel-road-2p）のズル対策:
//   ・走る道の種（seed）は start でサーバーが決めて渡す（走りやすい道を選べない）。
//   ・最初の操作で go を送り、そこから100m進むたびに cp を送る。サーバーは
//     「100mを最高速度（18m/s）より速く進んでいないか」「go からの本当の時間で、平均15m/sより速く進んでいないか」を確かめる。
//   ・最後の submit の距離は、最後に届いた cp の距離から次の cp の手前まで。整理券は1回だけ。
//   ・ゲームのプログラム自体を改造して本当に走らせるズルまでは防げない（見つけたら行を消す・ban に書く）。
//   ・2人用は name と name2 を「名前1&名前2」で保存し、端末は2人分を合わせたものを1組として扱う。
//   ・通信が切れて送り直した go / cp / submit は、2回目もはじかずに同じ答えを返す。
//
// 回数で競うゲーム（リフティング: lifting）のズル対策（数字だけでなく、プレイそのものを確かめる）:
//   ・遊ぶ前（ページを開いた時・もう一度の時）に整理券（start）をもらう。届くのを待たずに遊び始めてよい。
//   ・登録（submit）では、乱数の種と「指の動きの記録」（刻み・足・押しているか・位置 mm）を送ってもらい、
//     このファイルの下にある LiftCore（games/lifting/core.js の写し）で最初から再生する。
//     再生した回数と、落とした刻みが、送られてきたものとぴったり同じでなければ受け付けない。
//   ・ゲーム内の時間が、整理券を出してからの本当の時間（+60秒）より長くないこと（早送りした記録ははじく）。
//   ・同じ記録（種と指の動きが同じもの）は1回しか登録できない（記録の指紋を scores の9列目に残す）。
//   ・ほぼ必ず登録できるように（作者の判断）: 再生が合わない・整理券がない・時間が合わない記録も、
//     回数がありえる範囲（1回あたり0.3秒以上）なら登録して、scores の10列目に「未確認（理由）」と書く。
//     怪しい行は10列目を見て消す。ありえない回数・壊れた記録・二重登録・NGワード・ban だけははじく。
//   ・check は登録せずに再生だけする（ゲームとサーバーの計算が合っているかを確かめる用）。
//     本当に遊ぶプログラム（ボット）までは防げない（見つけたら行を消す・ban に書く）。
//   ・core.js を書き換えたら、このファイルの写しも同じに直して、デプロイし直す。
//
// プレイを再生して確かめるゲーム（SIM: 紙飛行機 paper-plane・三重振り子ゴルフ pendulum-golf・コーラ振り子 cola-pendulum）:
//   ・遊ぶ前（ページを開いた時・もう一度の時）に整理券（start）をもらう。
//   ・登録（submit）では、そのゲームの操作の記録を送ってもらい、このファイルの下にある各ゲームの core.js の写し
//     （PlaneCore / GolfCore / ColaCore）で最初から再生して、送られてきた記録と合うかを確かめる。
//       紙飛行機: 引っぱった量と、押す／離すが変わった刻み（1/240秒）。距離 0.2m・着地の刻み ±2 まで許す
//                 （Math.sin などの端末ごとの差は 1mm にもならない）
//       ゴルフ: 指の動き（刻み 1/480秒・押しているか・位置 mm）。ぴったり合うこと（計算は + − × ÷ と √ だけ）
//       コーラ: 手を離した瞬間の振り子の形と、ずらした量。そこから5秒を再生して、高さが ±1m で合うこと
//   ・合わない記録・整理券がない記録・時間が合わない記録も、ありえる範囲（SIM の maxScore 以下など）なら
//     登録して、scores の10列目に「未確認（理由）」と書く（リフティングと同じ考え方）。
//   ・同じ記録は1回しか登録できない（記録の指紋を scores の9列目に残す）。
//   ・core.js を書き換えたら、このファイルの写しも同じに直して、デプロイし直す。
//
// GET  ?game=<フォルダ名>                         → { today: [{ name, wave, kills }], all: [...] }   （距離のゲームは wave が距離 m）
// POST {act:'start', game, dev}                    → { ok, tok }
// POST {act:'wave', tok, wave, kills}              → { ok }        （wave = クリアしたウェーブ）
// POST {act:'submit', tok, name, wave, kills, sec, dev} → { ok, rank: { today, all }, today, all } または { ok: false, error }
//      ブラウザからは Content-Type: text/plain で送る（事前確認の通信を起こさないため）
//      同じ端末（dev）の記録は、一番良いものだけがランキングに載る
// 距離のゲーム:
// POST {act:'start', game, dev}                    → { ok, tok, seed }
// POST {act:'go', tok}                             → { ok }        （最初の操作をした時）
// POST {act:'cp', tok, n, sec}                     → { ok }        （n×100m に着いた。sec は go からの秒数）
// POST {act:'submit', tok, name, name2?, dev2?, dist, sec, dev} → 上と同じ
// 回数のゲーム（再生で確かめる）:
// POST {act:'start', game, dev}                    → { ok, tok }
// POST {act:'submit', game, tok, name, dev, seed, score, steps, log} → 上と同じ（wave に回数が入る。tok はなくてもよい）
//      うまくいかない時の error: 'replay'（ありえない回数） / 'dup'（同じ記録） / 'bad'（記録が壊れている）
// POST {act:'check', game:'lifting', seed, steps, log} → { ok, score, steps, failed }（登録しない。再生の確認用）
// 飛んだ距離のゲーム（再生で確かめる）:
// POST {act:'start', game, dev}                    → { ok, tok }
// 再生で確かめるゲーム（SIM）:
// POST {act:'start', game, dev}                    → { ok, tok }
// POST {act:'submit', game, tok, name, dev, score, ...記録} → 上と同じ（wave に距離・高さ m が入る。tok はなくてもよい）
//      紙飛行機: dist（score の代わり）, ix, iy（引っぱった量。画面の px の10倍の整数）, steps, tog（押す／離すが変わった刻みの番号）
//      ゴルフ:   steps, log（[刻み, 押しているか, x mm, y mm, ...]）
//      コーラ:   p, q（手を離した瞬間の4点 [[x, y], ...] と、その1刻み前）, jit（横にずらした量 ×4）
// POST {act:'check', game, ...記録}                → { ok, score, steps, done }（登録しない）

const SHEET = 'scores', BAN = 'ban';
const TOP_N = 10, MAX_WAVE = 150, DAY_CAP = 3000;
const GAMES = ['slingshot-wave', 'wheel-road', 'wheel-road-2p', 'lifting', 'paper-plane', 'pendulum-golf', 'cola-pendulum']; // ランキングを受け付けるゲーム（フォルダ名）
// 回数で競うゲーム: プレイを再生して確かめる。maxSteps 1回の長さの上限（1/120秒の刻み）
const REPLAY = {
  'lifting': { maxSteps: 120 * 3600 * 3 },
};
// 再生で確かめるゲーム。どれも作者のシミュレーションで調べた値より、かなり余裕を持たせてある
//   maxScore 記録の上限（これより上は未確認でも登録しない） / round 記録の丸め（10 = 0.1m 単位）
//   read(b) 送られてきた記録の形を確かめる（おかしければ null） / run(L) 再生 → { score, steps, done }（飛ばせない記録なら null）
//   same(r, L, score) 再生と合っているか / fast(score, L) ありえない速さ / sec(L) ゲームの中でたった秒数
//   minSec 整理券からこれより早い登録は「time」 / key(L) 記録の指紋の元
const isInt = v => Number.isInteger(v);
const isNum = v => typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e3;
const SIM = {
  // 紙飛行機（うまく飛ばしても 160m・平均 10m/s ほど）
  'paper-plane': {
    maxScore: 400, round: 10,
    read: b => {
      const ix = Number(b.ix), iy = Number(b.iy), steps = Number(b.steps), tog = b.tog;
      if (!(isInt(ix) && isInt(iy) && isInt(steps) && steps > 0 && steps <= 240 * 600)) return null;
      if (!Array.isArray(tog) || tog.length > steps) return null;
      for (let i = 0; i < tog.length; i++) if (!isInt(tog[i]) || tog[i] < 0 || tog[i] >= steps || (i && tog[i] <= tog[i - 1])) return null;
      return { ix, iy, steps, tog };
    },
    run: L => { const C = PlaneCore(); if (!C.pullOk(L.ix, L.iy)) return null; const r = C.replay(L.ix, L.iy, L.tog, 240 * 600); return { score: r.dist, steps: r.steps, done: r.landed }; },
    same: (r, L, sc) => r.done && Math.abs(r.steps - L.steps) <= 2 && Math.abs(r.score - sc) <= 0.2,
    fast: (sc, L) => sc > 25 * L.steps / 240 + 5,
    sec: L => L.steps / 240,
    key: L => L.ix + ':' + L.iy + ':' + JSON.stringify(L.tog),
  },
  // 三重振り子ゴルフ（ランダムに振って 3000 回で最高 76m ほど）
  'pendulum-golf': {
    maxScore: 500, round: 10,
    read: b => {
      const steps = Number(b.steps), log = b.log;
      if (!(isInt(steps) && steps > 0 && steps <= 480 * 600)) return null;
      if (!Array.isArray(log) || log.length % 4 !== 0 || log.length > steps * 8 + 64) return null;
      for (let i = 0; i < log.length; i++) if (!isInt(log[i]) || Math.abs(log[i]) > 1e6) return null;
      for (let i = 0; i < log.length; i += 4) if (log[i] < 0 || log[i] >= steps || (i && log[i] < log[i - 4])) return null;
      return { steps, log };
    },
    run: L => { const r = GolfCore().replay(L.log, 480 * 600); return { score: r.score, steps: r.steps, done: r.done }; },
    same: (r, L, sc) => r.done && r.steps === L.steps && Math.abs(Math.round(r.score * 10) / 10 - sc) < 1e-6,
    fast: () => false,
    sec: L => L.steps / 480,
    key: L => JSON.stringify(L.log),
  },
  // コーラ振り子（上限なし。いろいろな形で振って 400 回で最高 10億m ほど）
  'cola-pendulum': {
    maxScore: 1e12, round: 1, minSec: 5,
    read: b => {
      const pts = v => Array.isArray(v) && v.length === 4 && v.every(x => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]) && x[1] >= -0.01) ? v : null;
      const p = pts(b.p), q = pts(b.q), jit = b.jit;
      if (!p || !q || !Array.isArray(jit) || jit.length !== 4 || !jit.every(v => isNum(v) && Math.abs(v) <= 5e-5)) return null;
      // 棒の長さが合っていること・ほぼ止まった状態から振り始めること
      const C = ColaCore(), L = C.LEN;
      for (const v of [p, q]) {
        let a = C.PIV;
        for (let k = 0; k < 4; k++) { const dx = v[k][0] - a[0], dy = v[k][1] - a[1]; if (Math.abs(Math.sqrt(dx * dx + dy * dy) - L[k]) > 1e-6) return null; a = v[k]; }
      }
      for (let k = 0; k < 4; k++) if (Math.abs(p[k][0] - q[k][0]) > 1e-3 || Math.abs(p[k][1] - q[k][1]) > 1e-3) return null;
      return { p, q, jit, steps: 4800 };
    },
    run: L => { const r = ColaCore().replay(L.p, L.q, L.jit); return { score: r.score, steps: r.steps, done: true }; },
    same: (r, L, sc) => Math.abs(r.score - sc) <= 1,
    fast: () => false,
    sec: () => 5,
    key: L => JSON.stringify([L.p, L.q, L.jit]),
  },
};
// 距離で競うゲーム: cp 何mごとに知らせるか / vmax 平均速度の上限 / top 一瞬の最高速度 / max 距離の上限 / duo 2人用
const DIST = {
  'wheel-road': { cp: 100, vmax: 15, top: 18, max: 100000 },
  'wheel-road-2p': { cp: 100, vmax: 15, top: 18, max: 100000, duo: true },
};
const NG = [ // 名前に使えない言葉（ひらがな・小文字にそろえてから、含まれているかを見る）
  'しね', 'ころす', 'ころせ', 'きちがい', 'がいじ', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ', 'せっくす', 'れいぷ', 'ばいた', 'くそ',
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'nigg', 'fag', 'rape', 'sex', 'porn', 'kill',
  '씨발', '병신', '좆', 'ควย', 'เหี้ย', 'สัส',
  'http', 'www', '.com', '.jp', '.net',
];

// ---- ゲームのルール（index.html の startWave / spawnInterval と同じ計算） ----
const RULES = {
  'slingshot-wave': {
    count: w => 6 + Math.floor(Math.min(w, 25) * 1.8 + Math.max(0, w - 25) * 0.5) + (w % 5 === 0 ? Math.floor(w / 10) + 1 : 0),
    interval: w => Math.max(0.18, 1.3 - w * 0.05),
  },
};
function totalEnemies(R, w) { let n = 0; for (let i = 1; i <= w; i++) n += R.count(i); return n; }
// そのウェーブをクリアするのに最低かかる秒数（敵が出そろうまでの時間の45%）。
// 最初のウェーブは、GAS の起動待ちで整理券の時刻がずれることがあるので見ない
const minWaveSec = (R, w) => w === 1 ? 0 : Math.max(3, (R.count(w) - 1) * R.interval(w) * 0.45);
// 倒した数として、ありえる範囲（石垣に着いた敵は倒した数に入らないので、下は少し甘く）
const killsOk = (R, cleared, upto, kills) => kills >= totalEnemies(R, cleared) * 0.75 - 30 && kills <= totalEnemies(R, upto) * 2.2 + 10;

function sheetOf(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (header) sh.appendRow(header); }
  return sh;
}
const sheet = () => sheetOf(SHEET, ['time', 'date', 'game', 'name', 'wave', 'kills', 'sec', 'dev']);
const today = () => Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const cache = () => CacheService.getScriptCache();

function banned() {
  const hit = cache().get('ban');
  if (hit) return new Set(JSON.parse(hit));
  const sh = sheetOf(BAN, null), last = sh.getLastRow();
  const list = last ? sh.getRange(1, 1, last, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean) : [];
  cache().put('ban', JSON.stringify(list), 60);
  return new Set(list);
}

// 記録を読む（todayOnly なら今日の分だけ。新しい行ほど下にあるので、今日の分は下から5000行だけ見る）
function readRows(game, todayOnly) {
  const sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  const n = todayOnly ? Math.min(5000, last - 1) : last - 1;
  const d = today(), ban = banned();
  return sh.getRange(last - n + 1, 1, n, 8).getValues()
    .filter(r => r[2] === game && (!todayOnly || (r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[1])) === d))
    .map(r => ({ t: new Date(r[0]).getTime(), name: String(r[3]), wave: Number(r[4]), kills: Number(r[5]), dev: String(r[7]) }))
    .filter(r => !ban.has(r.name) && !ban.has(r.dev));
}
const better = (a, b) => b.wave - a.wave || b.kills - a.kills || a.t - b.t;
// 同じ端末の記録は一番良いものだけ（1人でトップ10を埋めないように）。
// 名前は、その端末で最後に登録した名前にそろえる（名前を変えたら、前の記録の名前も変わって見える）
function bestPerDev(rows) {
  const best = {}, last = {};
  for (const r of rows) {
    const k = r.dev || ('row' + r.t);
    if (!best[k] || better(r, best[k]) < 0) best[k] = r;
    if (!last[k] || r.t > last[k].t) last[k] = r;
  }
  return Object.keys(best).map(k => Object.assign({}, best[k], { name: last[k].name })).sort(better);
}
const pub = list => list.slice(0, TOP_N).map(({ name, wave, kills }) => ({ name, wave, kills }));
function tops(game) {
  const key = 'tops:' + game + ':' + today(), hit = cache().get(key);
  if (hit) return JSON.parse(hit);
  const o = { today: pub(bestPerDev(readRows(game, true))), all: pub(bestPerDev(readRows(game, false))) };
  cache().put(key, JSON.stringify(o), 60);
  return o;
}

function doGet(e) {
  const game = String(e.parameter.game || '');
  if (!GAMES.includes(game)) return json({ today: [], all: [] });
  return json(tops(game));
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 8);
}
function badName(name) {
  const flat = name.toLowerCase().replace(/[\s._\-・ー~〜!！?？*＊]/g, '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); // カタカナ → ひらがな
  return NG.some(w => flat.includes(w.replace(/[.\-]/g, '')) || name.toLowerCase().includes(w));
}
// 回数の上限（key ごとに sec 秒の間に max 回まで）
function limited(key, max, sec) {
  const c = cache(), n = Number(c.get(key) || 0);
  if (n >= max) return true;
  c.put(key, String(n + 1), sec);
  return false;
}
const getSess = tok => { const s = /^[0-9a-f-]{36}$/.test(tok) && cache().get('s:' + tok); return s ? JSON.parse(s) : null; };
const putSess = (tok, s) => cache().put('s:' + tok, JSON.stringify(s), 21600); // 6時間

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad' }); }
  const act = String(b.act || ''), now = Date.now();
  // 整理券（start）と再生の確認（check）は、キャッシュに書くだけなので順番待ち（ロック）をしない。
  // ロックで並ばせると、遊ぶたびに来る start が登録の後ろで待たされ、
  // 「同時に動くスクリプトが多すぎる」「ロックの待ち時間切れ」で失敗していた。
  if (act === 'check' || act === 'start') return startOrCheck(act, b, now);
  // 回数のゲームの登録: 重い再生は、ロックの外で先に済ませる
  let pre = null;
  if (act === 'submit' && SIM[String(b.game)]) pre = preSim(b);
  if (act === 'submit' && (REPLAY[String(b.game)] || (getSess(String(b.tok || '')) || {}).game in REPLAY)) pre = preReplay(b);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json({ ok: false, error: 'wait' }); // 待ちきれない時は、エラー画面ではなく「もう一度」
  try {
    const tok = String(b.tok || ''), s = getSess(tok);
    // 距離のゲーム: 通信が切れて同じ登録が2回届いたら、1回目の結果を返す
    if (s && s.used && s.res && act === 'submit') return json(s.res);
    // 再生で確かめるゲーム: 整理券がない・使用済みでも、登録は受け付ける（未確認として）
    if (act === 'submit' && SIM[String(b.game)]) return simAct(b, s && !s.used && s.game === String(b.game) ? s : null, tok, now, pre, lock);
    // 回数のゲーム: 整理券がない・使用済みでも、登録は受け付ける（未確認として）
    if (act === 'submit' && REPLAY[String(b.game)] && (!s || s.used || s.game !== String(b.game))) return replayAct(act, b, null, tok, now, pre, lock);
    if (!s || s.used) return json({ ok: false, error: 'bad' });
    if (DIST[s.game]) return distAct(act, b, s, tok, now);
    if (REPLAY[s.game]) return replayAct(act, b, s, tok, now, pre, lock);
    if (SIM[s.game]) return json({ ok: false, error: 'bad' });
    return waveAct(act, b, s, tok, now);
  } finally { lock.releaseLock(); }
}

function startOrCheck(act, b, now) {
  {
    if (act === 'check' && SIM[String(b.game)]) { // 再生で確かめるゲーム: 登録せずに再生だけする
      if (limited('chk:' + Math.floor(now / 60000), 30, 70)) return json({ ok: false, error: 'wait' });
      const r = preSim(b);
      return json(r ? { ok: true, score: r.score, steps: r.steps, done: r.done } : { ok: false, error: 'bad' });
    }
    if (act === 'check') { // 登録せずに再生だけする（確認用）
      if (!REPLAY[String(b.game)] || limited('chk:' + Math.floor(now / 60000), 30, 70)) return json({ ok: false, error: 'wait' });
      const log = b.log, steps = Math.floor(Number(b.steps));
      if (!Array.isArray(log) || !(steps > 0 && steps <= REPLAY[String(b.game)].maxSteps)) return json({ ok: false, error: 'bad' });
      const r = liftReplay(Math.floor(Number(b.seed)) | 0, log, steps);
      return json({ ok: true, score: r.score, steps: r.steps, failed: r.failed });
    }
    if (act === 'start') {
      const game = String(b.game || ''), dev = String(b.dev || '').slice(0, 40);
      if (!GAMES.includes(game)) return json({ ok: false, error: 'bad' });
      if (limited('st:' + dev, DIST[game] || REPLAY[game] || SIM[game] ? 40 : 10, 60) || limited('stmin:' + Math.floor(now / 60000), 400, 70)) return json({ ok: false, error: 'wait' });
      const tok = Utilities.getUuid();
      if (REPLAY[game] || SIM[game]) {
        putSess(tok, { game, dev, issued: now, used: false });
        return json({ ok: true, tok });
      }
      if (DIST[game]) {
        const seed = Math.floor(Math.random() * 1e9);
        putSess(tok, { game, dev, seed, issued: now, go: 0, cp: 0, ct: 0, used: false });
        return json({ ok: true, tok, seed });
      }
      putSess(tok, { game, dev, t0: now, last: now, wave: 0, kills: 0, used: false });
      return json({ ok: true, tok });
    }
  }
}

// ウェーブのゲーム（最強パチンコなど）
function waveAct(act, b, s, tok, now) {
  {
    const R = RULES[s.game];
    const wave = Math.floor(Number(b.wave)), kills = Math.floor(Number(b.kills));
    if (act === 'wave') {
      // ウェーブは1つずつ。前のクリアから、本当にそのウェーブの分の時間がたっていること
      if (wave !== s.wave + 1 || wave > MAX_WAVE) return json({ ok: false, error: 'bad' });
      // 通信の遅れのぶん2秒は甘くする。合わなければ、この整理券はもう使えない
      if ((now - s.last) / 1000 < minWaveSec(R, wave) - 2) { s.used = true; putSess(tok, s); return json({ ok: false, error: 'bad' }); }
      if (!(kills >= s.kills && killsOk(R, wave, wave, kills))) { s.used = true; putSess(tok, s); return json({ ok: false, error: 'bad' }); }
      s.wave = wave; s.kills = kills; s.last = now; putSess(tok, s);
      return json({ ok: true });
    }
    if (act !== 'submit') return json({ ok: false, error: 'bad' });
    const name = cleanName(b.name), dev = String(b.dev || '').slice(0, 40), sec = Math.floor(Number(b.sec));
    if (!name) return json({ ok: false, error: 'name' });
    if (badName(name)) return json({ ok: false, error: 'ng' });
    const ban = banned();
    if (ban.has(name) || ban.has(dev) || ban.has(s.dev)) return json({ ok: false, error: 'bad' });
    // 最後のウェーブ（倒れたウェーブ）は、クリア済みのウェーブ + 1
    if (wave !== s.wave + 1 || wave > MAX_WAVE || dev !== s.dev) return json({ ok: false, error: 'bad' });
    if (!(kills >= s.kills && killsOk(R, wave - 1, wave, kills) && sec >= 0 && sec <= (now - s.t0) / 1000 + 5)) return json({ ok: false, error: 'bad' });
    if (limited('dev:' + dev, 1, 20)) return json({ ok: false, error: 'wait' });
    if (limited('min:' + Math.floor(now / 60000), 60, 70) || limited('day:' + today(), DAY_CAP, 90000)) return json({ ok: false, error: 'wait' });
    s.used = true; putSess(tok, s);
    const game = s.game, t = new Date(now);
    // 先頭の ' で文字として保存する（日付への変換や、= で始まる名前が数式になるのを防ぐ）
    sheet().appendRow([t, "'" + today(), game, "'" + name, wave, kills, sec, "'" + dev]);
    // 順位: ほかの人（端末）の一番良い記録のうち、この記録より上のものの数 + 1
    const rankIn = rows => bestPerDev(rows).filter(r => r.dev !== dev && better(r, { wave, kills, t: now }) < 0).length + 1;
    const todayRows = readRows(game, true), allRows = readRows(game, false);
    const o = { today: pub(bestPerDev(todayRows)), all: pub(bestPerDev(allRows)) };
    cache().put('tops:' + game + ':' + today(), JSON.stringify(o), 60);
    return json({ ok: true, rank: { today: rankIn(todayRows), all: rankIn(allRows) }, today: o.today, all: o.all });
  }
}

// ---- 距離で競うゲーム ----
function distAct(act, b, s, tok, now) {
  const D = DIST[s.game];
  const fail = () => { s.used = true; putSess(tok, s); return json({ ok: false, error: 'bad' }); };
  if (act === 'go') {
    if (s.go && now - s.go < 60000) return json({ ok: true });   // 送り直し（2回目）
    if (s.go || now - s.issued > 3600 * 1000) return fail();
    s.go = now; putSess(tok, s);
    return json({ ok: true });
  }
  if (!s.go) return fail();
  const real = (now - s.go) / 1000;                 // go から本当にたった秒数
  if (act === 'cp') {
    const n = Math.floor(Number(b.n)), ct = Number(b.sec);
    if (n === s.cp && n > 0) return json({ ok: true });            // 送り直し（2回目）
    if (n !== s.cp + 1 || n * D.cp > D.max || !(ct >= s.ct) || ct > real + 3) return fail();
    if (n > 1 && ct - s.ct < D.cp / D.top) return fail();          // 100m を最高速度より速く
    if (n * D.cp > D.vmax * real + 60) return fail();               // 平均速度が速すぎる
    s.cp = n; s.ct = ct; putSess(tok, s);
    return json({ ok: true });
  }
  if (act !== 'submit') return json({ ok: false, error: 'bad' });
  const dist = Math.floor(Number(b.dist)), sec = Math.floor(Number(b.sec)), dev = String(b.dev || '').slice(0, 40);
  if (dev !== s.dev) return json({ ok: false, error: 'bad' });
  if (!(dist >= s.cp * D.cp && dist < (s.cp + 1) * D.cp + 1 && dist <= D.max)) return fail();
  if (!(sec >= Math.floor(s.ct) && sec <= real + 3) || dist > D.vmax * real + 60) return fail();
  const n1 = cleanName(b.name), n2 = D.duo ? (cleanName(b.name2) || '?') : '';
  if (!n1) return json({ ok: false, error: 'name' });
  if (badName(n1) || (n2 && badName(n2))) return json({ ok: false, error: 'ng' });
  const name = D.duo ? n1 + '&' + n2 : n1;
  const pairDev = D.duo ? (dev.slice(0, 19) + '+' + String(b.dev2 || '').replace(/[^0-9a-z]/gi, '').slice(0, 19)) : dev;
  const ban = banned();
  if (ban.has(name) || ban.has(n1) || (n2 && ban.has(n2)) || ban.has(dev) || ban.has(pairDev) || (D.duo && ban.has(String(b.dev2 || '')))) return json({ ok: false, error: 'bad' });
  if (limited('dev:' + dev, 1, 20)) return json({ ok: false, error: 'wait' });
  if (limited('min:' + Math.floor(now / 60000), 60, 70) || limited('day:' + today(), DAY_CAP, 90000)) return json({ ok: false, error: 'wait' });
  s.used = true; putSess(tok, s);
  const game = s.game, t = new Date(now);
  sheet().appendRow([t, "'" + today(), game, "'" + name, dist, 0, sec, "'" + pairDev]);
  s.res = { ok: true, rank: { today: 1, all: 1 } };
  const rankIn = rows => bestPerDev(rows).filter(r => r.dev !== pairDev && better(r, { wave: dist, kills: 0, t: now }) < 0).length + 1;
  const todayRows = readRows(game, true), allRows = readRows(game, false);
  const o = { today: pub(bestPerDev(todayRows)), all: pub(bestPerDev(allRows)) };
  cache().put('tops:' + game + ':' + today(), JSON.stringify(o), 60);
  s.res = { ok: true, rank: { today: rankIn(todayRows), all: rankIn(allRows) }, today: o.today, all: o.all }; putSess(tok, s);
  return json(s.res);
}

// ---- 回数で競うゲーム（プレイを再生して確かめる） ----
// 送られてきた記録を確かめて再生する（ロックの外で呼ぶ）。形がおかしければ null
function preReplay(b) {
  const P = REPLAY.lifting;
  const seed = Math.floor(Number(b.seed)), steps = Math.floor(Number(b.steps)), log = b.log;
  if (!(seed === (seed | 0) && steps > 0 && steps <= P.maxSteps)) return null;
  if (!Array.isArray(log) || log.length % 4 !== 0 || log.length > steps * 8 + 64) return null;
  for (let i = 0; i < log.length; i++) if (typeof log[i] !== 'number' || log[i] !== Math.floor(log[i]) || Math.abs(log[i]) > 1e7) return null;
  for (let i = 4; i < log.length; i += 4) if (log[i] < log[i - 4]) return null;
  return liftReplay(seed, log, steps);
}
function replayAct(act, b, s, tok, now, pre, lock) {
  if (act === 'go') return json({ ok: true }); // 古いゲームからの知らせ（今は使わない）
  if (act !== 'submit') return json({ ok: false, error: 'bad' });
  const game = s ? s.game : String(b.game), P = REPLAY[game];
  if (!P) return json({ ok: false, error: 'bad' });
  const dev = String(b.dev || '').slice(0, 40);
  const seed = Math.floor(Number(b.seed)), score = Math.floor(Number(b.score)), steps = Math.floor(Number(b.steps)), log = b.log;
  // 記録の形（壊れていたら受け付けない）
  if (!(seed === (seed | 0) && score >= 1 && steps > 0 && steps <= P.maxSteps)) return json({ ok: false, error: 'bad' });
  if (!Array.isArray(log) || log.length % 4 !== 0 || log.length > steps * 8 + 64) return json({ ok: false, error: 'bad' });
  for (let i = 0; i < log.length; i++) if (typeof log[i] !== 'number' || log[i] !== Math.floor(log[i]) || Math.abs(log[i]) > 1e7) return json({ ok: false, error: 'bad' });
  for (let i = 4; i < log.length; i += 4) if (log[i] < log[i - 4]) return json({ ok: false, error: 'bad' });
  // ありえない回数（1回あたり0.3秒より速い）は受け付けない
  if (score * 0.3 > steps / 120 + 1) return json({ ok: false, error: 'replay' });
  const n1 = cleanName(b.name);
  if (!n1) return json({ ok: false, error: 'name' });
  if (badName(n1)) return json({ ok: false, error: 'ng' });
  const ban = banned();
  if (ban.has(n1) || ban.has(dev)) return json({ ok: false, error: 'bad' });
  // 確かめる: 整理券・端末・時間・再生。合わないものは登録して「未確認」と書く
  const why = [];
  if (!s) why.push('notoken');
  else {
    if (dev !== s.dev) why.push('dev');
    if (steps / 120 > (now - s.issued) / 1000 + 60) why.push('time');
  }
  const r = pre || liftReplay(seed, log, steps);
  if (!(r.failed && r.steps === steps && r.score === score)) why.push('replay ' + r.score + '/' + r.steps);
  // 同じ記録は1回だけ（記録の指紋）
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed + ':' + JSON.stringify(log))).slice(0, 24);
  if (cache().get('lh:' + hash) || sheet().createTextFinder(hash).matchEntireCell(true).findNext()) return json({ ok: false, error: 'dup' });
  if (limited('dev:' + dev, 1, 20)) return json({ ok: false, error: 'wait' });
  if (limited('min:' + Math.floor(now / 60000), 60, 70) || limited('day:' + today(), DAY_CAP, 90000)) return json({ ok: false, error: 'wait' });
  if (s) { s.used = true; putSess(tok, s); }
  cache().put('lh:' + hash, '1', 21600);
  const t = new Date(now), sec = Math.floor(steps / 120);
  sheet().appendRow([t, "'" + today(), game, "'" + n1, score, 0, sec, "'" + dev, hash, why.length ? '未確認（' + why.join(', ') + '）' : '']);
  SpreadsheetApp.flush();
  lock.releaseLock(); // ここから下（順位の計算）は読むだけなので、ほかの人を待たせない
  const rankIn = rows => bestPerDev(rows).filter(x => x.dev !== dev && better(x, { wave: score, kills: 0, t: now }) < 0).length + 1;
  const todayRows = readRows(game, true), allRows = readRows(game, false);
  const o = { today: pub(bestPerDev(todayRows)), all: pub(bestPerDev(allRows)) };
  cache().put('tops:' + game + ':' + today(), JSON.stringify(o), 60);
  const res = { ok: true, rank: { today: rankIn(todayRows), all: rankIn(allRows) }, today: o.today, all: o.all };
  if (s) { s.res = res; putSess(tok, s); }
  return json(res);
}

// ---- 再生で確かめるゲーム（SIM） ----
// 再生する（重いので、ロックの外で呼ぶ）。形がおかしい・飛ばせない記録なら null
function preSim(b) {
  const S = SIM[String(b.game)], L = S && S.read(b);
  return L ? S.run(L) : null;
}
function simAct(b, s, tok, now, pre, lock) {
  const game = String(b.game), S = SIM[game], L = S.read(b), dev = String(b.dev || '').slice(0, 40);
  const score = Math.round(Number(b.score !== undefined ? b.score : b.dist) * S.round) / S.round;
  if (!L || !pre || !(score >= 0 && score <= S.maxScore)) return json({ ok: false, error: 'bad' });
  if (S.fast(score, L)) return json({ ok: false, error: 'replay' }); // ありえない速さ
  const n1 = cleanName(b.name);
  if (!n1) return json({ ok: false, error: 'name' });
  if (badName(n1)) return json({ ok: false, error: 'ng' });
  const ban = banned();
  if (ban.has(n1) || ban.has(dev)) return json({ ok: false, error: 'bad' });
  // 確かめる: 整理券・端末・時間・再生。合わないものは登録して「未確認」と書く
  const why = [];
  if (!s) why.push('notoken');
  else {
    const real = (now - s.issued) / 1000;
    if (dev !== s.dev) why.push('dev');
    if (S.sec(L) > real + 60 || real < (S.minSec || 0)) why.push('time');
  }
  if (!S.same(pre, L, score)) why.push('replay ' + (Math.round(pre.score * S.round) / S.round) + '/' + pre.steps);
  // 同じ記録は1回だけ（記録の指紋）
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, game + ':' + S.key(L))).slice(0, 24);
  if (cache().get('lh:' + hash) || sheet().createTextFinder(hash).matchEntireCell(true).findNext()) return json({ ok: false, error: 'dup' });
  if (limited('dev:' + dev, 1, 20)) return json({ ok: false, error: 'wait' });
  if (limited('min:' + Math.floor(now / 60000), 60, 70) || limited('day:' + today(), DAY_CAP, 90000)) return json({ ok: false, error: 'wait' });
  if (s) { s.used = true; putSess(tok, s); }
  cache().put('lh:' + hash, '1', 21600);
  const t = new Date(now), sec = Math.floor(S.sec(L));
  sheet().appendRow([t, "'" + today(), game, "'" + n1, score, 0, sec, "'" + dev, hash, why.length ? '未確認（' + why.join(', ') + '）' : '']);
  SpreadsheetApp.flush();
  lock.releaseLock(); // ここから下（順位の計算）は読むだけなので、ほかの人を待たせない
  const rankIn = rows => bestPerDev(rows).filter(x => x.dev !== dev && better(x, { wave: score, kills: 0, t: now }) < 0).length + 1;
  const todayRows = readRows(game, true), allRows = readRows(game, false);
  const o = { today: pub(bestPerDev(todayRows)), all: pub(bestPerDev(allRows)) };
  cache().put('tops:' + game + ':' + today(), JSON.stringify(o), 60);
  const res = { ok: true, rank: { today: rankIn(todayRows), all: rankIn(allRows) }, today: o.today, all: o.all };
  if (s) { s.res = res; putSess(tok, s); }
  return json(res);
}

// ===== ここから下は games/lifting/core.js の写し（中身を変えずに貼る。ゲームと食い違うと正しい記録がはじかれる） =====
// core.js — リフティングの物理（足の動き・ボール・回数）。
// ゲーム（index.html）と、ランキングのサーバー（.claude/ranking.gs）で同じものを使う。
// サーバーは送られてきた「指の動き」をこれで最初から再生して、本当にその回数続いたかを確かめる。
//
// どの端末・どのブラウザでも結果が1ビットも変わらないように:
//   ・使う計算は + − × ÷ と Math.sqrt / abs / min / max / imul だけ（Math.sin や exp は端末で微妙に違うことがある）
//   ・乱数はサーバーが決めた種（seed）から作る
//   ・指の位置は 1mm 単位の整数で受け取る
// ここを書き換えたら、ranking.gs の中の写しも同じに直す（ゲームとサーバーで食い違うと、正しい記録がはじかれる）。
function LiftCore() {
  const DT = 1 / 120;
  const R = 0.11, E = 0.62, BALL_Z = 0.5, ANKLE_H = 0.068;
  const THIGH = 0.401128, SHIN = 0.428272, LEG = THIGH + SHIN;
  // 0 = 左足, 1 = 右足（本人から見た左右。L が +X 側）
  const SIDE = [1, -1];
  const HIP = [[0.088972, 0.867266, -0.000302], [-0.088972, 0.867266, -0.000302]];
  const HOME = [[0.13, 0.09, 0.26], [-0.13, 0.09, 0.26]];
  const LO = [[-0.06, 0.09], [-0.45, 0.09]], HI = [[0.45, 0.85], [0.06, 0.85]];
  const K_FOLLOW = 0.271426427488607;  // 1 - exp(-38 / 120): 足が指を追う速さ
  const K_HOME = 0.05666455012650784;  // 1 - exp(-7 / 120): 指を離した足が戻る速さ
  const K_DOWN = 0.09516258196404048;  // 1 - exp(-12 / 120): 反対の足を下ろす速さ
  const MAX_STEP = 0.075;              // 1刻みで足が動ける距離（9m/s）
  const READY_Y = 0.24;

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  // 小さい角度の sin / cos（多項式。Math.sin は端末で違うことがあるので使わない）
  const sinS = a => a - a * a * a / 6 + a * a * a * a * a / 120;
  const cosS = a => 1 - a * a / 2 + a * a * a * a / 24;

  let rs = 1;
  const rand = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const vec = () => [0, 0, 0];
  const feet = [0, 1].map(i => ({
    i, s: SIDE[i], held: false, prio: i === 1 ? 1 : 0, lastY: 0,
    t: HOME[i].slice(), p: HOME[i].slice(), pp: HOME[i].slice(), v: vec(),
    q: [0, 0, 0, 1], A: vec(), T0: vec(), T1: vec(), K: vec(), S0: vec(), S1: vec(),
  }));
  const ball = { p: [0, 0, BALL_Z], pp: [0, 0, BALL_Z], v: vec(), r: R };
  const core = { feet, ball, score: 0, g: 6.2, t: 0, steps: 0, playing: false, failed: false, events: [], BALL_Z, R };
  let lastKick = -1;

  // 足の甲の点 p を、届く範囲に収める（上げると前へ出る。股関節から脚の長さより遠くへは行かない）
  function reach(f) {
    const t = f.t, h = HIP[f.i];
    t[0] = clamp(t[0], LO[f.i][0], HI[f.i][0]); t[1] = clamp(t[1], LO[f.i][1], HI[f.i][1]);
    const k = clamp((t[1] - 0.09) / 0.13, 0, 1);
    t[2] = lerp(0.26, BALL_Z, k * k * (3 - 2 * k));
    const bx = t[0], by = t[1] - 0.02, bz = t[2] - 0.08;
    let dx = bx - h[0], dy = by - h[1], dz = bz - h[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), m = LEG * 0.985;
    if (d > m) { dx *= m / d; dy *= m / d; dz *= m / d; t[0] += h[0] + dx - bx; t[1] += h[1] + dy - by; t[2] += h[2] + dz - bz; }
  }
  const liftOf = y => clamp((y - 0.09) / 0.6, 0, 1);
  // 回転 q でベクトル (x, y, z) を回して o + それ を out に入れる
  function rotAdd(q, x, y, z, o, out) {
    const tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
    out[0] = o[0] + x + q[3] * tx + q[1] * tz - q[2] * ty;
    out[1] = o[1] + y + q[3] * ty + q[2] * tx - q[0] * tz;
    out[2] = o[2] + z + q[3] * tz + q[0] * ty - q[1] * tx;
  }
  // 足の形（足首・靴の甲・ひざ・すね）を、甲の点の位置から求める
  function shape(f) {
    const p = f.p, li = liftOf(p[1]);
    const hx = -0.15 * li / 2, hy = f.s * 0.15 / 2; // つま先を少し上げ、外へ向ける
    const s1 = sinS(hx), c1 = cosS(hx), s2 = sinS(hy), c2 = cosS(hy);
    const q = f.q; q[0] = s1 * c2; q[1] = c1 * s2; q[2] = s1 * s2; q[3] = c1 * c2;
    const a = f.A;
    // 足首 = p − 回した(0, 0, 0.15)
    const tmp = [0, 0, 0]; rotAdd(q, 0, 0, 0.15, [0, 0, 0], tmp);
    a[0] = p[0] - tmp[0]; a[1] = Math.max(p[1] - tmp[1], ANKLE_H); a[2] = p[2] - tmp[2];
    rotAdd(q, 0, -0.02, 0, a, f.T0);
    rotAdd(q, 0, -0.05, 0.17, a, f.T1);
    // ひざ: 股関節と足首の間。足を上げるほど外へ開く
    const h = HIP[f.i];
    let dx = a[0] - h[0], dy = a[1] - h[1], dz = a[2] - h[2];
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz), dist = clamp(dl, THIGH - SHIN + 1e-3, LEG - 1e-3);
    dx /= dl; dy /= dl; dz /= dl;
    let mx = f.s * (0.15 + 1.6 * li), my = 0, mz = 1;
    const pd = mx * dx + my * dy + mz * dz; mx -= dx * pd; my -= dy * pd; mz -= dz * pd;
    const ml = Math.sqrt(mx * mx + my * my + mz * mz); mx /= ml; my /= ml; mz /= ml;
    const cosA = clamp((THIGH * THIGH + dist * dist - SHIN * SHIN) / (2 * THIGH * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const K = f.K;
    K[0] = h[0] + dx * THIGH * cosA + mx * THIGH * sinA; K[1] = h[1] + dy * THIGH * cosA + my * THIGH * sinA; K[2] = h[2] + dz * THIGH * cosA + mz * THIGH * sinA;
    for (let j = 0; j < 3; j++) { f.S0[j] = lerp(K[j], a[j], 0.3); f.S1[j] = lerp(K[j], a[j], 0.55); }
  }

  // ---- ボールと当たり判定 ----
  // ボールは前後に動かないので、押し返す向きは左右と上下だけ
  const ZERO = [0, 0, 0];
  function hitSphere(cx, cy, cz, cr, cv, e, fr) {
    const p = ball.p, v = ball.v;
    let rx = p[0] - cx, ry = p[1] - cy; const rz = p[2] - cz, Rr = R + cr;
    if (rx * rx + ry * ry + rz * rz >= Rr * Rr) return 0;
    const d2 = Math.sqrt(rx * rx + ry * ry);
    if (d2 < 1e-4 || Math.abs(rz) > Rr * 0.75) return 0;
    const need = Math.sqrt(Math.max(0, Rr * Rr - rz * rz));
    rx /= d2; ry /= d2;
    p[0] = cx + rx * need; p[1] = cy + ry * need;
    const wx = v[0] - cv[0], wy = v[1] - cv[1], wz = v[2] - cv[2];
    const vn = wx * rx + wy * ry;
    if (vn >= 0) return 0;
    const tx = (wx - rx * vn) * fr, ty = (wy - ry * vn) * fr, tz = wz * fr;
    v[0] = cv[0] + tx - rx * vn * e; v[1] = cv[1] + ty - ry * vn * e; v[2] = cv[2] + tz;
    return -vn;
  }
  function hitSeg(A, B, r, cv, e, fr) {
    const p = ball.p, ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2];
    const l2 = Math.max(1e-6, ax * ax + ay * ay + az * az);
    const t = clamp(((p[0] - A[0]) * ax + (p[1] - A[1]) * ay + (p[2] - A[2]) * az) / l2, 0, 1);
    return hitSphere(A[0] + ax * t, A[1] + ay * t, A[2] + az * t, r, cv, e, fr);
  }
  const lockZ = () => { ball.p[2] = BALL_Z; ball.v[2] = 0; };
  // 上へ当てたら1回。続けるほど、戻ってくる位置の補正が弱く、ばらつきが大きくなる
  function touch(kind, k) {
    const v = ball.v;
    if (!core.playing || v[1] < 0.8 || core.t - lastKick < 0.18) return;
    lastKick = core.t; core.score++;
    const T = 2 * v[1] / core.g;
    const assist = Math.max(0.45, 0.85 - core.score * 0.008), spread = Math.min(0.15, 0.03 + core.score * 0.0025);
    v[0] = clamp(v[0], -0.9, 0.9);
    v[0] = lerp(v[0], ((rand() * 2 - 1) * spread - ball.p[0]) / T, assist);
    core.events.push(['touch', core.score, kind, k]);
  }

  function stepFeet() {
    const [a, c] = feet[0].prio >= feet[1].prio ? [feet[0], feet[1]] : [feet[1], feet[0]];
    if (liftOf(a.t[1]) > 0.1 && !c.held) for (let j = 0; j < 3; j++) c.t[j] = lerp(c.t[j], HOME[c.i][j], K_DOWN);
    for (const f of feet) {
      if (!f.held) for (let j = 0; j < 3; j++) f.t[j] = lerp(f.t[j], HOME[f.i][j], K_HOME);
      let dx = (f.t[0] - f.p[0]) * K_FOLLOW, dy = (f.t[1] - f.p[1]) * K_FOLLOW, dz = (f.t[2] - f.p[2]) * K_FOLLOW;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > MAX_STEP) { dx *= MAX_STEP / d; dy *= MAX_STEP / d; dz *= MAX_STEP / d; }
      for (let j = 0; j < 3; j++) f.pp[j] = f.p[j];
      f.p[0] += dx; f.p[1] += dy; f.p[2] += dz;
      for (let j = 0; j < 3; j++) f.v[j] = (f.p[j] - f.pp[j]) / DT;
      shape(f);
    }
  }
  const sv = [0, 0, 0];
  function stepBall() {
    const p = ball.p, v = ball.v;
    for (let j = 0; j < 3; j++) ball.pp[j] = p[j];
    v[1] -= core.g * DT;
    for (let j = 0; j < 3; j++) { v[j] *= 1 - 0.02 * DT; p[j] += v[j] * DT; }
    lockZ();
    if (p[1] < R) { // 地面
      p[1] = R;
      if (v[1] < 0) {
        const imp = -v[1];
        v[1] = imp * E; v[0] *= 0.86; v[2] *= 0.86;
        if (v[1] < 0.25) v[1] = 0;
        if (imp > 0.4) core.events.push(['ground', imp]);
      } else { v[0] *= 1 - 1.5 * DT; v[2] *= 1 - 1.5 * DT; }
    }
    // 胴（跳ね返るだけ）と頭（ヘディングも1回）
    if (p[1] >= 0.95 - R && p[1] <= 1.4 + R) hitSphere(0, clamp(p[1], 0.95, 1.4), 0.02, 0.13, ZERO, 0.4, 0.8);
    const ih = hitSphere(0, 1.6, 0.06, 0.11, ZERO, 0.6, 0.8);
    if (ih > 0.5) { core.events.push(['head', ih]); touch('head', ih); }
    lockZ();
    if (!core.playing && !core.failed) return;
    for (const f of feet) {
      for (let j = 0; j < 3; j++) sv[j] = f.v[j] * 0.75;
      const is = hitSeg(f.S0, f.S1, 0.04, sv, 0.45, 0.7); // すね（ひざとももには当てない）
      if (is > 0.3) { core.events.push(['shin', is]); touch('shin', is); }
      const im = hitSeg(f.T0, f.T1, 0.05, f.v, 0.55, 0.7); // 靴の甲
      if (im > 0.2) { v[1] = Math.min(v[1], 4.9); core.events.push(['kick', im, f.i]); touch('kick', im); }
    }
    lockZ();
  }

  // ---- 外から使う ----
  // 指の入力: held = 押しているか、x・y = 甲の点を動かしたい位置（mm の整数）
  core.setFoot = (i, held, xmm, ymm) => {
    const f = feet[i];
    if (held) {
      if (!f.held || ymm > f.lastY) f.prio = core.steps + 2;
      f.t[0] = xmm / 1000; f.t[1] = ymm / 1000; reach(f); f.lastY = ymm;
    }
    f.held = !!held;
  };
  // スタート前の構え: 右足を少し上げて、甲にボールを乗せる
  core.ready = () => {
    for (const f of feet) { for (let j = 0; j < 3; j++) { f.t[j] = f.p[j] = f.pp[j] = HOME[f.i][j]; f.v[j] = 0; } f.held = false; f.prio = f.i === 1 ? 1 : 0; f.lastY = 0; }
    const f = feet[1]; f.t[0] = HOME[1][0]; f.t[1] = READY_Y; reach(f);
    for (let j = 0; j < 3; j++) f.p[j] = f.pp[j] = f.t[j];
    for (const g of feet) shape(g);
    ball.p[0] = f.p[0]; ball.p[1] = f.p[1] + R + 0.008; ball.p[2] = BALL_Z;
    for (let j = 0; j < 3; j++) { ball.pp[j] = ball.p[j]; ball.v[j] = 0; }
    core.score = 0; core.g = 6.2; core.t = 0; core.steps = 0; core.playing = false; core.failed = false; lastKick = -1; core.events.length = 0;
  };
  // 最初の操作で始まる。seed: サーバーが決めた乱数の種
  core.start = seed => { rs = seed | 0; ball.v[0] = 0; ball.v[1] = 3.4; ball.v[2] = 0; core.playing = true; };
  // 1刻み（1/120秒）進める。落としたら failed になる
  core.step = () => {
    core.events.length = 0;
    if (core.playing) { core.t += DT; core.g = 6.2 + Math.min(1.2, core.score * 0.02); }
    stepFeet(); stepBall();
    if (core.playing) {
      core.steps++;
      if (ball.p[1] < R + 0.01 || Math.abs(ball.p[0]) > 1.6) { core.playing = false; core.failed = true; core.events.push(['fail']); }
    }
  };
  core.ready();
  return core;
}
// 記録の再生（サーバーで使う）: log は [刻み, 足 + 2×押しているか, x mm, y mm, ...] の並び
function liftReplay(seed, log, steps) {
  const c = LiftCore();
  c.start(seed);
  let k = 0;
  for (let s = 0; s < steps && c.playing; s++) {
    while (k + 3 < log.length && log[k] === s) { c.setFoot(log[k + 1] & 1, log[k + 1] >> 1, log[k + 2], log[k + 3]); k += 4; }
    c.step();
  }
  return { score: c.score, failed: c.failed, steps: c.steps };
}

// ===== ここから下は games/paper-plane/core.js の写し（中身を変えずに貼る。ゲームと食い違うと正しい記録が「未確認」になる） =====
// core.js — 紙飛行機の物理（飛ばし方・機首・揚力と抗力）。
// ゲーム（index.html）と、ランキングのサーバー（.claude/ranking.gs）で同じものを使う。
// サーバーは送られてきた「引っぱった量」と「押していた刻み」をこれで最初から再生して、本当にその距離飛んだかを確かめる。
// 刻みは 1/240 秒で決まっているので、画面の速さに関係なく同じ操作なら同じ距離になる。
// （Math.sin などは端末でほんのわずかに違うことがあるが、この物理ではその差が 1mm にもならないので、サーバーは 0.2m まで許す）
// ここを書き換えたら、ranking.gs の中の写しも同じに直す（ゲームとサーバーで食い違うと、正しい記録が「未確認」になる）。
function PlaneCore() {
  const G = 9.8, AIR = .255, STALL = .28, CLMAX = 2 * Math.PI * STALL * .55, MAXPULL = 120, LAUNCH_V = 22, STEP = 1 / 240;
  const SLING = { x: 0, y: 1.6 };
  function cl(a) { const s = Math.sign(a), x = Math.abs(a); if (x < STALL) return 2 * Math.PI * a * .55; return s * Math.max(CLMAX * .25, CLMAX * (1 - (x - STALL) * 2.5)); }
  // 1刻み進める。drag = 画面を押している（機首を上げる）
  function step(p, drag, dt) {
    const v = Math.hypot(p.vx, p.vy) || 1e-6, gam = Math.atan2(p.vy, p.vx);
    let a = p.th - gam; a = Math.atan2(Math.sin(a), Math.cos(a));
    const stalled = Math.abs(a) > STALL; p.stall += ((stalled ? 1 : 0) - p.stall) * Math.min(1, dt * 6);
    if (drag) p.tt += 1.5 * dt; // 押している: 機首を上げる
    else p.tt += (gam - p.tt) * 3 * dt; // 離している: 機首は飛ぶ向きにそろう
    if (stalled) p.tt -= Math.sign(a) * 1.2 * dt; // 失速すると機首が下がる
    p.tt = Math.max(-1.4, Math.min(1.4, p.tt));
    p.th += (p.tt - p.th) * Math.min(1, dt * 8);
    const CL = cl(a), CD = .035 + .11 * CL * CL + (stalled ? 1.1 * (Math.abs(a) - STALL) : 0);
    const q = AIR * v * v, lx = -p.vy / v, ly = p.vx / v;
    p.vx += (q * CL * lx - q * CD * p.vx / v) * dt;
    p.vy += (q * CL * ly - q * CD * p.vy / v - G) * dt;
    const sp = Math.hypot(p.vx, p.vy); if (!(sp < 60)) { const k = sp > 0 && isFinite(sp) ? 60 / sp : 0; p.vx *= k; p.vy *= k; } // 念のための上限
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  // 引っぱった量（画面の px の10倍の整数。右が +x、上が +y）で飛ばせるか（短すぎる・前へ引いたものは飛ばない）
  function pullOk(ix, iy) { const dx = ix / 10, dy = iy / 10, l = Math.hypot(dx, dy); return l >= 18 && l <= MAXPULL + .1 && dx <= -6; }
  // 飛ばした直後の状態
  function launch(ix, iy) {
    const dx = ix / 10, dy = iy / 10, l = Math.min(MAXPULL, Math.hypot(dx, dy)), sp = LAUNCH_V * l / MAXPULL, ang = Math.atan2(-dy, -dx);
    return { x: SLING.x, y: SLING.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, th: ang, tt: ang, stall: 0 };
  }
  // 最初から再生する（サーバーで使う）。tog = 押す／離すが変わった刻みの番号（小さい順）
  function replay(ix, iy, tog, maxSteps) {
    const p = launch(ix, iy);
    let drag = false, k = 0, n = 0;
    while (n < maxSteps) {
      while (k < tog.length && tog[k] === n) { drag = !drag; k++; }
      step(p, drag, STEP); n++;
      if (p.y <= 0) return { dist: Math.max(0, p.x), steps: n, landed: true };
    }
    return { dist: Math.max(0, p.x), steps: n, landed: false };
  }
  return { G, MAXPULL, STEP, SLING, step, pullOk, launch, replay };
}

// ===== ここから下は games/pendulum-golf/core.js の写し（中身を変えずに貼る。ゲームと食い違うと正しい記録が「未確認」になる） =====
// core.js — 三重振り子ゴルフの物理（振り子・ボール・当たり）。
// ゲーム（index.html）と、ランキングのサーバー（.claude/ranking.gs）で同じものを使う。
// サーバーは送られてきた「指の動き」をこれで最初から再生して、本当にその距離飛んだかを確かめる。
//
// 振り子はカオス（ほんの少しの差で結果がまったく変わる）なので、どの端末・どのブラウザでも1ビットも変わらないように:
//   ・使う計算は + − × ÷ と Math.sqrt / abs / min / max だけ（Math.hypot などは端末で微妙に違うことがある）
//   ・刻みは 1/480 秒で決まっている（画面の速さに関係なく、同じ操作なら同じ結果）
//   ・指の位置は 1mm 単位の整数で受け取る
// ここを書き換えたら、ranking.gs の中の写しも同じに直す（ゲームとサーバーで食い違うと、正しい記録が「未確認」になる）。
function GolfCore() {
  const SH = { x: 0, y: 2.3 }, LEN = [0.8, 0.75, 0.7];
  const G = 9.8, BALL_R = 0.06, BALL_X = 0.25, TEE_H = 0.14, DT = 1 / 480;
  const len = (x, y) => Math.sqrt(x * x + y * y);
  const c = { SH, LEN, BALL_R, BALL_X, TEE_H, DT, pts: null, ball: null, state: 'title', grab: null, steps: 0, events: [] };

  // 構え: 振り子をまっすぐ下げ、ボールをティーに乗せる
  c.reset = () => {
    c.pts = []; let x = SH.x, y = SH.y;
    for (let i = 0; i < 3; i++) { y -= LEN[i]; c.pts.push({ x, y, px: x, py: y }); }
    c.ball = { x: BALL_X, y: TEE_H + BALL_R, vx: 0, vy: 0, flying: false, stopped: false };
    c.state = 'ready'; c.grab = null; c.steps = 0; c.events.length = 0;
  };
  // 指の入力（押した・動かした）: クラブの先を引っぱる位置（mm の整数）。肩より下には引けない
  c.press = (xmm, ymm) => {
    if (c.state !== 'ready' && c.state !== 'swing') return false;
    c.grab = { x: xmm / 1000, y: Math.max(SH.y, ymm / 1000) };
    return true;
  };
  // 指を離した: 止まった状態から振り始める
  c.release = () => {
    if (!c.grab) return false;
    c.grab = null; c.state = 'swing';
    for (const p of c.pts) { p.px = p.x; p.py = p.y; }
    return true;
  };
  c.dist = () => c.ball.x - BALL_X;

  // 1刻み（1/480秒）進める。events: ['hit', 速さ] / ['bounce', 落ちる速さ]
  c.step = () => {
    const dt = DT, pts = c.pts, ball = c.ball, grab = c.grab;
    c.events.length = 0;
    for (const p of pts) {
      const vx = (p.x - p.px) * 0.9995, vy = (p.y - p.py) * 0.9995;
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy - G * dt * dt;
    }
    if (grab) { const p = pts[2]; p.x += (grab.x - p.x) * 0.15; p.y += (grab.y - p.y) * 0.15; }
    for (let it = 0; it < 12; it++) {
      let prev = SH;
      for (let i = 0; i < 3; i++) {
        const p = pts[i], dx = p.x - prev.x, dy = p.y - prev.y, d = len(dx, dy) || 1e-6, diff = (d - LEN[i]) / d;
        if (i === 0) { p.x -= dx * diff; p.y -= dy * diff; }
        else { prev.x += dx * diff * .5; prev.y += dy * diff * .5; p.x -= dx * diff * .5; p.y -= dy * diff * .5; }
        prev = p;
      }
      for (const p of pts) if (p.y < 0.03) { p.y = 0.03; p.px += (p.x - p.px) * 0.3; }
    }
    // 当たり
    if (c.state === 'swing' && !ball.flying && !grab) {
      const h = pts[2];
      if (len(h.x - ball.x, h.y - ball.y) < BALL_R + 0.07) {
        const hvx = (h.x - h.px) / dt, hvy = (h.y - h.py) / dt;
        const sp = len(hvx, hvy);
        if (sp > 0.5) {
          ball.vx = hvx * 2.2; ball.vy = Math.max(hvy * 2.2, Math.abs(hvx) * 0.5);
          ball.flying = true; c.state = 'fly';
          c.events.push(['hit', sp]);
        }
      }
    }
    if (ball.flying && !ball.stopped) {
      ball.vy -= G * dt;
      const drag = 1 - 0.02 * dt; ball.vx *= drag; ball.vy *= drag;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        if (ball.vy < -1.5) { c.events.push(['bounce', -ball.vy]); ball.vy = -ball.vy * 0.4; ball.vx *= 0.75; }
        else { ball.vy = 0; ball.vx *= (1 - 1.8 * dt); }
        if (Math.abs(ball.vx) < 0.15 && ball.vy === 0) ball.stopped = true;
      }
      if (ball.stopped && c.state === 'fly') c.state = 'done';
    }
    c.steps++;
  };

  // 記録の再生（サーバーで使う）: log は [刻み, 押しているか(1/0), x mm, y mm, ...] の並び。
  // ボールが止まるまで（最大 maxSteps 刻み）進める
  c.replay = (log, maxSteps) => {
    c.reset();
    let k = 0;
    while (c.steps < maxSteps && c.state !== 'done') {
      while (k + 3 < log.length && log[k] === c.steps) { if (log[k + 1]) c.press(log[k + 2], log[k + 3]); else c.release(); k += 4; }
      c.step();
    }
    return { score: c.dist(), steps: c.steps, done: c.state === 'done' };
  };
  return c;
}

// ===== ここから下は games/cola-pendulum/core.js の写し（中身を変えずに貼る。ゲームと食い違うと正しい記録が「未確認」になる） =====
// core.js — コーラ振り子の物理（三重振り子とボトル・振られ具合・届く高さ）。
// ゲーム（index.html）と、ランキングのサーバー（.claude/ranking.gs）で同じものを使う。
// サーバーは送られてきた「手を離した瞬間の振り子の形」から5秒間の振り回しを再生して、本当にその高さになるかを確かめる。
//
// 振り子はカオス（ほんの少しの差で結果がまったく変わる）なので、どの端末・どのブラウザでも1ビットも変わらないように:
//   ・振られ具合の計算は + − × ÷ と Math.sqrt / abs / min / max だけ（Math.hypot などは端末で微妙に違うことがある）
//   ・刻みは 1/960 秒で決まっている
// ここを書き換えたら、ranking.gs の中の写しも同じに直す（ゲームとサーバーで食い違うと、正しい記録が「未確認」になる）。
function ColaCore() {
  const G = 9.8, BS = 1.8, H = 0.24 * BS, HC = 0.08 * BS; // ボトルの高さ・重心の高さ（真ん中より下）
  const PIV = [0, 1.8], LEN = [0.4, 0.4, 0.4, H], INV = [0, 1, 1, 1, 1]; // 支点は動かない。重さはどの点も同じ
  const STEP = 1 / 960, SHAKE_TIME = 5, FIZZ_FULL = 130; // 振り回す時間（秒）／これだけ振れば炭酸は最大
  const len = (x, y) => Math.sqrt(x * x + y * y);
  const P = Array.from({ length: 5 }, () => [0, 0]), Q = P.map(v => v.slice());
  const body = { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0 };
  const c = { G, H, HC, PIV, LEN, STEP, SHAKE_TIME, FIZZ_FULL, P, Q, body, energy0: null, lastSub: STEP, fizz: 0, tShake: 0, prevV: null };

  c.comOf = () => { const t = HC / H; return [P[4][0] + (P[3][0] - P[4][0]) * t, P[4][1] + (P[3][1] - P[4][1]) * t]; };
  // 振り子のエネルギー（重さはどの点も1）。手を離した時点の値を保ち続ける
  c.chainEnergy = h => {
    let e = 0;
    for (let k = 1; k < 5; k++) { const vx = (P[k][0] - Q[k][0]) / h, vy = (P[k][1] - Q[k][1]) / h; e += 0.5 * (vx * vx + vy * vy) + G * P[k][1]; }
    return e;
  };
  // active = 振り回している最中（つまんでいない）
  c.keepEnergy = (h, active) => {
    if (c.energy0 === null || !active) return;
    let ke = 0, pe = 0;
    for (let k = 1; k < 5; k++) { const vx = (P[k][0] - Q[k][0]) / h, vy = (P[k][1] - Q[k][1]) / h; ke += 0.5 * (vx * vx + vy * vy); pe += G * P[k][1]; }
    const want = c.energy0 - pe;
    if (ke < 1e-9 || want <= 0) return;
    const sc = Math.sqrt(want / ke); // 計算で失われた分だけ速さを戻す
    for (let k = 1; k < 5; k++) { Q[k][0] = P[k][0] - (P[k][0] - Q[k][0]) * sc; Q[k][1] = P[k][1] - (P[k][1] - Q[k][1]) * sc; }
  };
  c.hang = () => {
    let y = PIV[1];
    for (let k = 0; k < 5; k++) { if (k) y -= LEN[k - 1]; P[k] = [PIV[0], y]; Q[k] = [PIV[0], y]; }
    c.bodyFromChain(); c.energy0 = null;
  };
  // n = 動かす点の数（5: ボトル付き、4: 飛び立ったあと）。posing = つまんで形を決めている（aim = ボトルの重心を持っていく位置）
  c.chainStep = (dt, n, posing, aim) => {
    if (!posing) for (let k = 1; k < n; k++) {
      const vx = P[k][0] - Q[k][0], vy = P[k][1] - Q[k][1]; // 減衰なし
      Q[k] = P[k]; P[k] = [P[k][0] + vx, P[k][1] + vy - G * dt * dt];
    }
    for (let it = 0; it < 8; it++) {
      if (posing) {
        // ボトルの重心を指の位置へ持っていく
        const m = c.comOf(), dx = aim[0] - m[0], dy = aim[1] - m[1];
        for (const k of [3, 4]) { P[k][0] += dx; P[k][1] += dy; }
      }
      for (let j = 0; j < n - 1; j++) {
        const a = P[j], b = P[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = len(dx, dy) || 1e-6;
        const wa = INV[j], wb = INV[j + 1], k = (d - LEN[j]) / d / (wa + wb);
        a[0] += dx * k * wa; a[1] += dy * k * wa; b[0] -= dx * k * wb; b[1] -= dy * k * wb;
      }
      for (let k = 1; k < n; k++) if (P[k][1] < 0) { P[k][1] = 0; Q[k][0] = P[k][0] * 0.5 + Q[k][0] * 0.5; }
    }
    // 節が伸び縮みしないよう、支点から順に長さをきっちり合わせ直す
    for (let j = 0; j < n - 1; j++) {
      const a = P[j], b = P[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = len(dx, dy) || 1e-6;
      b[0] = a[0] + dx / d * LEN[j]; b[1] = a[1] + dy / d * LEN[j];
    }
    if (posing) for (let k = 1; k < n; k++) Q[k] = P[k].slice(); // 離した瞬間は止まった状態から動き出す
    if (dt > 0) c.lastSub = dt;
  };
  c.bodyFromChain = () => {
    const [cx, cy] = P[3], [bx, by] = P[4], ux = (cx - bx) / H, uy = (cy - by) / H, ls = c.lastSub;
    const v2x = (P[3][0] - Q[3][0]) / ls, v2y = (P[3][1] - Q[3][1]) / ls;
    const v3x = (P[4][0] - Q[4][0]) / ls, v3y = (P[4][1] - Q[4][1]) / ls;
    const t = HC / H;
    body.x = bx + (cx - bx) * t; body.y = by + (cy - by) * t; body.a = Math.atan2(-ux, uy);
    body.vx = v3x + (v2x - v3x) * t; body.vy = v3y + (v2y - v3y) * t;
    body.w = ((cx - bx) * (v2y - v3y) - (cy - by) * (v2x - v3x)) / (H * H);
  };
  // 手を離した: jit = 真上で釣り合ったまま止まらないよう、各点を横に少しだけずらす量
  c.startShake = jit => {
    for (let k = 1; k < 5; k++) P[k][0] += jit[k - 1];
    c.energy0 = c.chainEnergy(STEP); c.fizz = 0; c.tShake = 0; c.prevV = null;
  };
  // 振られ具合：ボトルの速さの変わり方（ゆさぶられた量）を足していく。5秒たったら true
  c.measure = h => {
    c.bodyFromChain();
    const v = [body.vx, body.vy, body.w], pv = c.prevV;
    if (pv) c.fizz += len(v[0] - pv[0], v[1] - pv[1]) + Math.abs(v[2] - pv[2]) * 0.02;
    c.prevV = v;
    c.tShake += h;
    return c.tShake >= SHAKE_TIME;
  };
  // 届く高さ（m）。上限なし：振れば振るほど、どこまでも高く
  c.apexOf = fizz => 40 * Math.pow(10000, fizz / FIZZ_FULL);
  c.scoreOf = fizz => Math.max(0, Math.round(c.apexOf(fizz)));

  // 再生（サーバーで使う）: p・q = 手を離した瞬間の4つの点の位置（[x, y] ×4。q は1刻み前）、jit = ずらした量 ×4
  c.replay = (p, q, jit) => {
    P[0] = PIV.slice(); Q[0] = PIV.slice();
    for (let k = 1; k < 5; k++) { P[k] = p[k - 1].slice(); Q[k] = q[k - 1].slice(); }
    c.lastSub = STEP;
    c.startShake(jit);
    let steps = 0;
    for (;;) {
      c.chainStep(STEP, 5, false, null); c.keepEnergy(STEP, true); steps++;
      if (c.measure(STEP)) break;
    }
    return { fizz: c.fizz, score: c.scoreOf(c.fizz), steps };
  };
  return c;
}
