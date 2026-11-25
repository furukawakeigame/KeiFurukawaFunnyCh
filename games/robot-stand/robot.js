// ===== ロボットの物理（three.js に依存しない） =====
// 立ったときの姿勢で全部の剛体を回転なしで作る → 関節の角度 0 = 直立
export function createSim(R) {
  const DT = 1 / 120, G = 9.81;
  const world = new R.World({ x: 0, y: -G, z: 0 });
  world.timestep = DT;
  world.integrationParameters.numSolverIterations = 8;
  const events = new R.EventQueue(true);

  const GROUND = (0x1 << 16) | 0xffff, ROBOT = (0x2 << 16) | 0x5, BALL = (0x4 << 16) | 0x7, NONE = 0;
  world.createCollider(R.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(1).setRestitution(0.2).setCollisionGroups(GROUND));

  // ---- 寸法（メートル）----
  const HIP_X = 0.1, HIP_Y = 0.87, KNEE_Y = 0.47, ANKLE_Y = 0.09, L1 = HIP_Y - KNEE_Y, L2 = KNEE_Y - ANKLE_Y;
  const PELVIS_Y = 0.92, STAND_H = 0.905, SH_X = 0.25, SH_Y = 1.38, ELB_Y = 1.09, NECK_Y = 1.46;
  const parts = {}, partList = [], colliderPart = new Map();
  let totalMass = 0;
  function part(name, shape, pos, mass, opts = {}) {
    const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos[0], pos[1], pos[2])
      .setLinearDamping(0.05).setAngularDamping(0.3).setCanSleep(false));
    let cd;
    if (shape[0] === 'box') cd = R.ColliderDesc.cuboid(shape[1], shape[2], shape[3]);
    else if (shape[0] === 'cap') cd = R.ColliderDesc.capsule(shape[1], shape[2]);
    else cd = R.ColliderDesc.ball(shape[1]);
    if (opts.offset) cd.setTranslation(...opts.offset);
    if (opts.ghost) cd.setMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: 0.03, y: 0.03, z: 0.03 }, { x: 0, y: 0, z: 0, w: 1 });
    else cd.setMass(mass);
    cd.setFriction(opts.friction ?? 0.6).setRestitution(0.15)
      .setCollisionGroups(opts.ghost ? NONE : ROBOT).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const c = world.createCollider(cd, b);
    const p = { name, body: b, collider: c, shape, mass, home: pos.slice(), ghost: !!opts.ghost };
    parts[name] = p; partList.push(p); colliderPart.set(c.handle, p);
    totalMass += mass;
    return p;
  }
  part('pelvis', ['box', 0.15, 0.07, 0.1], [0, PELVIS_Y, 0], 7);
  part('waistY', ['ball', 0.03], [0, 0.99, 0], 0.4, { ghost: true });
  part('torso', ['box', 0.19, 0.22, 0.12], [0, 1.22, 0], 11);
  part('head', ['box', 0.15, 0.12, 0.13], [0, 1.6, 0], 3);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    part('hipY' + k, ['ball', 0.03], [s * HIP_X, HIP_Y, 0], 0.4, { ghost: true });
    part('thigh' + k, ['cap', 0.135, 0.065], [s * HIP_X, (HIP_Y + KNEE_Y) / 2, 0], 4);
    part('shin' + k, ['cap', 0.13, 0.06], [s * HIP_X, (KNEE_Y + ANKLE_Y) / 2, 0], 3);
    part('ankY' + k, ['ball', 0.03], [s * HIP_X, ANKLE_Y, 0], 0.3, { ghost: true });
    part('foot' + k, ['box', 0.07, 0.045, 0.125], [s * HIP_X, 0.045, 0.03], 1.6, { friction: 1.2 });
    part('shY' + k, ['ball', 0.03], [s * SH_X, SH_Y, 0], 0.3, { ghost: true });
    part('upper' + k, ['cap', 0.1, 0.05], [s * SH_X, (SH_Y + ELB_Y) / 2, 0], 2);
    part('fore' + k, ['cap', 0.1, 0.045], [s * SH_X, ELB_Y - 0.15, 0], 1.6);
  }

  const joints = {};
  function rev(name, a, b, anchor, axis, lo, hi, kp, kd) {
    const A = parts[a], B = parts[b];
    const la = { x: anchor[0] - A.home[0], y: anchor[1] - A.home[1], z: anchor[2] - A.home[2] };
    const lb = { x: anchor[0] - B.home[0], y: anchor[1] - B.home[1], z: anchor[2] - B.home[2] };
    const ax = axis === 'x' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    const j = world.createImpulseJoint(R.JointData.revolute(la, lb, ax), A.body, B.body, true);
    j.setLimits(lo, hi);
    j.configureMotorModel(R.MotorModel.ForceBased);
    const jj = { name, j, kp, kd, target: 0, lo, hi, gain: 1 };
    joints[name] = jj;
    return jj;
  }
  rev('waistP', 'pelvis', 'waistY', [0, 0.99, 0], 'x', -0.4, 1.3, 900, 40);
  rev('waistR', 'waistY', 'torso', [0, 0.99, 0], 'z', -0.4, 0.4, 900, 40);
  rev('neck', 'torso', 'head', [0, NECK_Y, 0], 'x', -0.5, 0.6, 120, 6);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    // 外に開く向きが正になるよう、左右で限界を入れ替える
    const out = (a, b) => s > 0 ? [a, b] : [-b, -a];
    rev('hipR' + k, 'pelvis', 'hipY' + k, [s * HIP_X, HIP_Y, 0], 'z', ...out(-0.25, 0.7), 1400, 50);
    rev('hipP' + k, 'hipY' + k, 'thigh' + k, [s * HIP_X, HIP_Y, 0], 'x', -1.9, 0.6, 1400, 50);
    rev('knee' + k, 'thigh' + k, 'shin' + k, [s * HIP_X, KNEE_Y, 0], 'x', 0, 2.4, 1200, 40);
    rev('ankP' + k, 'shin' + k, 'ankY' + k, [s * HIP_X, ANKLE_Y, 0], 'x', -0.9, 0.9, 700, 20);
    rev('ankR' + k, 'ankY' + k, 'foot' + k, [s * HIP_X, ANKLE_Y, 0], 'z', -0.45, 0.45, 500, 15);
    rev('shP' + k, 'torso', 'shY' + k, [s * SH_X, SH_Y, 0], 'x', -3.0, 1.0, 140, 6);
    rev('shR' + k, 'shY' + k, 'upper' + k, [s * SH_X, SH_Y, 0], 'z', ...out(-0.1, 2.6), 140, 6);
    rev('elb' + k, 'upper' + k, 'fore' + k, [s * SH_X, ELB_Y, 0], 'x', -2.4, 0, 80, 4);
  }
  const jointList = Object.values(joints);

  // ---- 小さなベクトル・クォータニオン ----
  const rotV = (q, v) => { // q * v * q^-1
    const { x, y, z, w } = q, ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
    return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  // ---- 状態 ----
  const sim = {
    world, parts, partList, joints, colliderPart, totalMass, DT,
    state: 'stand', stateT: 0, tilt: 0, stagger: 0, time: 0,
    com: { x: 0, y: 0, z: 0 }, comV: { x: 0, y: 0, z: 0 },
    swing: null, stepCool: 0, hits: [], balls: [], onStep: null, onFall: null, onGetup: null, onLand: null,
  };
  const feet = [{ s: -1, k: 'R' }, { s: 1, k: 'L' }];

  function measure() {
    let m = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
    for (const p of partList) {
      const t = p.body.translation(), v = p.body.linvel(), w = p.mass;
      m += w; cx += t.x * w; cy += t.y * w; cz += t.z * w; vx += v.x * w; vy += v.y * w; vz += v.z * w;
    }
    sim.com = { x: cx / m, y: cy / m, z: cz / m }; sim.comV = { x: vx / m, y: vy / m, z: vz / m };
    const up = rotV(parts.torso.body.rotation(), { x: 0, y: 1, z: 0 });
    sim.tilt = Math.acos(clamp(up.y, -1, 1));
    const pf = rotV(parts.pelvis.body.rotation(), { x: 0, y: 0, z: 1 });
    sim.yaw = Math.atan2(pf.x, pf.z);
    for (const f of feet) {
      const b = parts['foot' + f.k].body, t = b.translation(), fu = rotV(b.rotation(), { x: 0, y: 1, z: 0 });
      // 足首の位置（足の中心から上に少し・かかと寄り）
      const a = rotV(b.rotation(), { x: 0, y: ANKLE_Y - 0.045, z: -0.03 });
      f.ankle = { x: t.x + a.x, y: t.y + a.y, z: t.z + a.z };
      f.ground = t.y < 0.09 && fu.y > 0.85;
    }
  }

  // 脚の逆運動学: 骨盤の座標で見た足首の位置 v → 5つの関節角
  function legIK(k, s, v, ankPitchAdd = 0, ankRollAdd = 0) {
    const r = Math.atan2(v.x, -v.y);
    const ly = Math.hypot(v.x, v.y), D = clamp(Math.hypot(ly, v.z), 0.25, L1 + L2 - 0.002);
    const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const beta = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const alpha = Math.atan2(v.z, ly);
    const p = -(alpha + beta);
    joints['hipR' + k].target = r; joints['hipP' + k].target = p; joints['knee' + k].target = knee;
    joints['ankP' + k].target = -(p + knee) + ankPitchAdd; joints['ankR' + k].target = -r + ankRollAdd;
  }

  // 骨盤の「なりたい位置」から、足首の世界座標を骨盤の座標に直す
  function legsToward(P, yaw, targets) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const f of feet) {
      const A = targets[f.k];
      const hx = P.x + c * f.s * HIP_X, hz = P.z - sn * f.s * HIP_X, hy = P.y + (HIP_Y - PELVIS_Y);
      const dx = A.x - hx, dy = A.y - hy, dz = A.z - hz;
      // 世界 → 骨盤（向きだけ）
      const v = { x: c * dx - sn * dz, y: dy, z: sn * dx + c * dz };
      legIK(f.k, f.s, v);
    }
  }

  function setGains(g, legs = g, arms = g) {
    for (const j of jointList) {
      const n = j.name;
      j.gain = /^(hip|knee|ank)/.test(n) ? legs : /^(sh|elb)/.test(n) ? arms : g;
    }
  }

  // 上体をまっすぐに戻す補助（倒れないための「ずる」は小さく、起き上がりの時だけ強く）
  function uprightAssist(name, kp, kd, max) {
    const b = parts[name].body, q = b.rotation(), up = rotV(q, { x: 0, y: 1, z: 0 }), w = b.angvel();
    // up → (0,1,0) へ回す軸 = up × Y
    let ax = -up.z, az = up.x; // up × (0,1,0) = (-up.z, 0, up.x)
    const ang = Math.acos(clamp(up.y, -1, 1)), sl = Math.hypot(ax, az) || 1;
    ax /= sl; az /= sl;
    let tx = kp * ang * ax - kd * w.x, tz = kp * ang * az - kd * w.z, ty = -kd * 0.3 * w.y;
    const tl = Math.hypot(tx, tz);
    if (tl > max) { tx *= max / tl; tz *= max / tl; }
    b.applyTorqueImpulse({ x: tx * DT, y: ty * DT, z: tz * DT }, true);
  }

  const ARM_IDLE = { shP: 0.05, shR: 0.12, elb: -0.25 };
  function armPose(shP, shR, elb) {
    for (const k of ['R', 'L']) { joints['shP' + k].target = shP; joints['shR' + k].target = shR * (k === 'L' ? 1 : -1); joints['elb' + k].target = elb; }
  }

  function setState(s) { sim.state = s; sim.stateT = 0; }

  function control() {
    measure();
    const st = sim.state, t = sim.stateT;
    const pel = parts.pelvis.body, pt = pel.translation(), pv = pel.linvel();
    const yaw = sim.yaw, c = Math.cos(yaw), sn = Math.sin(yaw);
    const fwd = { x: sn, z: c }, side = { x: c, z: -sn }; // side = 骨盤の +x（L 側）
    const FL = feet[1], FR = feet[0];

    if (st === 'stand') {
      sim.stepCool -= DT;
      const Tc = Math.sqrt(0.9 / G);
      // 支えの中心
      let sx, sz;
      if (sim.swing) { const sf = feet.find(f => f !== sim.swing.foot); sx = sf.ankle.x; sz = sf.ankle.z; }
      else { sx = (FL.ankle.x + FR.ankle.x) / 2; sz = (FL.ankle.z + FR.ankle.z) / 2; }
      const ex = sim.com.x - sx, ez = sim.com.z - sz;
      const cpx = ex + sim.comV.x * Tc, cpz = ez + sim.comV.z * Tc;
      const cpF = cpx * fwd.x + cpz * fwd.z, cpS = cpx * side.x + cpz * side.z;
      const cpLen = Math.hypot(cpx, cpz);
      sim.stagger = clamp(cpLen / 0.25, 0, 1); sim.cpF = cpF; sim.cpS = cpS;

      // 踏み出し
      if (!sim.swing && sim.stepCool <= 0 && (cpF > 0.09 || cpF < -0.07 || Math.abs(cpS) > 0.1)) {
        let foot;
        if (Math.abs(cpS) > Math.abs(cpF) * 0.8) foot = cpS > 0 ? FL : FR;
        else { // 押された向きで後ろにある足を出す
          const dl = (FL.ankle.x - sx) * cpx + (FL.ankle.z - sz) * cpz, dr = (FR.ankle.x - sx) * cpx + (FR.ankle.z - sz) * cpz;
          foot = dl < dr ? FL : FR;
        }
        // 続けて踏むときは足を交互に
        if (sim.lastStep && sim.lastStep.k === foot.k && sim.time - sim.lastStep.t < 0.6) foot = foot === FL ? FR : FL;
        sim.swing = { foot, u: 0, start: { ...foot.ankle }, dur: 0.3 };
        sim.lastStep = { k: foot.k, t: sim.time };
        if (sim.onStep) sim.onStep(foot.k);
      }
      // 落ち着いたら、開いた足をそろえる
      sim.calm = cpLen < 0.06 ? (sim.calm || 0) + DT : 0;
      if (!sim.swing && sim.calm > 0.35) {
        let worst = null, wd = 0.05;
        for (const f of feet) {
          const o = f === FL ? FR : FL;
          const nx = o.ankle.x + side.x * f.s * 2 * HIP_X, nz = o.ankle.z + side.z * f.s * 2 * HIP_X;
          // 骨盤の真下からも離れすぎない
          const d = Math.hypot(f.ankle.x - nx, f.ankle.z - nz);
          if (d > wd) { wd = d; worst = { f, nx, nz }; }
        }
        if (worst) {
          const f = worst.f, o = f === FL ? FR : FL;
          // そろえる位置: 骨盤の下に両足が来るよう、相手の足と骨盤の中間あたり
          const mx = (pt.x + o.ankle.x) / 2 - side.x * o.s * HIP_X * 0, mz = (pt.z + o.ankle.z) / 2;
          const tx = mx + side.x * f.s * HIP_X + (o.ankle.x - (o.ankle.x + pt.x) / 2) * 0, tz = mz + side.z * f.s * HIP_X;
          sim.swing = { foot: f, u: 0, start: { ...f.ankle }, dur: 0.38, fixed: { x: worst.nx, z: worst.nz }, settle: true };
          sim.calm = 0;
          if (sim.onStep) sim.onStep(f.k);
        }
      }

      // 骨盤のなりたい位置: 今の位置から、倒れる向きと逆へずらす（足首と股関節の踏ん張り）
      const lean = 0.9, lx = clamp(-cpx * lean, -0.1, 0.1), lz = clamp(-cpz * lean, -0.1, 0.1);
      const P = { x: pt.x + lx, y: STAND_H - (sim.swing ? 0.02 : 0), z: pt.z + lz };
      const targets = {};
      for (const f of feet) targets[f.k] = { ...f.ankle, y: ANKLE_Y };
      if (sim.swing) {
        const sw = sim.swing, f = sw.foot;
        sw.u += DT / sw.dur;
        // 着地点: 重心＋捕捉点の先、腰幅ぶん横へ
        const ox = f.s * HIP_X * side.x, oz = f.s * HIP_X * side.z;
        let tx = sim.com.x + sim.comV.x * Tc * 1.15 + ox, tz = sim.com.z + sim.comV.z * Tc * 1.15 + oz;
        const other = feet.find(g => g !== f);
        // 足が交差しないように: 相手の足より外側
        const rel = (tx - other.ankle.x) * side.x + (tz - other.ankle.z) * side.z;
        if (rel * f.s < 0.14) { const d = 0.14 * f.s - rel; tx += d * side.x; tz += d * side.z; }
        // 一歩の上限
        const sdx = tx - other.ankle.x, sdz = tz - other.ankle.z, sl = Math.hypot(sdx, sdz);
        if (sl > 0.55) { tx = other.ankle.x + sdx * 0.55 / sl; tz = other.ankle.z + sdz * 0.55 / sl; }
        if (sw.fixed) sw.target = sw.fixed; else if (sw.u < 0.6) sw.target = { x: tx, z: tz };
        const u = smooth(sw.u), tg = sw.target;
        targets[f.k] = { x: sw.start.x + (tg.x - sw.start.x) * u, y: ANKLE_Y + 0.1 * Math.sin(Math.PI * clamp(sw.u, 0, 1)), z: sw.start.z + (tg.z - sw.start.z) * u };
        if (sw.u >= 1 && (f.ground || sw.u > 1.4)) { sim.swing = null; sim.stepCool = 0.05; if (sim.onLand) sim.onLand(f.k); }
      }
      legsToward(P, yaw, targets);
      // 足首でも踏ん張る
      for (const f of feet) {
        if (sim.swing && sim.swing.foot === f) continue;
        joints['ankP' + f.k].target += clamp(cpF * 1.2, -0.25, 0.25);
        joints['ankR' + f.k].target += clamp(-cpS * 2, -0.25, 0.25);
      }
      joints.waistP.target = clamp(-cpF * 0.8, -0.3, 0.4); joints.waistR.target = clamp(cpS * 0.8, -0.3, 0.3);
      joints.neck.target = 0;
      // 腕: よろけるほど広げてバランスを取る
      const a = sim.stagger;
      armPose(ARM_IDLE.shP + cpF * 1.0, ARM_IDLE.shR + a * 1.3, ARM_IDLE.elb - a * 0.6);
      setGains(1);
      uprightAssist('torso', 250, 30, 45);
      uprightAssist('pelvis', 120, 10, 25);
      if (sim.tilt > 0.7 || pt.y < 0.62) { setState('fallen'); sim.swing = null; if (sim.onFall) sim.onFall(); }
    } else if (st === 'fallen') {
      setGains(0.03, 0.03, 0.03);
      // 力が抜けた姿勢（少しだけ縮こまる）
      for (const j of jointList) j.target = 0;
      for (const k of ['R', 'L']) { joints['knee' + k].target = 0.4; joints['hipP' + k].target = -0.3; joints['elb' + k].target = -0.5; }
      const sp = Math.hypot(pv.x, pv.y, pv.z);
      if (t > 2.6 && sp < 0.4) { setState('getup'); if (sim.onGetup) sim.onGetup(); }
    } else if (st === 'getup') {
      // 1) しゃがんだ姿勢まで上体を起こす → 2) 立ち上がる
      const T1 = 1.1, T2 = 2.1;
      const g = smooth(t / 0.5);
      setGains(0.03 + 0.97 * g);
      let h;
      if (t < T1) h = 0.5; else h = 0.5 + (STAND_H - 0.5) * smooth((t - T1) / (T2 - T1));
      const P = { x: pt.x, y: h, z: pt.z };
      const targets = {};
      for (const f of feet) {
        // 足は骨盤の真下へ
        const hx = P.x + c * f.s * HIP_X, hz = P.z - sn * f.s * HIP_X;
        targets[f.k] = { x: hx + fwd.x * 0.03, y: ANKLE_Y, z: hz + fwd.z * 0.03 };
      }
      legsToward(P, yaw, targets);
      joints.waistP.target = t < T1 ? 0.5 : 0.5 * (1 - smooth((t - T1) / (T2 - T1)));
      joints.waistR.target = 0; joints.neck.target = 0;
      if (t < T1) armPose(-0.9, 0.3, -0.3); else armPose(-0.9 * (1 - smooth((t - T1) / 0.6)) + 0.05, 0.4, -0.3);
      // 補助: 上体を起こし、腰を持ち上げる（だんだん弱める）
      const ramp = smooth(t / 0.7), fade = 1 - smooth((t - T2) / 0.6);
      const k = ramp * fade;
      uprightAssist('pelvis', 900 * k, 90 * k, 400 * k);
      uprightAssist('torso', 900 * k, 90 * k, 400 * k);
      const M = sim.totalMass;
      let fy = M * (G * 0.85 + 30 * (h - pt.y) - 9 * pv.y) * k;
      fy = clamp(fy, -200, M * G * 1.6);
      pel.applyImpulse({ x: -M * 4 * pv.x * k * DT, y: fy * DT, z: -M * 4 * pv.z * k * DT }, true);
      if (t > T2 + 0.6 && sim.tilt < 0.25) { setState('stand'); sim.stepCool = 0.2; }
      if (t > 6 || (t > 0.9 && sim.tilt > 1.1)) { setState('fallen'); if (sim.onFall) sim.onFall(); }
    }

    for (const j of jointList) j.j.configureMotorPosition(j.target, j.kp * j.gain, j.kd * Math.max(j.gain, 0.08));
  }

  sim.step = () => {
    control();
    world.step(events);
    sim.stateT += DT; sim.time += DT;
    sim.hits.length = 0;
    events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const b1 = sim.balls.find(b => b.collider.handle === h1 || b.collider.handle === h2);
      const p = colliderPart.get(h1) || colliderPart.get(h2);
      if (b1 && p) sim.hits.push({ ball: b1, part: p });
      else if (b1) sim.hits.push({ ball: b1, part: null });
      else if (p) sim.hits.push({ ball: null, part: p }); // ロボットと地面（自分どうしは当たらない）
    });
  };

  sim.throwBall = (pos, vel, r = 0.11, mass = 1.6) => {
    const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true).setAngularDamping(0.5));
    const c = world.createCollider(R.ColliderDesc.ball(r).setMass(mass).setRestitution(0.45).setFriction(0.5)
      .setCollisionGroups(BALL).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), b);
    const ball = { body: b, collider: c, r, age: 0 };
    sim.balls.push(ball);
    return ball;
  };
  sim.removeBall = ball => { world.removeRigidBody(ball.body); sim.balls.splice(sim.balls.indexOf(ball), 1); };

  // 起動時に少し回して落ち着かせる
  for (let i = 0; i < 60; i++) sim.step();
  sim.time = 0;
  return sim;
}
