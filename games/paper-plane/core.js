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
