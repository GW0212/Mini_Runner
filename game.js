(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const finalScoreEl = document.getElementById('finalScore');
  const guideList = document.getElementById('guideList');
  const ovTitle = document.getElementById('ov-title');
  const ovSub = document.getElementById('ov-sub');

  // WebAudio simple beeps
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq=440, dur=0.08, type='sine', gain=0.06) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }
  const sfx = {
    jump(){ ensureAudio(); beep(520, 0.09, 'square', 0.07); },
    pass(){ ensureAudio(); beep(760, 0.05, 'triangle', 0.05); },
    hit(){ ensureAudio(); beep(140, 0.18, 'sawtooth', 0.08); },
    milestone(){
      ensureAudio();
      beep(660, 0.08, 'sine', 0.06);
      setTimeout(()=>beep(880, 0.08, 'sine', 0.06), 90);
      setTimeout(()=>beep(1040, 0.1, 'sine', 0.06), 180);
    }
  };

  // Prevent page scroll on space
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
    }
  });

  const W = canvas.width;
  const H = canvas.height;

  // Game state
  let running = false;
  let score = 0;
  let highScore = Number(localStorage.getItem('miniRunnerHighScore') || 0);
  highScoreEl.textContent = highScore;
  let nextMilestone = 1000;
  let fireworks = []; // particles
  let milestoneTimer = 0; // ms
  let elapsed = 0; // ms since run start

  // World params
  const gravity = 0.55;
  const groundY = H - 48;
  let speed = 4.6; // slower start
  let minGap = 220; // larger gaps early
  let maxGap = 340;
  let lastObstacleX = 0;

  // Player (with ducking)
  const player = {
    x: 110,
    y: groundY,
    w: 36,
    h: 44,
    vy: 0,
    onGround: true,
    duck: false,
    get hitbox(){
      if (!this.duck) return {x:this.x, y:this.y - this.h, w:this.w, h:this.h};
      // crouch: wider, shorter
      return {x:this.x, y:this.y - 28, w:48, h:28};
    }
  };

  // Obstacles
  const obstacles = []; // {type, x,y,w,h,parts?,passed?,flap?}

  function reset() {
    score = 0;
    speed = 6;
    nextMilestone = 1000;
    milestoneTimer = 0;
    fireworks = [];
    lastObstacleX = 0;
    obstacles.length = 0;
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
    player.duck = false;
    updateScoreUI();
  }

  function updateScoreUI() {
    scoreEl.textContent = Math.floor(score);
    highScoreEl.textContent = highScore;
  }

  function jump() {
    if (!running) return;
    if (player.onGround && !player.duck) {
      player.vy = -10;
      player.onGround = false;
      sfx.jump();
    }
  }

  function setDuck(v) {
    if (!running) return;
    player.duck = v;
  }

  function onTap() {
    if (!running) {
      startGame();
    } else {
      jump();
    }
  }

  canvas.addEventListener('pointerdown', onTap);
  // 모바일 전용 버튼 연결
  const controls = document.getElementById('mobileControls');
  const btnJump = document.getElementById('btnJump');
  const btnDuck = document.getElementById('btnDuck');
  const touchLike = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

  if (controls && touchLike){
    controls.setAttribute('aria-hidden','false');
    // 점프: 클릭/터치 시 단발
    btnJump && btnJump.addEventListener('pointerdown', (e)=>{ e.preventDefault(); if(!running) startGame(); else jump(); });
    // 엎드리기: 누르는 동안 유지
    const duckOn = (e)=>{ e.preventDefault(); setDuck(true); };
    const duckOff = (e)=>{ e.preventDefault(); setDuck(false); };
    if (btnDuck){
      btnDuck.addEventListener('pointerdown', duckOn);
      btnDuck.addEventListener('pointerup', duckOff);
      btnDuck.addEventListener('pointerleave', duckOff);
      btnDuck.addEventListener('pointercancel', duckOff);
    }
  } else if (controls){
    controls.style.display = 'none';
  }

  startBtn.addEventListener('click', () => startGame());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      if (!running) startGame();
      else jump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      setDuck(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      setDuck(false);
    }
  });

  function startGame() {
    ensureAudio(); // user gesture
    reset();
    running = true;
    overlay.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    overlay.classList.remove('hidden');
    if (guideList) guideList.style.display = 'none';
    if (startBtn) startBtn.textContent = '다시 시작';
    if (ovTitle) ovTitle.textContent = '게임 오버!';
    if (ovSub) ovSub.textContent = '';
    if (finalScoreEl) {finalScoreEl.textContent = `최종 점수 : ${Math.floor(score)}점`; finalScoreEl.style.display = 'block';}
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('miniRunnerHighScore', highScore);
    }
    sfx.hit();
    updateScoreUI();
  }

  // background dots
  const layers = [
    { speed: 0.3, dots: makeDots(30, '#e5e7eb') },
    { speed: 0.7, dots: makeDots(20, '#d1d5db') },
  ];

  function makeDots(n, color) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * (H - 60),
        r: Math.random() * 2 + 0.5,
        color,
      });
    }
    return arr;
  }

  let groundOffset = 0;

  function maybeSpawn() {
    // Grace: first 2s no spawns, next 8s sparse
    if (elapsed < 2000) return;
    if (elapsed < 10000 && Math.random() < 0.6) return;
    const rightmost = obstacles.reduce((m, o) => Math.max(m, o.x + o.w), 0);
    const gap = (rightmost || lastObstacleX) ? (W - (rightmost || lastObstacleX)) : W;
    if (gap < minGap + Math.random() * (maxGap - minGap)) return;

    const canBird = score > 300;
    const roll = Math.random();
    if (score > 600 && roll < 0.15) {
      spawnBar(); // overhead bar appears later
    } else if (canBird && roll < 0.35) {
      spawnBird();
    } else {
      spawnCactusGroup();
    }
  }

  function spawnCactusGroup() {
    const groupCount = 1 + Math.floor(Math.random() * 3);
    const sizeType = Math.random() < 0.5 ? 'small' : 'large';
    const baseH = sizeType === 'small' ? 34 : 50;
    const baseW = sizeType === 'small' ? 18 : 24;
    const spacing = 10;

    const parts = [];
    let totalW = 0;
    for (let i = 0; i < groupCount; i++) {
      const w = baseW + (Math.random() < 0.4 ? 6 : 0);
      const h = baseH + (Math.random() < 0.4 ? 8 : 0);
      const xoff = i === 0 ? 0 : totalW + spacing;
      parts.push({ x: xoff, w, h });
      totalW = xoff + w;
    }

    const g = {
      type: 'cactus',
      x: W + 20,
      y: groundY,
      w: totalW,
      h: Math.max(...parts.map(p => p.h)),
      parts,
      passed: false,
    };
    obstacles.push(g);
    lastObstacleX = g.x + g.w;
  }

  function spawnBird() {
    // low/mid/high — mid forces duck
    const heights = [groundY - 26, groundY - 48, groundY - 72];
    const height = heights[Math.floor(Math.random() * heights.length)];
    const w = 40, h = 24;
    obstacles.push({
      type: 'bird',
      x: W + 20,
      y: height,
      w, h,
      flap: 0,
      passed: false,
    });
  }

  function spawnBar() {
    // overhead horizontal bar that requires ducking
    const w = 50 + Math.floor(Math.random() * 40);
    const h = 14;
    const y = groundY - 58 - Math.floor(Math.random() * 6); // around head height
    obstacles.push({
      type: 'bar',
      x: W + 20,
      y: y,
      w, h,
      passed: false,
    });
  }

  function rectsIntersect(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function checkCollision(o) {
    const hb = player.hitbox;
    if (o.type === 'cactus') {
      for (const p of o.parts) {
        const rect = { x: o.x + p.x, y: o.y - p.h, w: p.w, h: p.h };
        if (rectsIntersect(hb, rect)) return true;
      }
    } else if (o.type === 'bird') {
      const rect = { x: o.x, y: o.y - o.h, w: o.w, h: o.h };
      // ducking helps vs mid bar/low bird
      if (rectsIntersect(hb, rect)) return true;
    } else if (o.type === 'bar') {
      const rect = { x: o.x, y: o.y, w: o.w, h: o.h };
      if (rectsIntersect(hb, rect)) return true;
    }
    return false;
  }

  function drawBackground(dt) {
    // white fill
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // parallax dots
    layers.forEach(layer => {
      layer.dots.forEach(d => {
        d.x -= layer.speed * speed * dt * 0.06;
        if (d.x + d.r < 0) d.x = W + d.r;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // ground
    groundOffset = (groundOffset + speed * dt * 0.12) % 40;
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    // ground ticks
    ctx.strokeStyle = '#e5e7eb';
    for (let x = -groundOffset; x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 8);
      ctx.lineTo(x + 20, groundY + 16);
      ctx.stroke();
    }

    // milestone flag
    if (milestoneTimer > 0) {
      // flag at right
      const fx = W - 50;
      const fy = groundY;
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 44);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(fx, fy - 44);
      ctx.lineTo(fx + 26, fy - 36);
      ctx.lineTo(fx, fy - 28);
      ctx.closePath();
      ctx.fill();
    }
  }

  function spawnFirework(x, y) {
    // particles radial
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1.5 + Math.random() * 2.2;
      fireworks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 900, // ms
        color: ['#f87171','#34d399','#60a5fa','#fbbf24'][i % 4]
      });
    }
  }

  function drawFireworks(dt) {
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const p = fireworks[i];
      p.life -= dt;
      p.x += p.vx * (dt * 0.1);
      p.y += p.vy * (dt * 0.1);
      p.vy += 0.002 * dt; // slight gravity
      if (p.life <= 0) { fireworks.splice(i,1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / 900);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let lastTime = 0;

  function loop(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(32, ts - lastTime);
    lastTime = ts;

    // Update
    score += dt * 0.02;
    elapsed += dt;

    // Smooth difficulty ramp using elapsed time (0s -> 120s)
    const rampT = Math.min(1, elapsed / 120000); // 0..1 over 120s
    const eased = easeInOutCubic(rampT);

    // Speed: from 4.6 -> 13 with easing
    speed = 4.6 + eased * (13 - 4.6);

    // Gaps shrink with score and easing
    const baseMin = 220, baseMax = 340; // start generous
    const hardMin = 110, hardMax = 170; // late-game tight
    minGap = Math.round(baseMin + (hardMin - baseMin) * eased);
    maxGap = Math.round(baseMax + (hardMax - baseMax) * eased);


    // Milestone check
    if (Math.floor(score) >= nextMilestone) {
      // trigger celebration once
      milestoneTimer = 1500; // ms
      nextMilestone += 1000;
      spawnFirework(W - 90, 60 + Math.random()*40);
      spawnFirework(W - 140, 70 + Math.random()*40);
      spawnFirework(W - 60, 40 + Math.random()*40);
      sfx.milestone();
    }
    if (milestoneTimer > 0) milestoneTimer -= dt;

    maybeSpawn();

    // physics
    player.vy += gravity;
    player.y += player.vy;
    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }

    // Move obstacles & check pass/collision
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= speed;

      if (!o.passed && o.x + o.w < player.x) {
        o.passed = true;
        score += 10;
        sfx.pass();
      }

      if (checkCollision(o)) { endGame(); return; }

      if (o.x + o.w < -40) obstacles.splice(i, 1);
    }

    // Draw
    drawBackground(dt);
    drawPlayer();
    obstacles.forEach(o => drawObstacle(o));
    drawFireworks(dt);

    updateScoreUI();
    requestAnimationFrame(loop);
  }

  function drawPlayer() {
    const hb = player.hitbox;
    ctx.save();
    // Draw as silhouette rounded rect
    ctx.fillStyle = '#111827';
    roundRect(ctx, hb.x, hb.y, hb.w, hb.h, 8, true, false);
    // small eye (only if not ducking for visibility)
    if (!player.duck) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hb.x + hb.w*0.68, hb.y + 10, 3, 3);
    }
    ctx.restore();

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(player.x + player.w/2, groundY + 5, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawObstacle(o) {
    if (o.type === 'cactus') drawCactusGroup(o);
    else if (o.type === 'bird') drawBird(o);
    else if (o.type === 'bar') drawBar(o);
  }

  function drawCactusGroup(g) {
    ctx.save();
    ctx.fillStyle = '#1f2937';
    for (const p of g.parts) {
      const x = g.x + p.x;
      const y = g.y;
      const w = p.w;
      const h = p.h;
      ctx.fillRect(x + w*0.4, y - h, w*0.2, h);
      const armH = Math.max(8, h * 0.35);
      ctx.fillRect(x, y - armH - h*0.4, w*0.4, 6);
      ctx.fillRect(x + w*0.6, y - armH - h*0.65, w*0.4, 6);
      ctx.fillRect(x + w*0.05, y - h, 6, 8);
      ctx.fillRect(x + w*0.8, y - h + 6, 6, 8);
    }
    ctx.restore();
  }

  function drawBird(b) {
    ctx.save();
    ctx.translate(b.x, b.y - b.h);
    ctx.fillStyle = '#374151';
    roundRect(ctx, 0, 6, b.w, b.h-6, 6, true, false);
    const wingY = Math.sin((b.flap+=0.12)) * 6;
    ctx.fillRect(8, 6 + wingY, 14, 6);
    ctx.fillRect(b.w - 22, 6 - wingY, 14, 6);
    ctx.fillStyle = '#111827';
    ctx.fillRect(b.w - 4, b.h/2, 4, 3);
    ctx.restore();
  }

  function drawBar(bar) {
    ctx.save();
    ctx.fillStyle = '#6b7280';
    roundRect(ctx, bar.x, bar.y, bar.w, bar.h, 6, true, false);
    ctx.restore();
  }

  function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // initial overlay text
  document.getElementById('ov-title').textContent = '게임 방법';
  function showStartOverlay(){
    if (guideList) guideList.style.display = 'block';
    if (startBtn) startBtn.textContent = '게임 시작';
    if (ovTitle) ovTitle.textContent = '게임 방법';
    if (ovSub) ovSub.textContent = '스페이스/탭: 점프 · ↓/S: 엎드리기';
    if (finalScoreEl) finalScoreEl.style.display = 'none';
  }
  showStartOverlay();
  document.getElementById('ov-sub').textContent = '스페이스/탭: 점프 · ↓/S: 엎드리기';

})();