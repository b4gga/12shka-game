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
const finalScoreEl = document.getElementById("finalScore");
const gameOverTitleEl = document.getElementById("gameOverTitle");

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
  textShadow: "rgba(15,23,42,0.9)",
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
  score: 0,
  lives: 3,
  level: 1,
  spawnTimer: 0,
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

startButton.addEventListener("click", () => {
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
  });

  platforms.push({ x: 160, y: 360, width: 180, height: 22 });
  platforms.push({ x: 460, y: 320, width: 200, height: 22 });
  platforms.push({ x: 780, y: 340, width: 140, height: 22 });
  platforms.push({ x: 260, y: 240, width: 160, height: 22 });
  platforms.push({ x: 620, y: 220, width: 180, height: 22 });

  return platforms;
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

function resetGameState() {
  keys = {};
  world.platforms = createPlatforms();
  world.player = createPlayer();
  world.enemies = [];
  world.particles = [];
  world.score = 0;
  world.lives = 3;
  world.level = 1;
  world.spawnTimer = 1.2;
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
}

function showGameOverScreen(win) {
  gameState = "gameover";
  finalScoreEl.textContent = world.score.toString();
  gameOverTitleEl.textContent = win ? "Ты победил!" : "Грибок раздавлен";
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

function moveWithCollisions(entity, dt) {
  entity.onGround = false;

  entity.x += entity.vx * dt;
  for (const plat of world.platforms) {
    if (!rectsOverlap(entity, plat)) continue;

    if (entity.vx > 0) {
      entity.x = plat.x - entity.width;
    } else if (entity.vx < 0) {
      entity.x = plat.x + plat.width;
    }
    entity.vx = 0;
  }

  entity.y += entity.vy * dt;
  for (const plat of world.platforms) {
    if (!rectsOverlap(entity, plat)) continue;

    if (entity.vy > 0) {
      entity.y = plat.y - entity.height;
      entity.vy = 0;
      entity.onGround = true;
    } else if (entity.vy < 0) {
      entity.y = plat.y + plat.height;
      entity.vy = 0;
    }
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

function handleEnemies(dt) {
  for (const e of world.enemies) {
    if (!e.alive) {
      e.squashTimer -= dt;
      continue;
    }

    e.vy += GRAVITY * dt;
    moveWithCollisions(e, dt);

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
      world.score += 100;
      if (world.score % 700 === 0) {
        world.level += 1;
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
    ctx.globalAlpha = 0.16;
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

    ctx.fillStyle = "rgba(15,23,42,0.4)";
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
    ctx.fillStyle = COLORS.particle;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawForeground() {
  ctx.save();
  ctx.globalAlpha = 0.24;
  const gradient = ctx.createLinearGradient(0, HEIGHT * 0.6, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(15,23,42,0)");
  gradient.addColorStop(1, "rgba(15,23,42,0.8)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, HEIGHT * 0.6, WIDTH, HEIGHT * 0.4);
  ctx.restore();
}

function gameLoop(timestamp) {
  if (gameState !== "running") return;

  const dt = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (world.player.invincibleTimer > 0) {
    world.player.invincibleTimer -= dt;
  }

  handlePlayerMovement(dt);
  handleEnemies(dt);
  handlePlayerEnemyCollisions();
  updateParticles(dt);
  spawnEnemyIfNeeded(dt);

  drawBackground();
  drawPlatforms();
  for (const e of world.enemies) {
    drawEnemy(e);
  }
  drawMushroom(world.player);
  drawParticles();
  drawForeground();

  requestAnimationFrame(gameLoop);
}

drawBackground();
drawPlatforms();

