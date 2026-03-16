/* ============================================================
   Guiyu -- celebration.js
   Victory confetti & celebration animation system
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     Configuration
     ---------------------------------------------------------- */
  var CONFETTI_COLORS = [
    '#7BA7BC', '#BC7B8F', '#8FBC7B', '#BCB07B',
    '#9B7BBC', '#7BBCB0', '#BC957B', '#7B8FBC',
    '#BC7BAA', '#A0BC7B', '#7BBCA0', '#BC7B7B',
  ];

  var PARTICLE_SHAPES = ['rect', 'circle', 'strip', 'diamond', 'petal'];

  // Timing (ms)
  var T_BACKDROP     = 0;
  var T_CANNONS      = 200;
  var T_CONFETTI     = 500;
  var T_CONFETTI_ECHO = 690;
  var T_MESSAGE      = 800;
  var T_AUTO_CLEANUP = 5000;

  // Particle counts
  var PARTICLES_PER_CANNON_DESKTOP = 44;
  var PARTICLES_PER_CANNON_MOBILE  = 18;

  /* ----------------------------------------------------------
     Module state
     ---------------------------------------------------------- */
  var _overlay        = null;
  var _backdrop       = null;
  var _cannonLeft     = null;
  var _cannonRight    = null;
  var _confettiBox    = null;
  var _winMessage     = null;
  var _btnNext        = null;
  var _cleanupTimer   = null;
  var _active         = false;
  var _armingTimer    = null;
  var _firingTimer    = null;
  var _echoTimer      = null;

  function _t(key, vars) {
    if (window.GameI18n && window.GameI18n.t) {
      return window.GameI18n.t(key, vars);
    }
    return '';
  }

  function _applyCopy() {
    if (!_winMessage) return;
    var title = _winMessage.querySelector('.win-message__title');
    var subtitle = _winMessage.querySelector('.win-message__subtitle');

    if (title) {
      title.textContent = _t('win.title') || '完成！';
    }
    if (subtitle) {
      subtitle.textContent = _t('win.subtitle') || '这一局拼好了';
    }
    if (_btnNext) {
      _btnNext.textContent = _t('win.next') || '下一关';
    }
  }

  /* ----------------------------------------------------------
     Helpers
     ---------------------------------------------------------- */

  function _rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function _randInt(min, max) {
    return Math.floor(_rand(min, max + 1));
  }

  function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function _isMobile() {
    return window.innerWidth < 700 ||
      !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  /** Generate a slightly varied shade of the given hex color */
  function _varyColor(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var shift = _randInt(-20, 20);
    r = Math.max(0, Math.min(255, r + shift));
    g = Math.max(0, Math.min(255, g + _randInt(-15, 15)));
    b = Math.max(0, Math.min(255, b + _randInt(-15, 15)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ----------------------------------------------------------
     Particle creation
     ---------------------------------------------------------- */

  /**
   * Create a single confetti particle DOM element.
   * @param {number} cannonX - start X position (px)
   * @param {number} cannonY - start Y position (px)
   * @param {string} side    - 'left' or 'right'
   * @returns {HTMLElement}
   */
  function _createParticle(cannonX, cannonY, side, options) {
    var el = document.createElement('div');
    options = options || {};

    var shape = _pick(PARTICLE_SHAPES);
    var color = _varyColor(_pick(CONFETTI_COLORS));
    var scale = options.scale || 1;

    // Size depends on shape
    var w, h;
    switch (shape) {
      case 'circle':
        w = h = _rand(5, 10) * scale;
        el.style.borderRadius = '50%';
        break;
      case 'diamond':
        w = h = _rand(8, 12) * scale;
        el.style.borderRadius = '2px';
        break;
      case 'petal':
        w = _rand(6, 9) * scale;
        h = _rand(10, 16) * scale;
        el.style.borderRadius = '70% 70% 45% 45%';
        break;
      case 'strip':
        w = _rand(3, 5) * scale;
        h = _rand(12, 20) * scale;
        el.style.borderRadius = '1px';
        break;
      default: // rect
        w = _rand(5, 9) * scale;
        h = _rand(6, 11) * scale;
        el.style.borderRadius = '2px';
        break;
    }

    el.className = 'confetti-particle';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
    el.style.background = shape === 'strip'
      ? 'linear-gradient(180deg, rgba(255,255,255,.45), ' + color + ')'
      : shape === 'petal'
        ? 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.65), ' + color + ' 68%)'
        : color;
    el.style.position = 'absolute';
    el.style.left = cannonX + 'px';
    el.style.top  = cannonY + 'px';
    el.style.willChange = 'transform, opacity';
    el.style.pointerEvents = 'none';
    el.style.boxShadow = '0 1px 4px rgba(0,0,0,.08)';

    // --- Burst trajectory ---
    // Horizontal spread: wide fan from cannon
    var spreadAngle;
    if (side === 'left') {
      spreadAngle = _rand(-36, 76);  // degrees from vertical, biased right
    } else {
      spreadAngle = _rand(-76, 36);  // biased left
    }
    var angleRad = (spreadAngle * Math.PI) / 180;
    var velocity = _rand(320, 760) * (options.velocityScale || 1);   // px total travel upward
    var dx = Math.sin(angleRad) * velocity;
    var dy = -Math.cos(angleRad) * velocity; // negative = upward

    // Gravity-simulated fall component
    var gravityDrop = _rand(420, 980) * (options.gravityScale || 1);  // how far it falls after peak
    var drift = _rand(-72, 72) * (options.driftScale || 1);           // horizontal drift during fall
    var spin  = _randInt(360, 1440) * (_rand(0, 1) > 0.5 ? 1 : -1);

    // Stagger delay so particles don't all fire at once
    var delay = _rand(0, 260) + (options.delayOffset || 0);

    // Total duration: burst up + fall
    var burstDuration = _rand(620, 920);
    var fallDuration  = _rand(1700, 3000);
    var totalDuration = burstDuration + fallDuration;

    // --- CSS custom properties for the two-phase animation ---
    // Phase 1: burst upward
    el.style.setProperty('--burst-x', dx + 'px');
    el.style.setProperty('--burst-y', dy + 'px');
    el.style.setProperty('--spin-burst', (spin * 0.4) + 'deg');

    // Phase 2: drift and fall
    el.style.setProperty('--fall-x', (dx + drift) + 'px');
    el.style.setProperty('--fall-y', (dy + gravityDrop) + 'px');
    el.style.setProperty('--spin-fall', spin + 'deg');

    // Timing
    var burstPct = Math.round((burstDuration / totalDuration) * 100);
    el.style.setProperty('--burst-pct', burstPct + '%');

    el.style.animationName        = 'confetti-two-phase';
    el.style.animationDuration    = totalDuration + 'ms';
    el.style.animationDelay       = delay + 'ms';
    el.style.animationTimingFunction = 'ease-out';
    el.style.animationFillMode    = 'forwards';

    // Random initial rotation for visual variety
    el.style.transform = 'rotate(' + _randInt(0, 360) + 'deg)';

    return el;
  }

  /* ----------------------------------------------------------
     Inject two-phase keyframes (once)
     ---------------------------------------------------------- */

  var _keyframesInjected = false;

  function _injectKeyframes() {
    if (_keyframesInjected) return;
    _keyframesInjected = true;

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes confetti-two-phase {',
      '  0% {',
      '    opacity: 1;',
      '    transform: translate(0, 0) rotate(0deg) scale(1);',
      '  }',
      '  10% {',
      '    opacity: 1;',
      '  }',
      '  /* burst peak — var(--burst-pct) of the way through */',
      '  35% {',
      '    opacity: 1;',
      '    transform: translate(var(--burst-x, 60px), var(--burst-y, -300px))',
      '               rotate(var(--spin-burst, 300deg)) scale(1);',
      '  }',
      '  /* fall phase */',
      '  100% {',
      '    opacity: 0;',
      '    transform: translate(var(--fall-x, 80px), var(--fall-y, 400px))',
      '               rotate(var(--spin-fall, 720deg)) scale(0.3);',
      '  }',
      '}',
      '',
      '@keyframes celebration-cannons-left {',
      '  0%   { transform: scale(0) rotate(15deg); opacity: 0; }',
      '  60%  { transform: scale(1.15) rotate(15deg); opacity: 1; }',
      '  80%  { transform: scale(0.95) rotate(15deg); }',
      '  100% { transform: scale(1) rotate(15deg); opacity: 1; }',
      '}',
      '',
      '@keyframes celebration-cannons-right {',
      '  0%   { transform: scale(0) rotate(-15deg); opacity: 0; }',
      '  60%  { transform: scale(1.15) rotate(-15deg); opacity: 1; }',
      '  80%  { transform: scale(0.95) rotate(-15deg); }',
      '  100% { transform: scale(1) rotate(-15deg); opacity: 1; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ----------------------------------------------------------
     Show celebration
     ---------------------------------------------------------- */

  function _show() {
    if (_active) return;
    _active = true;

    _injectKeyframes();

    // --- Phase 1: Backdrop ---
    _overlay.classList.remove('hidden');
    _overlay.classList.remove('fade-out');
    _cannonLeft.classList.remove('cannon--arming', 'cannon--firing');
    _cannonRight.classList.remove('cannon--arming', 'cannon--firing');

    // Reset cannon animations
    _cannonLeft.style.animation  = 'none';
    _cannonRight.style.animation = 'none';

    // Reset win message
    _winMessage.style.opacity   = '0';
    _winMessage.style.transform = 'scale(0.85) translateY(16px)';

    // Clear previous confetti
    _confettiBox.innerHTML = '';

    if (_armingTimer) {
      clearTimeout(_armingTimer);
      _armingTimer = null;
    }
    if (_firingTimer) {
      clearTimeout(_firingTimer);
      _firingTimer = null;
    }
    if (_echoTimer) {
      clearTimeout(_echoTimer);
      _echoTimer = null;
    }

    // --- Phase 2: Cannons (spring-in) ---
    setTimeout(function () {
      _cannonLeft.style.animation  = 'celebration-cannons-left 500ms cubic-bezier(.34,1.56,.64,1) forwards';
      _cannonRight.style.animation = 'celebration-cannons-right 500ms cubic-bezier(.34,1.56,.64,1) forwards';
    }, T_CANNONS);

    _armingTimer = setTimeout(function () {
      _cannonLeft.classList.add('cannon--arming');
      _cannonRight.classList.add('cannon--arming');
    }, Math.max(T_CANNONS + 120, T_CONFETTI - 130));

    // --- Phase 3: Confetti burst ---
    setTimeout(function () {
      _cannonLeft.classList.remove('cannon--arming');
      _cannonRight.classList.remove('cannon--arming');
      _cannonLeft.classList.add('cannon--firing');
      _cannonRight.classList.add('cannon--firing');
      _fireConfetti({
        multiplier: 1,
        scale: 1,
        velocityScale: 1,
        gravityScale: 1,
        driftScale: 1,
      });
    }, T_CONFETTI);

    _firingTimer = setTimeout(function () {
      _cannonLeft.classList.remove('cannon--firing');
      _cannonRight.classList.remove('cannon--firing');
    }, T_CONFETTI + 420);

    _echoTimer = setTimeout(function () {
      _fireConfetti({
        multiplier: 0.42,
        scale: 0.8,
        velocityScale: 0.82,
        gravityScale: 0.92,
        driftScale: 0.75,
        delayOffset: 50,
      });
    }, T_CONFETTI_ECHO);

    // --- Phase 4: Win message ---
    setTimeout(function () {
      _winMessage.style.transition = 'opacity 500ms ease, transform 600ms cubic-bezier(.22,1,.36,1)';
      _winMessage.style.opacity    = '1';
      _winMessage.style.transform  = 'scale(1) translateY(0)';
    }, T_MESSAGE);

    // --- Phase 5: Auto-cleanup ---
    _cleanupTimer = setTimeout(function () {
      _fadeOutConfetti();
    }, T_AUTO_CLEANUP);
  }

  /* ----------------------------------------------------------
     Fire confetti from both cannons
     ---------------------------------------------------------- */

  function _fireConfetti(options) {
    options = options || {};
    var mobile = _isMobile();
    var count  = mobile ? PARTICLES_PER_CANNON_MOBILE : PARTICLES_PER_CANNON_DESKTOP;
    var multiplier = options.multiplier || 1;
    count = Math.max(8, Math.round(count * multiplier));

    var winW = window.innerWidth;
    var winH = window.innerHeight;

    // Left cannon position
    var leftX = Math.round(winW * 0.10) + 18;
    var leftY = winH - 50;

    // Right cannon position
    var rightX = Math.round(winW * 0.90) - 18;
    var rightY = winH - 50;

    var fragment = document.createDocumentFragment();

    for (var i = 0; i < count; i++) {
      fragment.appendChild(_createParticle(leftX, leftY, 'left', options));
      fragment.appendChild(_createParticle(rightX, rightY, 'right', options));
    }

    _confettiBox.appendChild(fragment);
  }

  /* ----------------------------------------------------------
     Fade out & cleanup confetti
     ---------------------------------------------------------- */

  function _fadeOutConfetti() {
    var particles = _confettiBox.querySelectorAll('.confetti-particle');
    particles.forEach(function (p) {
      p.style.transition = 'opacity 600ms ease';
      p.style.opacity    = '0';
    });

    // Remove DOM elements after fade
    setTimeout(function () {
      _confettiBox.innerHTML = '';
    }, 700);
  }

  /* ----------------------------------------------------------
     Hide celebration (dismiss)
     ---------------------------------------------------------- */

  function _hide() {
    if (!_active) return;
    _active = false;

    if (_cleanupTimer) {
      clearTimeout(_cleanupTimer);
      _cleanupTimer = null;
    }
    if (_armingTimer) {
      clearTimeout(_armingTimer);
      _armingTimer = null;
    }
    if (_firingTimer) {
      clearTimeout(_firingTimer);
      _firingTimer = null;
    }
    if (_echoTimer) {
      clearTimeout(_echoTimer);
      _echoTimer = null;
    }

    // Fade out the whole overlay
    _overlay.classList.add('fade-out');

    setTimeout(function () {
      _overlay.classList.add('hidden');
      _overlay.classList.remove('fade-out');

      // Fully clean up
      _confettiBox.innerHTML = '';
      _cannonLeft.style.animation  = 'none';
      _cannonRight.style.animation = 'none';
      _cannonLeft.classList.remove('cannon--arming', 'cannon--firing');
      _cannonRight.classList.remove('cannon--arming', 'cannon--firing');
      _winMessage.style.opacity    = '0';
      _winMessage.style.transform  = 'scale(0.85) translateY(16px)';
      _winMessage.style.transition = 'none';
    }, 450);
  }

  /* ----------------------------------------------------------
     Initialization
     ---------------------------------------------------------- */

  function _init() {
    _overlay     = document.getElementById('celebration-overlay');
    _confettiBox = _overlay ? _overlay.querySelector('.confetti-container') : null;
    _cannonLeft  = _overlay ? _overlay.querySelector('.cannon-left')        : null;
    _cannonRight = _overlay ? _overlay.querySelector('.cannon-right')       : null;
    _winMessage  = _overlay ? _overlay.querySelector('.win-message')        : null;
    _btnNext     = document.getElementById('btn-next-level');

    if (!_overlay) {
      console.warn('[Celebration] #celebration-overlay not found.');
      return;
    }

    _applyCopy();

    // Dismiss on overlay click (but not on the win-message area)
    _overlay.addEventListener('click', function (e) {
      // Only dismiss if clicking the backdrop, not the message
      if (e.target === _overlay ||
          e.target.classList.contains('celebration-backdrop') ||
          e.target.classList.contains('confetti-container')) {
        _hide();
      }
    });

    // Dismiss on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _active) {
        _hide();
      }
    });

    // Next level button
    if (_btnNext) {
      _btnNext.addEventListener('click', function () {
        _hide();
        // Go to next level after a brief delay for the hide animation
        setTimeout(function () {
          if (window.GameEngine && window.Levels) {
            var nextIdx = (window.GameEngine.currentLevel + 1) % window.Levels.length;
            if (window.GameEngine.loadLevel) {
              window.GameEngine.loadLevel(nextIdx);
            }
          }
        }, 200);
      });
    }

    // Listen for the game-won event
    document.addEventListener('game-won', function () {
      // Small delay so pieces animate into place first
      setTimeout(function () {
        _show();
      }, 300);
    });

    // Hide celebration when a new level loads
    document.addEventListener('level-loaded', function () {
      if (_active) {
        _hide();
      }
    });

    document.addEventListener('language-changed', function () {
      _applyCopy();
    });
  }

  /* ----------------------------------------------------------
     Public API
     ---------------------------------------------------------- */

  window.Celebration = {
    init: _init,
    show: _show,
    hide: _hide,
  };

})();
