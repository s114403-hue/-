/**
 * Save the Doge (畫線防禦：拯救狗狗)
 * Main Game Controller & Canvas Renderer
 */

const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 700;

const GAME_STATE = {
  DRAWING: 'drawing',
  DEFENDING: 'defending',
  WON: 'won',
  LOST: 'lost'
};

class DogeGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('canvas-container');

    // UI elements
    this.statusBanner = document.getElementById('status-banner');
    this.statusText = document.getElementById('status-text');
    this.countdownWrapper = document.getElementById('countdown-wrapper');
    this.countdownCircle = document.getElementById('countdown-circle');
    this.countdownSec = document.getElementById('countdown-sec');
    this.inkBarFill = document.getElementById('ink-bar-fill');
    this.levelTitle = document.getElementById('level-title');
    this.starsPreview = document.getElementById('stars-preview');

    // Modals
    this.modalVictory = document.getElementById('modal-victory');
    this.modalDefeat = document.getElementById('modal-defeat');
    this.modalLevels = document.getElementById('modal-level-select');

    // Stats
    this.statInkUsed = document.getElementById('stat-ink-used');
    this.statScore = document.getElementById('stat-score');
    this.defeatTipText = document.getElementById('defeat-tip-text');
    this.levelsGrid = document.getElementById('levels-grid');
    this.totalStarsCount = document.getElementById('total-stars-count');
    this.maxStarsCount = document.getElementById('max-stars-count');

    // Game state
    this.currentLevelIndex = 0;
    this.state = GAME_STATE.DRAWING;
    this.currentLevel = null;
    this.progress = this.loadProgress();

    // Drawing tracking
    this.isPointerDown = false;
    this.drawPoints = [];
    this.inkUsed = 0;
    this.maxInk = 1000;
    this.lastSoundTime = 0;

    // Defense countdown (10 seconds)
    this.defenseTimer = 10.0;
    this.lastCountdownSec = 10;

    // Particles & Visual FX
    this.particles = [];
    this.confetti = [];
    this.clouds = [
      { x: 50, y: 80, speed: 0.15, scale: 0.8 },
      { x: 350, y: 50, speed: 0.22, scale: 1.1 },
      { x: 650, y: 110, speed: 0.18, scale: 0.9 }
    ];

    // Hint state
    this.showHint = false;
    this.hintAnimOffset = 0;

    // Assets
    this.assets = {
      dogeNormal: null,
      dogeStung: null,
      dogeHappy: null,
      beehive: null,
      angryBee: null
    };

    // Physics
    this.physics = new GamePhysics();

    this.init();
  }

  // Load progress from localStorage
  loadProgress() {
    try {
      const saved = localStorage.getItem('save_the_doge_progress');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Progress load failed', e);
    }
    return {
      unlockedLevel: 1,
      levelStars: {},
      levelScores: {}
    };
  }

  saveProgress() {
    try {
      localStorage.setItem('save_the_doge_progress', JSON.stringify(this.progress));
    } catch (e) {
      console.warn('Progress save failed', e);
    }
  }

  async init() {
    this.setupResize();
    this.setupEventListeners();
    this.physics.init({
      onStung: (bee) => this.handleDogeStung(bee),
      onHitShield: (pos) => this.handleShieldHit(pos),
      onFall: () => this.handleDogeFall()
    });

    // Load custom sticker assets with background removal
    await this.preloadAssets();

    // Load first level
    this.loadLevel(this.currentLevelIndex);

    // Start render loop
    let lastTime = performance.now();
    const loop = (currentTime) => {
      const deltaMs = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;

      this.update(deltaMs);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Preload and make sticker edges transparent
  async preloadAssets() {
    const list = [
      { key: 'dogeNormal', src: 'assets/doge_normal.jpg' },
      { key: 'dogeStung', src: 'assets/doge_stung.jpg' },
      { key: 'dogeHappy', src: 'assets/doge_happy.jpg' },
      { key: 'beehive', src: 'assets/beehive.jpg' },
      { key: 'angryBee', src: 'assets/angry_bee.jpg' }
    ];

    await Promise.all(list.map(item => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.assets[item.key] = this.processTransparentBackground(img);
          resolve();
        };
        img.onerror = () => {
          console.warn('Failed to load asset', item.src);
          resolve();
        };
        img.src = item.src;
      });
    }));
  }

  // Flood fill corner transparency to preserve inner white details
  processTransparentBackground(img) {
    try {
      const c = document.createElement('canvas');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const visited = new Uint8Array(w * h);
      const queue = [];

      const tolerance = 42;
      const isNearWhite = (idx) => {
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        return r > (255 - tolerance) && g > (255 - tolerance) && b > (255 - tolerance);
      };

      // Seed all 4 borders
      for (let x = 0; x < w; x++) {
        queue.push(x, 0);
        queue.push(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        queue.push(0, y);
        queue.push(w - 1, y);
      }

      let head = 0;
      while (head < queue.length) {
        const x = queue[head++];
        const y = queue[head++];
        const pIdx = y * w + x;
        if (visited[pIdx]) continue;
        visited[pIdx] = 1;

        const dIdx = pIdx * 4;
        if (isNearWhite(dIdx)) {
          data[dIdx + 3] = 0; // Transparent
          if (x > 0 && !visited[pIdx - 1]) queue.push(x - 1, y);
          if (x < w - 1 && !visited[pIdx + 1]) queue.push(x + 1, y);
          if (y > 0 && !visited[pIdx - w]) queue.push(x, y - 1);
          if (y < h - 1 && !visited[pIdx + w]) queue.push(x, y + 1);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      return c;
    } catch (e) {
      return img;
    }
  }

  // Handle responsive canvas sizing
  setupResize() {
    const resize = () => {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.dpr = dpr;
      this.scaleX = rect.width / VIRTUAL_WIDTH;
      this.scaleY = rect.height / VIRTUAL_HEIGHT;
      this.scale = Math.min(this.scaleX, this.scaleY);
      this.offsetX = (rect.width - VIRTUAL_WIDTH * this.scale) / 2;
      this.offsetY = (rect.height - VIRTUAL_HEIGHT * this.scale) / 2;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  // Convert screen client coords to virtual game coords
  toVirtualCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale
    };
  }

  // Input & UI listeners
  setupEventListeners() {
    // Touch & Pointer drawing
    const onStart = (e) => {
      if (this.state !== GAME_STATE.DRAWING) return;
      e.preventDefault();
      window.soundEngine.init();
      this.isPointerDown = true;
      this.drawPoints = [];
      this.inkUsed = 0;
      this.showHint = false;

      const pt = this.toVirtualCoords(e.clientX || e.touches[0].clientX, e.clientY || e.touches[0].clientY);
      this.addDrawPoint(pt.x, pt.y);
    };

    const onMove = (e) => {
      if (!this.isPointerDown || this.state !== GAME_STATE.DRAWING) return;
      e.preventDefault();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches ? e.touches[0].clientY : 0);
      const pt = this.toVirtualCoords(clientX, clientY);
      this.addDrawPoint(pt.x, pt.y);
    };

    const onEnd = (e) => {
      if (!this.isPointerDown || this.state !== GAME_STATE.DRAWING) return;
      e.preventDefault();
      this.isPointerDown = false;
      this.finishDrawing();
    };

    this.container.addEventListener('pointerdown', onStart);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    // Touch fallbacks
    this.container.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: false });

    // Buttons
    document.getElementById('btn-restart').onclick = () => {
      window.soundEngine.playButton();
      this.loadLevel(this.currentLevelIndex);
    };

    document.getElementById('btn-sound').onclick = () => {
      const active = window.soundEngine.toggleMute();
      document.getElementById('icon-sound-on').classList.toggle('hidden', !active);
      document.getElementById('icon-sound-off').classList.toggle('hidden', active);
      window.soundEngine.playButton();
    };

    document.getElementById('btn-hint').onclick = () => {
      window.soundEngine.playButton();
      this.showHint = !this.showHint;
    };

    document.getElementById('btn-levels').onclick = () => {
      window.soundEngine.playButton();
      this.openLevelSelect();
    };

    document.getElementById('btn-close-levels').onclick = () => {
      window.soundEngine.playButton();
      this.modalLevels.classList.add('hidden');
    };

    // Modal action buttons
    document.getElementById('btn-replay-level').onclick = () => {
      window.soundEngine.playButton();
      this.modalVictory.classList.add('hidden');
      this.loadLevel(this.currentLevelIndex);
    };

    document.getElementById('btn-next-level').onclick = () => {
      window.soundEngine.playButton();
      this.modalVictory.classList.add('hidden');
      if (this.currentLevelIndex + 1 < GAME_LEVELS.length) {
        this.loadLevel(this.currentLevelIndex + 1);
      } else {
        this.openLevelSelect();
      }
    };

    document.getElementById('btn-retry-level').onclick = () => {
      window.soundEngine.playButton();
      this.modalDefeat.classList.add('hidden');
      this.loadLevel(this.currentLevelIndex);
    };

    document.getElementById('btn-defeat-hint').onclick = () => {
      window.soundEngine.playButton();
      this.modalDefeat.classList.add('hidden');
      this.showHint = true;
      this.loadLevel(this.currentLevelIndex);
    };
  }

  // Add point while drawing, deduct ink
  addDrawPoint(x, y) {
    if (this.drawPoints.length > 0) {
      const last = this.drawPoints[this.drawPoints.length - 1];
      const dist = Math.hypot(x - last.x, y - last.y);
      if (dist < 5) return; // avoid clustering

      if (this.inkUsed + dist > this.maxInk) {
        // Out of ink!
        this.finishDrawing();
        return;
      }
      this.inkUsed += dist;

      // Sound feedback
      const now = performance.now();
      if (now - this.lastSoundTime > 60) {
        window.soundEngine.playDraw();
        this.lastSoundTime = now;
      }

      // Sparkle particles
      if (Math.random() < 0.3) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -Math.random() * 1.5,
          life: 1.0,
          color: '#2d3436',
          size: 3
        });
      }
    }

    this.drawPoints.push({ x, y });
    this.updateInkGauge();
  }

  // Update ink bar & stars preview
  updateInkGauge() {
    const remainingRatio = Math.max(0, 1 - (this.inkUsed / this.maxInk));
    const percent = Math.round(remainingRatio * 100);
    this.inkBarFill.style.width = `${percent}%`;

    const stars = this.calculateStars(remainingRatio);
    const starEls = this.starsPreview.querySelectorAll('.star-icon');
    starEls.forEach((el, idx) => {
      el.classList.toggle('star-active', idx < stars);
    });
  }

  calculateStars(remainingRatio) {
    if (remainingRatio >= 0.65) return 3;
    if (remainingRatio >= 0.30) return 2;
    if (remainingRatio > 0.0) return 1;
    return 1;
  }

  // Player releases finger: build rigid physics body and spawn bees
  finishDrawing() {
    if (this.drawPoints.length < 3 || this.inkUsed < 35) {
      // Too short to be a defensive line
      this.drawPoints = [];
      this.inkUsed = 0;
      this.updateInkGauge();
      return;
    }

    // Convert drawn points to rigid Matter.js compound body
    const compound = this.physics.createShieldFromPoints(this.drawPoints, 14);
    if (!compound) {
      this.drawPoints = [];
      this.inkUsed = 0;
      this.updateInkGauge();
      return;
    }

    // Switch state to DEFENDING!
    this.state = GAME_STATE.DEFENDING;
    this.defenseTimer = 10.0;
    this.lastCountdownSec = 10;

    // UI Updates
    this.statusBanner.classList.add('hidden');
    this.countdownWrapper.classList.remove('hidden');
    this.countdownWrapper.classList.remove('countdown-pulse');
    this.countdownSec.innerText = '10';

    // Start bee swarm buzz
    window.soundEngine.startBeeBuzz();

    // Spawn bees from hives
    this.physics.spawnBees(this.currentLevel.hives);
  }

  // Load a specific level
  loadLevel(index) {
    if (index < 0 || index >= GAME_LEVELS.length) index = 0;
    this.currentLevelIndex = index;
    this.currentLevel = GAME_LEVELS[index];

    this.state = GAME_STATE.DRAWING;
    this.drawPoints = [];
    this.inkUsed = 0;
    this.maxInk = this.currentLevel.maxInk || 1000;
    this.defenseTimer = 10.0;
    this.particles = [];
    this.confetti = [];

    // Reset physics world
    this.physics.loadLevel(this.currentLevel);

    // Reset UI
    this.levelTitle.innerText = `第 ${this.currentLevel.id} 關`;
    this.statusBanner.classList.remove('hidden');
    this.statusText.innerText = '輕觸畫布畫出保護罩，抵擋蜜蜂！';
    this.countdownWrapper.classList.add('hidden');
    this.modalVictory.classList.add('hidden');
    this.modalDefeat.classList.add('hidden');
    this.modalLevels.classList.add('hidden');

    this.updateInkGauge();
    window.soundEngine.stopBeeBuzz();
  }

  // When Doge is stung by a bee
  handleDogeStung(bee) {
    if (this.state !== GAME_STATE.DEFENDING) return;
    this.state = GAME_STATE.LOST;

    window.soundEngine.playStung();

    // Doge tear particles
    if (this.physics.dogeBody) {
      const pos = this.physics.dogeBody.position;
      for (let i = 0; i < 20; i++) {
        this.particles.push({
          x: pos.x + (Math.random() - 0.5) * 30,
          y: pos.y - 10 + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 6,
          vy: -Math.random() * 6 - 2,
          life: 1.2,
          color: '#3498db',
          size: 4 + Math.random() * 3
        });
      }
    }

    // Show defeat modal after brief comedy pause
    setTimeout(() => {
      this.defeatTipText.innerText = this.currentLevel.tip || '畫出封閉的弧線或利用勾子支撐！';
      this.modalDefeat.classList.remove('hidden');
    }, 700);
  }

  // Doge touched hazard/spikes or fell off
  handleDogeFall() {
    if (this.state !== GAME_STATE.DEFENDING) return;
    this.state = GAME_STATE.LOST;

    window.soundEngine.playStung();

    setTimeout(() => {
      this.defeatTipText.innerText = '小心尖刺與懸崖！讓保護罩牢牢托住狗狗！';
      this.modalDefeat.classList.remove('hidden');
    }, 600);
  }

  // Bee hit shield
  handleShieldHit(pos) {
    window.soundEngine.playBeeHit();

    // Small impact puff
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 0.5,
        color: '#f1c40f',
        size: 3
      });
    }
  }

  // Victory handler when surviving full 10s
  handleVictory() {
    this.state = GAME_STATE.WON;
    window.soundEngine.stopBeeBuzz();
    window.soundEngine.playWinFanfare();

    // Calculate stars and score
    const remainingRatio = Math.max(0, 1 - (this.inkUsed / this.maxInk));
    const stars = this.calculateStars(remainingRatio);
    const inkPercent = Math.round((this.inkUsed / this.maxInk) * 100);
    const score = 5000 + Math.round(remainingRatio * 4000) + stars * 1000;

    // Update progress
    this.progress.unlockedLevel = Math.max(this.progress.unlockedLevel, this.currentLevelIndex + 2);
    const prevStars = this.progress.levelStars[this.currentLevel.id] || 0;
    this.progress.levelStars[this.currentLevel.id] = Math.max(prevStars, stars);
    const prevScore = this.progress.levelScores[this.currentLevel.id] || 0;
    this.progress.levelScores[this.currentLevel.id] = Math.max(prevScore, score);
    this.saveProgress();

    // Trigger confetti explosion
    for (let i = 0; i < 100; i++) {
      this.confetti.push({
        x: VIRTUAL_WIDTH / 2 + (Math.random() - 0.5) * 300,
        y: VIRTUAL_HEIGHT / 2 - 100 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 12 - 4,
        gravity: 0.28,
        color: ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#f368e0', '#ffc800'][Math.floor(Math.random() * 6)],
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        life: 1.0
      });
    }

    // Show Victory modal
    setTimeout(() => {
      this.statInkUsed.innerText = `${inkPercent}%`;
      this.statScore.innerText = score.toLocaleString();

      const winStars = [
        document.getElementById('win-star-1'),
        document.getElementById('win-star-2'),
        document.getElementById('win-star-3')
      ];

      winStars.forEach(s => s.classList.remove('earned'));
      this.modalVictory.classList.remove('hidden');

      // Animate stars sequentially with dings
      for (let s = 1; s <= stars; s++) {
        setTimeout(() => {
          winStars[s - 1].classList.add('earned');
          window.soundEngine.playStarDing(s);
        }, s * 300);
      }
    }, 600);
  }

  // Level selector modal
  openLevelSelect() {
    this.modalLevels.classList.remove('hidden');
    this.levelsGrid.innerHTML = '';

    let totalStars = 0;
    const maxStars = GAME_LEVELS.length * 3;

    GAME_LEVELS.forEach((lvl, idx) => {
      const isUnlocked = idx + 1 <= this.progress.unlockedLevel;
      const starsEarned = this.progress.levelStars[lvl.id] || 0;
      totalStars += starsEarned;

      const tile = document.createElement('div');
      tile.className = `level-tile ${isUnlocked ? '' : 'locked'} ${idx === this.currentLevelIndex ? 'current' : ''}`;

      if (isUnlocked) {
        const starStr = '★'.repeat(starsEarned) + '☆'.repeat(3 - starsEarned);
        tile.innerHTML = `
          <span class="level-num">${lvl.id}</span>
          <span class="level-tile-stars">${starStr}</span>
        `;
        tile.onclick = () => {
          window.soundEngine.playButton();
          this.modalLevels.classList.add('hidden');
          this.loadLevel(idx);
        };
      } else {
        tile.innerHTML = `
          <span class="lock-icon">🔒</span>
          <span class="level-num" style="font-size:14px;">第${lvl.id}關</span>
        `;
      }

      this.levelsGrid.appendChild(tile);
    });

    this.totalStarsCount.innerText = totalStars;
    this.maxStarsCount.innerText = maxStars;
  }

  // Main update loop
  update(deltaMs) {
    // 1. Step Matter.js physics
    this.physics.step(deltaMs);

    // 2. Update defense countdown
    if (this.state === GAME_STATE.DEFENDING) {
      const deltaSec = deltaMs / 1000;
      this.defenseTimer -= deltaSec;

      const curSec = Math.ceil(this.defenseTimer);
      if (curSec !== this.lastCountdownSec && curSec >= 0) {
        window.soundEngine.playCountdownTick(curSec);
        this.lastCountdownSec = curSec;
      }

      // Update timer ring
      const progress = Math.max(0, this.defenseTimer / 10.0);
      const dashoffset = 264 * (1 - progress);
      this.countdownCircle.style.strokeDashoffset = dashoffset;
      this.countdownSec.innerText = Math.max(0, Math.ceil(this.defenseTimer));

      if (this.defenseTimer <= 3.0) {
        this.countdownWrapper.classList.add('countdown-pulse');
        this.countdownCircle.style.stroke = '#ff4757';
      } else {
        this.countdownCircle.style.stroke = '#2ecc71';
      }

      // Reached 0 -> VICTORY!
      if (this.defenseTimer <= 0) {
        this.handleVictory();
      }
    }

    // 3. Update clouds
    this.clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > VIRTUAL_WIDTH + 100) c.x = -150;
    });

    // 4. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= deltaMs / 800;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // 5. Update confetti
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.vy += c.gravity;
      c.x += c.vx;
      c.y += c.vy;
      c.rotation += c.rotSpeed;
      c.life -= deltaMs / 2500;
      if (c.life <= 0 || c.y > VIRTUAL_HEIGHT + 50) this.confetti.splice(i, 1);
    }

    // 6. Hint animation
    if (this.showHint) {
      this.hintAnimOffset += 0.8;
    }
  }

  // Main render loop
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Reset transform & scale to virtual resolution
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.translate(this.offsetX * this.dpr, this.offsetY * this.dpr);
    ctx.scale(this.scale * this.dpr, this.scale * this.dpr);

    // Draw background elements (clouds, sun rays)
    this.renderSky(ctx);

    // Draw static level terrain & hazards
    this.renderLevelPlatforms(ctx);

    // Draw pegs & anchors
    this.renderPegs(ctx);

    // Draw hives
    this.renderHives(ctx);

    // Draw 3-star Hint if requested
    if (this.showHint && this.currentLevel && this.currentLevel.hint) {
      this.renderHint(ctx);
    }

    // Draw line currently being drawn
    if (this.state === GAME_STATE.DRAWING && this.drawPoints.length > 1) {
      this.renderCurrentDrawing(ctx);
    }

    // Draw dynamic physics shield
    if (this.physics.shieldBody) {
      this.renderPhysicsShield(ctx, this.physics.shieldBody);
    }

    // Draw Doge
    this.renderDoge(ctx);

    // Draw Bees
    this.renderBees(ctx);

    // Draw Particles & Confetti
    this.renderParticles(ctx);

    ctx.restore();
  }

  // Draw animated sky background
  renderSky(ctx) {
    // Drifting clouds
    this.clouds.forEach(c => {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      const cx = c.x, cy = c.y, s = c.scale;
      ctx.arc(cx, cy, 25 * s, 0, Math.PI * 2);
      ctx.arc(cx + 25 * s, cy - 10 * s, 32 * s, 0, Math.PI * 2);
      ctx.arc(cx + 60 * s, cy, 28 * s, 0, Math.PI * 2);
      ctx.arc(cx + 30 * s, cy + 10 * s, 25 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Draw platforms & hazards
  renderLevelPlatforms(ctx) {
    const platforms = this.physics.platformBodies;
    platforms.forEach(b => {
      const p = b.meta;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);

      const hw = p.width / 2;
      const hh = p.height / 2;

      // Platform body (stone / cartoon soil)
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, p.width, p.height, 8);
      ctx.fill();

      // Top grass fringe
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, p.width, Math.min(14, p.height), [8, 8, 0, 0]);
      ctx.fill();

      // Border outline
      ctx.strokeStyle = '#2c3e50';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, p.width, p.height, 8);
      ctx.stroke();

      ctx.restore();
    });

    // Spikes & Lava
    const spikes = this.physics.spikeBodies;
    spikes.forEach(b => {
      const s = b.meta;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);

      const hw = s.width / 2;
      const hh = s.height / 2;

      if (s.hazard === 'lava') {
        // Glowing animated Lava zone
        const grad = ctx.createLinearGradient(0, -hh, 0, hh);
        grad.addColorStop(0, '#ff3838');
        grad.addColorStop(1, '#c0392b');
        ctx.fillStyle = grad;
        ctx.fillRect(-hw, -hh, s.width, s.height);

        // Lava bubbles
        ctx.fillStyle = '#f39c12';
        for (let i = 0; i < 5; i++) {
          const bx = -hw + ((i + 1) * s.width / 6);
          const by = -hh + 6 + Math.sin(performance.now() * 0.005 + i) * 3;
          ctx.beginPath();
          ctx.arc(bx, by, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Metallic Spikes
        ctx.fillStyle = '#95a5a6';
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;

        const spikeW = 20;
        const count = Math.floor(s.width / spikeW);
        const startX = -hw;

        for (let i = 0; i < count; i++) {
          ctx.beginPath();
          ctx.moveTo(startX + i * spikeW, hh);
          ctx.lineTo(startX + (i + 0.5) * spikeW, -hh);
          ctx.lineTo(startX + (i + 1) * spikeW, hh);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  // Draw static pegs
  renderPegs(ctx) {
    this.physics.pegBodies.forEach(peg => {
      ctx.save();
      ctx.translate(peg.position.x, peg.position.y);

      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.arc(0, 0, peg.circleRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#2c3e50';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Peg center bolt
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(0, 0, peg.circleRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // Draw Beehives
  renderHives(ctx) {
    if (!this.currentLevel) return;

    this.currentLevel.hives.forEach(h => {
      ctx.save();
      ctx.translate(h.x, h.y);

      // Hanging branch / rope
      ctx.strokeStyle = '#795548';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.lineTo(0, -10);
      ctx.stroke();

      // Beehive sprite
      const hiveImg = this.assets.beehive;
      if (hiveImg) {
        const size = 70;
        ctx.drawImage(hiveImg, -size / 2, -size / 2, size, size);
      } else {
        // Fallback cartoon beehive
        ctx.fillStyle = '#f1c40f';
        ctx.strokeStyle = '#d35400';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hive hole
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.ellipse(0, 8, 10, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  // Draw 3-star Hint ghost trail
  renderHint(ctx) {
    const hint = this.currentLevel.hint;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.hintAnimOffset;
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.85)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    hint.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt[0], pt[1]);
      else ctx.lineTo(pt[0], pt[1]);
    });
    ctx.stroke();

    // Hint label
    const midPt = hint[Math.floor(hint.length / 2)];
    ctx.fillStyle = '#27ae60';
    ctx.font = 'bold 15px Fredoka, sans-serif';
    ctx.fillText('💡 3星線條參考', midPt[0] - 45, midPt[1] - 18);

    ctx.restore();
  }

  // Draw line currently being drawn by player
  renderCurrentDrawing(ctx) {
    ctx.save();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    this.drawPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Inner highlight line
    ctx.strokeStyle = '#576574';
    ctx.lineWidth = 6;
    ctx.beginPath();
    this.drawPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    ctx.restore();
  }

  // Draw rigid physical shield after drop
  renderPhysicsShield(ctx, body) {
    ctx.save();
    const parts = body.parts;

    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#1e272e';
    ctx.lineWidth = 3;

    // Render compound body parts
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      ctx.beginPath();
      const vertices = part.vertices;
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let j = 1; j < vertices.length; j++) {
        ctx.lineTo(vertices[j].x, vertices[j].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw Doge character
  renderDoge(ctx) {
    const doge = this.physics.dogeBody;
    if (!doge) return;

    ctx.save();
    ctx.translate(doge.position.x, doge.position.y);
    ctx.rotate(doge.angle);

    const r = doge.circleRadius || 36;
    const size = r * 2.2;

    // Choose face asset depending on state
    let img = this.assets.dogeNormal;
    if (this.state === GAME_STATE.LOST) {
      img = this.assets.dogeStung;
    } else if (this.state === GAME_STATE.WON) {
      img = this.assets.dogeHappy;
    }

    if (img) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      // Fallback cute doge face
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2c3e50';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Eyes
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.arc(-10, -6, 4, 0, Math.PI * 2);
      ctx.arc(10, -6, 4, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.beginPath();
      ctx.arc(0, 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nervous sweat drop if bees are within 85px during defense
    if (this.state === GAME_STATE.DEFENDING) {
      let isNearBee = false;
      const bees = this.physics.beeBodies;
      for (let b of bees) {
        if (Math.hypot(b.position.x - doge.position.x, b.position.y - doge.position.y) < 85) {
          isNearBee = true;
          break;
        }
      }
      if (isNearBee) {
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.arc(r * 0.7, -r * 0.6, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Draw Bees
  renderBees(ctx) {
    const bees = this.physics.beeBodies;
    const beeImg = this.assets.angryBee;

    bees.forEach(bee => {
      ctx.save();
      ctx.translate(bee.position.x, bee.position.y);

      const meta = bee.beeMeta || {};
      const angle = meta.targetAngle || 0;
      ctx.rotate(angle);

      const r = bee.circleRadius || 13;
      const size = r * 2.8;

      if (beeImg) {
        // Flip sprite if moving leftwards
        if (Math.cos(angle) < 0) {
          ctx.scale(1, -1);
        }
        ctx.drawImage(beeImg, -size / 2, -size / 2, size, size);
      } else {
        // Fallback vector bee
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stripes
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(-4, -9, 4, 18);
        ctx.fillRect(4, -9, 4, 18);

        // Stinger
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(20, -3);
        ctx.lineTo(20, 3);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
  }

  // Render particles & confetti
  renderParticles(ctx) {
    // Normal particles
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Victory Confetti
    this.confetti.forEach(c => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    });
  }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.dogeGame = new DogeGame();
});
