// みんなの絵馬（games/minna-no-ema/）の絵馬の置き場所。
// Google スプレッドシートに付けた Apps Script を「ウェブアプリ」として公開し、そのURLを
// games/minna-no-ema/index.html の EMA_URL に入れる。
//
// 公開のしかた（1回だけ）:
//   0. この用途専用の Google アカウントを使う（ふだんのアカウントとは分ける。
//      万一ひどい投稿が放置されても、ふだんのアカウントに影響が出ないように）
//   1. そのアカウントで Google スプレッドシートを新しく作る（名前は何でもよい。共有はしない）
//   2. 拡張機能 → Apps Script を開き、このファイルの中身を全部貼り付けて保存
//   3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
//        次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員
//   4. 出てきた「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）を EMA_URL に入れる
//   ※ このファイルを直したときは、デプロイを管理 → 編集 → バージョン「新バージョン」で更新する（URLは変わらない）
//
// 見る人ができるのは、このスクリプトに書いた3つだけ（読む・1枚足す・通報する）。
// スプレッドシートそのものは作者しか開けない。
//
// シート「ema」の列: A=id, B=日時, C=表の線, D=裏の線, E=通報数
//   ・通報数が HIDE_AT 以上になった絵馬は表示されない（E列を 0 に戻せば元に戻る）
//   ・行を消せば、その絵馬は消える
const SHEET = 'ema';
const LIST = 60;       // 返す枚数（新しい順）
const SCAN = 400;      // 下から見る行数
const HIDE_AT = 3;     // この回数通報されたら隠す
const PER_MIN = 20;    // 全体で1分あたりに受け付ける枚数
const MAX_LEN = 8200;  // 1面の線のデータの長さの上限（ゲーム側は 6000 バイト = 約 8000 文字まで）
const P = 'v1:';       // セルに入れるときの頭（数式や数値と見なされないように）

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
}
function out_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
const strip_ = v => String(v).startsWith(P) ? String(v).slice(P.length) : '';

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('list');
  if (hit) return out_(hit);
  const sh = sheet_(), n = sh.getLastRow(), items = [];
  if (n > 0) {
    const from = Math.max(1, n - SCAN + 1);
    const rows = sh.getRange(from, 1, n - from + 1, 5).getValues();
    for (let i = rows.length - 1; i >= 0 && items.length < LIST; i--) {
      const [id, time, f, b, rep] = rows[i];
      if (!id || Number(rep) >= HIDE_AT) continue;
      items.push({ id: String(id), t: time instanceof Date ? time.getTime() : 0, f: strip_(f), b: strip_(b) });
    }
  }
  const text = JSON.stringify({ items });
  if (text.length < 95000) cache.put('list', text, 60);
  return out_(text);
}

function doPost(e) {
  let q;
  try { q = JSON.parse(e.postData.contents); } catch (_) { return out_('{"ok":false}'); }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out_('{"ok":false}');
  try {
    const cache = CacheService.getScriptCache();
    if (q.a === 'add') {
      const ok = s => typeof s === 'string' && s.length <= MAX_LEN && /^[A-Za-z0-9+/]*={0,2}$/.test(s) && (s === '' || s.startsWith('A'));
      if (!/^[a-z0-9]{8,16}$/.test(q.id || '') || !ok(q.f) || !ok(q.b) || q.f.length + q.b.length < 8) return out_('{"ok":false}');
      const key = 'n' + Math.floor(Date.now() / 60000), cnt = Number(cache.get(key) || 0);
      if (cnt >= PER_MIN) return out_('{"ok":false,"busy":true}');
      cache.put(key, String(cnt + 1), 120);
      sheet_().appendRow([q.id, new Date(), P + q.f, P + q.b, 0]);
      cache.remove('list');
      return out_('{"ok":true}');
    }
    if (q.a === 'report' && /^[a-z0-9]{8,16}$/.test(q.id || '')) {
      const sh = sheet_(), n = sh.getLastRow();
      if (n > 0) {
        const from = Math.max(1, n - SCAN + 1);
        const ids = sh.getRange(from, 1, n - from + 1, 1).getValues();
        for (let i = ids.length - 1; i >= 0; i--) {
          if (String(ids[i][0]) !== q.id) continue;
          const cell = sh.getRange(from + i, 5);
          cell.setValue(Number(cell.getValue() || 0) + 1);
          cache.remove('list');
          break;
        }
      }
      return out_('{"ok":true}');
    }
    return out_('{"ok":false}');
  } finally {
    lock.releaseLock();
  }
}
