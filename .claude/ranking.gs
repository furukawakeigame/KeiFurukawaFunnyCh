// ゲームのランキング（今日・全期間）を保存・返す Google Apps Script（無料）。
// スコアはこのスクリプトを入れたスプレッドシートの「scores」シートに1行ずつたまる。
// 変な名前やズルの記録は、シートの行を消せば消える。
// 同じ人がまた送ってくるときは「ban」シートの A 列に、その名前か端末（scores の dev 列）を書く。
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

const SHEET = 'scores', BAN = 'ban';
const TOP_N = 10, MAX_WAVE = 150, DAY_CAP = 3000;
const GAMES = ['slingshot-wave', 'wheel-road', 'wheel-road-2p']; // ランキングを受け付けるゲーム（フォルダ名）
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
// 同じ端末の記録は一番良いものだけ（1人でトップ10を埋めないように）
function bestPerDev(rows) {
  const best = {};
  for (const r of rows) { const k = r.dev || ('row' + r.t); if (!best[k] || better(r, best[k]) < 0) best[k] = r; }
  return Object.values(best).sort(better);
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
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (act === 'start') {
      const game = String(b.game || ''), dev = String(b.dev || '').slice(0, 40);
      if (!GAMES.includes(game)) return json({ ok: false, error: 'bad' });
      if (limited('st:' + dev, DIST[game] ? 40 : 10, 60) || limited('stmin:' + Math.floor(now / 60000), 400, 70)) return json({ ok: false, error: 'wait' });
      const tok = Utilities.getUuid();
      if (DIST[game]) {
        const seed = Math.floor(Math.random() * 1e9);
        putSess(tok, { game, dev, seed, issued: now, go: 0, cp: 0, ct: 0, used: false });
        return json({ ok: true, tok, seed });
      }
      putSess(tok, { game, dev, t0: now, last: now, wave: 0, kills: 0, used: false });
      return json({ ok: true, tok });
    }
    const tok = String(b.tok || ''), s = getSess(tok);
    // 距離のゲーム: 通信が切れて同じ登録が2回届いたら、1回目の結果を返す
    if (s && s.used && s.res && act === 'submit') return json(s.res);
    if (!s || s.used) return json({ ok: false, error: 'bad' });
    if (DIST[s.game]) return distAct(act, b, s, tok, now);
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
  } finally { lock.releaseLock(); }
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
