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
if (typeof window !== 'undefined') { window.LiftCore = LiftCore; window.liftReplay = liftReplay; }
