// 結果画面の広告（AdSense のディスプレイ広告）
//
// 各ゲームの </body> の直前で読み込む:
//   <script src="../../ad.js" data-result="#result"></script>
// data-result には「結果を表示している間だけ見える要素」の CSS セレクタを書く。
// その要素が見えている間だけ、画面上部（ヘッダーの下）に広告カードを出す。
// 結果が白いパネル（ボタン入り）のゲームは data-ad-in="<パネルのセレクタ>" も書くと、
// 広告をパネルの一番上に入れる（広告 → 結果 → ボタン の順になり、ボタンから離れる）。
// 決まった要素がないゲームは data-result を書かず、JS から resultAd(true) / resultAd(false) を呼ぶ。
//
// ・広告は1回の訪問につき1回だけ読み込む（結果が出るたびに入れ替えると AdSense の規約違反になる）
// ・adsbygoogle.js は最初の結果が出た時に読み込む（プレイ中を重くしないため）
// ・背の低い画面（横向きスマホなど）では出さない
(() => {
  const CLIENT = 'ca-pub-6939356439579496';
  const SLOT = ''; // AdSense の広告ユニット「結果画面」の data-ad-slot（10桁）。空なら何もしない
  if (!SLOT) { window.resultAd = () => {}; return; }

  const me = document.currentScript;
  const selector = me && me.dataset.result;
  const inSel = me && me.dataset.adIn;
  const MIN_H = 600; // これより背の低い画面では出さない

  const style = document.createElement('style');
  style.textContent = `
    #result-ad { position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483000;
      width: min(calc(100vw - 24px), 352px); box-sizing: border-box; padding: 6px 10px 10px;
      background: #fff; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,.18); display: none; }
    #result-ad.on { display: block; }
    #result-ad.inline { position: static; transform: none; width: min(calc(100vw - 32px), 352px); max-width: 100%; margin: 0 auto 20px; padding: 4px 0 0;
      align-self: center; flex-shrink: 0;
      box-shadow: none; border-radius: 10px; text-align: left; }
    #result-ad.inline .label { padding: 0 8px; }
    #result-ad .label { font: 11px/1.4 system-ui, sans-serif; color: #889; margin: 0 0 4px; }
    #result-ad ins { display: block; width: 100%; }
    #result-ad:has(ins[data-ad-status="unfilled"]) { display: none !important; }`;
  document.head.append(style);

  let box = null, filled = false, on = false;

  function build() {
    box = document.createElement('div');
    box.id = 'result-ad';
    box.innerHTML = '<p class="label"></p>';
    const panel = inSel && document.querySelector(inSel);
    if (panel) { box.classList.add('inline'); panel.prepend(box); }
    else document.body.append(box);
  }

  // ラベルは、ゲームが今表示している言語に合わせる（ヘッダーの「トップへ戻る」リンクの文字で判断する）
  function label() {
    const back = document.querySelector('header a');
    const t = back ? back.textContent : document.title;
    return /[\u3040-\u30ff]/.test(t) ? '広告' : /[\uac00-\ud7af]/.test(t) ? '광고'
      : /[\u0e00-\u0e7f]/.test(t) ? 'โฆษณา' : 'Advertisement';
  }

  function place() {
    box.querySelector('.label').textContent = label();
    if (box.classList.contains('inline')) return;
    const header = document.querySelector('header');
    const top = header ? Math.max(8, header.getBoundingClientRect().bottom + 8) : 12;
    box.style.top = top + 'px';
  }

  function fill() {
    filled = true;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    // パネルの中で、画面に余裕があるときだけ大きい広告（300×250）。それ以外は横長（320×100）
    ins.style.height = (box.classList.contains('inline') && innerHeight >= 900 ? 250 : 100) + 'px';
    ins.dataset.adClient = CLIENT;
    ins.dataset.adSlot = SLOT;
    box.append(ins);
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    document.head.append(s);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  window.resultAd = show => {
    if (show === on) return;
    on = show;
    if (show) {
      if (innerHeight < MIN_H) { on = false; return; }
      if (!box) build();
      place();
      box.classList.add('on');
      if (!filled) fill();
      // パネルの大きさが変わったので、ゲームに配置を計算し直してもらう
      if (box.classList.contains('inline')) dispatchEvent(new Event('resize'));
    } else if (box) {
      box.classList.remove('on');
    }
  };

  // data-result の要素が見えているかを 0.4 秒ごとに確かめる
  if (selector) {
    const visible = el => el && (el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    setInterval(() => resultAd(visible(document.querySelector(selector))), 400);
  }
})();
