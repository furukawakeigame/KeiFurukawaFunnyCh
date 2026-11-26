// 結果画面の「次のゲーム」リンク ＋ 最近遊んだゲームの記録
//
// ad.js が自動で読み込むので、各ゲームに書き足すものはない（ad.js を読み込んでいるゲームだけで動く）。
// ・ゲームを開いたら、トップページの「最近遊んだ」に記録する（トップと同じ localStorage の 'recent'）
// ・最初に結果が出たとき、ヘッダーの「トップへ戻る」の横に、別のゲームへのリンクを1つ出す
//   （アイコン＋タイトル。最近遊んだゲームと今のゲームは避けて、トップの一覧からランダムに選ぶ）
//   一度出したら、そのページにいる間は出したままにする。
// ・結果の判定は ad.js と同じ: ad.js の data-result の要素が見えている間、または resultAd(true) が呼ばれたとき
// ・ヘッダーの中に入れるので、ゲームの絵・結果・広告とは重ならない。ヘッダーのほかの部品が縮むなら
//   アイコンだけにし、それでも入らなければ出さない
(() => {
  const me = document.currentScript;
  const top = new URL('./', me.src); // サイトのトップ（more.js と同じ場所）
  const selector = me.dataset.result;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // 今のゲーム（"games/<name>/" の形。トップページの href と同じ）
  const m = location.pathname.match(/games\/[^/]+\//);
  const here = m && m[0];
  if (here) store.set('recent', [here, ...(store.get('recent') || []).filter(h => h !== here)].slice(0, 6));

  const style = document.createElement('style');
  style.textContent = `
    #next-game { display: inline-flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0; height: 32px; box-sizing: border-box;
      padding: 0 10px 0 4px; border-radius: 99px; background: rgba(255,255,255,.94); color: #2a2233 !important; border: none !important;
      box-shadow: 0 1px 6px rgba(0,0,0,.2); font: bold 12px/1 system-ui, sans-serif; text-decoration: none !important;
      white-space: nowrap; pointer-events: auto; margin: 0 !important; animation: next-game-in .4s ease-out; }
    #next-game img { width: 24px; height: 24px; border-radius: 7px; flex: none; }
    #next-game span { overflow: hidden; text-overflow: ellipsis; max-width: 8em; }
    #next-game.compact { padding: 0 6px 0 4px; }
    #next-game.compact span { display: none; }
    @keyframes next-game-in { from { opacity: 0; transform: scale(.8); } }`;
  document.head.append(style);

  let done = false;
  async function show() {
    if (done) return;
    done = true;
    const header = document.querySelector('header');
    if (!header) return;
    try {
      const html = await (await fetch(new URL('index.html', top))).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const all = [...doc.querySelectorAll('.games li')].map(li => ({
        href: li.querySelector('a').getAttribute('href'),
        img: li.querySelector('img').getAttribute('src'),
        title: li.querySelector('div a').textContent,
      })).filter(g => g.href !== here);
      const recent = store.get('recent') || [];
      const fresh = all.filter(g => !recent.includes(g.href));
      const pool = fresh.length ? fresh : all;
      if (!pool.length) return;
      const g = pool[Math.floor(Math.random() * pool.length)];

      const a = document.createElement('a');
      a.id = 'next-game';
      a.href = new URL(g.href, top).href;
      const back = header.querySelector('a');
      const ja = /[぀-ヿ]/.test(back ? back.textContent : document.title);
      a.title = a.ariaLabel = (ja ? '次のゲーム: ' : 'Next game: ') + g.title;
      a.innerHTML = '<img alt=""><span></span>▶';
      a.querySelector('img').src = new URL(g.img, top).href;
      a.querySelector('span').textContent = g.title;
      // ヘッダーのほかの部品の大きさを覚えておき、入れたあとに縮んだり折り返したりしたら、アイコンだけにする
      // （それでもだめなら出さない）。ヘッダーからはみ出す場合も同じ
      const parts = [...header.querySelectorAll('a, button, select, h1, h2, span, div')];
      const size = () => parts.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
      const before = size();
      const crowded = () => header.scrollWidth > header.clientWidth + 1 || a.getBoundingClientRect().right > innerWidth ||
        size().some(([w, h], i) => !parts[i].contains(a) && Math.abs(w - before[i][0]) > 1 || Math.abs(h - before[i][1]) > 1);
      if (back) back.after(a); else header.append(a);
      // タイトルが3文字くらいしか見えないほど縮んだときも、アイコンだけにする
      const span = a.querySelector('span');
      if (crowded() || (span.scrollWidth > span.clientWidth && span.clientWidth < 40)) a.classList.add('compact');
      if (crowded()) a.remove();
    } catch {}
  }

  // 結果が出たかどうか（ad.js の resultAd を包む ＋ data-result の要素を見る）
  const orig = window.resultAd;
  window.resultAd = on => { if (on) show(); if (orig) orig(on); };
  if (selector) {
    const visible = el => el && (el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const timer = setInterval(() => {
      if (done) clearInterval(timer);
      else if (visible(document.querySelector(selector))) show();
    }, 400);
  }
})();
