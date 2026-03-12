"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const bonusIndicatorEl = document.getElementById("bonusIndicator");
const finalScoreEl = document.getElementById("finalScore");
const gameOverTitleEl = document.getElementById("gameOverTitle");
const nicknameInput = document.getElementById("nicknameInput");
const highscoresListStart = document.getElementById("highscoresListStart");
const highscoresListGameOver = document.getElementById("highscoresListGameOver");
const newRecordMsg = document.getElementById("newRecordMsg");

const STORAGE_KEY = "mushroomGameHighscores";
const MAX_RECORDS = 10;
const FIREBASE_DB_PATH = "mushroomGame/scores";

let firebaseDb = null;
try {
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && cfg.apiKey !== "YOUR_API_KEY" && cfg.databaseURL) {
    firebaseDb = firebase.initializeApp(cfg).database();
  }
} catch (_) {}

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const GRAVITY = 2000;
const JUMP_VELOCITY = -830;
const MOVE_SPEED = 360;

const COLORS = {
  skyTop: "#0f172a",
  skyBottom: "#020617",
  ground: "#1f2937",
  platformTop: "#22c55e",
  platformSide: "#14532d",
  mushroomCap: "#f97316",
  mushroomDots: "#fed7aa",
  mushroomStem: "#fde68a",
  plumberHat: "#ef4444",
  plumberBody: "#0ea5e9",
  textShadow: "#0f172a",
  particle: "#facc15",
};

// Используем фото как спрайты (относительные пути, чтобы работало на GitHub Pages)
const playerImg = new Image();
playerImg.src = "./assets/player.png";

const enemyImg = new Image();
enemyImg.src = "./assets/enemy.png";

const bgImg = new Image();
bgImg.src = "./assets/backstage.png";

let keys = {};
let lastTime = 0;
let gameState = "start";

const world = {
  platforms: [],
  player: null,
  enemies: [],
  particles: [],
  powerUps: [],
  score: 0,
  lives: 3,
  level: 1,
  spawnTimer: 0,
  powerUpSpawnTimer: 12,
  slowmoTimer: 0,
  scoreMultiplier: 1,
  scoreMultiplierTimer: 0,
  kills: 0,
  healAnim: null,
};

const POWERUP_TYPES = {
  slowmo: { label: "Замедление", color: "#8b5cf6", duration: 6 },
  score2x: { label: "×2 очки", color: "#facc15", duration: 10 },
  score3x: { label: "×3 очки", color: "#f97316", duration: 8 },
};

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
  keys[e.key.toLowerCase()] = true;

  if (e.key === "r" || e.key === "R") {
    if (gameState === "gameover") {
      restartGame();
    }
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function getNickname() {
  const val = (nicknameInput?.value || "").trim();
  return val || "Игрок";
}

let cachedRecords = [];

function loadHighscoresFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHighscoresToStorage(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch (_) {}
}

function loadHighscores() {
  return cachedRecords.length ? cachedRecords : loadHighscoresFromStorage();
}

function fetchHighscoresFromFirebase(callback) {
  if (!firebaseDb) {
    callback(loadHighscoresFromStorage());
    return;
  }
  firebaseDb.ref(FIREBASE_DB_PATH).once("value", (snap) => {
    const val = snap.val();
    const arr = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    const records = arr
      .filter((r) => r && typeof r.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    cachedRecords = records;
    callback(records);
  }).catch(() => {
    callback(loadHighscoresFromStorage());
  });
}

function addRecord(nickname, score) {
  const records = loadHighscores();
  const idx = records.findIndex((r) => r.nickname === nickname);
  if (idx >= 0 && score <= records[idx].score) return;
  if (idx >= 0) records[idx] = { nickname, score, date: Date.now() };
  else records.push({ nickname, score, date: Date.now() });
  records.sort((a, b) => b.score - a.score);
  const top = records.slice(0, MAX_RECORDS);
  cachedRecords = top;
  saveHighscoresToStorage(top);
  if (firebaseDb) firebaseDb.ref(FIREBASE_DB_PATH).set(top).catch(() => {});
}

function renderHighscores(listEl, records) {
  if (!listEl) return;
  const top = (records || cachedRecords).slice(0, MAX_RECORDS);
  listEl.innerHTML = top.length
    ? top.map((r) => `<li>${escapeHtml(String(r.nickname || "?"))} — ${r.score}</li>`).join("")
    : "<li>Пока нет рекордов</li>";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("mushroomGameNickname");
  if (nicknameInput && saved) nicknameInput.value = saved;
  fetchHighscoresFromFirebase((records) => {
    cachedRecords = records;
    renderHighscores(highscoresListStart, records);
  });
});

startButton.addEventListener("click", () => {
  const nick = getNickname();
  try {
    localStorage.setItem("mushroomGameNickname", nick);
  } catch (_) {}
  startScreen.classList.add("hidden");
  startGame();
});

restartButton.addEventListener("click", () => {
  gameOverScreen.classList.add("hidden");
  restartGame();
});

// Экранные кнопки для телефона
function setupMobileControls() {
  const mobileControls = document.getElementById("mobileControls");
  if (!mobileControls) return;

  const setKey = (key, pressed) => {
    if (key === " ") {
      keys[" "] = pressed;
    } else {
      keys[key.toLowerCase()] = pressed;
    }
  };

  mobileControls.querySelectorAll(".btn-mobile").forEach((btn) => {
    const key = btn.getAttribute("data-key");
    if (!key) return;

    const press = () => setKey(key, true);
    const release = (e) => {
      setKey(key, false);
      e?.preventDefault?.();
    };

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      press();
    });
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);

    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      press();
    }, { passive: false });
    btn.addEventListener("touchend", (e) => {
      release(e);
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener("touchcancel", release);
  });
}

setupMobileControls();

function createPlayer() {
  return {
    x: WIDTH * 0.22,
    y: HEIGHT * 0.5,
    width: 46,
    height: 54,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    jumpBuffer: 0,
    coyoteTime: 0,
    invincibleTimer: 0,
  };
}

function createPlatforms() {
  const platforms = [];
  const groundHeight = 48;

  platforms.push({
    x: -40,
    y: HEIGHT - groundHeight,
    width: WIDTH + 80,
    height: groundHeight,
    moving: false,
  });

  const floating = [
    { x: 160, y: 430, w: 180, h: 22 },
    { x: 460, y: 350, w: 200, h: 22 },
    { x: 780, y: 390, w: 140, h: 22 },
    { x: 260, y: 270, w: 160, h: 22 },
    { x: 620, y: 180, w: 180, h: 22 },
  ];

  floating.forEach((f) => {
    const vx = (Math.random() - 0.5) * 60 + (Math.random() < 0.5 ? 1 : -1) * 50;
    const xMin = 20;
    const xMax = WIDTH - f.w - 20;
    platforms.push({
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      vx,
      vy: 0,
      xMin,
      xMax,
      moving: true,
    });
  });

  return platforms;
}

function updatePlatforms(dt) {
  for (const plat of world.platforms) {
    if (!plat.moving) continue;
    plat.x += plat.vx * dt;
    if (plat.x <= plat.xMin) {
      plat.x = plat.xMin;
      plat.vx = -plat.vx;
    }
    if (plat.x >= plat.xMax) {
      plat.x = plat.xMax;
      plat.vx = -plat.vx;
    }
  }
}

function createEnemy(level) {
  const size = 42;
  const baseSpeed = 80 + level * 14;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const y = HEIGHT - 48 - size;
  return {
    x: dir === 1 ? -size - 8 : WIDTH + 8,
    y,
    width: size,
    height: size,
    vx: baseSpeed * dir,
    vy: 0,
    onGround: true,
    alive: true,
    squashTimer: 0,
  };
}

function spawnEnemyIfNeeded(dt) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;

  const baseInterval = Math.max(0.9, 2.4 - world.level * 0.18);
  const randomBonus = Math.random() * 0.7;
  world.spawnTimer = baseInterval + randomBonus;

  world.enemies.push(createEnemy(world.level));
}

function createPowerUp() {
  const floating = world.platforms.filter((p) => p.moving && p.y < HEIGHT - 80 && p.width > 100);
  if (floating.length === 0) return null;
  const plat = floating[Math.floor(Math.random() * floating.length)];
  const platIdx = world.platforms.indexOf(plat);
  const types = ["slowmo", "score2x", "score3x"];
  const type = types[Math.floor(Math.random() * types.length)];
  const size = 28;
  const relX = 20 + Math.random() * (plat.width - 40 - size);
  const relY = -size - 8;
  return {
    x: plat.x + relX,
    y: plat.y + relY,
    width: size,
    height: size,
    type,
    bobOffset: Math.random() * Math.PI * 2,
    platformIdx: platIdx,
    relX,
    relY,
  };
}

function spawnPowerUpIfNeeded(dt) {
  world.powerUpSpawnTimer -= dt;
  if (world.powerUpSpawnTimer > 0) return;
  world.powerUpSpawnTimer = 10 + Math.random() * 12;
  const pu = createPowerUp();
  if (pu) world.powerUps.push(pu);
}

function handlePowerUpCollection() {
  const p = world.player;
  for (let i = world.powerUps.length - 1; i >= 0; i--) {
    const pu = world.powerUps[i];
    if (!rectsOverlap(p, pu)) continue;
    world.powerUps.splice(i, 1);
    const info = POWERUP_TYPES[pu.type];
    if (!info) continue;
    if (pu.type === "slowmo") {
      world.slowmoTimer = Math.max(world.slowmoTimer, info.duration);
    } else if (pu.type === "score2x" || pu.type === "score3x") {
      world.scoreMultiplier = pu.type === "score3x" ? 3 : 2;
      world.scoreMultiplierTimer = info.duration;
    }
    world.particles.push(...createBurst(pu.x + pu.width / 2, pu.y + pu.height / 2, 8));
  }
}

function updatePowerUps(dt) {
  world.powerUps.forEach((pu) => {
    pu.bobOffset += dt * 4;
    if (pu.platformIdx != null && world.platforms[pu.platformIdx]) {
      const plat = world.platforms[pu.platformIdx];
      pu.x = plat.x + pu.relX;
      pu.y = plat.y + pu.relY;
    }
  });
  if (world.slowmoTimer > 0) world.slowmoTimer -= dt;
  if (world.scoreMultiplierTimer > 0) {
    world.scoreMultiplierTimer -= dt;
    if (world.scoreMultiplierTimer <= 0) world.scoreMultiplier = 1;
  }
}

function drawPowerUp(pu) {
  const info = POWERUP_TYPES[pu.type];
  if (!info) return;
  ctx.save();
  const bob = Math.sin(pu.bobOffset) * 3;
  ctx.translate(pu.x + pu.width / 2, pu.y + pu.height / 2 + bob);
  ctx.fillStyle = info.color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pu.width / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const sym = pu.type === "slowmo" ? "⏱" : pu.type === "score3x" ? "×3" : "×2";
  ctx.fillText(sym, 0, 0);
  ctx.restore();
}

function resetGameState() {
  keys = {};
  world.platforms = createPlatforms();
  world.player = createPlayer();
  world.enemies = [];
  world.particles = [];
  world.powerUps = [];
  world.score = 0;
  world.lives = 3;
  world.level = 1;
  world.spawnTimer = 1.2;
  world.powerUpSpawnTimer = 8;
  world.slowmoTimer = 0;
  world.scoreMultiplier = 1;
  world.scoreMultiplierTimer = 0;
  world.kills = 0;
  world.healAnim = null;
  updateHud();
}

function startGame() {
  resetGameState();
  gameState = "running";
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function restartGame() {
  resetGameState();
  gameState = "running";
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function updateHud() {
  scoreEl.textContent = world.score.toString();
  livesEl.textContent = world.lives.toString();
  levelEl.textContent = world.level.toString();
  const parts = [];
  if (world.slowmoTimer > 0) parts.push(`⏱ ${world.slowmoTimer.toFixed(1)}с`);
  if (world.scoreMultiplier > 1 && world.scoreMultiplierTimer > 0) {
    parts.push(`×${world.scoreMultiplier} ${world.scoreMultiplierTimer.toFixed(1)}с`);
  }
  if (bonusIndicatorEl) bonusIndicatorEl.textContent = parts.length ? parts.join(" · ") : "";
}

function showGameOverScreen(win) {
  gameState = "gameover";
  finalScoreEl.textContent = world.score.toString();
  gameOverTitleEl.textContent = win ? "Ты победил!" : "Грибок раздавлен";

  const nick = getNickname();
  const score = world.score;
  const records = [...cachedRecords];
  const prevBest = records.find((r) => r.nickname === nick);
  const isNewRecord = !prevBest || score > prevBest.score;

  addRecord(nick, score);

  if (newRecordMsg) {
    newRecordMsg.classList.toggle("hidden", !isNewRecord);
  }
  renderHighscores(highscoresListGameOver);

  gameOverScreen.classList.remove("hidden");
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width ||
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height
  );
}

function handlePlayerMovement(dt) {
  const p = world.player;
  const left = keys["arrowleft"] || keys["a"];
  const right = keys["arrowright"] || keys["d"];
  let targetVx = 0;
  if (left) targetVx -= MOVE_SPEED;
  if (right) targetVx += MOVE_SPEED;

  const accel = 4000;
  if (targetVx === 0) {
    const friction = 5000;
    if (Math.abs(p.vx) < friction * dt) {
      p.vx = 0;
    } else {
      p.vx -= Math.sign(p.vx) * friction * dt;
    }
  } else {
    if (p.vx < targetVx) {
      p.vx = Math.min(targetVx, p.vx + accel * dt);
    } else if (p.vx > targetVx) {
      p.vx = Math.max(targetVx, p.vx - accel * dt);
    }
  }

  if (targetVx !== 0) p.facing = Math.sign(targetVx);

  const jumpPressed =
    keys[" "] || keys["arrowup"] || keys["w"] || keys["z"] || keys["x"];

  if (jumpPressed) {
    p.jumpBuffer = 0.12;
  } else {
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  }

  if (p.onGround) {
    p.coyoteTime = 0.1;
  } else {
    p.coyoteTime = Math.max(0, p.coyoteTime - dt);
  }

  if (p.jumpBuffer > 0 && p.coyoteTime > 0) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
    p.coyoteTime = 0;
    p.jumpBuffer = 0;
  }

  p.vy += GRAVITY * dt;

  moveWithCollisions(p, dt);

  if (p.x < -80 || p.x > WIDTH + 80 || p.y > HEIGHT + 120) {
    loseLife();
  }
}

function getPlatformsForEntity(includeMoving) {
  return world.platforms.filter((p) => includeMoving || !p.moving);
}

function moveWithCollisions(entity, dt, includeMovingPlatforms = true) {
  entity.onGround = false;
  const platforms = getPlatformsForEntity(includeMovingPlatforms);

  entity.x += entity.vx * dt;
  for (let px = 0; px < 3; px++) {
    let any = false;
    for (const plat of platforms) {
      if (!rectsOverlap(entity, plat)) continue;

      const overlapLeft = (entity.x + entity.width) - plat.x;
      const overlapRight = (plat.x + plat.width) - entity.x;
      if (overlapLeft < overlapRight) {
        entity.x = plat.x - entity.width;
      } else {
        entity.x = plat.x + plat.width;
      }
      entity.vx = 0;
      any = true;
      break;
    }
    if (!any) break;
  }

  entity.y += entity.vy * dt;

  for (let pass = 0; pass < 3; pass++) {
    let resolved = false;
    const overlapping = platforms
      .filter((plat) => rectsOverlap(entity, plat))
      .map((plat) => {
        const overlapTop = (entity.y + entity.height) - plat.y;
        const overlapBottom = (plat.y + plat.height) - entity.y;
        return { plat, overlapTop, overlapBottom };
      });

    if (overlapping.length === 0) break;

    overlapping.sort((a, b) => {
      if (entity.vy > 0) {
        return a.plat.y - b.plat.y;
      }
      return (b.plat.y + b.plat.height) - (a.plat.y + a.plat.height);
    });

    const { plat, overlapTop, overlapBottom } = overlapping[0];

    if (entity.vy > 0 && overlapTop < overlapBottom) {
      entity.y = plat.y - entity.height;
      entity.vy = 0;
      entity.onGround = true;
      if (plat.moving) entity.x += plat.vx * dt;
      resolved = true;
    } else if (entity.vy < 0 && overlapBottom <= overlapTop) {
      entity.y = plat.y + plat.height + 2;
      entity.vy = 60;
      resolved = true;
    } else if (overlapTop <= overlapBottom) {
      entity.y = plat.y - entity.height;
      entity.vy = 0;
      entity.onGround = true;
      if (plat.moving) entity.x += plat.vx * dt;
      resolved = true;
    } else {
      entity.y = plat.y + plat.height + 2;
      entity.vy = Math.min(entity.vy, 60);
      resolved = true;
    }
    if (!resolved) break;
  }
}

function loseLife() {
  if (world.player.invincibleTimer > 0) return;

  world.lives -= 1;
  updateHud();

  world.particles.push(
    ...createBurst(world.player.x + world.player.width / 2, world.player.y + world.player.height / 2, 14)
  );

  if (world.lives <= 0) {
    showGameOverScreen(false);
  } else {
    world.player = createPlayer();
    world.player.invincibleTimer = 1.4;
  }
}

function createBurst(x, y, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const speed = 150 + Math.random() * 170;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      life: 0.4 + Math.random() * 0.2,
      size: 3 + Math.random() * 2,
    });
  }
  return particles;
}

function createHealBurst(x, y, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 80 + Math.random() * 100;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 120,
      life: 0.6 + Math.random() * 0.3,
      size: 4 + Math.random() * 2,
      color: "#22c55e",
    });
  }
  return particles;
}

function updateHealAnim(dt) {
  if (!world.healAnim) return;
  const a = world.healAnim;
  a.y += a.vy * dt;
  a.vy += 200 * dt;
  a.life -= dt;
  if (a.life <= 0) world.healAnim = null;
}

function drawHealAnim() {
  if (!world.healAnim) return;
  const a = world.healAnim;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a.life / 0.3);
  ctx.font = "bold 28px system-ui";
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "+1 ❤";
  ctx.strokeText(text, a.x, a.y);
  ctx.fillText(text, a.x, a.y);
  ctx.restore();
}

function handleEnemies(dt) {
  for (const e of world.enemies) {
    if (!e.alive) {
      e.squashTimer -= dt;
      continue;
    }

    e.vy += GRAVITY * dt;
    moveWithCollisions(e, dt, false);

    if (e.onGround) {
      e.vx = Math.sign(e.vx) * Math.abs(e.vx);
      if (e.x < -80 || e.x > WIDTH + 80) {
        e.alive = false;
        e.squashTimer = 0;
      }
    }
  }

  world.enemies = world.enemies.filter((e) => e.alive || e.squashTimer > -0.15);
}

function handlePlayerEnemyCollisions() {
  const p = world.player;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (!rectsOverlap(p, e)) continue;

    const playerBottom = p.y + p.height;
    const enemyTop = e.y;

    const verticalVelocityThreshold = 200;

    if (p.vy > verticalVelocityThreshold && playerBottom - enemyTop < e.height * 0.55) {
      e.alive = false;
      e.squashTimer = 0.25;
      world.score += Math.floor(100 * world.scoreMultiplier);
      world.kills += 1;
      if (world.score % 700 === 0) {
        world.level += 1;
      }
      if (world.kills % 10 === 0) {
        world.lives += 1;
        world.healAnim = {
          x: p.x + p.width / 2,
          y: p.y,
          life: 1.2,
          vy: -120,
        };
        world.particles.push(
          ...createHealBurst(p.x + p.width / 2, p.y + p.height / 2, 12)
        );
      }
      updateHud();
      world.particles.push(
        ...createBurst(e.x + e.width / 2, e.y + e.height / 3, 10)
      );

      p.vy = JUMP_VELOCITY * 0.78;
      p.onGround = false;
    } else {
      loseLife();
      break;
    }
  }
}

function updateParticles(dt) {
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += GRAVITY * 0.4 * dt;
    p.life -= dt;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
}

function drawBackground() {
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (!bgImg.complete || bgImg.naturalWidth === 0) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#1f2937";
    for (let x = 0; x < WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0ea5e9";
    for (let i = 0; i < 8; i++) {
      const baseX = (i * 140 + (performance.now() * 0.02) % 1200) % (WIDTH + 260) - 260;
      const baseY = 120 + (i % 3) * 40;
      ctx.beginPath();
      ctx.ellipse(baseX, baseY, 80, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlatforms() {
  for (const plat of world.platforms) {
    const radius = 10;
    const x = plat.x;
    const y = plat.y;
    const w = plat.width;
    const h = plat.height;

    ctx.fillStyle = COLORS.platformSide;
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + radius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.platformTop;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + radius + 4);
    ctx.lineTo(x, y + radius + 4);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x + 2, y + radius + 4, w - 4, 4);
  }
}

function drawMushroom(p) {
  ctx.save();
  ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
  if (p.facing < 0) {
    ctx.scale(-1, 1);
  }

  let alpha = 1;
  if (p.invincibleTimer > 0) {
    alpha = (Math.sin(performance.now() * 0.04) + 1) / 2 > 0.5 ? 0.3 : 1;
  }
  ctx.globalAlpha = alpha;

  ctx.shadowColor = COLORS.textShadow;
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;

  const drawW = p.width;
  const drawH = p.height;

  if (playerImg.complete && playerImg.naturalWidth > 0) {
    ctx.drawImage(playerImg, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    // запасной вариант — старый условный гриб
    ctx.fillStyle = COLORS.mushroomStem;
    ctx.beginPath();
    ctx.roundRect(-12, 4, 24, 26, 6);
    ctx.fill();

    ctx.fillStyle = COLORS.mushroomCap;
    ctx.beginPath();
    ctx.ellipse(0, -10, 28, 20, 0, Math.PI, 0);
    ctx.fill();
  }

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
  ctx.scale(e.vx < 0 ? -1 : 1, 1);

  ctx.shadowColor = COLORS.textShadow;
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  if (!e.alive) {
    const squashAmount = 0.4;
    ctx.scale(1.1, 1 - squashAmount);
  }

  const drawW = e.width;
  const drawH = e.height;

  if (enemyImg.complete && enemyImg.naturalWidth > 0) {
    ctx.drawImage(enemyImg, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    // запасной вариант — старый условный марио
    ctx.fillStyle = COLORS.plumberHat;
    ctx.beginPath();
    ctx.roundRect(-14, -18, 28, 14, 6);
    ctx.fill();

    ctx.fillStyle = "#fecaca";
    ctx.beginPath();
    ctx.roundRect(-11, -10, 22, 18, 8);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of world.particles) {
    const t = p.life;
    ctx.globalAlpha = Math.max(0, t / 0.6);
    ctx.fillStyle = p.color || COLORS.particle;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawForeground() {
}

function gameLoop(timestamp) {
  if (gameState !== "running") return;

  let dt = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  if (world.slowmoTimer > 0) dt *= 0.35;

  if (world.player.invincibleTimer > 0) {
    world.player.invincibleTimer -= dt;
  }

  updatePlatforms(dt);
  handlePlayerMovement(dt);
  handleEnemies(dt);
  handlePlayerEnemyCollisions();
  handlePowerUpCollection();
  updatePowerUps(dt);
  updateHealAnim(dt);
  updateParticles(dt);
  spawnEnemyIfNeeded(dt);
  spawnPowerUpIfNeeded(dt);

  if (world.slowmoTimer > 0 || world.scoreMultiplierTimer > 0) updateHud();

  drawBackground();
  drawPlatforms();
  for (const pu of world.powerUps) drawPowerUp(pu);
  for (const e of world.enemies) drawEnemy(e);
  drawMushroom(world.player);
  drawParticles();
  drawHealAnim();
  drawForeground();

  requestAnimationFrame(gameLoop);
}

drawBackground();
drawPlatforms();

