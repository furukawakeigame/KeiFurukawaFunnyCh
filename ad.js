// 結果画面の広告（AdSense のディスプレイ広告）
//
// 各ゲームの </body> の直前で読み込む:
//   <script src="../../ad.js" data-result="#result"></script>
// data-result には「結果を表示している間だけ見える要素」の CSS セレクタを書く。
// 決まった要素がないゲームは data-result を書かず、JS から resultAd(true) / resultAd(false) を呼ぶ
// （毎フレーム呼んでよい。変わった時だけ動く）。
//
// 結果が出ている間だけ、ヘッダーのすぐ下に広告を出す。広告がゲームの絵や結果に重ならないよう、
// ヘッダー以外の画面全体を下（ボタンのある側）へ向かって縮めて、上に広告の帯を空ける。
// ゲームの描画や配置の計算は変えず、見た目だけ縮める（CSS の scale / translate）。
//
// 画面を縮めたくないゲームは、結果パネルの中に広告用の空き枠を用意して data-inline にそのセレクタを書く:
//   <script src="../../ad.js" data-result="#result" data-inline="#adSlot"></script>
// その場合は縮めずに、枠の中へ広告を入れる。枠は、ボタンから GAP 以上離れる位置（結果の文字より上など）に置き、
// 広告が後から出てもボタンがずれないよう、高さを空けておく（背の高さ800px以上は約128px、それ以外は約78px）。
//
// ・広告は1回の訪問につき1回だけ読み込む（結果が出るたびに入れ替えると AdSense の規約違反になる）
// ・adsbygoogle.js は最初の結果が出た時に読み込む（プレイ中を重くしないため）
// ・背の低い画面（横向きスマホなど）では出さない
(() => {
  const CLIENT = 'ca-pub-6939356439579496';
  const SLOT = '1935432497'; // AdSense の広告ユニット「結果画面」の data-ad-slot（10桁）。空なら広告は出さない
  const me = document.currentScript;

  // 結果画面の「次のゲーム」リンクと「最近遊んだ」の記録（広告とは別。more.js を参照）。広告がなくても動く
  if (me) {
    const more = document.createElement('script');
    more.src = new URL('more.js', me.src).href;
    if (me.dataset.result) more.dataset.result = me.dataset.result;
    document.head.append(more);
  }

  if (!SLOT) { window.resultAd = () => {}; return; }

  const selector = me && me.dataset.result;
  const inlineSel = me && me.dataset.inline; // 結果パネルの中の広告枠（あれば縮めない）
  const slotEl = () => inlineSel && document.querySelector(inlineSel);
  const MIN_H = 600; // これより背の低い画面では出さない
  const GAP = 150;    // 広告とボタンの間に空ける距離（AdSense の推奨）
  const MIN_SCALE = 0.55; // これより縮めないと離せないときは、広告を出さない
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'HEADER']);

  const style = document.createElement('style');
  style.textContent = `
    #result-ad { position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483000;
      width: min(calc(100vw - 24px), 352px); box-sizing: border-box; padding: 4px 8px 8px;
      background: #fff; border-radius: 14px; box-shadow: 0 2px 10px rgba(0,0,0,.15); display: none; }
    #result-ad.on { display: block; }
    #result-ad .label { font: 11px/1.4 system-ui, sans-serif; color: #889; margin: 0 0 3px; }
    #result-ad ins { display: block; width: 100%; }
    #result-ad:has(ins[data-ad-status="unfilled"]) { display: none !important; }
    #result-ad.inline { position: static; transform: none; margin: 0 auto; width: min(100%, 352px); z-index: auto; }`;
  document.head.append(style);

  let box = null, filled = false, on = false, shown = false, blocked = false, scale = 1;
  const shrunk = new Map(); // 縮めた要素 → 元の style.scale / style.translate

  function build() {
    box = document.createElement('div');
    box.id = 'result-ad';
    box.innerHTML = '<p class="label"></p>';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    // 背の高い画面は 320×100、それ以外は 320×50（ゲームを縮めすぎないため）
    ins.style.height = (innerHeight >= 800 ? 100 : 50) + 'px';
    ins.dataset.adClient = CLIENT;
    ins.dataset.adSlot = SLOT;
    box.append(ins);
    const slot = slotEl();
    if (slot) { box.classList.add('inline'); slot.append(box); }
    else document.body.append(box);
  }

  // ラベルは、ゲームが今表示している言語に合わせる（ヘッダーの「トップへ戻る」リンクの文字で判断する）
  function label() {
    const back = document.querySelector('header a');
    const t = back ? back.textContent : document.title;
    return /[぀-ヿ]/.test(t) ? '広告' : /[가-힯]/.test(t) ? '광고'
      : /[฀-๿]/.test(t) ? 'โฆษณา' : 'Advertisement';
  }

  function fill() {
    filled = true;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    document.head.append(s);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  // 画面の一番外側の要素（header と広告以外）。display: contents の要素はその中身を見る
  function layers(root = document.body, out = []) {
    for (const el of root.children) {
      if (el === box || SKIP.has(el.tagName)) continue;
      if (getComputedStyle(el).display === 'contents') layers(el, out);
      else out.push(el);
    }
    return out;
  }

  // 見えている要素を、画面の下の真ん中を中心に scale 倍に縮める（まだ縮めていないものだけ）
  function shrink() {
    const cx = innerWidth / 2, cy = innerHeight;
    for (const el of layers()) {
      if (shrunk.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue; // 非表示の要素は、見えたら縮める
      // 要素自身の transform の平行移動を引いて、変形の中心（要素の中心）を求める
      const m = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
      const ox = r.left + r.width / 2 - m.e, oy = r.top + r.height / 2 - m.f;
      shrunk.set(el, [el.style.scale, el.style.translate]);
      el.style.translate = `${(1 - scale) * (cx - ox)}px ${(1 - scale) * (cy - oy)}px`;
      el.style.scale = scale;
    }
  }

  // 押せる部品（ヘッダーと広告の中は除く）で、画面に見えているもの
  function buttons() {
    return [...document.querySelectorAll('button, a[href], input, select, [role=button]')].filter(el => {
      if (el.closest('header') || box.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 &&
        (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
    });
  }

  // 縮めたあとでも、ボタンが広告から GAP 以上離れる倍率
  function scaleForButtons(adBottom) {
    let s = 1;
    for (const el of buttons()) {
      const top = el.getBoundingClientRect().top;
      s = Math.min(s, (innerHeight - adBottom - GAP - 4) / (innerHeight - top)); // 4px of slack so rounding never lands a button just inside the gap
    }
    return s;
  }

  function tooClose() {
    const adBottom = box.getBoundingClientRect().bottom;
    return buttons().some(el => el.getBoundingClientRect().top < adBottom + GAP);
  }

  function hideAd() {
    if (shown && on) blocked = true; // この結果の間はもう出さない（出たり消えたりしないように）
    shown = false;
    if (box) box.classList.remove('on');
    unshrink();
  }

  function unshrink() {
    for (const [el, [s, t]] of shrunk) { el.style.scale = s; el.style.translate = t; }
    shrunk.clear();
  }

  window.resultAd = show => {
    if (show === on) return;
    on = show;
    if (!show) { hideAd(); blocked = false; return; }
    tryShow();
  };

  function tryShow() {
    if (innerHeight < MIN_H || blocked) return;
    if (!box) build();
    box.querySelector('.label').textContent = label();
    if (box.classList.contains('inline')) {
      // 結果パネルの中の枠に出す（縮めない）。ボタンに近すぎるなら、この結果の間は出さない
      box.classList.add('on');
      if (tooClose()) { box.classList.remove('on'); blocked = true; return; }
      if (!filled) fill();
      shown = true;
      return;
    }
    const header = document.querySelector('header');
    box.style.top = (header ? Math.max(6, header.getBoundingClientRect().bottom + 6) : 6) + 'px';
    box.classList.add('on');
    const adBottom = box.getBoundingClientRect().bottom;
    scale = Math.min(1, (innerHeight - adBottom - 8) / innerHeight, scaleForButtons(adBottom));
    if (scale < MIN_SCALE) { box.classList.remove('on'); return; } // ボタンから離せないので出さない
    if (!filled) fill();
    shown = true;
    shrunk.clear();
    shrink();
  }

  // data-result の要素が見えているかを 0.4 秒ごとに確かめる（結果中は、あとから出た要素も縮める）
  const visible = el => el && (el.checkVisibility
    ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  setInterval(() => {
    if (selector) resultAd(visible(document.querySelector(selector)));
    if (shown) { if (!box.classList.contains('inline')) shrink(); if (tooClose()) hideAd(); } // あとから広告の近くにボタンが出たら、広告をやめる
    else if (on) tryShow(); // ボタンが動いている途中などで出せなかったら、もう一度試す
  }, 400);
})();
