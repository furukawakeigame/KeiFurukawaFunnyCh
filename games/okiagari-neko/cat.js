// ===== 猫の物理（three.js に依存しない） =====
// 体（胸・腰）・頭・4本の脚を剛体と関節モーターでつなぐ。立った姿勢で回転なしに作る → 関節の角度 0 = 脚がまっすぐ下
// 座標: 猫は +z を向く。単位はメートル・キログラム
export function createCat(R, opt = {}) {
  const DT = 1 / 120, G = 9.81;
  const world = new R.World({ x: 0, y: -G, z: 0 });
  world.timestep = DT;
  world.integrationParameters.numSolverIterations = 25;

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
      .setLinearDamping(0.01).setAngularDamping(0.02).setCanSleep(false).setCcdEnabled(!o.ghost));
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
    { k: 'FL', s: 1, front: true, x: 0.054, z: 0.105, y0: 0.205, y1: 0.12, y2: 0.045, paw: [0.02, 0.012], body: 'chest' },
    { k: 'FR', s: -1, front: true, x: 0.054, z: 0.105, y0: 0.205, y1: 0.12, y2: 0.045, paw: [0.02, 0.012], body: 'chest' },
    { k: 'HL', s: 1, front: false, x: 0.058, z: -0.125, y0: 0.245, y1: 0.16, y2: 0.075, paw: [0.02, 0.018], body: 'hips' },
    { k: 'HR', s: -1, front: false, x: 0.058, z: -0.125, y0: 0.245, y1: 0.16, y2: 0.075, paw: [0.02, 0.018], body: 'hips' },
  ];
  for (const L of LEGS) {
    const x = L.s * L.x;
    L.l1 = L.y0 - L.y1; L.l2 = L.y1 - L.y2;
    L.pawOff = { y: L.y2 - L.paw[0], z: -L.paw[1] }; // 足首 = 肉球 + これ
    part('abd' + L.k, ['ball', 0.01], [x, L.y0, L.z], 0.04, { ghost: true });
    part('up' + L.k, ['cap', L.front ? 0.02 : 0.024, L.l1 / 2 - 0.015], [x, (L.y0 + L.y1) / 2, L.z], L.front ? 0.11 : 0.15);
    part('lo' + L.k, ['cap', L.front ? 0.015 : 0.016, L.l2 / 2 - 0.012], [x, (L.y1 + L.y2) / 2, L.z], L.front ? 0.07 : 0.08);
    // 足先の体の中心 = 足首。肉球の玉はそこから下にずらす
    part('paw' + L.k, ['ball', 0.019], [x, L.y2, L.z], 0.045, { offset: [0, L.paw[0] - L.y2, L.paw[1]], friction: 3.0 });
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
    const jj = { name, j, kp, kd, target: 0, lo, hi, gain: 1, a, b, axis };
    joints[name] = jj;
    return jj;
  }
  rev('spP', 'chest', 'sp1', SPINE, 'x', -0.7, 0.7, 30, 0.6);
  rev('spY', 'sp1', 'sp2', SPINE, 'y', -0.7, 0.7, 25, 0.5);
  rev('spR', 'sp2', 'hips', SPINE, 'z', -3.0, 3.0, 25, 0.5); // 背骨のひねり（空中で体を回すのに使う）
  rev('nkP', 'chest', 'nk', NECK, 'x', -0.9, 0.9, 6, 0.12);
  rev('nkY', 'nk', 'head', NECK, 'y', -1.1, 1.1, 4, 0.08);
  for (const L of LEGS) {
    const x = L.s * L.x;
    rev('ab' + L.k, L.body, 'abd' + L.k, [x, L.y0, L.z], 'z', -1.9, 1.9, 50, 0.6);
    rev('hp' + L.k, 'abd' + L.k, 'up' + L.k, [x, L.y0, L.z], 'x', L.front ? -2.0 : -2.3, L.front ? 2.0 : 1.3, 30, 0.45);
    rev('kn' + L.k, 'up' + L.k, 'lo' + L.k, [x, L.y1, L.z], 'x', L.front ? -2.7 : -0.05, L.front ? 0.05 : 2.7, 28, 0.4);
    rev('an' + L.k, 'lo' + L.k, 'paw' + L.k, [x, L.y2, L.z], 'x', -2.3, 2.3, L.front ? 14 : 30, L.front ? 0.2 : 0.4);
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
    state: 'stand', stateT: 0, time: 0,
    com: { x: 0, y: 0, z: 0 }, comV: { x: 0, y: 0, z: 0 }, yaw: 0, upC: 1, upH: 1, grounded: 0,
    grab: null, look: null, onLand: null, onStep: null, onState: null,
  };
  const legBy = {}; for (const L of LEGS) legBy[L.k] = L;

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
    const r = clamp(Math.atan2(v.x, -v.y), -1.5, 1.5);
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

  // 関節の今の角度（2つの体の向きの差から）
  const qmul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
  function jAngle(jj) {
    const qa = parts[jj.a].body.rotation(), qb = parts[jj.b].body.rotation();
    let r = qmul({ w: qa.w, x: -qa.x, y: -qa.y, z: -qa.z }, qb);
    if (r.w < 0) r = { w: -r.w, x: -r.x, y: -r.y, z: -r.z };
    return 2 * Math.atan2(r[jj.axis], r.w);
  }
  // 体（胸・腰）を、前後の軸のまわりにどれだけ回せば背中が上になるか
  function rollErr(name) {
    const q = parts[name].body.rotation(), r = rotV(q, { x: 1, y: 0, z: 0 }), u = rotV(q, { x: 0, y: 1, z: 0 });
    return Math.atan2(-r.y, u.y);
  }
  function setGains(legs, spine = legs, neck = 1) {
    for (const j of jointList) j.gain = /^(ab|hp|kn|an)/.test(j.name) ? legs : /^sp/.test(j.name) ? spine : neck;
  }
  function setState(s) {
    const prev = sim.state;
    sim.state = s; sim.stateT = 0;
    if (s === 'stand') { sim.holdYaw = null; sim.crouch = null; resetPlants(); }
    if (sim.onState) sim.onState(s, prev);
  }
  function resetPlants() {
    for (const L of LEGS) { L.plant = { x: L.pawPos.x, z: L.pawPos.z }; L.swing = null; }
    sim.gait = null;
  }
  measure();
  resetPlants();

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
  // 体全体の「いるべき所」: 4本の足の真ん中から重心の位置を決め、胸と腰はそこから背骨まっすぐの位置に置く（前脚と後ろ脚が押し合わない）
  const COM0 = (() => { let m = 0, z = 0; for (const p of partList) { m += p.mass; z += p.home[2] * p.mass; } return z / m; })();
  const FEET0 = LEGS.reduce((a, L) => a + L.z + L.paw[1], 0) / 4;
  function bodyFrames(Hc, Hh, yaw, pc, ph, ref, shift, lim = 0.06) {
    const c = Math.sin(yaw), k = Math.cos(yaw);
    let dx, dz, vx = 0, vz = 0;
    if (ref) { dx = ref.x - sim.com.x; dz = ref.z - sim.com.z; vx = ref.vx; vz = ref.vz; }
    else {
      let fx = 0, fz = 0; for (const L of LEGS) { fx += L.plant.x / 4; fz += L.plant.z / 4; }
      dx = fx + (COM0 - FEET0) * c - sim.com.x; dz = fz + (COM0 - FEET0) * k - sim.com.z;
    }
    // 速さのずれのぶんだけ逆へ（行きすぎて揺れないように）
    const X = sim.com.x + clamp(dx - (sim.comV.x - vx) * 0.2, -lim, lim) + (shift ? shift.x : 0);
    const Z = sim.com.z + clamp(dz - (sim.comV.z - vz) * 0.2, -lim, lim) + (shift ? shift.z : 0);
    const at = (name, y, pitch) => { const o = parts[name].home[2] - COM0, x = X + o * c, z = Z + o * k; return { x, y: y + floorAt(x, z), z, yaw, pitch }; };
    return [at('chest', Hc, -pc), at('hips', Hh, -ph)];
  }
  // 足の並びの向き（後ろ足の真ん中 → 前足の真ん中）。体がねじれても、脚は足の並びに体を合わせようとする
  function footYaw() {
    let fx = 0, fz = 0, hx = 0, hz = 0;
    for (const L of LEGS) { if (L.front) { fx += L.plant.x; fz += L.plant.z; } else { hx += L.plant.x; hz += L.plant.z; } }
    return Math.atan2(fx - hx, fz - hz);
  }
  // 立つ時の肉球の決まった位置（体の座標）
  function nominal(L, F, lead = { x: 0, z: 0 }) {
    const home = parts[L.body].home, c = Math.cos(F.yaw), s = Math.sin(F.yaw);
    const lx = L.s * (L.x + 0.004), lz = L.z - home[2] + L.paw[1] + (L.front ? 0.0 : 0.005);
    return { x: F.x + lx * c + lz * s + lead.x, z: F.z - lx * s + lz * c + lead.z };
  }

  // 足が遠くて脚が伸びきってしまう時は、体を低くして脚に余裕を残す（伸びきった脚はつっかえ棒になって体を押してしまう）
  function fitHeight(F, list) {
    let y = F.y;
    for (const [L, P] of list) {
      const home = parts[L.body].home, c = Math.cos(F.yaw), s = Math.sin(F.yaw);
      const ax = L.s * L.x - home[0], az = L.z - home[2];
      const Wx = F.x + ax * c + az * s, Wz = F.z - ax * s + az * c;
      const Ax = P.x + L.pawOff.z * s, Az = P.z + L.pawOff.z * c, Ay = P.y + L.pawOff.y;
      const dh2 = (Ax - Wx) ** 2 + (Az - Wz) ** 2, reach = 0.93 * (L.l1 + L.l2);
      const v = Math.sqrt(Math.max(reach * reach - dh2, 0.0025));
      y = Math.min(y, Ay + v - (L.y0 - home[1]));
    }
    return { ...F, y };
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

    // 持ち上げ中: 指の位置にある見えない「つまむ点」（動かす体）を関節でつなぎ、指へなめらかに動かす
    if (sim.grab) {
      const g = sim.grab, h = g.hand.translation();
      // 指が飛んでも急に引っぱらないよう、速さ（秒速9m）と加速の上限をつけて追いかける（急な動きで体が回りすぎない）
      const hv = g.hv || (g.hv = { x: 0, y: 0, z: 0 });
      let wx = (g.target.x - h.x) * 18, wy = (g.target.y - h.y) * 18, wz = (g.target.z - h.z) * 18;
      const VM = 6.5; // 投げる速さの上限（つまむ点が動ける速さ）
      const ws = Math.hypot(wx, wy, wz); if (ws > VM) { wx *= VM / ws; wy *= VM / ws; wz *= VM / ws; }
      let ax = wx - hv.x, ay = wy - hv.y, az = wz - hv.z;
      const as = Math.hypot(ax, ay, az), am = 70 * DT; if (as > am) { ax *= am / as; ay *= am / as; az *= am / as; }
      hv.x += ax; hv.y += ay; hv.z += az;
      const dx = hv.x * DT, dy = hv.y * DT, dz = hv.z * DT;
      g.hand.setNextKinematicTranslation({ x: h.x + dx, y: h.y + dy, z: h.z + dz });
    }

    if (st === 'held') {
      // つままれた時: 全身の力を抜いて、だらんとぶら下がる（脚もしっぽも重さのまま）
      const k = smooth(t / 0.25);
      setGains(0.6 - 0.592 * k, 0.6, 0.7);
      for (const L of LEGS) {
        if (L.front) legPose(L, 0.03, -0.15, -0.25, 0.3);
        else legPose(L, 0.03, -0.2, 0.35, -0.2);
      }
      joints.spP.target = 0; joints.spY.target = 0; joints.spR.target = 0;
      aimHead(0.5);
      if (!sim.grab) { setState('air'); sim.air = { phase: 'twist' }; }
    }
    else if (st === 'air') airControl(t, upright);
    else if (st === 'land') {
      // 着地: 脚をやわらかくして沈み込み、4本で立つ（関節の力だけ）
      const u = smooth(t / 0.35);
      setGains(0.7 + 0.3 * u, 0.9, 1);
      const H = 0.16 + 0.04 * u;
      // 体の目標は4本の足の真ん中（立っている時と同じ。速さのぶんブレーキもかかる）
      let [Fc, Fh] = bodyFrames(H, H + 0.005, footYaw(), 0, 0, null, null, 0.1);
      const pp = L => ({ x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z });
      Fc = fitHeight(Fc, LEGS.filter(L => L.front).map(L => [L, pp(L)])); Fh = fitHeight(Fh, LEGS.filter(L => !L.front).map(L => [L, pp(L)]));
      for (const L of LEGS) legToward(L, L.front ? Fc : Fh, pp(L)); // 足は着いた所から動かさない（体のほうを足の上へ戻す）
      joints.spP.target = 0; joints.spY.target = 0; joints.spR.target = 0;
      aimHead(0.6);
      const rolled = Math.abs(rollErr('chest')) > 0.8 || Math.abs(rollErr('hips')) > 0.8;
      if (t > 0.1 && rolled && !upright) { setState('getup'); sim.gu = { phase: 'front', t: 0 }; }
      else if (t > 0.35 && upright && sim.grounded >= 3) setState('stand');
      else if (t > 2.5 && !upright) { setState('getup'); sim.gu = { phase: 'front', t: 0 }; }
      else if (sim.grounded === 0 && !sim.bodyLow && t > 0.1 && sim.height > 0.3) { setState('air'); sim.air = { phase: 'twist' }; }
    }
    else if (st === 'getup') getupControl(t, upright);
    else if (st === 'stand') standControl(fwd, upright);

    for (const j of jointList) j.j.configureMotorPosition(j.target, j.kp * j.gain, j.kd * Math.max(j.gain, 0.15));
  }

  // ===== 立っている時: 4本の脚で支え、足の並びが崩れたら1本ずつ踏み直す（関節の力だけ） =====
  function standControl(fwd, upright) {
    setGains(1, 1, 1);
    const yaw = sim.yaw;
    const CR = sim.crouch;
    if (CR) CR.t += DT;
    // しゃがみ直し中は体を低くする（重心が低いほど倒れにくい）
    const crK = CR ? (CR.phase === 'down' ? smooth(CR.t / 0.3) : CR.phase === 'up' ? 1 - smooth(CR.t / 0.5) : 1) : 0;
    const Hc = 0.2 - 0.05 * crK, Hh = 0.205 - 0.05 * crK;
    // 向きは足の並びから。体がそれより大きくねじれていたら、体の向きに合わせて足を置き直す
    // （足の並びが崩れて置き直している間は、体そのものの向きを使う）
    const fy = footYaw();
    const Y = fy + clamp(angDiff(yaw, fy), -0.3, 0.3) * 0.3;

    // 足の置き場所は体の今の位置から決める（足の並びが崩れていても体の下へ戻す）
    const [Ac, Ah] = bodyFrames(Hc, Hh, Y, 0, 0, null, null, 0);
    const errOf = L => { const n = nominal(L, L.front ? Ac : Ah); return Math.hypot(L.plant.x - n.x, L.plant.z - n.z); };
    let worst = 0, worstL = null;
    for (const L of LEGS) { const e = errOf(L); if (e > worst) { worst = e; worstL = L; } }
    const G = sim.gait || (sim.gait = { leg: null, phase: 'none', t: 0 });
    G.t += DT;
    // 4本とも着いていて体が落ち着いている時だけ足を上げる（揺れている時に上げると倒れる）
    const calm = sim.grounded === 4 && sim.upC > 0.93 && sim.upH > 0.93 && Math.hypot(sim.comV.x, sim.comV.z) < 0.15;
    // 足の並びが大きく崩れていたら、低くしゃがんでから順に置き直す
    if (!CR && G.phase === 'none' && worst > (sim.crTh ?? 0.055) && sim.stateT > 0.2) sim.crouch = { phase: 'down', t: 0, n: 0 };
    if (CR) {
      if (CR.phase === 'down' && CR.t > 0.35) { CR.phase = 'fix'; CR.t = 0; }
      if (CR.phase === 'fix' && G.phase === 'none' && (worst < 0.025 || CR.n >= 6)) { CR.phase = 'up'; CR.t = 0; }
      if (CR.phase === 'up' && CR.t > 0.5) sim.crouch = null;
    }
    // しゃがみ直し中は3本着いていれば置き直してよい（浮いている足があれば、その足から）
    const fixOk = CR && CR.phase === 'fix' && sim.grounded >= 3 && sim.upC > 0.75 && sim.upH > 0.75;
    if (G.phase === 'none' && (calm && !CR || fixOk) && !sim.noStep && worst > (sim.forceStep ? 0 : 0.03)) {
      const air = LEGS.find(L => !L.ground);
      G.leg = fixOk && air ? air : worstL; G.phase = 'shift'; G.t = 0; if (CR) CR.n++;
    }
    if (G.phase === 'shift' && G.t > 0.18) { G.phase = 'swing'; G.t = 0; G.leg.swing = { u: 0, start: { ...G.leg.plant }, dur: 0.26 }; if (sim.onStep) sim.onStep(); }
    // 体を寄せる量: 上げる足のとなり2本を結ぶ対角線から、反対の足の側へ少しだけ（重心が支える三角形の中に入る）
    let sx = 0, sz = 0;
    if (G.phase !== 'none') {
      const X = G.leg, adj = LEGS.filter(L => L !== X && (L.front === X.front) !== (L.s === X.s)), opp = LEGS.find(L => L.front !== X.front && L.s !== X.s);
      const a = adj[0].plant, b = adj[1].plant, ex = b.x - a.x, ez = b.z - a.z, el = Math.hypot(ex, ez) || 1;
      let nx = -ez / el, nz = ex / el;
      if ((opp.plant.x - a.x) * nx + (opp.plant.z - a.z) * nz < 0) { nx = -nx; nz = -nz; }
      const k = G.phase === 'shift' ? smooth(G.t / 0.15) : 1;
      sx = nx * 0.025 * k; sz = nz * 0.025 * k;
    }
    sim.shiftV = sim.shiftV || { x: 0, z: 0 };
    sim.shiftV.x += (sx - sim.shiftV.x) * Math.min(1, DT * 25); sim.shiftV.z += (sz - sim.shiftV.z) * Math.min(1, DT * 25);
    const [Fc, Fh] = bodyFrames(Hc, Hh, Y, 0, 0, null, sim.shiftV, CR ? 0.1 : 0.06);

    const goals = [];
    for (const L of LEGS) {
      let P;
      if (L.swing) {
        const sw = L.swing;
        sw.u += DT / sw.dur;
        if (sw.u < 0.7) sw.target = nominal(L, L.front ? Ac : Ah);
        // まず真上に上げ、上がってから運び、最後に下ろす（床を引きずると、その反動で体が滑る）
        const u = smooth((sw.u - 0.25) / 0.55);
        const h = 0.035 * (sw.u < 0.25 ? smooth(sw.u / 0.25) : sw.u < 0.8 ? 1 : 1 - smooth((sw.u - 0.8) / 0.2)) - 0.006 * Math.max(0, sw.u - 1);
        const sag = clamp((L.front ? Fc : Fh).y - parts[L.body].body.translation().y, 0, 0.04); // 体が沈んでいるぶん高めに
        P = { x: sw.start.x + (sw.target.x - sw.start.x) * u, y: floorAt(sw.start.x, sw.start.z) * (1 - u) + floorAt(sw.target.x, sw.target.z) * u + 0.02 + h + (sw.u < 1 ? sag : 0), z: sw.start.z + (sw.target.z - sw.start.z) * u };
        if (sw.u >= 1 && (L.ground || sw.u > 1.4)) { L.plant = { x: L.pawPos.x, z: L.pawPos.z }; L.swing = null; G.phase = 'none'; G.t = 0; }
      } else P = { x: L.plant.x, y: floorAt(L.plant.x, L.plant.z) + 0.02, z: L.plant.z };
      goals.push([L, P]);
    }
    // 着いている足だけで高さを決める（上げている足は届かなくてよい）
    const FcF = fitHeight(Fc, goals.filter(([L]) => L.front && !L.swing)), FhF = fitHeight(Fh, goals.filter(([L]) => !L.front && !L.swing));
    for (const [L, P] of goals) legToward(L, L.front ? FcF : FhF, P);
    if (!upright && sim.grounded < 2) { setState('getup'); sim.gu = { phase: 'front', t: 0 }; return; }
    joints.spP.target = 0; joints.spR.target = 0; joints.spY.target = 0;
    sim.headTilt = 0;
    aimHead(1);
    // 足が全部浮いたら空中へ
    if (sim.grounded === 0 && sim.height > 0.27) { setState('air'); sim.air = { phase: 'twist' }; }
  }

  // ===== 空中: 外から回さず、体の中の動きだけで背中を上にする（本物の猫と同じやり方） =====
  // 1) 前脚をたたみ（回りやすい）、後ろ脚を広げて（回りにくい）背骨をひねる → 前半身が大きく回る
  // 2) 前脚を広げ、後ろ脚をたたんでひねりを戻す → 後ろ半身が前半身に追いつく。足りなければくり返す
  const TUCK = L => L.front ? legPose(L, 0.1, 0.5, -2.5, 1.2) : legPose(L, 0.1, -1.7, 2.5, -0.8);
  const SPREAD = L => L.front ? legPose(L, 1.2, -0.3, -0.1, 0.2) : legPose(L, 1.2, -0.3, 0.2, -0.1);
  function airControl(t, upright) {
    const A = sim.air || (sim.air = { phase: 'twist' });
    A.t = (A.t || 0) + DT;
    setGains(1, 1, 1);
    const ec = rollErr('chest'), eh = rollErr('hips'), tw = jAngle(joints.spR);
    sim.dbg = { ec, eh, tw };
    if (A.phase === 'twist') {
      for (const L of LEGS) (L.front ? TUCK : SPREAD)(L);
      // 胸を回したい分だけ、腰に対してひねる（胸が +ec 回る = 腰から見て -ec）
      joints.spR.target = clamp(tw - 1.6 * ec, -2.9, 2.9);
      if (Math.abs(ec) < 0.15 || Math.abs(tw) > 2.75 || A.t > 0.35) { A.phase = 'untwist'; A.t = 0; }
    } else if (A.phase === 'untwist') {
      for (const L of LEGS) (L.front ? SPREAD : TUCK)(L);
      joints.spR.target = 0;
      if (Math.abs(tw) < 0.2 || A.t > 0.3) { A.phase = Math.abs(ec) < 0.3 && Math.abs(eh) < 0.3 ? 'ready' : 'twist'; A.t = 0; }
    } else {
      // 着地の準備: 体の真下の「見えない床」へ4本を伸ばす（体が少し傾いていても4本そろって着く）
      const yaw = sim.yaw, H = 0.17;
      const Fc = frameOf('chest', 0, yaw, 0, 0), Fh = frameOf('hips', 0, yaw, 0, 0);
      Fc.y = parts.chest.body.translation().y; Fh.y = parts.hips.body.translation().y;
      const gy = Math.min(Fc.y, Fh.y) - H;
      for (const L of LEGS) { const F = L.front ? Fc : Fh, n = nominal(L, F); legToward(L, F, { x: n.x, y: gy + 0.02, z: n.z }); }
      joints.spR.target = 0;
      if (Math.abs(ec) > 0.6 || Math.abs(eh) > 0.6) { A.phase = 'twist'; A.t = 0; }
    }
    joints.spP.target = A.phase === 'ready' ? 0 : 0.2; joints.spY.target = 0;
    sim.look = null; joints.nkP.target = 0.35; joints.nkY.target = 0;
    if ((sim.grounded > 0 || sim.bodyLow) && sim.stateT > 0.03) {
      const v = sim.comV;
      sim.landV = Math.hypot(v.x, v.y, v.z);
      // 背中が上なら着地、横向き・あお向けなら起き上がりへ
      // 横に倒れていなければ（前後に傾いているだけなら）着地。後ろ足から着いても前足を下ろせば立てる
      if (Math.abs(ec) < 0.7 && Math.abs(eh) < 0.7) setState('land'); else { setState('getup'); sim.gu = { phase: 'front', t: 0 }; }
      for (const L of LEGS) L.plant = { x: L.pawPos.x, z: L.pawPos.z };
      if (sim.onLand) sim.onLand(sim.landV, upright);
    }
  }

  // ===== 起き上がり: 背骨のひねりで、まず前半身を起こして前脚で床をつかみ、次に後ろ半身を起こす（関節の力だけ） =====
  function getupControl(t, upright) {
    const g = sim.gu || (sim.gu = { phase: 'front', t: 0 });
    g.t += DT;
    setGains(1, 1, 1);
    const ec = rollErr('chest'), eh = rollErr('hips'), tw = jAngle(joints.spR), yaw = sim.yaw;
    sim.dbg = { ec, eh, tw };
    const H = 0.14, Fc = frameOf('chest', H, yaw, 0, 0), Fh = frameOf('hips', H, yaw, 0, 0);
    // 起き上がる時は脚を広めに置いて、転がる勢いを受け止める
    const standLeg = L => { const F = L.front ? Fc : Fh, n = nominal(L, F), c = Math.cos(yaw), s = Math.sin(yaw), w = (g.phase === 'hind' ? 0.06 : 0.05) * L.s; legToward(L, F, { x: n.x + w * c, y: floorAt(n.x, n.z) + 0.02, z: n.z - w * s }); };
    // 体が前後の軸のまわりに回る速さ
    const rollRate = n => { const q = parts[n].body.rotation(), f = rotV(q, { x: 0, y: 0, z: 1 }), w = parts[n].body.angvel(); return w.x * f.x + w.y * f.y + w.z * f.z; };
    const K = L0 => 1.6 * clamp(Math.abs(L0) / 0.8, 0.45, 1); // 起きる直前はひねりをゆるめる（勢いで反対へ転がらないように）
    if (g.phase === 'front') {
      // 前脚をたたんで回りやすく、後ろ脚は広げて床につっぱる。先に起きた方の半身の脚で床をつかむ
      for (const L of LEGS) (L.front ? TUCK : SPREAD)(L);
      joints.spR.target = clamp(tw - K(ec) * ec, -2.9, 2.9);
      if (Math.abs(ec) < 0.4) { g.phase = 'plant'; g.first = 'front'; g.t = 0; }
      else if (Math.abs(eh) < 0.4) { g.phase = 'plant'; g.first = 'hind'; g.t = 0; }
      else if (g.t > 1.0) { g.phase = 'kick'; g.t = 0; }
    } else if (g.phase === 'plant') {
      const F = g.first === 'front';
      for (const L of LEGS) (L.front === F) ? standLeg(L) : TUCK(L);
      joints.spR.target = tw;
      if (g.t > 0.3) { g.phase = 'hind'; g.t = 0; g.twT = null; }
    } else if (g.phase === 'hind') {
      // 起きた方の脚でふんばり、もう片方の脚をたたんで、ひねりを戻してもう半身を起こす
      const F = g.first === 'front', e = F ? eh : ec, e0 = F ? ec : eh;
      // 起こしている半身が横向きまで来たら、その脚も床へ伸ばして押し上げる
      for (const L of LEGS) (L.front === F || Math.abs(e) < 1.2) ? standLeg(L) : TUCK(L);
      // ひねりを戻すと、起きている半身にそろう（少しずつ戻す）
      if (g.twT == null) g.twT = tw;
      g.twT += clamp(-g.twT, -2 * DT, 2 * DT);
      joints.spR.target = clamp(g.twT, tw - 0.7, tw + 0.7);
      if (Math.abs(tw) < 0.35 && Math.abs(e) < 1.3 && Math.abs(e0) < 1.3 && Math.abs(rollRate('chest')) < 2.5 && Math.abs(rollRate('hips')) < 2.5) { g.phase = 'stand'; g.t = 0; }
      else if (g.t > 1.5 || Math.abs(e0) > 1.2) { g.phase = Math.abs(e0) > 0.8 ? 'front' : 'kick'; g.t = 0; }
    } else if (g.phase === 'kick') {
      for (const L of LEGS) { const ph = g.t * 6 + (L.front ? 0 : 1.6); legPose(L, 0.5 * Math.sin(ph), -0.5 * Math.cos(ph), L.front ? -1.0 : 1.0, 0); }
      setGains(0.5, 0.5, 1);
      joints.spR.target = 0;
      if (g.t > 0.5) { g.phase = 'front'; g.t = 0; }
    } else {
      for (const L of LEGS) standLeg(L);
      joints.spR.target = 0;
      if (upright && sim.grounded >= 3 && g.t > 0.3) { setState('land'); for (const L of LEGS) L.plant = { x: L.pawPos.x, z: L.pawPos.z }; }
      if ((!upright && g.t > 1.2) || sim.upC < 0.2 || sim.upH < 0.2) { g.phase = 'front'; g.t = 0; }
    }
    joints.spP.target = 0; joints.spY.target = 0;
    aimHead(0.5);
    if (sim.grounded === 0 && !sim.bodyLow && sim.height > 0.3) { setState('air'); sim.air = { phase: 'twist' }; }
  }

  sim.step = () => {
    control();
    world.step();
    sim.stateT += DT; sim.time += DT;
  };

  // つまむ・動かす・放す
  sim.grab = null;
  sim.startGrab = (part, worldPoint) => {
    // どこをつまんでも、背中の真ん中（全身の重心の真上）を持つ。こうすると猫は水平にぶら下がり、離すと足から落ちる
    const b = parts.chest.body, t = b.translation(), q = b.rotation();
    const local = { x: 0, y: 0.085, z: COM0 - parts.chest.home[2] };
    const lw = rotV(q, local), anchor = { x: t.x + lw.x, y: t.y + lw.y, z: t.z + lw.z };
    // 手は胸の向き（水平・今の向き）のまま持つ。くるくる回らないので、離した時に回転が残らない
    const yaw = sim.yaw, hq = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const hand = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(anchor.x, anchor.y, anchor.z).setRotation(hq));
    const joint = world.createImpulseJoint(R.JointData.fixed(local, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), b, hand, true);
    // 指の位置とつまむ点のずれはそのまま保つ
    const off = { x: anchor.x - worldPoint.x, y: anchor.y - worldPoint.y, z: anchor.z - worldPoint.z };
    sim.grab = { part: parts.chest, local, target: { ...anchor }, hand, joint, off };
    setState('held');
  };
  sim.moveGrab = p => { const g = sim.grab; if (g) g.target = { x: p.x + g.off.x, y: p.y + g.off.y, z: p.z + g.off.z }; };
  sim.release = (maxV = 6.5) => {
    if (!sim.grab) return;
    world.removeImpulseJoint(sim.grab.joint, true);
    world.removeRigidBody(sim.grab.hand);
    sim.grab = null;
  };
  // 置き物（クッションなど）の当たり判定
  sim.addCylinder = (x, z, r, h, friction = 0.9) => (props.push({ x, z, r, h }), world.createCollider(R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, h / 2, z).setFriction(friction).setRestitution(0.05).setCollisionGroups(GROUND)));
  sim.floorAt = floorAt;

  // 起動時に少し回して落ち着かせる
  if (opt.warm !== false) for (let i = 0; i < 120; i++) sim.step();
  sim.time = 0;
  return sim;
}
