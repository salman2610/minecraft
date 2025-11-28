/* hackercraft-engine.js
   Complete game engine for HackerCraft portfolio
   Includes SoundManager, GSAP transitions, gameplay mechanics
*/

(() => {
  /* =========================
     GLOBAL STATE
     ========================= */
  const state = {
    soundOn: true,
    gameActive: false,
    achievements: new Set(),
    inventory: [],
    xp: 60,
    audioCtx: null,
    resources: {},
    parkourInstance: null,
    keys: {}
  };

  const log = (...args) => console.debug('[HackerCraft]', ...args);

  /* =========================
     SOUND MANAGER
     ========================= */
  const SOUND_FILES = {
    click: 'assets/ui_click.wav',
    block: 'assets/block_break.wav',
    xp: 'assets/xp_gain.wav',
    achievement: 'assets/achievement.wav',
    open: 'assets/open_inventory.wav',
    hover: 'assets/hover.wav',
    pause: 'assets/pause_menu.wav',
    page: 'assets/page_switch.wav'
  };

  const SoundManager = (() => {
    let ctx = null;
    const buffers = {};
    const gain = { master: null, sfx: null };
    let inited = false;
    let masterVol = 0.12;

    async function init() {
      if (inited) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        gain.master = ctx.createGain();
        gain.sfx = ctx.createGain();
        gain.master.gain.value = masterVol;
        gain.sfx.gain.value = 1;
        gain.sfx.connect(gain.master);
        gain.master.connect(ctx.destination);

        // Load sounds
        const names = Object.keys(SOUND_FILES);
        await Promise.all(names.map(async (k) => {
          try {
            const res = await fetch(SOUND_FILES[k]);
            const ab = await res.arrayBuffer();
            const buf = await ctx.decodeAudioData(ab);
            buffers[k] = buf;
          } catch (e) {
            console.warn('[Sound] failed to load', k, e);
          }
        }));
        inited = true;
        log('Sound preloaded', Object.keys(buffers));
      } catch (e) {
        console.warn('Audio init failed', e);
      }
    }

    function _playBuffer(buf, opts = {}) {
      if (!buf || !ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;
      const g = ctx.createGain();
      g.gain.value = (typeof opts.volume === 'number') ? opts.volume : 1.0;
      src.connect(g);
      g.connect(gain.sfx);
      src.start(0);
    }

    function play(name, opts = {}) {
      if (!inited) {
        init().then(() => {
          if (buffers[name]) _playBuffer(buffers[name], opts);
        }).catch(()=>{});
        return;
      }
      if (!state.soundOn) return;
      const buf = buffers[name];
      if (buf) _playBuffer(buf, opts);
    }

    function setVolume(v) {
      masterVol = Math.max(0, Math.min(1, v));
      if (gain.master) gain.master.gain.value = masterVol;
    }

    function toggle() {
      state.soundOn = !state.soundOn;
      log('Sound toggled', state.soundOn);
      if (!inited && state.soundOn) init().catch(()=>{});
    }

    // Fallback beep
    function beep(freq = 600, dur = 0.08, vol = 0.12, type = 'sine') {
      try {
        if (!ctx) init();
        if (!ctx) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = vol;
        o.connect(g); g.connect(gain.sfx);
        o.start();
        o.stop(ctx.currentTime + dur);
      } catch (e) { /* ignore */ }
    }

    return { init, play, setVolume, toggle, beep, _buffers: buffers };
  })();

  /* =========================
     GSAP TRANSITIONS
     ========================= */
  const GSAP = (() => {
    const hasG = typeof window.gsap !== 'undefined';

    function introSequenceFallback(titleEl, gameEl) {
      if (titleEl) titleEl.style.display = 'none';
      if (gameEl) { gameEl.style.display = 'flex'; }
    }

    function bindInventoryAnimation() {
      const inv = document.getElementById('inventoryModal');
      if (!inv) return;
      
      window.openInventory = () => {
        SoundManager.play('open');
        inv.style.display = 'block';
        inv.setAttribute('aria-hidden','false');
        if (hasG) gsap.fromTo(inv, {y:-40, autoAlpha:0, scale:0.98}, {y:0, autoAlpha:1, scale:1, duration:0.6, ease:'back.out(1.2)'});
      };
      
      window.closeInventory = () => {
        if (hasG) gsap.to(inv, {y:-20, autoAlpha:0, duration:0.35, ease:'power1.in', onComplete: ()=>{inv.style.display='none'; inv.setAttribute('aria-hidden','true');}});
        else { inv.style.display='none'; inv.setAttribute('aria-hidden','true'); }
      };
    }

    function setupToastStack() {
      const wrap = document.getElementById('toastWrap');
      if (!wrap) return;

      window.createToast = function(title, msg, opts = {}) {
        const node = document.createElement('div');
        node.className = 'toast';
        node.innerHTML = `<div style="width:40px;height:40px;background:linear-gradient(180deg,#232425,#111213);border-radius:6px;border:2px solid #000;margin-right:8px"></div>
                          <div style="display:flex;flex-direction:column">
                            <div class="title">${title}</div>
                            <div class="msg">${msg}</div>
                          </div>`;
        wrap.prepend(node);
        if (hasG) {
          gsap.fromTo(node, {y:-20, autoAlpha:0, scale:0.98}, {y:0, autoAlpha:1, scale:1, duration:0.45, ease:'back.out(1.1)'});
          gsap.to(node, {delay:(opts.duration||4.2)/1000, x:40, autoAlpha:0, duration:0.5, ease:'power1.in', onComplete: ()=> node.remove()});
        } else {
          setTimeout(()=> node.remove(), opts.duration || 4200);
        }
        SoundManager.play('achievement');
      };
    }

    function bindEnhancedParallax() {
      const preview = document.getElementById('preview');
      const layers = [document.getElementById('previewLayer1'), document.getElementById('previewLayer2')].filter(Boolean);
      if (!preview || !layers.length) return;
      
      if (!hasG) {
        preview.addEventListener('mousemove', (ev) => {
          const rect = preview.getBoundingClientRect();
          const cx = (ev.clientX - rect.left) / rect.width - 0.5;
          layers.forEach((el, i) => el.style.transform = `translate(${cx * ((i+1)*6)}px, ${cx * -((i+1)*3)}px)`);
        });
        return;
      }
      
      preview.addEventListener('mousemove', (ev) => {
        const rect = preview.getBoundingClientRect();
        const cx = (ev.clientX - rect.left) / rect.width - 0.5;
        layers.forEach((el, i) => {
          gsap.to(el, {x: cx * (i+1) * 10, y: cx * (i+1) * -6, duration: 0.6, ease: 'power3.out'});
        });
      });
    }

    function introSequence() {
      const title = document.getElementById('titleScreen');
      const game = document.getElementById('gameShell');
      if (!hasG) { introSequenceFallback(title, game); return; }
      gsap.fromTo(title, {autoAlpha:1, scale:1}, {duration:0.5, autoAlpha:0, scale:0.98, ease:'power1.inOut', onComplete(){
        title.style.display='none';
        game.style.display='flex';
        gsap.fromTo(game, {autoAlpha:0, scale:0.98}, {autoAlpha:1, scale:1, duration:0.6, ease:'back.out(1.2)'});
      }});
    }

    return { 
      init() { 
        bindInventoryAnimation(); 
        setupToastStack(); 
        bindEnhancedParallax(); 
      }, 
      introSequence, 
      bindInventoryAnimation, 
      setupToastStack, 
      bindEnhancedParallax 
    };
  })();

  /* =========================
     ACHIEVEMENT SYSTEM
     ========================= */
  function awardAchievement(id, title, msg) {
    if (state.achievements.has(id)) return;
    state.achievements.add(id);
    (window.createToast || ((t,m)=>{
      const wrap = document.getElementById('toastWrap');
      if (!wrap) return;
      const n = document.createElement('div'); 
      n.className='toast'; 
      n.innerHTML = `<div class="title">${t}</div><div class="msg">${m}</div>`;
      wrap.prepend(n); 
      setTimeout(()=> n.remove(), 4200);
    }))(title, msg, { duration: 4200 });
    log('Achievement unlocked', id);
    SoundManager.play('achievement');
  }

  /* =========================
     BASIC PARALLAX
     ========================= */
  function setupParallaxBasic() {
    const preview = document.getElementById('preview');
    const layers = [document.getElementById('previewLayer1'), document.getElementById('previewLayer2')].filter(Boolean);
    if (!preview || !layers.length) return;
    preview.addEventListener('mousemove', (ev) => {
      const rect = preview.getBoundingClientRect();
      const cx = (ev.clientX - rect.left) / rect.width - 0.5;
      layers.forEach((el, i) => el.style.transform = `translate(${cx * ((i+1)*6)}px, ${cx * -((i+1)*3)}px)`);
    });
  }

  /* =========================
     HOTBAR & NAVIGATION
     ========================= */
  function bindHotbar() {
    const hotbar = document.getElementById('hotbar');
    if (!hotbar) return;
    hotbar.addEventListener('click', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      [...hotbar.children].forEach(s => s.classList.remove('active'));
      slot.classList.add('active');
      const section = slot.dataset.section;
      if (section && document.getElementById(section)) {
        document.getElementById(section).scrollIntoView({ behavior: 'smooth' });
      }
      SoundManager.play('click');
    });
    
    window.addEventListener('keydown', (ev) => {
      if (/^[1-4]$/.test(ev.key)) {
        const idx = Number(ev.key) - 1;
        const slot = hotbar.children[idx];
        if (slot) slot.click();
      }
    });
  }

  /* =========================
     INVENTORY SYSTEM
     ========================= */
  function populateInventory(items = []) {
    state.inventory = items;
    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    items.forEach(it => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<div style="font-weight:700">${it.name}</div><div style="font-size:12px;color:#9aa0a6">${it.desc}</div><div style="margin-top:8px"><a class="menu-btn" href="${it.link}" target="_blank">Open</a></div>`;
      el.addEventListener('click', () => { 
        window.createToast?.(it.name, it.desc); 
        SoundManager.play('click'); 
      });
      grid.appendChild(el);
    });
  }

  /* =========================
     BLOCK BREAKING GAME
     ========================= */
  function setupBlockGame(containerId = 'blockGameMini') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const facts = [
      "M.Sc Physics — The New College, Chennai",
      "Certified Penetration Tester — RedTeam",
      "Built AI vulnerability scanner",
      "Research: Ultrasonic interferometry",
      "Experienced in Python, JS & Go",
      "Worked on OWASP tooling & purple-team infra",
    ];
    
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('div');
      b.className = 'mc-game-block';
      b.textContent = '⛏️';
      b.style.userSelect = 'none';
      b.dataset.fact = facts[Math.floor(Math.random() * facts.length)];
      b.addEventListener('click', async function () {
        if (this.dataset.broken) return;
        this.dataset.broken = '1';
        this.classList.add('broken');
        SoundManager.play('block');
        await new Promise(r => setTimeout(r, 260));
        this.classList.add('revealed');
        this.textContent = '💡';
        window.createToast?.('Fact', this.dataset.fact);
        spawnParticles(this.getBoundingClientRect());
        awardAchievement(`block-${i}`, 'Miner', 'You broke a block and found a fact!');
      });
      container.appendChild(b);
    }
  }

  function spawnParticles(rect, count = 8) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'mc-particle';
      const x = rect.left + rect.width / 2 + (Math.random() * 60 - 30);
      const y = rect.top + rect.height / 2 + (Math.random() * 60 - 30);
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 40;
      p.style.setProperty('--tx', `${tx}px`);
      p.style.setProperty('--ty', `${ty}px`);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1000 + Math.random() * 400);
    }
  }

  /* =========================
     PARKOUR PHYSICS
     ========================= */
  function setupParkour(arenaId = 'parkourArena') {
    const arena = document.getElementById(arenaId);
    if (!arena) return;
    arena.innerHTML = '';

    const w = arena.clientWidth || 700;
    const h = arena.clientHeight || 320;
    const platforms = [
      { x: 10, y: h - 28, w: 120, h: 20 },
      { x: 170, y: h - 90, w: 90, h: 18 },
      { x: 300, y: h - 140, w: 140, h: 20 },
      { x: 500, y: h - 200, w: 100, h: 18 },
      { x: 660, y: h - 260, w: 80, h: 18 }
    ];

    // Create player
    const playerEl = document.createElement('div');
    playerEl.className = 'mc-parkour-player';
    playerEl.style.position = 'absolute';
    playerEl.style.width = '20px';
    playerEl.style.height = '20px';
    playerEl.style.left = '20px';
    playerEl.style.top = (h - 48) + 'px';
    playerEl.style.background = 'linear-gradient(180deg,#5b9c64,#2f5a31)';
    playerEl.style.border = '2px solid #000';
    arena.appendChild(playerEl);

    // Create platforms
    platforms.forEach(pl => {
      const el = document.createElement('div');
      el.className = 'mc-parkour-platform';
      el.style.left = pl.x + 'px';
      el.style.top = pl.y + 'px';
      el.style.width = pl.w + 'px';
      el.style.height = pl.h + 'px';
      el.style.position = 'absolute';
      el.style.background = 'linear-gradient(180deg,#8b6914,#6d4f0b)';
      el.style.border = '2px solid #000';
      arena.appendChild(el);
    });

    // Physics state
    const player = { 
      x: 20, y: h - 48, vx: 0, vy: 0, w: 20, h: 20, 
      onGround: false, speed: 2.9, jumpStrength: 7.2 
    };
    
    function keyHandler(ev) {
      const k = ev.key.toLowerCase();
      if (ev.type === 'keydown') state.keys[k] = true;
      else state.keys[k] = false;
    }
    
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keyup', keyHandler);

    let last = performance.now();
    let running = true;

    function step(now) {
      const dt = Math.min(32, now - last) / 16.666;
      last = now;
      
      const left = state.keys['a'] || state.keys['arrowleft'];
      const right = state.keys['d'] || state.keys['arrowright'];
      const up = state.keys['w'] || state.keys['arrowup'] || state.keys[' '];

      if (left) player.vx = -player.speed;
      else if (right) player.vx = player.speed;
      else player.vx = 0;

      player.vy += 0.45 * dt;
      
      if (up && player.onGround) {
        player.vy = -player.jumpStrength;
        player.onGround = false;
        SoundManager.play('click');
      }
      
      player.x += player.vx * dt * 6;
      player.y += player.vy * dt;

      // Collision detection
      player.onGround = false;
      platforms.forEach(pl => {
        const px1 = pl.x, px2 = pl.x + pl.w;
        const py = pl.y;
        const playerBottom = player.y + player.h;
        if (player.x + player.w > px1 && player.x < px2) {
          if (playerBottom >= py && playerBottom < py + 16 && player.vy >= 0) {
            player.y = py - player.h;
            player.vy = 0;
            player.onGround = true;
          }
        }
      });

      // Arena bounds
      if (player.x < 0) player.x = 0;
      if (player.x + player.w > (arena.clientWidth - 6)) player.x = arena.clientWidth - player.w - 6;
      
      if (player.y > arena.clientHeight) {
        player.x = 20; 
        player.y = arena.clientHeight - 48; 
        player.vy = 0;
        (window.createToast || ((t,m)=>{}))('Parkour', 'You fell. Resetting run...');
        SoundManager.play('page');
      }

      playerEl.style.left = Math.round(player.x) + 'px';
      playerEl.style.top = Math.round(player.y) + 'px';

      // Victory condition
      if (player.x > (arena.clientWidth - 120)) {
        (window.createToast || ((t,m)=>{}))('Parkour Complete', 'You reached the end — +15 XP', {duration:3600});
        SoundManager.play('xp');
        state.xp = Math.min(100, state.xp + 15);
        document.getElementById('xpFill').style.width = state.xp + '%';
        awardAchievement('parkour-complete', 'Parkour Master', 'Completed a parkour run.');
        running = false;
      }

      if (running) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
    
    return {
      destroy() {
        running = false;
        window.removeEventListener('keydown', keyHandler);
        window.removeEventListener('keyup', keyHandler);
      }
    };
  }

  /* =========================
     WORLD CONTROLS
     ========================= */
  function bindWorldControls() {
    const btnStart = document.getElementById('btnStart');
    const btnWorldSelect = document.getElementById('btnWorldSelect');
    const btnSingle = document.getElementById('btnSingle');
    const btnMult = document.getElementById('btnMult');
    const btnSounds = document.getElementById('btnSounds');
    const btnInventory = document.getElementById('btnInventory');

    if (btnStart) btnStart.addEventListener('click', startWorldSequence);
    
    if (btnWorldSelect) btnWorldSelect.addEventListener('click', () => {
      const label = document.getElementById('selectedWorldLabel');
      if (label) label.textContent = label.textContent.includes('Overworld') ? 'Cyber Lab (Nether)' : 'Portfolio Overworld';
      SoundManager.play('page');
    });
    
    if (btnSingle) btnSingle.addEventListener('click', startWorldSequence);
    
    if (btnMult) btnMult.addEventListener('click', () => {
      (window.createToast || ((t,m)=>{}))('Multiplayer', 'Simulated project gallery view opened.');
      SoundManager.play('click');
      document.getElementById('projects').scrollIntoView({behavior: 'smooth'});
    });
    
    if (btnSounds) btnSounds.addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      btnSounds.textContent = 'Sound: ' + (state.soundOn ? 'On' : 'Off');
      if (state.soundOn) SoundManager.init().catch(()=>{});
    });
    
    if (btnInventory) btnInventory.addEventListener('click', () => {
      window.openInventory?.();
    });
  }

  function startWorldSequence() {
    const title = document.getElementById('titleScreen');
    const game = document.getElementById('gameShell');
    
    SoundManager.init().catch(()=>{});
    
    if (window.HackerCraft && HackerCraft.gsap && typeof HackerCraft.gsap.introSequence === 'function') {
      HackerCraft.gsap.introSequence();
    } else {
      if (title) title.style.display = 'none';
      if (game) game.style.display = 'flex';
    }
    
    state.gameActive = true;
    (window.createToast || ((t,m)=>{}))('World Loaded', 'Welcome to HackerCraft!');
    awardAchievement('enter-world','World Entered','You booted the HackerCraft world.');
    
    const cross = document.getElementById('crosshair'); 
    if (cross) cross.style.display = 'block';
    
    populateInventoryDemoAndUI();
    setupBlockGame('blockGameMini');
    
    if (state.parkourInstance && typeof state.parkourInstance.destroy === 'function') {
      state.parkourInstance.destroy();
    }
    state.parkourInstance = setupParkour('parkourArena');
    
    bindHotbar();
    SoundManager.play('open');
  }

  /* =========================
     DEMO DATA
     ========================= */
  function populateInventoryDemoAndUI() {
    const items = [
      {id:'vuln-scanner', name:'Vuln Scanner', desc:'AI-driven vulnerability detection', link:'https://github.com/salman2610/ai-vuln-scanner'},
      {id:'owasp', name:'OWASP Framework', desc:'Automated security tests & CI', link:'https://github.com/salman2610/OWASP-Framework'},
      {id:'purple-team', name:'Purple Team', desc:'Threat hunting & analytics', link:'https://github.com/salman2610/PurpleTeam-Project'},
      {id:'red-team', name:'Red Team', desc:'Adversary emulation environment', link:'#'}
    ];
    populateInventory(items);
    const xpEl = document.getElementById('xpFill'); 
    if (xpEl) xpEl.style.width = state.xp + '%';
  }

  /* =========================
     UI BINDINGS
     ========================= */
  function bindUI() {
    // Inventory modal close
    const invModal = document.getElementById('inventoryModal');
    if (invModal) {
      invModal.addEventListener('click', (ev) => {
        if (ev.target === invModal) window.closeInventory?.();
      });
    }

    // Achievements button
    const achBtn = document.getElementById('btnAchievements');
    if (achBtn) achBtn.addEventListener('click', () => {
      (window.createToast || ((t,m)=>{}))('Achievements', `Unlocked: ${state.achievements.size}`);
      SoundManager.play('click');
    });

    // Pause system
    const pauseBtn = document.getElementById('btnPause');
    const pauseOverlay = document.getElementById('pauseOverlay');
    const resumeBtn = document.getElementById('resumeBtn');
    const toTitleBtn = document.getElementById('toTitleBtn');
    
    if (pauseBtn) pauseBtn.addEventListener('click', () => {
      if (pauseOverlay) pauseOverlay.style.display = 'flex';
      state.gameActive = false;
      SoundManager.play('pause');
    });
    
    if (resumeBtn) resumeBtn.addEventListener('click', () => {
      if (pauseOverlay) pauseOverlay.style.display = 'none';
      state.gameActive = true;
    });
    
    if (toTitleBtn) toTitleBtn.addEventListener('click', () => {
      document.getElementById('gameShell').style.display = 'none';
      document.getElementById('titleScreen').style.display = 'flex';
      SoundManager.play('page');
    });

    // Project cards
    document.querySelectorAll('.project-card').forEach(pc => {
      pc.addEventListener('click', () => {
        const pr = pc.dataset.project || 'project';
        (window.createToast || ((t,m)=>{}))('Project', `Opening ${pr}`);
        SoundManager.play('click');
      });
    });

    // Global keyboard
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && document.getElementById('titleScreen') && 
          document.getElementById('titleScreen').style.display !== 'none') {
        startWorldSequence();
      }
      if (ev.key === 'Escape') {
        const overlay = document.getElementById('pauseOverlay');
        if (overlay) overlay.style.display = (overlay.style.display === 'flex') ? 'none' : 'flex';
      }
    });
  }

  /* =========================
     PARKOUR CONTROLS (global)
     ========================= */
  window.startParkour = function() {
    if (state.parkourInstance && typeof state.parkourInstance.destroy === 'function') {
      state.parkourInstance.destroy();
    }
    state.parkourInstance = setupParkour('parkourArena');
  };

  window.resetParkour = function() {
    const arena = document.getElementById('parkourArena');
    if (arena) arena.innerHTML = '';
    document.getElementById('skillXpFill').style.width = '40%';
    (window.createToast || ((t,m)=>{}))('Parkour', 'Reset');
  };

  /* =========================
     TOAST FALLBACK
     ========================= */
  window.toast = function(title, msg) {
    (window.createToast || ((t,m)=>{
      const wrap = document.getElementById('toastWrap');
      if (!wrap) return;
      const n = document.createElement('div'); 
      n.className='toast'; 
      n.innerHTML = `<div class="title">${t}</div><div class="msg">${m}</div>`;
      wrap.prepend(n); 
      setTimeout(()=> n.remove(), 4200);
    }))(title, msg);
  };

  /* =========================
     INITIALIZATION
     ========================= */
  function init() {
    if (window.HackerCraft && window.HackerCraft.gsap) {
      window.HackerCraft.gsap.init?.();
    }
    
    setupParallaxBasic();
    bindWorldControls();
    bindUI();
    bindHotbar();
    
    setupBlockGame('blockGameMini');

    const start = document.getElementById('btnStart');
    if (start) start.focus();

    log('HackerCraft engine initialized');
  }

  // Expose API
  window.HackerCraft = window.HackerCraft || {};
  Object.assign(window.HackerCraft, {
    startWorldSequence,
    awardAchievement,
    SoundManager,
    setupBlockGame,
    setupParkour,
    populateInventory,
    gsap: window.HackerCraft.gsap || null
  });

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof window.gsap !== 'undefined' && window.HackerCraft.gsap && 
          typeof window.HackerCraft.gsap.init === 'function') {
        window.HackerCraft.gsap.init();
      }
      init();
    });
  } else {
    init();
  }

})();
