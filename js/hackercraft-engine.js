// js/engine.js
class HackercraftEngine {
    constructor() {
        this.state = {
            currentScreen: 'title',
            currentBiome: 'forest',
            health: 10,
            maxHealth: 10,
            xp: 0,
            level: 1,
            xpToNext: 100,
            unlockedAchievements: new Set(),
            hotbarIndex: 0,
            volume: 0.5,
            sfxVolume: 0.7,
            darkTheme: true
        };
        
        this.soundManager = new SoundManager();
        this.uiManager = new UIManager(this);
        this.gameManager = new GameManager(this);
        this.saveManager = new SaveManager(this);
        
        this.init();
    }
    
    async init() {
        // Initialize managers
        await this.soundManager.init();
        this.uiManager.init();
        this.gameManager.init();
        this.saveManager.load();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Preload assets
        this.preloadAssets();
        
        // Start animation loop
        this.animate();
    }
    
    setupEventListeners() {
        // Title screen buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleAction(action);
                this.soundManager.play('ui_click');
            });
            
            btn.addEventListener('mouseenter', () => {
                this.soundManager.play('hover');
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key) {
                case 'Escape':
                    this.toggleSettings();
                    break;
                case 'Enter':
                    if (this.state.currentScreen === 'title') {
                        this.startGame();
                    }
                    break;
                case '1': case '2': case '3': case '4': case '5':
                case '6': case '7': case '8': case '9':
                    const index = parseInt(e.key) - 1;
                    this.switchHotbar(index);
                    break;
            }
        });
        
        // Volume controls
        document.getElementById('masterVolume').addEventListener('input', (e) => {
            this.state.volume = e.target.value / 100;
            this.soundManager.setVolume(this.state.volume);
            document.querySelector('.volume-value').textContent = `${e.target.value}%`;
        });
        
        document.getElementById('sfxVolume').addEventListener('input', (e) => {
            this.state.sfxVolume = e.target.value / 100;
            document.querySelectorAll('.volume-value')[1].textContent = `${e.target.value}%`;
        });
        
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('change', (e) => {
            this.state.darkTheme = !e.target.checked;
            document.body.dataset.theme = this.state.darkTheme ? 'dark' : 'light';
        });
        
        // Save settings
        document.querySelector('.save-settings').addEventListener('click', () => {
            this.saveManager.save();
            this.toggleSettings();
            this.soundManager.play('ui_click');
        });
        
        // Reset progress
        document.querySelector('.reset-progress').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all progress?')) {
                localStorage.clear();
                location.reload();
            }
        });
    }
    
    handleAction(action) {
        switch(action) {
            case 'start':
                this.startGame();
                break;
            case 'projects':
                this.switchBiome('desert');
                break;
            case 'skills':
                this.switchBiome('cave');
                break;
            case 'options':
                this.toggleSettings();
                break;
            case 'resume':
                this.downloadResume();
                break;
        }
    }
    
    async startGame() {
        // Show loading screen
        this.switchScreen('loading');
        
        // Simulate loading
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                // Switch to game world
                setTimeout(() => {
                    this.switchScreen('game');
                    this.uiManager.showToast('Welcome!', 'Use 1-9 to navigate sections');
                    this.soundManager.play('achievement');
                }, 500);
            }
            
            // Update loading bar
            document.querySelector('.loading-bar-progress').style.width = `${progress}%`;
            document.querySelector('.loading-status').textContent = 
                this.getLoadingStatus(progress);
        }, 100);
    }
    
    getLoadingStatus(progress) {
        if (progress < 30) return 'Loading security modules...';
        if (progress < 60) return 'Initializing game engine...';
        if (progress < 90) return 'Loading biome data...';
        return 'Complete! Entering world...';
    }
    
    switchScreen(screen) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
        });
        
        // Show target screen
        document.getElementById(`${screen}Screen`).classList.add('active');
        this.state.currentScreen = screen;
        
        // Update crosshair visibility
        document.getElementById('crosshair').style.display = 
            screen === 'game' ? 'block' : 'none';
    }
    
    switchBiome(biome) {
        if (this.state.currentScreen !== 'game') return;
        
        // Update active biome
        document.querySelectorAll('.biome').forEach(b => {
            b.classList.remove('active');
        });
        document.getElementById(`${biome}Biome`).classList.add('active');
        this.state.currentBiome = biome;
        
        // Update hotbar
        const biomeIndex = ['forest', 'cave', 'desert', 'sky', 'nether'].indexOf(biome);
        this.switchHotbar(biomeIndex);
        
        // Play transition sound
        this.soundManager.play('page_switch');
        
        // Add GSAP transition
        gsap.fromTo(`#${biome}Biome`, 
            { opacity: 0, y: 50 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
        );
    }
    
    switchHotbar(index) {
        if (index < 0 || index > 8) return;
        
        // Update active slot
        document.querySelectorAll('.hotbar-slot').forEach((slot, i) => {
            slot.classList.toggle('active', i === index);
        });
        
        this.state.hotbarIndex = index;
        
        // Switch to corresponding biome
        const biomes = ['forest', 'cave', 'desert', 'sky', 'nether'];
        if (index < biomes.length) {
            this.switchBiome(biomes[index]);
        }
        
        // Play sound
        this.soundManager.play('hover');
    }
    
    toggleSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.toggle('active');
        this.soundManager.play(modal.classList.contains('active') ? 'pause_menu' : 'ui_click');
    }
    
    downloadResume() {
        // Create download link
        const link = document.createElement('a');
        link.href = 'assets/resume.pdf';
        link.download = 'cybersecurity_resume.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Show achievement
        this.unlockAchievement('Download Resume', 'Your resume has been downloaded!');
    }
    
    unlockAchievement(title, description) {
        if (this.state.unlockedAchievements.has(title)) return;
        
        this.state.unlockedAchievements.add(title);
        this.addXP(25);
        this.uiManager.showToast(`Achievement: ${title}`, description);
        this.soundManager.play('achievement');
        this.saveManager.save();
    }
    
    addXP(amount) {
        this.state.xp += amount;
        
        // Level up
        while (this.state.xp >= this.state.xpToNext) {
            this.state.xp -= this.state.xpToNext;
            this.state.level++;
            this.state.xpToNext = Math.floor(this.state.xpToNext * 1.5);
            
            // Show level up toast
            this.uiManager.showToast('Level Up!', `Reached level ${this.state.level}`);
            this.soundManager.play('xp_gain');
        }
        
        // Update UI
        this.uiManager.updateHUD();
    }
    
    preloadAssets() {
        const images = [
            'assets/heart_full.png',
            'assets/heart_half.png',
            'assets/heart_empty.png',
            'assets/crosshair.png',
            'assets/hotbar_slot.png'
        ];
        
        images.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }
    
    animate() {
        // Animation loop for game updates
        requestAnimationFrame(() => this.animate());
    }
}

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.masterVolume = 0.5;
        this.sfxVolume = 0.7;
        this.initialized = false;
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Load all sounds
            const soundFiles = {
                'ui_click': 'assets/ui_click.wav',
                'block_break': 'assets/block_break.wav',
                'xp_gain': 'assets/xp_gain.wav',
                'achievement': 'assets/achievement.wav',
                'open_inventory': 'assets/open_inventory.wav',
                'hover': 'assets/hover.wav',
                'pause_menu': 'assets/pause_menu.wav',
                'page_switch': 'assets/page_switch.wav'
            };
            
            for (const [name, url] of Object.entries(soundFiles)) {
                await this.loadSound(name, url);
            }
            
            this.initialized = true;
        } catch (error) {
            console.warn('AudioContext not available, using fallback sounds');
            this.setupFallbackSounds();
        }
    }
    
    async loadSound(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
        } catch (error) {
            console.error(`Failed to load sound: ${name}`, error);
        }
    }
    
    play(name) {
        if (!this.initialized) {
            this.playFallback(name);
            return;
        }
        
        const sound = this.sounds.get(name);
        if (!sound) return;
        
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = sound;
        gainNode.gain.value = this.masterVolume * this.sfxVolume;
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        source.start(0);
        
        // Clean up
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };
    }
    
    setVolume(volume) {
        this.masterVolume = volume;
    }
    
    setupFallbackSounds() {
        // Simple oscillator fallback for when AudioContext is blocked
        this.initialized = true;
        this.sounds.set('fallback', true);
    }
    
    playFallback(name) {
        // Create simple beep sounds
        const frequencies = {
            'ui_click': 800,
            'block_break': 300,
            'xp_gain': 1200,
            'achievement': 1500,
            'hover': 600
        };
        
        const freq = frequencies[name] || 440;
        this.playBeep(freq, 0.1);
    }
    
    playBeep(frequency, duration) {
        const oscillator = new OscillatorNode(this.audioContext || {});
        const gainNode = new GainNode(this.audioContext || {});
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext?.destination || {});
        
        oscillator.frequency.value = frequency;
        gainNode.gain.value = this.masterVolume * this.sfxVolume;
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }
}

class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.toastQueue = [];
        this.isShowingToast = false;
    }
    
    init() {
        this.initHotbar();
        this.initHealth();
        this.initBlockGame();
        this.initParkourGame();
        this.initCrafting();
        this.initInventory();
        this.initContactForm();
    }
    
    initHotbar() {
        const hotbar = document.querySelector('.hotbar');
        const slots = [
            { icon: '🌲', label: '1', biome: 'forest' },
            { icon: '⛏️', label: '2', biome: 'cave' },
            { icon: '🏜️', label: '3', biome: 'desert' },
            { icon: '☁️', label: '4', biome: 'sky' },
            { icon: '🔥', label: '5', biome: 'nether' },
            { icon: '📁', label: '6', action: 'inventory' },
            { icon: '⚙️', label: '7', action: 'options' },
            { icon: '📄', label: '8', action: 'resume' },
            { icon: '🏠', label: '9', action: 'title' }
        ];
        
        slots.forEach((slot, index) => {
            const slotElement = document.createElement('div');
            slotElement.className = 'hotbar-slot';
            slotElement.innerHTML = `
                <div class="slot-icon">${slot.icon}</div>
                <span class="slot-label">${slot.label}</span>
            `;
            
            slotElement.addEventListener('click', () => {
                if (slot.biome) {
                    this.engine.switchBiome(slot.biome);
                } else if (slot.action) {
                    this.engine.handleAction(slot.action);
                }
                this.engine.switchHotbar(index);
            });
            
            hotbar.appendChild(slotElement);
        });
        
        // Set first slot as active
        this.engine.switchHotbar(0);
    }
    
    initHealth() {
        this.updateHealth();
    }
    
    updateHealth() {
        const hearts = document.querySelector('.hearts');
        const healthText = document.querySelector('.health-text');
        const { health, maxHealth } = this.engine.state;
        
        hearts.innerHTML = '';
        
        for (let i = 0; i < maxHealth / 2; i++) {
            const heart = document.createElement('div');
            heart.className = 'heart';
            
            if (health >= (i + 1) * 2) {
                heart.style.backgroundImage = 'url("assets/heart_full.png")';
            } else if (health >= i * 2 + 1) {
                heart.style.backgroundImage = 'url("assets/heart_half.png")';
            } else {
                heart.style.backgroundImage = 'url("assets/heart_empty.png")';
            }
            
            hearts.appendChild(heart);
        }
        
        healthText.textContent = `${health}/${maxHealth}`;
    }
    
    updateHUD() {
        this.updateHealth();
        this.updateXP();
    }
    
    updateXP() {
        const { xp, xpToNext, level } = this.engine.state;
        const progress = (xp / xpToNext) * 100;
        
        document.querySelector('.xp-progress').style.width = `${progress}%`;
        document.querySelector('.xp-text').textContent = 
            `Level ${level} • ${xp}/${xpToNext} XP`;
        
        // Animate XP gain
        gsap.fromTo('.xp-progress', 
            { scaleX: progress / 100 * 0.9 },
            { scaleX: progress / 100, duration: 0.3, ease: 'power2.out' }
        );
    }
    
    initBlockGame() {
        document.querySelectorAll('.block').forEach(block => {
            block.addEventListener('click', () => {
                const fact = block.dataset.fact;
                
                // Visual feedback
                gsap.to(block, {
                    scale: 0.9,
                    duration: 0.1,
                    yoyo: true,
                    repeat: 1,
                    ease: 'power2.inOut'
                });
                
                // Play sound
                this.engine.soundManager.play('block_break');
                
                // Show fact
                this.showToast('Block Broken!', fact);
                
                // Add XP
                this.engine.addXP(10);
                
                // Unlock achievement on first block break
                if (!this.engine.state.unlockedAchievements.has('First Block')) {
                    this.engine.unlockAchievement('First Block', 'You broke your first block!');
                }
            });
        });
    }
    
    initParkourGame() {
        const player = document.querySelector('.parkour-player');
        const platforms = document.querySelectorAll('.parkour-platform');
        let playerX = 70;
        let playerY = 60;
        let isJumping = false;
        let velocityY = 0;
        const gravity = 0.5;
        const jumpStrength = -12;
        
        // Keyboard controls
        const keys = {};
        document.addEventListener('keydown', (e) => {
            if (this.engine.state.currentBiome !== 'cave') return;
            
            keys[e.key.toLowerCase()] = true;
            
            if (e.key === ' ' && !isJumping) {
                isJumping = true;
                velocityY = jumpStrength;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            keys[e.key.toLowerCase()] = false;
        });
        
        // Game loop
        function updateParkour() {
            // Horizontal movement
            if (keys['a'] || keys['arrowleft']) playerX -= 3;
            if (keys['d'] || keys['arrowright']) playerX += 3;
            
            // Apply gravity
            velocityY += gravity;
            playerY += velocityY;
            
            // Platform collision
            let onGround = false;
            platforms.forEach(platform => {
                const rect = platform.getBoundingClientRect();
                const gameRect = document.querySelector('.parkour-game').getBoundingClientRect();
                
                const platX = parseInt(platform.style.left || '0');
                const platY = parseInt(platform.style.bottom || '0');
                const platWidth = parseInt(platform.style.width || '0');
                
                if (playerX + 30 > platX && 
                    playerX < platX + platWidth &&
                    playerY + 50 > platY && 
                    playerY < platY + 40) {
                    
                    playerY = platY - 50;
                    velocityY = 0;
                    onGround = true;
                    
                    // Check if reached end
                    if (platform.classList.contains('end')) {
                        completeParkour();
                    }
                }
            });
            
            // Ground collision
            if (playerY >= 150) {
                playerY = 150;
                velocityY = 0;
                onGround = true;
            }
            
            isJumping = !onGround;
            
            // Update player position
            player.style.left = `${playerX}px`;
            player.style.bottom = `${playerY}px`;
            
            // Boundary checks
            playerX = Math.max(0, Math.min(playerX, 470));
            
            requestAnimationFrame(updateParkour);
        }
        
        function completeParkour() {
            if (this.parkourCompleted) return;
            
            this.parkourCompleted = true;
            this.engine.addXP(50);
            this.engine.unlockAchievement('Parkour Master', 'Completed the skills course!');
            
            // Visual feedback
            gsap.to(player, {
                scale: 1.5,
                duration: 0.5,
                yoyo: true,
                repeat: 2,
                ease: 'elastic.out'
            });
        }
        
        // Bind context
        updateParkour = updateParkour.bind(this);
        completeParkour = completeParkour.bind(this);
        
        // Start game loop
        updateParkour();
    }
    
    initCrafting() {
        const craftBtn = document.querySelector('.craft-btn');
        const resultSlot = document.querySelector('.result-item');
        const slots = document.querySelectorAll('.crafting-slot');
        
        const recipes = {
            'react+node+aws': { icon: '🚀', name: 'Full-Stack App' },
            'python+docker+security': { icon: '🔒', name: 'Secure Microservice' },
            'git+linux+api': { icon: '⚡', name: 'DevOps Pipeline' }
        };
        
        craftBtn.addEventListener('click', () => {
            const items = Array.from(slots).map(slot => 
                slot.dataset.item || 'empty'
            ).join('+');
            
            const recipe = recipes[items];
            if (recipe) {
                // Show result
                resultSlot.innerHTML = `${recipe.icon}<br><small>${recipe.name}</small>`;
                
                // Animation
                gsap.fromTo(resultSlot, 
                    { scale: 0, rotation: -180 },
                    { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out' }
                );
                
                // Achievement
                this.engine.unlockAchievement('Crafting Expert', `Crafted: ${recipe.name}`);
            } else {
                // Failed craft
                resultSlot.textContent = '❌';
                gsap.fromTo(resultSlot,
                    { x: -10 },
                    { x: 10, duration: 0.1, repeat: 5, yoyo: true, ease: 'power1.inOut' }
                );
            }
            
            this.engine.soundManager.play('block_break');
        });
    }
    
    initInventory() {
        const inventoryBtn = document.querySelector('.hotbar-slot:nth-child(6)');
        const closeBtn = document.querySelector('.close-inventory');
        const inventoryModal = document.getElementById('inventoryModal');
        const inventoryGrid = document.querySelector('.inventory-grid');
        
        // Sample project items
        const projects = [
            { icon: '🔐', name: 'Auth System', desc: 'Secure authentication service' },
            { icon: '🌐', name: 'Web Scanner', desc: 'Vulnerability scanner tool' },
            { icon: '☁️', name: 'Cloud Sec', desc: 'AWS security automation' },
            { icon: '🐋', name: 'Docker Sec', desc: 'Container security audit' },
            { icon: '📱', name: 'Mobile App', desc: 'Secure React Native app' },
            { icon: '🤖', name: 'Bot Defense', desc: 'Bot mitigation system' },
            { icon: '🔍', name: 'CTF Toolkit', desc: 'Collection of CTF tools' },
            { icon: '📊', name: 'SIEM Dashboard', desc: 'Security monitoring dashboard' }
        ];
        
        // Populate inventory
        projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'inventory-item';
            item.innerHTML = `
                <div class="item-icon">${project.icon}</div>
                <div class="item-name">${project.name}</div>
            `;
            
            item.addEventListener('click', () => {
                this.showToast(project.name, project.desc);
                this.engine.soundManager.play('ui_click');
            });
            
            inventoryGrid.appendChild(item);
        });
        
        // Open/close inventory
        inventoryBtn.addEventListener('click', () => {
            inventoryModal.classList.add('active');
            this.engine.soundManager.play('open_inventory');
            
            // FLIP animation
            const state = Flip.getState(inventoryGrid.children);
            inventoryGrid.classList.add('inventory-open');
            Flip.from(state, {
                duration: 0.3,
                ease: 'power2.out'
            });
        });
        
        closeBtn.addEventListener('click', () => {
            inventoryModal.classList.remove('active');
            this.engine.soundManager.play('ui_click');
        });
        
        // Close with ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && inventoryModal.classList.contains('active')) {
                inventoryModal.classList.remove('active');
            }
        });
    }
    
    initContactForm() {
        const form = document.getElementById('contactForm');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            
            // In a real application, you would send this to a server
            console.log('Contact form submitted:', data);
            
            // Show success message
            this.showToast('Message Sent!', 'Thanks for reaching out!');
            
            // Reset form
            form.reset();
            
            // Add XP
            this.engine.addXP(15);
        });
    }
    
    showToast(title, description) {
        const toast = {
            title,
            description,
            id: Date.now()
        };
        
        this.toastQueue.push(toast);
        this.processToastQueue();
    }
    
    processToastQueue() {
        if (this.isShowingToast || this.toastQueue.length === 0) return;
        
        this.isShowingToast = true;
        const toast = this.toastQueue.shift();
        const container = document.getElementById('toastContainer');
        
        // Create toast element
        const toastElement = document.createElement('div');
        toastElement.className = 'toast showing';
        toastElement.innerHTML = `
            <div class="toast-title">${toast.title}</div>
            <div class="toast-description">${toast.description}</div>
        `;
        
        container.appendChild(toastElement);
        
        // Animation
        gsap.fromTo(toastElement,
            { x: 300, opacity: 0 },
            { 
                x: 0, 
                opacity: 1, 
                duration: 0.5,
                ease: 'back.out',
                onComplete: () => {
                    // Remove after delay
                    setTimeout(() => {
                        toastElement.classList.remove('showing');
                        toastElement.classList.add('hiding');
                        
                        setTimeout(() => {
                            container.removeChild(toastElement);
                            this.isShowingToast = false;
                            this.processToastQueue();
                        }, 500);
                    }, 3000);
                }
            }
        );
    }
}

class GameManager {
    constructor(engine) {
        this.engine = engine;
        this.achievements = [
            { id: 'first_block', title: 'First Block', desc: 'Break your first block' },
            { id: 'parkour_master', title: 'Parkour Master', desc: 'Complete the skills course' },
            { id: 'crafting_expert', title: 'Crafting Expert', desc: 'Successfully craft an item' },
            { id: 'resume_download', title: 'Resume Download', desc: 'Download your resume' },
            { id: 'level_5', title: 'Level 5', desc: 'Reach level 5' },
            { id: 'level_10', title: 'Level 10', desc: 'Reach level 10' },
            { id: 'all_biomes', title: 'World Explorer', desc: 'Visit all biomes' }
        ];
    }
    
    init() {
        this.initScrollAnimations();
        this.initObserver();
    }
    
    initScrollAnimations() {
        // Use GSAP ScrollTrigger for reveal animations
        gsap.registerPlugin(ScrollTrigger);
        
        // Animate biome sections
        gsap.utils.toArray('.pixel-panel').forEach((panel, i) => {
            gsap.from(panel, {
                scrollTrigger: {
                    trigger: panel,
                    start: 'top 80%',
                    end: 'bottom 20%',
                    toggleActions: 'play none none reverse'
                },
                y: 50,
                opacity: 0,
                duration: 0.8,
                delay: i * 0.1,
                ease: 'power2.out'
            });
        });
    }
    
    initObserver() {
        // Use GSAP Observer for input handling
        gsap.registerPlugin(Observer);
        
        Observer.create({
            target: window,
            type: 'wheel,touch,pointer',
            onWheel: this.handleWheel.bind(this),
            wheelSpeed: -1,
            tolerance: 10,
            preventDefault: true
        });
    }
    
    handleWheel(self) {
        if (this.engine.state.currentScreen !== 'game') return;
        
        // Wheel navigation between hotbar slots
        const delta = self.deltaY > 0 ? 1 : -1;
        const newIndex = (this.engine.state.hotbarIndex + delta + 9) % 9;
        this.engine.switchHotbar(newIndex);
    }
}

class SaveManager {
    constructor(engine) {
        this.engine = engine;
        this.saveKey = 'hackercraft_save';
    }
    
    save() {
        const saveData = {
            xp: this.engine.state.xp,
            level: this.engine.state.level,
            unlockedAchievements: Array.from(this.engine.state.unlockedAchievements),
            volume: this.engine.state.volume,
            sfxVolume: this.engine.state.sfxVolume,
            darkTheme: this.engine.state.darkTheme,
            lastSave: Date.now()
        };
        
        try {
            localStorage.setItem(this.saveKey, JSON.stringify(saveData));
        } catch (error) {
            console.warn('Failed to save game:', error);
        }
    }
    
    load() {
        try {
            const saved = localStorage.getItem(this.saveKey);
            if (!saved) return;
            
            const saveData = JSON.parse(saved);
            
            // Load saved data
            this.engine.state.xp = saveData.xp || 0;
            this.engine.state.level = saveData.level || 1;
            this.engine.state.unlockedAchievements = new Set(saveData.unlockedAchievements || []);
            this.engine.state.volume = saveData.volume || 0.5;
            this.engine.state.sfxVolume = saveData.sfxVolume || 0.7;
            this.engine.state.darkTheme = saveData.darkTheme !== undefined ? saveData.darkTheme : true;
            
            // Apply theme
            document.body.dataset.theme = this.engine.state.darkTheme ? 'dark' : 'light';
            
            // Update UI
            document.getElementById('masterVolume').value = this.engine.state.volume * 100;
            document.getElementById('sfxVolume').value = this.engine.state.sfxVolume * 100;
            document.getElementById('themeToggle').checked = !this.engine.state.darkTheme;
            
            document.querySelectorAll('.volume-value')[0].textContent = `${Math.round(this.engine.state.volume * 100)}%`;
            document.querySelectorAll('.volume-value')[1].textContent = `${Math.round(this.engine.state.sfxVolume * 100)}%`;
            
            this.engine.uiManager.updateHUD();
            
        } catch (error) {
            console.warn('Failed to load save:', error);
        }
    }
}

// Initialize the engine when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.hackercraft = new HackercraftEngine();
});

// Service Worker for offline capability (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.log('ServiceWorker registration failed:', error);
        });
    });
}

// Fallback for browsers without AudioContext
if (!window.AudioContext && !window.webkitAudioContext) {
    console.warn('Web Audio API not supported, using fallback audio');
}
