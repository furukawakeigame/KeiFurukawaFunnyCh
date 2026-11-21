// ゲームの「今日のランキング」を保存・返す Google Apps Script（無料）。
// スコアはこのスクリプトを入れたスプレッドシートの「scores」シートに1行ずつたまる。
// 変な名前やズルの記録は、シートの行を消せば消える。
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
// GET  ?game=<フォルダ名>            → { top: [{ name, wave, kills }] }  今日（日本時間）のトップ10
// POST {game, name, wave, kills, sec, dev} → { ok, rank, top } または { ok: false, error }
//      ブラウザからは Content-Type: text/plain で送る（事前確認の通信を起こさないため）

const SHEET = 'scores';
const TOP_N = 10;
const GAMES = ['slingshot-wave']; // ランキングを受け付けるゲーム（フォルダ名）
const NG = [ // 名前に使えない言葉（ひらがな・小文字にそろえてから、含まれているかを見る）
  'しね', 'ころす', 'ころせ', 'きちがい', 'がいじ', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ', 'せっくす', 'れいぷ', 'ばいた', 'くそ',
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'nigg', 'fag', 'rape', 'sex', 'porn', 'kill',
  '씨발', '병신', '좆', 'ควย', 'เหี้ย', 'สัส',
  'http', 'www', '.com', '.jp', '.net',
];

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(['time', 'date', 'game', 'name', 'wave', 'kills', 'sec', 'dev']); }
  return sh;
}
const today = () => Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// 今日の記録（新しい行ほど下にあるので、下から最大5000行だけ読む）
function todayRows(game) {
  const sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(5000, last - 1);
  const d = today();
  return sh.getRange(last - n + 1, 1, n, 8).getValues()
    .filter(r => (r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[1])) === d && r[2] === game)
    .map(r => ({ t: new Date(r[0]).getTime(), name: String(r[3]), wave: Number(r[4]), kills: Number(r[5]) }));
}
const order = (a, b) => b.wave - a.wave || b.kills - a.kills || a.t - b.t;
function top(game) {
  const key = 'top:' + game + ':' + today();
  const hit = CacheService.getScriptCache().get(key);
  if (hit) return JSON.parse(hit);
  const list = todayRows(game).sort(order).slice(0, TOP_N).map(({ name, wave, kills }) => ({ name, wave, kills }));
  CacheService.getScriptCache().put(key, JSON.stringify(list), 30);
  return list;
}

function doGet(e) {
  const game = String(e.parameter.game || '');
  if (!GAMES.includes(game)) return json({ top: [] });
  return json({ top: top(game) });
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 8);
}
function badName(name) {
  const flat = name.toLowerCase().replace(/[\s._\-・ー~〜!！?？*＊]/g, '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); // カタカナ → ひらがな
  return NG.some(w => flat.includes(w.replace(/[.\-]/g, '')) || name.toLowerCase().includes(w));
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad' }); }
  const game = String(b.game || ''), name = cleanName(b.name), dev = String(b.dev || '').slice(0, 40);
  const wave = Math.floor(Number(b.wave)), kills = Math.floor(Number(b.kills)), sec = Math.floor(Number(b.sec));
  if (!GAMES.includes(game)) return json({ ok: false, error: 'bad' });
  if (!name) return json({ ok: false, error: 'name' });
  if (badName(name)) return json({ ok: false, error: 'ng' });
  // ありえない記録は受け付けない（1ウェーブに最低5秒、倒せる数にも上限）
  if (!(wave >= 1 && wave <= 999 && kills >= 0 && kills <= wave * 120 && sec >= (wave - 1) * 5 && sec < 86400)) return json({ ok: false, error: 'bad' });
  const cache = CacheService.getScriptCache();
  // 同じ端末からは20秒に1回、全体でも1分に60回まで
  if (dev && cache.get('dev:' + dev)) return json({ ok: false, error: 'wait' });
  const minute = 'min:' + Math.floor(Date.now() / 60000), cnt = Number(cache.get(minute) || 0);
  if (cnt >= 60) return json({ ok: false, error: 'wait' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = new Date();
    // 先頭の ' で文字として保存する（日付への変換や、= で始まる名前が数式になるのを防ぐ）
    sheet().appendRow([t, "'" + today(), game, "'" + name, wave, kills, sec, "'" + dev]);
    if (dev) cache.put('dev:' + dev, '1', 20);
    cache.put(minute, String(cnt + 1), 70);
    cache.remove('top:' + game + ':' + today());
    const rows = todayRows(game).sort(order);
    const rank = rows.filter(r => r.wave > wave || (r.wave === wave && r.kills >= kills)).length; // 同じ記録なら先に出した人が上
    return json({ ok: true, rank, top: rows.slice(0, TOP_N).map(({ name, wave, kills }) => ({ name, wave, kills })) });
  } finally { lock.releaseLock(); }
}
