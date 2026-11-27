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
