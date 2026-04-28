import * as THREE from 'three';

// Shape types available
const SHAPE_TYPES = ['sphere', 'torus', 'triangle', 'square', 'pyramid', 'cube', 'cylinder'];

// Seeded PRNG (mulberry32)
function createRng(seed) {
    let s = seed | 0;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createGeometry(type, size) {
    switch (type) {
        case 'sphere':
            return new THREE.SphereGeometry(size, 24, 24);
        case 'torus':
            return new THREE.TorusGeometry(size, size * 0.4, 16, 32);
        case 'triangle': {
            const shape = new THREE.Shape();
            const h = size * 1.5;
            shape.moveTo(0, h / 2);
            shape.lineTo(-h / 2, -h / 2);
            shape.lineTo(h / 2, -h / 2);
            shape.closePath();
            return new THREE.ExtrudeGeometry(shape, { depth: size * 0.4, bevelEnabled: true, bevelThickness: size * 0.08, bevelSize: size * 0.08, bevelSegments: 3 });
        }
        case 'square': {
            const s = size * 1.2;
            const sq = new THREE.Shape();
            sq.moveTo(-s/2, -s/2);
            sq.lineTo(s/2, -s/2);
            sq.lineTo(s/2, s/2);
            sq.lineTo(-s/2, s/2);
            sq.closePath();
            return new THREE.ExtrudeGeometry(sq, { depth: size * 0.4, bevelEnabled: true, bevelThickness: size * 0.08, bevelSize: size * 0.08, bevelSegments: 3 });
        }
        case 'pyramid':
            return new THREE.ConeGeometry(size, size * 1.5, 4, 1);
        case 'cube':
            return new THREE.BoxGeometry(size * 1.2, size * 1.2, size * 1.2);
        case 'cylinder':
            return new THREE.CylinderGeometry(size * 0.6, size * 0.6, size * 1.5, 24);
        default:
            return new THREE.SphereGeometry(size, 24, 24);
    }
}

// Main initialization
async function initBackground() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;

    // Fetch counts and easter eggs list
    let gameCount = 0;
    let toolCount = 0;
    let easterEggs = [];
    try {
        const [gamesRes, toolsRes, eggsRes] = await Promise.all([
            fetch('data/games.json'),
            fetch('data/tools.json'),
            fetch('easter-eggs/list.json').catch(() => null)
        ]);
        if (gamesRes.ok) {
            const gamesData = await gamesRes.json();
            gameCount = gamesData.totalGames || 0;
        }
        if (toolsRes.ok) {
            const toolsData = await toolsRes.json();
            toolCount = toolsData.totalTools || 0;
        }
        if (eggsRes && eggsRes.ok) {
            easterEggs = await eggsRes.json();
        }
    } catch (e) {
        console.warn('Background: could not fetch counts, using defaults');
    }

    // Single seed from total count
    const seed = gameCount + toolCount;
    const rng = createRng(seed);

    // Derive all parameters from seed
    const shapeType = SHAPE_TYPES[seed % SHAPE_TYPES.length];
    const hue = (seed * 7.3) % 360;
    // Shape color: cap lightness to avoid too-bright shapes
    const shapeLightness = 30 + (rng() * 25);    // 30% — 55%, never white
    const shapeSaturation = 40 + (rng() * 30);   // 40% — 70%
    const shapeColor = `hsl(${hue}, ${shapeSaturation}%, ${shapeLightness}%)`;

    // Background: same hue, always very dark — darker when shapes are lighter
    const bgLightness = Math.max(5, 14 - (shapeLightness - 30) * 0.2);  // 5% — 14%
    const bgSaturation = Math.min(25, shapeSaturation * 0.4);            // max 25%
    const bgPrimary = `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`;
    const bgSecondary = `hsl(${hue}, ${bgSaturation}%, ${Math.max(3, bgLightness - 3)}%)`;
    document.documentElement.style.setProperty('--bg-primary', bgPrimary);
    document.documentElement.style.setProperty('--bg-secondary', bgSecondary);

    const BASE_SIZE = 1.0 + (rng() * 1.5);       // 1.0 — 2.5
    const MOVE_SPEED = 1.5 + (rng() * 1.5);      // 1.5 — 3.0
    const ROT_SPEED = 0.005 + (rng() * 0.045);   // 0.005 — 0.05
    const MAX_SHAPES = window.innerWidth < 480 ? 10 : 20;
    const BOUNDS = { x: 35, y: 25 };

    console.log(`Background: seed=${seed}, shape=${shapeType}, color=${shapeColor}, size=${BASE_SIZE.toFixed(2)}, speed=${MOVE_SPEED.toFixed(2)}, rot=${ROT_SPEED.toFixed(3)}`);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Scene — transparent, body CSS provides base color
    const scene = new THREE.Scene();
    scene.background = null;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 20;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Texture loader for easter eggs
    const textureLoader = new THREE.TextureLoader();
    const loadedTextures = {};

    function getEasterEggTexture(filename) {
        if (!loadedTextures[filename]) {
            loadedTextures[filename] = textureLoader.load(`easter-eggs/${filename}`);
        }
        return loadedTextures[filename];
    }

    // Shape pool
    const shapes = [];

    function spawnShape(scattered) {
        const sizeVariation = BASE_SIZE * (0.5 + rng());
        let mesh;

        // 2% chance of easter egg (only if we have eggs and not initial scatter)
        if (!scattered && easterEggs.length > 0 && rng() < 0.02) {
            const eggFile = easterEggs[Math.floor(rng() * easterEggs.length)];
            const texture = getEasterEggTexture(eggFile);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
            mesh = new THREE.Sprite(spriteMaterial);
            mesh.scale.set(sizeVariation * 2, sizeVariation * 2, 1);
            mesh.isEasterEgg = true;
        } else {
            const geometry = createGeometry(shapeType, sizeVariation);
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shapeColor),
                roughness: 0.5,
                metalness: 0.1
            });
            mesh = new THREE.Mesh(geometry, material);
        }

        let x, y;
        if (scattered) {
            x = (rng() * 2 - 1) * BOUNDS.x;
            y = (rng() * 2 - 1) * BOUNDS.y;
        } else {
            const edge = Math.floor(rng() * 4);
            switch (edge) {
                case 0: x = (rng() * 2 - 1) * BOUNDS.x; y = BOUNDS.y + sizeVariation; break;
                case 1: x = (rng() * 2 - 1) * BOUNDS.x; y = -BOUNDS.y - sizeVariation; break;
                case 2: x = -BOUNDS.x - sizeVariation; y = (rng() * 2 - 1) * BOUNDS.y; break;
                default: x = BOUNDS.x + sizeVariation; y = (rng() * 2 - 1) * BOUNDS.y; break;
            }
        }

        mesh.position.set(x, y, (rng() * 2 - 1) * 5);
        mesh.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);

        let angle;
        if (scattered) {
            angle = rng() * Math.PI * 2;
        } else {
            const targetX = -x * (0.2 + rng() * 0.6) + (rng() * 10 - 5);
            const targetY = -y * (0.2 + rng() * 0.6) + (rng() * 10 - 5);
            angle = Math.atan2(targetY - y, targetX - x);
        }
        const speed = MOVE_SPEED * (0.5 + rng());

        shapes.push({
            mesh,
            velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            rotVelocity: {
                x: (rng() * 2 - 1) * ROT_SPEED,
                y: (rng() * 2 - 1) * ROT_SPEED,
                z: (rng() * 2 - 1) * ROT_SPEED
            },
            size: sizeVariation
        });
        scene.add(mesh);
    }

    function removeShape(index) {
        const shape = shapes[index];
        scene.remove(shape.mesh);
        if (shape.mesh.geometry) shape.mesh.geometry.dispose();
        shape.mesh.material.dispose();
        shapes.splice(index, 1);
    }

    function isOutOfBounds(shape) {
        const margin = shape.size + 2;
        const p = shape.mesh.position;
        return p.x > BOUNDS.x + margin || p.x < -BOUNDS.x - margin ||
               p.y > BOUNDS.y + margin || p.y < -BOUNDS.y - margin;
    }

    // Initial spawn (scattered)
    for (let i = 0; i < MAX_SHAPES; i++) {
        spawnShape(true);
    }

    // Animation loop
    let lastTime = performance.now();
    let paused = false;

    function animate() {
        requestAnimationFrame(animate);
        if (paused) return;

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            s.mesh.position.x += s.velocity.x * dt;
            s.mesh.position.y += s.velocity.y * dt;
            if (s.mesh.isEasterEgg) {
                s.mesh.material.rotation += s.rotVelocity.z;
            } else {
                s.mesh.rotation.x += s.rotVelocity.x;
                s.mesh.rotation.y += s.rotVelocity.y;
                s.mesh.rotation.z += s.rotVelocity.z;
            }

            if (isOutOfBounds(s)) {
                removeShape(i);
            }
        }

        while (shapes.length < MAX_SHAPES) {
            spawnShape(false);
        }

        renderer.render(scene, camera);
    }

    // Pause when tab is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            paused = true;
        } else {
            paused = false;
            lastTime = performance.now();
        }
    });

    // Debounced resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, 150);
    });

    animate();

    // Expose manual easter egg spawn (used by Konami Code button)
    window.spawnEasterEgg = function() {
        if (!easterEggs.length) return;
        const eggFile = easterEggs[Math.floor(Math.random() * easterEggs.length)];
        const texture = getEasterEggTexture(eggFile);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        const size = BASE_SIZE * (1 + Math.random());
        sprite.scale.set(size * 2, size * 2, 1);
        sprite.isEasterEgg = true;

        const edge = Math.floor(Math.random() * 4);
        let x, y;
        switch (edge) {
            case 0: x = (Math.random() * 2 - 1) * BOUNDS.x; y = BOUNDS.y + size; break;
            case 1: x = (Math.random() * 2 - 1) * BOUNDS.x; y = -BOUNDS.y - size; break;
            case 2: x = -BOUNDS.x - size; y = (Math.random() * 2 - 1) * BOUNDS.y; break;
            default: x = BOUNDS.x + size; y = (Math.random() * 2 - 1) * BOUNDS.y; break;
        }
        sprite.position.set(x, y, (Math.random() * 2 - 1) * 5);

        const targetX = -x * (0.3 + Math.random() * 0.5);
        const targetY = -y * (0.3 + Math.random() * 0.5);
        const angle = Math.atan2(targetY - y, targetX - x);
        const speed = MOVE_SPEED * (0.8 + Math.random() * 0.8);

        shapes.push({
            mesh: sprite,
            velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            rotVelocity: { x: 0, y: 0, z: (Math.random() * 2 - 1) * ROT_SPEED },
            size
        });
        scene.add(sprite);
    };

    // Toggle button
    const toggleBtn = document.getElementById('bgToggle');
    if (toggleBtn) {
        // Restore saved preference
        if (localStorage.getItem('bgAnimationOff') === 'true') {
            paused = true;
            canvas.style.display = 'none';
            document.getElementById('bgOverlay').style.display = 'none';
            toggleBtn.classList.add('off');
        } else {
            toggleBtn.classList.add('active');
        }

        toggleBtn.addEventListener('click', () => {
            if (paused && !document.hidden) {
                // Turn on
                paused = false;
                lastTime = performance.now();
                canvas.style.display = '';
                document.getElementById('bgOverlay').style.display = '';
                toggleBtn.classList.remove('off');
                toggleBtn.classList.add('active');
                localStorage.setItem('bgAnimationOff', 'false');
            } else {
                // Turn off
                paused = true;
                canvas.style.display = 'none';
                document.getElementById('bgOverlay').style.display = 'none';
                toggleBtn.classList.add('off');
                toggleBtn.classList.remove('active');
                localStorage.setItem('bgAnimationOff', 'true');
            }
        });
    }
}

// Konami Code listener
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a','Enter'];
let konamiIndex = 0;
document.addEventListener('keydown', (e) => {
    if (e.key === KONAMI[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === KONAMI.length) {
            konamiIndex = 0;
            const btn = document.getElementById('eggSpawnBtn');
            if (btn) {
                btn.style.display = 'inline';
            }
        }
    } else {
        konamiIndex = 0;
        if (e.key === KONAMI[0]) konamiIndex = 1;
    }
});

// Check for reduced motion preference
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    initBackground();
}
