// ===== 猫の物理（three.js に依存しない） =====
// 体（胸・腰）・頭・4本の脚を剛体と関節モーターでつなぐ。立った姿勢で回転なしに作る → 関節の角度 0 = 脚がまっすぐ下
// 座標: 猫は +z を向く。単位はメートル・キログラム
export function createCat(R, opt = {}) {
  const DT = 1 / 120, G = 9.81;
  const world = new R.World({ x: 0, y: -G, z: 0 });
  world.timestep = DT;
  world.integrationParameters.numSolverIterations = 10;

  const GROUND = (0x1 << 16) | 0xffff, CAT = (0x2 << 16) | 0x1, NONE = 0;
  const ROOM = 6; // 投げても遠くへ行きすぎない見えない壁（半分の広さ）
  world.createCollider(R.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0).setFriction(1).setRestitution(0.05).setCollisionGroups(GROUND));
  for (const [x, z, hx, hz] of [[ROOM + 0.2, 0, 0.2, ROOM + 0.4], [-ROOM - 0.2, 0, 0.2, ROOM + 0.4], [0, ROOM + 0.2, ROOM + 0.4, 0.2], [0, -ROOM - 0.2, ROOM + 0.4, 0.2]])
    world.createCollider(R.ColliderDesc.cuboid(hx, 1.5, hz).setTranslation(x, 1.5, z).setFriction(0.6).setRestitution(0.1).setCollisionGroups(GROUND));

  // ---- 寸法 ----
  const BODY_Y = 0.225; // 作る時の胴の高さ
  const SPINE = [0, BODY_Y, -0.015], NECK = [0, 0.262, 0.13];
  const parts = {}, partList = [];
  let totalMass = 0;
  const QX90 = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
  function part(name, shape, pos, mass, o = {}) {
    const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos[0], pos[1], pos[2])
      .setLinearDamping(0.05).setAngularDamping(0.4).setCanSleep(false).setCcdEnabled(!o.ghost));
    let cd;
    if (shape[0] === 'capz') cd = R.ColliderDesc.capsule(shape[2], shape[1]).setRotation(QX90);
    else if (shape[0] === 'cap') cd = R.ColliderDesc.capsule(shape[2], shape[1]);
    else cd = R.ColliderDesc.ball(shape[1]);
    if (o.offset) cd.setTranslation(...o.offset);
    if (o.ghost) cd.setMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: 1e-4, y: 1e-4, z: 1e-4 }, { x: 0, y: 0, z: 0, w: 1 });
    else cd.setMass(mass);
    cd.setFriction(o.friction ?? 0.5).setRestitution(0.05).setCollisionGroups(o.ghost ? NONE : CAT);
    const c = world.createCollider(cd, b);
    const p = { name, body: b, collider: c, mass, home: pos.slice(), ghost: !!o.ghost };
    parts[name] = p; partList.push(p); totalMass += mass;
    return p;
  }
  part('chest', ['capz', 0.07, 0.035], [0, BODY_Y, 0.075], 1.25);
  part('sp1', ['ball', 0.01], SPINE, 0.05, { ghost: true });
  part('sp2', ['ball', 0.01], SPINE, 0.05, { ghost: true });
  part('hips', ['capz', 0.066, 0.03], [0, BODY_Y, -0.1], 1.1);
  part('nk', ['ball', 0.01], NECK, 0.04, { ghost: true });
  part('head', ['ball', 0.052], [0, 0.305, 0.175], 0.32);

  // 脚: 付け根（abd ＝ 横に開く）→ 上 → 下 → 足先（肉球の玉）
  const LEGS = [
    { k: 'FL', s: 1, front: true, x: 0.042, z: 0.105, y0: 0.205, y1: 0.12, y2: 0.045, paw: [0.02, 0.012], body: 'chest' },
    { k: 'FR', s: -1, front: true, x: 0.042, z: 0.105, y0: 0.205, y1: 0.12, y2: 0.045, paw: [0.02, 0.012], body: 'chest' },
    { k: 'HL', s: 1, front: false, x: 0.048, z: -0.125, y0: 0.245, y1: 0.16, y2: 0.075, paw: [0.02, 0.018], body: 'hips' },
    { k: 'HR', s: -1, front: false, x: 0.048, z: -0.125, y0: 0.245, y1: 0.16, y2: 0.075, paw: [0.02, 0.018], body: 'hips' },
  ];
  for (const L of LEGS) {
    const x = L.s * L.x;
    L.l1 = L.y0 - L.y1; L.l2 = L.y1 - L.y2;
    L.pawOff = { y: L.y2 - L.paw[0], z: -L.paw[1] }; // 足首 = 肉球 + これ
    part('abd' + L.k, ['ball', 0.01], [x, L.y0, L.z], 0.04, { ghost: true });
    part('up' + L.k, ['cap', L.front ? 0.02 : 0.024, L.l1 / 2 - 0.015], [x, (L.y0 + L.y1) / 2, L.z], L.front ? 0.11 : 0.15);
    part('lo' + L.k, ['cap', L.front ? 0.015 : 0.016, L.l2 / 2 - 0.012], [x, (L.y1 + L.y2) / 2, L.z], L.front ? 0.07 : 0.08);
    // 足先の体の中心 = 足首。肉球の玉はそこから下にずらす
    part('paw' + L.k, ['ball', 0.019], [x, L.y2, L.z], 0.045, { offset: [0, L.paw[0] - L.y2, L.paw[1]], friction: 1.4 });
  }

  // ---- 関節 ----
  const joints = {};
  const AX = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };
  function rev(name, a, b, anchor, axis, lo, hi, kp, kd) {
    const A = parts[a], B = parts[b];
    const la = { x: anchor[0] - A.home[0], y: anchor[1] - A.home[1], z: anchor[2] - A.home[2] };
    const lb = { x: anchor[0] - B.home[0], y: anchor[1] - B.home[1], z: anchor[2] - B.home[2] };
    const j = world.createImpulseJoint(R.JointData.revolute(la, lb, AX[axis]), A.body, B.body, true);
    j.setLimits(lo, hi);
    j.configureMotorModel(R.MotorModel.ForceBased);
    const jj = { name, j, kp, kd, target: 0, lo, hi, gain: 1 };
    joints[name] = jj;
    return jj;
  }
  rev('spP', 'chest', 'sp1', SPINE, 'x', -0.7, 0.7, 30, 0.6);
  rev('spY', 'sp1', 'sp2', SPINE, 'y', -0.7, 0.7, 25, 0.5);
  rev('spR', 'sp2', 'hips', SPINE, 'z', -0.9, 0.9, 25, 0.5);
  rev('nkP', 'chest', 'nk', NECK, 'x', -0.9, 0.9, 6, 0.12);
  rev('nkY', 'nk', 'head', NECK, 'y', -1.1, 1.1, 4, 0.08);
  for (const L of LEGS) {
    const x = L.s * L.x;
    rev('ab' + L.k, L.body, 'abd' + L.k, [x, L.y0, L.z], 'z', -0.7, 0.7, 14, 0.25);
    rev('hp' + L.k, 'abd' + L.k, 'up' + L.k, [x, L.y0, L.z], 'x', L.front ? -2.0 : -2.3, L.front ? 2.0 : 1.3, 22, 0.4);
    rev('kn' + L.k, 'up' + L.k, 'lo' + L.k, [x, L.y1, L.z], 'x', L.front ? -2.7 : -0.05, L.front ? 0.05 : 2.7, 20, 0.35);
    rev('an' + L.k, 'lo' + L.k, 'paw' + L.k, [x, L.y2, L.z], 'x', -2.3, 2.3, 6, 0.1);
  }
  const jointList = Object.values(joints);

  // ---- 小さな数学 ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const rotV = (q, v) => {
    const { x, y, z, w } = q, ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
    return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
  };
  // 床の高さ（クッションの上などは高い）
  const props = [];
  const floorAt = (x, z) => { let h = 0; for (const p of props) if (Math.hypot(x - p.x, z - p.z) < p.r - 0.005) h = Math.max(h, p.h); return h; };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // ---- 状態 ----
  const sim = {
    world, parts, partList, joints, LEGS, totalMass, DT, ROOM, GROUND,
    state: 'stand', stateT: 0, time: 0, mode: 'idle', modeT: 0,
    com: { x: 0, y: 0, z: 0 }, comV: { x: 0, y: 0, z: 0 }, yaw: 0, upC: 1, upH: 1, grounded: 0,
    grab: null, look: null, walkTo: null, airT: 0, onLand: null, onStep: null, onState: null, purr: 0,
  };
  const legBy = {}; for (const L of LEGS) legBy[L.k] = L;
  const PAIRS = [['FL', 'HR'], ['FR', 'HL']];

  function measure() {
    let m = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
    for (const p of partList) {
      const t = p.body.translation(), v = p.body.linvel(), w = p.mass;
      m += w; cx += t.x * w; cy += t.y * w; cz += t.z * w; vx += v.x * w; vy += v.y * w; vz += v.z * w;
    }
    sim.com = { x: cx / m, y: cy / m, z: cz / m }; sim.comV = { x: vx / m, y: vy / m, z: vz / m };
    const qc = parts.chest.body.rotation(), qh = parts.hips.body.rotation();
    sim.upC = rotV(qc, { x: 0, y: 1, z: 0 }).y; sim.upH = rotV(qh, { x: 0, y: 1, z: 0 }).y;
    const fc = rotV(qc, { x: 0, y: 0, z: 1 }), fh = rotV(qh, { x: 0, y: 0, z: 1 });
    // 向き: 胸と腰の前方向の平均（ひっくり返っていても使えるよう、上下は無視）
    const fx = fc.x + fh.x, fz = fc.z + fh.z;
    if (Math.hypot(fx, fz) > 0.2) sim.yaw = Math.atan2(fx, fz);
    sim.grounded = 0;
    for (const L of LEGS) {
      const b = parts['paw' + L.k].body, t = b.translation();
      const pp = rotV(b.rotation(), { x: 0, y: L.paw[0] - L.y2, z: L.paw[1] });
      L.pawPos = { x: t.x + pp.x, y: t.y + pp.y, z: t.z + pp.z };
      L.ankle = t;
      L.floor = floorAt(L.pawPos.x, L.pawPos.z);
      L.ground = L.pawPos.y < L.floor + 0.032;
      if (L.ground) sim.grounded++;
    }
    const ct = parts.chest.body.translation(), ht = parts.hips.body.translation(), hd = parts.head.body.translation();
    sim.bodyLow = ct.y - floorAt(ct.x, ct.z) < 0.085 || ht.y - floorAt(ht.x, ht.z) < 0.08 || hd.y - floorAt(hd.x, hd.z) < 0.065;
    sim.height = sim.com.y - floorAt(sim.com.x, sim.com.z);
  }

  // 脚の逆運動学: 付け根から見た足首の位置 v（体の座標）→ 4つの関節角
  function legIK(L, v, ankAdd = 0) {
    const r = clamp(Math.atan2(v.x, -v.y), -0.6, 0.6);
    const ly = Math.hypot(v.x, v.y), l1 = L.l1, l2 = L.l2;
    const D = clamp(Math.hypot(ly, v.z), 0.35 * (l1 + l2), l1 + l2 - 0.001);
    const kn = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1));
    const beta = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
    const alpha = Math.atan2(v.z, ly);
    let p, k;
    if (L.front) { p = -(alpha - beta); k = -kn; } else { p = -(alpha + beta); k = kn; }
    joints['ab' + L.k].target = r; joints['hp' + L.k].target = p; joints['kn' + L.k].target = k;
    joints['an' + L.k].target = -(p + k) + ankAdd;
  }
  function legPose(L, ab, hp, kn, an) {
    joints['ab' + L.k].target = ab * L.s; joints['hp' + L.k].target = hp; joints['kn' + L.k].target = kn; joints['an' + L.k].target = an;
  }

  // 体の「なりたい姿勢」（位置・向き・前後の傾き）で、世界の肉球の位置 → 付け根から見た足首の位置
  function frameLocal(F, anchorLocal, P) {
    const c = Math.cos(F.yaw), s = Math.sin(F.yaw), ca = Math.cos(F.pitch), sa = Math.sin(F.pitch);
    // 付け根の世界座標
    const ax = anchorLocal.x, ay = anchorLocal.y * ca - anchorLocal.z * sa, az = anchorLocal.y * sa + anchorLocal.z * ca;
    const Wx = F.x + ax * c + az * s, Wy = F.y + ay, Wz = F.z - ax * s + az * c;
    const dx = P.x - Wx, dy = P.y - Wy, dz = P.z - Wz;
    const lx = dx * c - dz * s, lz0 = dx * s + dz * c;
    return { x: lx, y: dy * ca + lz0 * sa, z: -dy * sa + lz0 * ca };
  }
  // 肉球の目標（世界）→ 脚の関節（足首は肉球の上）
  function legToward(L, F, paw, ankAdd = 0) {
    const home = parts[L.body].home;
    const anchor = { x: L.s * L.x - home[0], y: L.y0 - home[1], z: L.z - home[2] };
    // 足首 = 肉球 + 足の傾きぶん（足は世界で立てたまま）
    const c = Math.cos(F.yaw), s = Math.sin(F.yaw);
    const A = { x: paw.x + L.pawOff.z * s, y: paw.y + L.pawOff.y, z: paw.z + L.pawOff.z * c };
    legIK(L, frameLocal(F, anchor, A), ankAdd);
  }

  // 体の「上」を target の向きへ回す補助（上限つき）
  function orientAssist(name, target, kp, kd, max, fwdT = null, kpY = 0) {
    const b = parts[name].body, q = b.rotation(), up = rotV(q, { x: 0, y: 1, z: 0 }), w = b.angvel();
    let ax = up.y * target.z - up.z * target.y, ay = up.z * target.x - up.x * target.z, az = up.x * target.y - up.y * target.x;
    const sl = Math.hypot(ax, ay, az), ang = Math.atan2(sl, up.x * target.x + up.y * target.y + up.z * target.z);
    if (sl > 1e-6) { ax /= sl; ay /= sl; az /= sl; } else if (ang > 3) { const f = rotV(q, { x: 0, y: 0, z: 1 }); ax = f.x; ay = f.y; az = f.z; } else { ax = ay = az = 0; }
    let tx = kp * ang * ax - kd * w.x, ty = kp * ang * ay - kd * w.y, tz = kp * ang * az - kd * w.z;
    if (fwdT !== null) { // 向き（ヨー）もそろえる
      const f = rotV(q, { x: 0, y: 0, z: 1 }), yw = Math.atan2(f.x, f.z);
      ty += kpY * angDiff(fwdT, yw);
    }
    const tl = Math.hypot(tx, ty, tz);
    if (tl > max) { tx *= max / tl; ty *= max / tl; tz *= max / tl; }
    b.applyTorqueImpulse({ x: tx * DT, y: ty * DT, z: tz * DT }, true);
  }
  const pitchUp = (yaw, a) => ({ x: -Math.sin(yaw) * Math.sin(a), y: Math.cos(a), z: -Math.cos(yaw) * Math.sin(a) }); // a>0 で鼻が上
  function setGains(legs, spine = legs, neck = 1) {
    for (const j of jointList) j.gain = /^(ab|hp|kn|an)/.test(j.name) ? legs : /^sp/.test(j.name) ? spine : neck;
  }
  function setState(s) {
    const prev = sim.state;
    sim.state = s; sim.stateT = 0;
    if (s === 'stand') { sim.mode = 'idle'; sim.modeT = 0; sim.holdYaw = null; sim.home = null; resetPlants(); }
    if (sim.onState) sim.onState(s, prev);
  }
  function resetPlants() {
    for (const L of LEGS) { L.plant = { x: L.pawPos.x, z: L.pawPos.z }; L.swing = null; }
    sim.nextPair = 0; sim.stepCool = 0.1;
  }
  measure();
  resetPlants();
  const COFF = parts.chest.home[2] - sim.com.z, HOFF = parts.hips.home[2] - sim.com.z;

  // 体の中心（胸と腰）を、その体の「なりたい姿勢」に
  // 足の位置から「体がいるべき所」を出し、今の位置からそちらへ少しずらす（足の真上に体を戻す踏ん張り）
  function frameOf(name, y, yaw, pitch, lim = 0.04, lead = null) {
    const t = parts[name].body.translation();
    const pr = LEGS.filter(L => L.body === name && L.plant);
    if (!pr.length || lim <= 0) return { x: t.x, y: y + floorAt(t.x, t.z), z: t.z, yaw, pitch };
    const L0 = pr[0], home = parts[name].home, lz = L0.z - home[2] + L0.paw[1] + (L0.front ? 0 : 0.005);
    let ax = 0, az = 0; for (const L of pr) { ax += L.plant.x; az += L.plant.z; } ax /= pr.length; az /= pr.length;
    let dx = ax - lz * Math.sin(yaw) - t.x, dz = az - lz * Math.cos(yaw) - t.z;
    if (lead) { dx += lead.x; dz += lead.z; }
    const X = t.x + clamp(dx, -lim, lim), Z = t.z + clamp(dz, -lim, lim);
    return { x: X, y: y + Math.max(floorAt(X, Z), floorAt(ax, az)), z: Z, yaw, pitch };
  }
  // 立つ時の肉球の決まった位置（体の座標）
  function nominal(L, F, lead = { x: 0, z: 0 }) {
    const home = parts[L.body].home, c = Math.cos(F.yaw), s = Math.sin(F.yaw);
    const lx = L.s * (L.front ? 0.045 : 0.05), lz = L.z - home[2] + L.paw[1] + (L.front ? 0.0 : 0.005);
    return { x: F.x + lx * c + lz * s + lead.x, z: F.z - lx * s + lz * c + lead.z };
  }

  // 体を持ち上げる・まっすぐにする補助
  function support(name, F, upT, k = 1) {
    const b = parts[name].body, t = b.translation(), v = b.linvel(), m = name === 'chest' ? 1.6 : 1.5;
    const fy = m * (G * 0.35 + 90 * (F.y - t.y) - 9 * v.y) * k;
    b.applyImpulse({ x: 0, y: clamp(fy, -m * G, m * G * 1.2) * DT, z: 0 }, true);
    orientAssist(name, upT, 3.5 * k, 0.18 * k, 2.5 * k, F.yaw, 1.5 * k);
  }
  function pushToward(name, vx, vz, k) {
    const b = parts[name].body, v = b.linvel(), m = name === 'chest' ? 1.6 : 1.5;
    b.applyImpulse({ x: clamp(m * k * (vx - v.x), -8, 8) * DT, y: 0, z: clamp(m * k * (vz - v.z), -8, 8) * DT }, true);
  }

  // 頭の向き（見る先）
  function aimHead(gain = 1) {
    let p = 0, y = 0;
    if (sim.look) {
      const h = parts.chest.body.translation(), q = parts.chest.body.rotation();
      const d = { x: sim.look.x - h.x, y: sim.look.y - (h.y + 0.09), z: sim.look.z - h.z };
      // 胸の座標へ
      const iq = { x: -q.x, y: -q.y, z: -q.z, w: q.w }, l = rotV(iq, d);
      y = clamp(Math.atan2(l.x, l.z), -1.0, 1.0);
      p = clamp(-Math.atan2(l.y, Math.hypot(l.x, l.z)), -0.8, 0.7);
      if (l.z < -0.05) y = clamp(y, -0.8, 0.8);
    }
    joints.nkP.target = p * gain + (sim.headTilt || 0); joints.nkY.target = y * gain;
  }

  // ===== 毎ステップの制御 =====
  function control() {
    measure();
    const st = sim.state, t = sim.stateT, yaw = sim.yaw;
    const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const upright = sim.upC > 0.75 && sim.upH > 0.7;

    // 持ち上げ中: つまんだ所をばねで指へ引く
    if (sim.grab) {
      const g = sim.grab, b = g.part.body, q = b.rotation(), t0 = b.translation();
      const lp = rotV(q, g.local), P = { x: t0.x + lp.x, y: t0.y + lp.y, z: t0.z + lp.z };
      const v = b.linvel(), w = b.angvel();
      const pv = { x: v.x + w.y * lp.z - w.z * lp.y, y: v.y + w.z * lp.x - w.x * lp.z, z: v.z + w.x * lp.y - w.y * lp.x };
      const M = totalMass, K = 260, C = 26;
      let fx = M * (K * (g.target.x - P.x) - C * (pv.x - g.tv.x));
      let fy = M * (K * (g.target.y - P.y) - C * (pv.y - g.tv.y) + G);
      let fz = M * (K * (g.target.z - P.z) - C * (pv.z - g.tv.z));
      const fl = Math.hypot(fx, fy, fz), FM = 260;
      if (fl > FM) { fx *= FM / fl; fy *= FM / fl; fz *= FM / fl; }
      b.applyImpulseAtPoint({ x: fx * DT, y: fy * DT, z: fz * DT }, P, true);
      // ぶらぶら揺れすぎないよう全身を少しだけ落ち着かせる
      for (const p of partList) { if (p.ghost) continue; const av = p.body.angvel(); p.body.setAngvel({ x: av.x * 0.985, y: av.y * 0.985, z: av.z * 0.985 }, true); }
    }

    if (st === 'held') {
      setGains(0.55, 0.6, 1);
      const tt = sim.time;
      // 体をつままれた時: 脚はだらんと下げ、ときどきゆっくり宙をかく（嫌がらない）
      for (const L of LEGS) {
        const ph = tt * 3.2 + (L.front ? 0 : Math.PI) + (L.s > 0 ? 0 : Math.PI / 2);
        const pad = sim.paddle * Math.sin(ph);
        if (L.front) legPose(L, 0.05, -0.35 + 0.35 * pad, -0.35 - 0.25 * Math.max(0, pad), 0.5);
        else legPose(L, 0.05, -0.15 + 0.3 * pad, 0.35 + 0.25 * Math.max(0, -pad), -0.3);
      }
      joints.spP.target = 0; joints.spY.target = 0; joints.spR.target = 0;
      // 胴は水平に近づける（ぶら下がっても気持ちよさそうに）
      orientAssist('chest', { x: 0, y: 1, z: 0 }, 1.2, 0.06, 0.8);
      orientAssist('hips', { x: 0, y: 1, z: 0 }, 1.0, 0.05, 0.7);
      aimHead(1);
      sim.paddle = Math.max(0, (sim.paddle || 0) - DT * 0.3);
      if (!sim.grab) { setState('air'); sim.airT = 0; }
    }
    else if (st === 'air') {
      sim.airT += DT;
      // 立ち直り反射: まず前半身（胸）が回り、少し遅れて後ろ半身（腰）が回る
      const k = Math.min(1, t / 0.04);
      const kh = smooth((t - 0.05) / 0.08);
      setGains(0.9, 0.35 + 0.65 * kh, 1);
      orientAssist('chest', { x: 0, y: 1, z: 0 }, 9 * k, 0.5 * k, 5);
      if (kh > 0) orientAssist('hips', { x: 0, y: 1, z: 0 }, 8 * kh, 0.45 * kh, 4.5 * kh);
      const done = upright;
      for (const L of LEGS) {
        if (!done) {
          // 回っている間は前脚をたたみ、後ろ脚は伸ばす
          if (L.front) legPose(L, 0.1, -0.6, -1.2, 0.9);
          else legPose(L, 0.15, -0.2, 0.3, -0.2);
        } else {
          // 回り終わったら4本とも下へ伸ばして着地の準備
          if (L.front) legPose(L, 0.12, -0.25, -0.15, 0.4);
          else legPose(L, 0.12, -0.45, 0.75, -0.3);
        }
      }
      joints.spP.target = done ? -0.05 : 0.15; joints.spY.target = 0; joints.spR.target = 0;
      sim.look = null; joints.nkP.target = 0.35; joints.nkY.target = 0;
      // 回り終わったら回転を止める
      if (done) for (const n of ['chest', 'hips']) { const b = parts[n].body, w = b.angvel(); b.applyTorqueImpulse({ x: -0.02 * w.x * DT * 60, y: -0.02 * w.y * DT * 60, z: -0.02 * w.z * DT * 60 }, true); }
      if ((sim.grounded > 0 || sim.bodyLow) && t > 0.03) {
        const v = sim.comV;
        sim.landV = Math.hypot(v.x, v.y, v.z);
        setState('land');
        for (const L of LEGS) L.plant = { x: L.pawPos.x, z: L.pawPos.z };
        if (sim.onLand) sim.onLand(sim.landV, upright);
      }
    }
    else if (st === 'land' || st === 'getup') {
      // 着地: 脚をやわらかくして沈み込み、すぐに4本で立つ。横向きに落ちたら、くるっと起き上がる
      const getup = st === 'getup';
      const u = smooth(t / (getup ? 0.6 : 0.35));
      const boost = getup ? 1 + Math.min(2, t * 0.8) : 1;
      setGains(getup ? 0.7 : 0.45 + 0.55 * u, 0.8, 1);
      orientAssist('chest', { x: 0, y: 1, z: 0 }, 7 * boost, 0.4, 4 * boost, yaw, 0);
      orientAssist('hips', { x: 0, y: 1, z: 0 }, 6.5 * boost, 0.38, 3.5 * boost, yaw, 0);
      const H = 0.17 + 0.045 * u;
      const Fc = frameOf('chest', H, yaw, 0), Fh = frameOf('hips', H, yaw, 0);
      for (const L of LEGS) {
        const F = L.front ? Fc : Fh;
        if (!upright) {
          const n = nominal(L, F);
          legToward(L, F, { x: n.x, y: floorAt(n.x, n.z) + 0.02, z: n.z });
        } else {
          // 足を滑らせないで、決まった位置へじわっと戻す
          const n = nominal(L, F);
          L.plant.x += (n.x - L.plant.x) * Math.min(1, DT * 5); L.plant.z += (n.z - L.plant.z) * Math.min(1, DT * 5);
          legToward(L, F, { x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z });
        }
      }
      if (upright) { support('chest', Fc, { x: 0, y: 1, z: 0 }, 0.8 * u + 0.2); support('hips', Fh, { x: 0, y: 1, z: 0 }, 0.8 * u + 0.2); }
      else if (getup) { // 床から少し浮かせて転がりやすく
        for (const n of ['chest', 'hips']) parts[n].body.applyImpulse({ x: 0, y: 1.4 * G * 0.4 * DT, z: 0 }, true);
      }
      pushToward('chest', 0, 0, upright ? 3 : 1); pushToward('hips', 0, 0, upright ? 3 : 1);
      joints.spP.target = 0; joints.spY.target = 0; joints.spR.target = 0;
      aimHead(0.6);
      if (!getup && t > 0.12 && !upright) setState('getup');
      else if (t > (getup ? 0.5 : 0.35) && upright && sim.grounded >= 3) setState('stand');
      else if (sim.grounded === 0 && !sim.bodyLow && t > 0.1 && sim.height > 0.3) { setState('air'); sim.airT = 0; }
    }
    else if (st === 'stand') standControl(fwd, upright);

    for (const j of jointList) j.j.configureMotorPosition(j.target, j.kp * j.gain, j.kd * Math.max(j.gain, 0.15));
  }

  // ===== 立っている時: 4本の脚で支え、ずれたら対角の2本ずつ踏み直す。歩く・座る・伸びをする =====
  function standControl(fwd, upright) {
    setGains(1, 1, 1);
    sim.modeT += DT;
    const yaw = sim.yaw, mode = sim.mode, mt = sim.modeT;
    // 歩く速さと向き
    let vx = 0, vz = 0, turn = null;
    if (mode === 'walk' && sim.walkTo) {
      const dx = sim.walkTo.x - sim.com.x, dz = sim.walkTo.z - sim.com.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz), err = angDiff(want, yaw);
      turn = want;
      const sp = Math.min(0.32, d * 0.8) * Math.max(0, Math.cos(err));
      vx = fwd.x * sp; vz = fwd.z * sp;
      if (d < 0.08 || mt > 12) { sim.mode = 'idle'; sim.modeT = 0; sim.walkTo = null; }
    }
    // 座る・伸びの量（なめらかに出入り）
    sim.sitK = clamp((sim.sitK || 0) + (mode === 'sit' ? DT / 0.7 : -DT / 0.45), 0, 1);
    sim.strK = clamp((sim.strK || 0) + (mode === 'stretch' && mt < 2.2 ? DT / 0.6 : -DT / 0.6), 0, 1);
    if (mode === 'stretch' && mt > 3.0) { sim.mode = 'idle'; sim.modeT = 0; }
    const sit = smooth(sim.sitK), str = smooth(sim.strK);

    const Hc = 0.212 + 0.035 * sit - 0.07 * str, Hh = 0.212 - 0.12 * sit + 0.01 * str;
    const pc = 0.45 * sit - 0.35 * str, ph = 0.95 * sit + 0.15 * str; // 鼻上げ
    if (turn !== null || sim.holdYaw == null) sim.holdYaw = yaw;
    const turnYaw = turn !== null ? yaw + clamp(angDiff(turn, yaw), -0.5, 0.5) : yaw + clamp(angDiff(sim.holdYaw, yaw), -0.3, 0.3);
    const moving = Math.hypot(vx, vz) > 0.02 || (turn !== null && Math.abs(angDiff(turn, yaw)) > 0.2);
    // 止まっている時は「いるべき所」(home) に体を戻す。押されて大きくずれたら、その分だけ home もずらす
    const com = sim.com;
    if (!sim.home || moving) sim.home = { x: com.x, z: com.z };
    { const hx = com.x - sim.home.x, hz = com.z - sim.home.z, d = Math.hypot(hx, hz); if (d > 0.05) { sim.home.x += hx * (1 - 0.05 / d); sim.home.z += hz * (1 - 0.05 / d); } }
    const homeF = (name, y, pitch, off) => {
      const t = parts[name].body.translation(), Y = sim.holdYaw ?? yaw;
      const dx = sim.home.x + off * Math.sin(Y) - t.x, dz = sim.home.z + off * Math.cos(Y) - t.z;
      const X = t.x + clamp(dx, -0.04, 0.04), Z = t.z + clamp(dz, -0.04, 0.04);
      return { x: X, y: y + floorAt(X, Z), z: Z, yaw, pitch };
    };
    const wl = { x: vx * 0.25, z: vz * 0.25 };
    const Fc = moving ? frameOf('chest', Hc, yaw, -pc, 0.04, wl) : homeF('chest', Hc, -pc, COFF);
    const Fh = moving ? frameOf('hips', Hh, yaw, -ph, 0.04, wl) : homeF('hips', Hh, -ph, HOFF);

    // 踏み直し（座っている時は前脚だけ）
    sim.stepCool -= DT;
    const swinging = LEGS.some(L => L.swing);
    // 着地点: 今の体の位置から、歩く速さぶん先（速すぎる時はさらに先へ出して止まる）
    const cv = sim.comV, kl = moving ? 0.06 : 0.015, lead = { x: vx * 0.1 + kl * (cv.x - vx), z: vz * 0.1 + kl * (cv.z - vz) };
    const Ac = moving ? frameOf('chest', Hc, yaw, 0, 0) : { ...Fc, pitch: 0 }, Ah = moving ? frameOf('hips', Hh, yaw, 0, 0) : { ...Fh, pitch: 0 };
    let worst = 0, worstPair = 0;
    PAIRS.forEach((pr, i) => {
      for (const k of pr) {
        const L = legBy[k], F = L.front ? Ac : Ah, n = nominal(L, F, lead);
        const e = Math.hypot(L.plant.x - n.x, L.plant.z - n.z);
        if (e > worst) { worst = e; worstPair = i; }
      }
    });
    const thresh = moving ? 0.0 : 0.03;
    if (!sim.noStep && !swinging && sim.stepCool <= 0 && worst > thresh && sit < 0.3 && str < 0.3) {
      const pi = moving ? sim.nextPair : worstPair;
      for (const k of PAIRS[pi]) {
        const L = legBy[k];
        L.swing = { u: 0, start: { ...L.plant }, dur: moving ? 0.2 : 0.18 };
      }
      sim.nextPair = 1 - pi;
      if (sim.onStep) sim.onStep();
    }
    for (const L of LEGS) {
      const F = L.front ? Fc : Fh;
      let P;
      if (L.swing) {
        const sw = L.swing;
        sw.u += DT / sw.dur;
        const n = nominal(L, L.front ? Ac : Ah, lead);
        if (sw.u < 0.7) sw.target = n;
        const u = smooth(sw.u), h = 0.035 * Math.sin(Math.PI * clamp(sw.u, 0, 1));
        P = { x: sw.start.x + (sw.target.x - sw.start.x) * u, y: floorAt(sw.start.x, sw.start.z) * (1 - u) + floorAt(sw.target.x, sw.target.z) * u + 0.02 + h, z: sw.start.z + (sw.target.z - sw.start.z) * u };
        if (sw.u >= 1) { L.plant = { x: sw.target.x, z: sw.target.z }; L.swing = null; sim.stepCool = moving ? 0.0 : 0.12; }
      } else P = { x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z };
      // 座る時: 後ろ脚は腰の横にたたむ・前脚はまっすぐ
      if (!L.front && sit > 0) {
        const n = nominal(L, Fh);
        const fx = n.x + fwd.x * 0.06 * sit, fz = n.z + fwd.z * 0.06 * sit;
        if (sit > 0.5) { L.plant.x += (fx - L.plant.x) * DT * 4; L.plant.z += (fz - L.plant.z) * DT * 4; }
        P = { x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z };
      }
      // 伸び: 前脚を前へ出す
      if (L.front && str > 0) {
        const n = nominal(L, Fc);
        const fx = n.x + fwd.x * 0.1 * str, fz = n.z + fwd.z * 0.1 * str;
        L.plant.x += (fx - L.plant.x) * DT * 4; L.plant.z += (fz - L.plant.z) * DT * 4;
        P = { x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z };
      }
      legToward(L, F, P, !L.front && sit > 0 ? 0.6 * sit : 0);
    }
    if (!upright && sim.grounded < 2) { setState('getup'); return; }
    // 支える力・まっすぐにする力（座っている時は胸を持ち上げる）
    support('chest', { ...Fc, yaw: turnYaw }, pitchUp(yaw, pc), 1);
    support('hips', { ...Fh, yaw: turnYaw }, pitchUp(yaw, ph), 1);
    // 胴の上下・左右の曲がり
    joints.spP.target = clamp(ph - pc, -0.6, 0.6); joints.spR.target = 0;
    joints.spY.target = turn !== null ? clamp(angDiff(turn, yaw) * 0.3, -0.25, 0.25) : 0;
    // 歩く・止まる
    pushToward('chest', vx, vz, moving ? 4 : 5); pushToward('hips', vx, vz, moving ? 4 : 5);
    sim.headTilt = 0.15 * str;
    aimHead(1);
    // 足が全部浮いたら空中へ
    if (sim.grounded === 0 && sim.height > 0.27) { setState('air'); sim.airT = 0; }
  }

  sim.step = () => {
    control();
    world.step();
    sim.stateT += DT; sim.time += DT;
  };

  // つまむ・動かす・放す
  sim.grab = null;
  sim.startGrab = (part, worldPoint) => {
    const b = part.body, t = b.translation(), q = b.rotation(), iq = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const local = rotV(iq, { x: worldPoint.x - t.x, y: worldPoint.y - t.y, z: worldPoint.z - t.z });
    sim.grab = { part, local, target: { ...worldPoint }, tv: { x: 0, y: 0, z: 0 } };
    sim.paddle = 1;
    setState('held');
  };
  sim.moveGrab = (p, v) => { if (!sim.grab) return; sim.grab.target = { ...p }; sim.grab.tv = v ? { ...v } : { x: 0, y: 0, z: 0 }; };
  sim.release = (maxV = 6.5) => {
    if (!sim.grab) return;
    sim.grab = null;
    // 投げる速さに上限
    for (const p of partList) {
      const v = p.body.linvel(), s = Math.hypot(v.x, v.y, v.z);
      if (s > maxV) p.body.setLinvel({ x: v.x * maxV / s, y: v.y * maxV / s, z: v.z * maxV / s }, true);
    }
  };
  // 置き物（クッションなど）の当たり判定
  sim.addCylinder = (x, z, r, h, friction = 0.9) => (props.push({ x, z, r, h }), world.createCollider(R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, h / 2, z).setFriction(friction).setRestitution(0.05).setCollisionGroups(GROUND)));
  sim.floorAt = floorAt;
  sim.setMode = (m, arg) => { if (sim.state !== 'stand') return; sim.mode = m; sim.modeT = 0; if (m === 'walk') sim.walkTo = arg; };

  // 起動時に少し回して落ち着かせる
  if (opt.warm !== false) for (let i = 0; i < 120; i++) sim.step();
  sim.time = 0;
  return sim;
}
