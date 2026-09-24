const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.getElementById("score"),
  distance: document.getElementById("distance"),
  combo: document.getElementById("combo"),
  level: document.getElementById("level"),
  levelDots: document.getElementById("levelDots"),
  energyBar: document.getElementById("energyBar"),
  startPanel: document.getElementById("startPanel"),
  gameOverPanel: document.getElementById("gameOverPanel"),
  finalStats: document.getElementById("finalStats"),
  deathReason: document.getElementById("deathReason"),
  breachFlash: document.getElementById("breachFlash"),
  breachMessage: document.getElementById("breachMessage"),
  gameShell: document.getElementById("game-shell"),
  hudRight: document.querySelector(".hud-right"),
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  jumpBtn: document.getElementById("jumpBtn"),
  musicBtn: document.getElementById("musicBtn"),
  eventFeed: document.getElementById("eventFeed"),
  comboBanner: document.getElementById("comboBanner"),
  comboKicker: document.getElementById("comboKicker"),
  comboText: document.getElementById("comboText"),
  comboSub: document.getElementById("comboSub"),
  levelBanner: document.getElementById("levelBanner"),
  levelBannerText: document.getElementById("levelBannerText"),
  levelBannerSub: document.getElementById("levelBannerSub"),
};

const state = {
  running: false,
  paused: false,
  gameOver: false,
  score: 0,
  distance: 0,
  combo: 1,
  level: 1,
  energy: 100,
  speed: 0.011,
  lane: 1,
  targetLane: 1,
  orbY: 0,
  jumpVelocity: 0,
  obstacles: [],
  shards: [],
  particles: [],
  stars: [],
  buildings: [],
  lastSpawn: 0,
  lastShardSpawn: 0,
  lastTime: 0,
  audio: null,
  t: 0,
  shardStreak: 0,
  lastShardTime: 0,
  musicEnabled: false,
  ambienceTimer: null,
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!state.stars.length) {
    state.stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.5,
      s: Math.random() * 2 + 0.4,
      a: Math.random() * 0.75 + 0.15,
    }));
  }

  state.buildings = Array.from({ length: 24 }, (_, i) => ({
    side: i % 2 === 0 ? -1 : 1,
    depth: Math.random(),
    width: 35 + Math.random() * 70,
    height: 80 + Math.random() * 240,
    hue: Math.random() > 0.5 ? "cyan" : "pink",
  }));
}
addEventListener("resize", resize);
resize();

function initLevelDots() {
  ui.levelDots.innerHTML = "";
  for (let i = 1; i <= 8; i++) {
    const dot = document.createElement("span");
    dot.className = "level-dot";
    ui.levelDots.appendChild(dot);
  }
}
initLevelDots();

function updateLevelDots() {
  [...ui.levelDots.children].forEach((dot, i) => {
    dot.classList.toggle("active", i < Math.min(state.level, 8));
  });
}

function laneX(lane, depth = 0) {
  const w = innerWidth;
  const center = w * 0.5;

  const horizonSpacing = 18;
  const bottomSpacing = Math.min(w * 0.22, 240);

  const horizonX = center + (lane - 1) * horizonSpacing;
  const bottomX = center + (lane - 1) * bottomSpacing;

  return horizonX + (bottomX - horizonX) * depth;
}

function roadY(depth) {
  const horizon = innerHeight * 0.43;
  return horizon + (innerHeight - horizon) * Math.pow(depth, 1.55);
}

function roadHalfWidth(depth) {
  return 34 + Math.pow(depth, 1.5) * Math.min(innerWidth * 0.42, 520);
}

function playTone(freq, duration = 0.08, type = "sine", gain = 0.05) {
  try {
    if (!state.audio) {
      state.audio = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ac = state.audio;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  } catch {}
}

function playStartSound() {
  [220, 330, 440, 660].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.12, "sawtooth", 0.035), i * 85);
  });
}

function playPickupSound() {
  playTone(740, 0.06, "triangle", 0.04);
  setTimeout(() => playTone(1040, 0.08, "triangle", 0.035), 35);
}

function playHitSound() {
  playTone(90, 0.18, "sawtooth", 0.08);
}


function showEvent(text, tone = "good") {
  const el = document.createElement("div");
  el.className = `event-chip ${tone}`;
  el.textContent = text;
  ui.eventFeed.appendChild(el);
  setTimeout(() => el.remove(), 920);
}

function pulseComboBanner(kicker, main, sub) {
  ui.comboKicker.textContent = kicker;
  ui.comboText.textContent = main;
  ui.comboSub.textContent = sub;
  ui.comboBanner.classList.remove("active");
  void ui.comboBanner.offsetWidth;
  ui.comboBanner.classList.add("active");
}

function pulseLevelBanner(level) {
  ui.levelBannerText.textContent = `LEVEL ${level}`;
  ui.levelBannerSub.textContent =
    level >= 6 ? "HOSTILE NETWORK STATE // MAX ESCALATION" :
    level >= 4 ? "THREAT LAYER EXPANDED" :
    "NETWORK VELOCITY INCREASED";
  ui.levelBanner.classList.remove("active");
  void ui.levelBanner.offsetWidth;
  ui.levelBanner.classList.add("active");
}

function announceEnergyLoss(amount, reason) {
  showEvent(`⚠ ${reason} // ENERGY -${amount}`, "danger");
  ui.hudRight.classList.remove("energy-shake");
  void ui.hudRight.offsetWidth;
  ui.hudRight.classList.add("energy-shake");
}

function toggleMusic() {
  state.musicEnabled = !state.musicEnabled;
  ui.musicBtn.classList.toggle("music-on", state.musicEnabled);
  ui.musicBtn.textContent = state.musicEnabled ? "♫" : "♪";

  if (!state.musicEnabled) {
    if (state.ambienceTimer) clearInterval(state.ambienceTimer);
    state.ambienceTimer = null;
    return;
  }

  playTone(110, 0.18, "sine", 0.018);
  if (state.ambienceTimer) clearInterval(state.ambienceTimer);
  state.ambienceTimer = setInterval(() => {
    if (!state.musicEnabled || !state.running || state.paused) return;
    const base = 100 + state.level * 8;
    playTone(base, 0.18, "sine", 0.012);
    setTimeout(() => playTone(base * 1.5, 0.08, "triangle", 0.008), 120);
  }, 900);
}

function resetGame() {
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.score = 0;
  state.distance = 0;
  state.combo = 1;
  state.level = 1;
  state.energy = 100;
  state.speed = 0.011;
  state.lane = 1;
  state.targetLane = 1;
  state.orbY = 0;
  state.jumpVelocity = 0;
  state.obstacles = [];
  state.shards = [];
  state.particles = [];
  state.lastSpawn = 0;
  state.lastShardSpawn = 0;
  state.shardStreak = 0;
  state.lastShardTime = 0;
  state.lastTime = performance.now();
  ui.startPanel.classList.add("hidden");
  ui.gameOverPanel.classList.add("hidden");
  ui.deathReason.textContent = "SYSTEM BREACH";
  ui.breachFlash.classList.remove("active");
  ui.breachMessage.classList.remove("active");
  ui.gameShell.classList.remove("shake");
  ui.hudRight.classList.remove("energy-shake");
  playStartSound();
  updateUI();
}

function moveLeft() {
  if (!state.running || state.paused) return;
  state.targetLane = Math.max(0, state.targetLane - 1);
  playTone(250, 0.035, "square", 0.018);
}

function moveRight() {
  if (!state.running || state.paused) return;
  state.targetLane = Math.min(2, state.targetLane + 1);
  playTone(310, 0.035, "square", 0.018);
}

function jump() {
  if (!state.running || state.paused) return;
  if (state.orbY <= 0.001) {
    state.jumpVelocity = 1.25;
    playTone(460, 0.08, "triangle", 0.028);
  }
}

function togglePause() {
  if (!state.running || state.gameOver) return;
  state.paused = !state.paused;
  ui.pauseBtn.textContent = state.paused ? "▶" : "Ⅱ";
  if (!state.paused) state.lastTime = performance.now();
}

ui.startBtn.addEventListener("click", resetGame);
ui.restartBtn.addEventListener("click", resetGame);
ui.pauseBtn.addEventListener("click", togglePause);
ui.leftBtn.addEventListener("click", moveLeft);
ui.rightBtn.addEventListener("click", moveRight);
ui.jumpBtn.addEventListener("click", jump);
ui.musicBtn.addEventListener("click", toggleMusic);

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", " ", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
  if (e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "w") jump();
  if (e.key.toLowerCase() === "p") togglePause();
});

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const r = Math.random();
  let type = "firewall";

  // Early game: firewall + jumpable neon block.
  // After 3 KM: introduce hostile computer-themed objects.
  if (state.distance < 3) {
    type = r < 0.48 ? "firewall" : "block";
  } else if (state.distance < 5.5) {
    if (r < 0.35) type = "firewall";
    else if (r < 0.67) type = "block";
    else type = "malware";
  } else {
    if (r < 0.28) type = "firewall";
    else if (r < 0.52) type = "block";
    else if (r < 0.76) type = "malware";
    else type = "packet";
  }

  state.obstacles.push({
    lane,
    depth: 0.04,
    type,
    phase: Math.random() * Math.PI * 2,
    passed: false,
  });
}

function spawnShard() {
  state.shards.push({
    lane: Math.floor(Math.random() * 3),
    depth: 0.04,
    spin: Math.random() * Math.PI,
    collected: false,
  });
}

function addParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      life: 1,
      color,
      size: Math.random() * 3 + 1,
    });
  }
}

function triggerBreachFeedback() {
  ui.breachFlash.classList.remove("active");
  ui.breachMessage.classList.remove("active");
  ui.gameShell.classList.remove("shake");
  ui.hudRight.classList.remove("energy-shake");

  void ui.breachFlash.offsetWidth;

  ui.breachFlash.classList.add("active");
  ui.breachMessage.classList.add("active");
  ui.gameShell.classList.add("shake");
  ui.hudRight.classList.add("energy-shake");

  setTimeout(() => {
    ui.gameShell.classList.remove("shake");
    ui.hudRight.classList.remove("energy-shake");
  }, 500);
}

function endGame(reason = "ENERGY DEPLETED") {
  state.running = false;
  state.gameOver = true;
  ui.deathReason.textContent = reason;
  ui.finalStats.textContent =
    `Score ${Math.floor(state.score)} • Distance ${state.distance.toFixed(1)} KM`;

  setTimeout(() => {
    ui.gameOverPanel.classList.remove("hidden");
  }, reason === "FIREWALL BREACHED" ? 650 : 0);

  playHitSound();
}

function updateUI() {
  ui.score.textContent = String(Math.floor(state.score)).padStart(4, "0");
  ui.distance.textContent = `${state.distance.toFixed(1)} KM`;
  ui.combo.textContent = `x${state.combo}`;
  ui.level.textContent = state.level;
  ui.energyBar.style.width = `${Math.max(0, state.energy)}%`;
  ui.hudRight.classList.toggle("energy-critical", state.energy > 0 && state.energy <= 25);
  updateLevelDots();
}

function update(dt, now) {
  if (!state.running || state.paused) return;

  state.t += dt;
  state.distance += dt * (0.014 + state.level * 0.0018);
  state.score += dt * (11 + state.level * 2) * state.combo;
  state.energy -= dt * (0.42 + state.level * 0.05);

  if (state.shardStreak > 0 && performance.now() - state.lastShardTime > 2800) {
    state.shardStreak = 0;
  }

  const newLevel = Math.min(8, 1 + Math.floor(state.distance / 0.55));
  if (newLevel !== state.level) {
    state.level = newLevel;
    state.speed = 0.011 + (state.level - 1) * 0.0018;
    playTone(880, 0.16, "triangle", 0.04);
    pulseLevelBanner(state.level);
    showEvent(`SECTOR LEVEL ${state.level} // VELOCITY UP`, "warn");
  }

  if (state.distance >= 3 && state.distance - dt * (0.014 + state.level * 0.0018) < 3) {
    showEvent("SECTOR 03 UNLOCKED // HOSTILE PROCESSES DETECTED", "danger");
    pulseLevelBanner(Math.max(state.level, 3));
  }

  state.lane += (state.targetLane - state.lane) * Math.min(1, dt * 8);

  state.orbY += state.jumpVelocity * dt;
  state.jumpVelocity -= 3.1 * dt;
  if (state.orbY < 0) {
    state.orbY = 0;
    state.jumpVelocity = 0;
  }

  const obstacleInterval = Math.max(590, 1260 - state.level * 75);
  if (now - state.lastSpawn > obstacleInterval) {
    spawnObstacle();
    state.lastSpawn = now;
  }

  const shardInterval = Math.max(500, 980 - state.level * 36);
  if (now - state.lastShardSpawn > shardInterval) {
    spawnShard();
    state.lastShardSpawn = now;
  }

  for (const o of state.obstacles) {
    o.depth += state.speed * dt * 60;
    const sameLane = Math.abs(o.lane - state.lane) < 0.36;
    const collisionWindow = o.depth > 0.86 && o.depth < 1.00;

    if (!o.passed && collisionWindow && sameLane) {
      if (o.type === "firewall") {
        o.passed = true;
        const loss = Math.ceil(state.energy);
        state.energy = 0;

        const x = laneX(o.lane, 0.93);
        const y = roadY(0.93);
        addParticles(x, y, "#ff3bf7", 46);

        announceEnergyLoss(loss, "FIREWALL BREACH");
        triggerBreachFeedback();
        updateUI();
        endGame("FIREWALL BREACHED");
        return;
      }

      if (o.type === "packet") {
        o.passed = true;
        const loss = Math.min(55, Math.ceil(state.energy));
        state.energy = Math.max(0, state.energy - loss);
        state.combo = 1;
        state.shardStreak = 0;

        const x = laneX(o.lane, 0.93);
        const y = roadY(0.93);
        addParticles(x, y, "#ffb347", 34);
        announceEnergyLoss(loss, "PACKET CORRUPTION");
        playHitSound();

        if (state.energy <= 0) {
          updateUI();
          endGame("PACKET CORRUPTION");
          return;
        }
      }

      // Neon block and malware can be jumped.
      if (o.type === "block" || o.type === "malware") {
        const jumpThreshold = o.type === "malware" ? 0.29 : 0.22;
        const jumpedEnough = state.orbY > jumpThreshold;

        if (jumpedEnough) {
          o.passed = true;
          state.combo = Math.min(12, state.combo + 1);
          state.score += (o.type === "malware" ? 220 : 150) * state.combo;

          const x = laneX(o.lane, 0.93);
          const y = roadY(0.93);
          addParticles(x, y - 34, "#73f7ff", 14);
          showEvent(
            o.type === "malware"
              ? "MALWARE PROCESS BYPASSED // +220"
              : "OBSTACLE CLEARED // ROUTE STABLE",
            "good"
          );
          playTone(620, 0.06, "triangle", 0.022);
        } else {
          const loss = o.type === "malware" ? 48 : 35;
          state.energy = Math.max(0, state.energy - loss);
          state.combo = 1;
          state.shardStreak = 0;
          o.passed = true;

          const x = laneX(o.lane, 0.93);
          const y = roadY(0.93);
          addParticles(x, y, o.type === "malware" ? "#ff7a00" : "#ff3bf7", 30);

          announceEnergyLoss(
            loss,
            o.type === "malware" ? "MALWARE CONTACT" : "SYSTEM COLLISION"
          );
          playHitSound();

          if (state.energy <= 0) {
            updateUI();
            endGame("ENERGY DEPLETED");
            return;
          }
        }
      }
    }
  }

  for (const s of state.shards) {
    s.depth += state.speed * dt * 60;
    const sameLane = Math.abs(s.lane - state.lane) < 0.4;
    if (!s.collected && s.depth > 0.83 && s.depth < 1.03 && sameLane) {
      s.collected = true;

      const nowMs = performance.now();
      if (nowMs - state.lastShardTime < 2600) state.shardStreak += 1;
      else state.shardStreak = 1;
      state.lastShardTime = nowMs;

      const energyGain = 16;
      state.energy = Math.min(100, state.energy + energyGain);
      state.combo = Math.min(12, state.combo + 1);
      state.score += 95 * state.combo;

      const x = laneX(s.lane, 0.93);
      const y = roadY(0.93);
      addParticles(x, y, "#73f7ff", 24);

      if (state.shardStreak >= 2) {
        const streakName =
          state.shardStreak >= 8 ? "QUANTUM CHAIN" :
          state.shardStreak >= 5 ? "NEURAL LINK" :
          state.shardStreak >= 3 ? "PULSE SYNC" :
          "DATA CHAIN";

        pulseComboBanner(
          streakName,
          `x${state.shardStreak} SHARDS LINKED`,
          `ENERGY +${energyGain} // COMBO x${state.combo}`
        );

        showEvent(`${streakName} // ${state.shardStreak} SIGNALS LOCKED`, "good");
      } else {
        showEvent(`ENERGY SHARD ACQUIRED // +${energyGain}`, "good");
      }

      playPickupSound();
    }
  }

  state.obstacles = state.obstacles.filter((o) => o.depth < 1.18);
  state.shards = state.shards.filter((s) => s.depth < 1.18 && !s.collected);

  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt * 1.8;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  if (state.energy <= 0) {
    state.energy = 0;
    updateUI();
    endGame("ENERGY DEPLETED");
    return;
  }

  updateUI();
}

function drawBackground() {
  const w = innerWidth;
  const h = innerHeight;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#02040a");
  sky.addColorStop(0.38, "#071126");
  sky.addColorStop(0.67, "#180d35");
  sky.addColorStop(1, "#05060d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const dangerPhase = Math.min(1, Math.max(0, (state.distance - 3) / 4));

  const glow = ctx.createRadialGradient(
    w * 0.5, h * 0.31, 10,
    w * 0.5, h * 0.31, Math.max(w, h) * 0.56
  );
  glow.addColorStop(0, `rgba(255,59,247,${0.22 + dangerPhase * 0.14})`);
  glow.addColorStop(0.32, "rgba(0,217,255,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  for (const s of state.stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = "#c8fbff";
    ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  drawCity();
  drawRoad();
}

function drawCity() {
  const w = innerWidth;
  const h = innerHeight;
  const horizon = h * 0.43;

  for (let i = 0; i < state.buildings.length; i++) {
    const b = state.buildings[i];
    const sideOffset = 65 + (i % 12) * (w * 0.042);
    const x = b.side < 0 ? w * 0.5 - sideOffset - b.width : w * 0.5 + sideOffset;
    const y = horizon - b.height * (0.45 + b.depth * 0.45);

    ctx.fillStyle = "rgba(5,10,22,0.93)";
    ctx.fillRect(x, y, b.width, horizon - y + 25);

    ctx.strokeStyle = b.hue === "cyan" ? "rgba(0,217,255,0.24)" : "rgba(255,59,247,0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, b.width, horizon - y + 25);

    for (let wy = y + 14; wy < horizon; wy += 16) {
      for (let wx = x + 9; wx < x + b.width - 6; wx += 13) {
        const on = ((wx + wy + i * 17) % 37) < 14;
        if (!on) continue;
        ctx.fillStyle =
          b.hue === "cyan"
            ? "rgba(75,235,255,0.55)"
            : "rgba(255,70,242,0.48)";
        ctx.fillRect(wx, wy, 4, 6);
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = "rgba(115,247,255,0.35)";
  ctx.shadowColor = "#73f7ff";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.5, horizon - 54, 96, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRoad() {
  const w = innerWidth;
  const h = innerHeight;
  const horizon = h * 0.43;

  ctx.save();

  const roadGrad = ctx.createLinearGradient(0, horizon, 0, h);
  roadGrad.addColorStop(0, "rgba(4,12,28,0.45)");
  roadGrad.addColorStop(1, "rgba(2,4,12,0.95)");

  ctx.beginPath();
  ctx.moveTo(w * 0.5 - 36, horizon);
  ctx.lineTo(w * 0.5 + 36, horizon);
  ctx.lineTo(w * 0.5 + Math.min(w * 0.46, 560), h);
  ctx.lineTo(w * 0.5 - Math.min(w * 0.46, 560), h);
  ctx.closePath();
  ctx.fillStyle = roadGrad;
  ctx.fill();

  const scroll = (state.t * 0.7) % 1;
  for (let i = 0; i < 20; i++) {
    let d = (i / 20 + scroll) % 1;
    d = Math.pow(d, 1.25);
    const y = roadY(d);
    const half = roadHalfWidth(d);
    ctx.strokeStyle = `rgba(115,247,255,${0.05 + d * 0.22})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - half, y);
    ctx.lineTo(w * 0.5 + half, y);
    ctx.stroke();
  }

  for (let lane = 0; lane < 4; lane++) {
    const bottomX =
      w * 0.5 - Math.min(w * 0.46, 560) +
      lane * (Math.min(w * 0.92, 1120) / 3);
    const topX = w * 0.5 - 36 + lane * 24;
    ctx.strokeStyle = lane === 0 || lane === 3
      ? "rgba(255,59,247,0.85)"
      : "rgba(0,217,255,0.45)";
    ctx.shadowColor = lane === 0 || lane === 3 ? "#ff3bf7" : "#00d9ff";
    ctx.shadowBlur = 12;
    ctx.lineWidth = lane === 0 || lane === 3 ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(topX, horizon);
    ctx.lineTo(bottomX, h);
    ctx.stroke();
  }

  ctx.restore();
}

function drawObstacle(o) {
  const d = o.depth;
  const x = laneX(o.lane, d);
  const y = roadY(d);
  const scale = 0.28 + d * 1.16;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (o.type === "firewall") {
    ctx.shadowColor = "#ff3bf7";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#ff63f6";
    ctx.fillStyle = "rgba(255,59,247,0.10)";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(-42, 34);
    ctx.lineTo(-42, -54);
    ctx.lineTo(42, -54);
    ctx.lineTo(42, 34);
    ctx.stroke();

    for (let i = -28; i <= 28; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, -50);
      ctx.lineTo(i + Math.sin(state.t * 8 + i) * 7, 28);
      ctx.strokeStyle = "rgba(255,90,246,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 24px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText("FIREWALL", 0, -66);
  } else if (o.type === "malware") {
    ctx.rotate(Math.sin(state.t * 4 + o.phase) * 0.08);
    ctx.shadowColor = "#ff7a00";
    ctx.shadowBlur = 26;
    ctx.strokeStyle = "#ff9a3c";
    ctx.fillStyle = "rgba(255,100,0,0.10)";
    ctx.lineWidth = 4;

    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const r = i % 2 ? 25 : 42;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#fff4e6";
    ctx.font = "700 18px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText("MALWARE", 0, -54);
  } else if (o.type === "packet") {
    ctx.shadowColor = "#ffb347";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#ffc35a";
    ctx.fillStyle = "rgba(255,179,71,0.10)";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(-44, -30);
    ctx.lineTo(30, -30);
    ctx.lineTo(44, 0);
    ctx.lineTo(30, 30);
    ctx.lineTo(-44, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,224,160,0.9)";
    ctx.lineWidth = 2;
    for (let i = -20; i <= 20; i += 10) {
      ctx.beginPath();
      ctx.moveTo(-26, i);
      ctx.lineTo(24, i + Math.sin(state.t * 8 + i) * 4);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff7e8";
    ctx.font = "700 16px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText("CORRUPT", 0, -48);
    ctx.fillText("PACKET", 0, -32);
  } else {
    ctx.shadowColor = "#ff3bf7";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "rgba(255,59,247,0.14)";
    ctx.strokeStyle = "#ff5af7";
    ctx.lineWidth = 4;
    ctx.fillRect(-34, -34, 68, 68);
    ctx.strokeRect(-34, -34, 68, 68);

    ctx.beginPath();
    ctx.moveTo(-17, -17);
    ctx.lineTo(17, 17);
    ctx.moveTo(17, -17);
    ctx.lineTo(-17, 17);
    ctx.stroke();
  }

  ctx.restore();
}

function drawShard(s) {
  const d = s.depth;
  const x = laneX(s.lane, d);
  const y = roadY(d) - 18 * d;
  const scale = 0.22 + d * 0.82;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.t * 2.2 + s.spin);
  ctx.scale(scale, scale);

  ctx.shadowColor = "#73f7ff";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = "#73f7ff";
  ctx.fillStyle = "rgba(115,247,255,0.16)";
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(18, 0);
  ctx.lineTo(0, 30);
  ctx.lineTo(-18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawOrb() {
  const d = 0.91;
  const x = laneX(state.lane, d);
  const baseY = roadY(d) - 22;
  const y = baseY - state.orbY * 155;

  ctx.save();

  const trail = ctx.createLinearGradient(x, y + 10, x, innerHeight);
  trail.addColorStop(0, "rgba(115,247,255,0.44)");
  trail.addColorStop(1, "rgba(115,247,255,0)");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(x - 18, y + 18);
  ctx.lineTo(x + 18, y + 18);
  ctx.lineTo(x + 8, innerHeight);
  ctx.lineTo(x - 8, innerHeight);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = "#73f7ff";
  ctx.shadowBlur = 34;
  const rg = ctx.createRadialGradient(x - 7, y - 8, 2, x, y, 26);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.28, "#bafcff");
  rg.addColorStop(0.62, "#18dbff");
  rg.addColorStop(1, "#5c36ff");

  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#d7ffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 31 + Math.sin(state.t * 6) * 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawPause() {
  if (!state.paused) return;
  ctx.save();
  ctx.fillStyle = "rgba(2,4,10,0.54)";
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = "#dfffff";
  ctx.font = "700 28px Orbitron";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", innerWidth / 2, innerHeight / 2);
  ctx.restore();
}

function render() {
  drawBackground();

  const sortedObstacles = [...state.obstacles].sort((a, b) => a.depth - b.depth);
  const sortedShards = [...state.shards].sort((a, b) => a.depth - b.depth);

  for (const s of sortedShards) drawShard(s);
  for (const o of sortedObstacles) drawObstacle(o);

  drawOrb();
  drawParticles();
  drawPause();
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;

  update(dt, now);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame((t) => {
  state.lastTime = t;
  requestAnimationFrame(loop);
});