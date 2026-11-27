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
