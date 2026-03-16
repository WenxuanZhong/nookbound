/* ============================================================
   Guiyu -- audio.js
   Ambient music & sound-effect synthesis via Web Audio API
   No external audio files required.
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     Private state
     ---------------------------------------------------------- */
  var _ctx          = null;   // AudioContext
  var _masterGain   = null;   // GainNode connected to ctx.destination
  var _muted        = false;
  var _sfxEnabled   = true;
  var _musicEnabled = true;
  var _masterVolume = 0.38;   // overall volume multiplier (user-facing 0-1)
  var _bgActive     = false;
  var _bgTimer      = null;
  var _initialized  = false;
  var _contextResumed = false;
  var _SFX_KEY      = 'guiyu-sfx-enabled';
  var _MUSIC_KEY    = 'guiyu-music-enabled';

  function _readPreference(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      if (value === null) return fallback;
      return value === '1';
    } catch (err) {
      return fallback;
    }
  }

  function _writePreference(key, enabled) {
    try {
      window.localStorage.setItem(key, enabled ? '1' : '0');
    } catch (err) {
      // Ignore storage failures.
    }
  }

  /* ----------------------------------------------------------
     AudioContext bootstrap
     ---------------------------------------------------------- */

  function _ensureContext() {
    if (_ctx) return _ctx;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[Audio] Web Audio API not supported.');
      return null;
    }
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _muted ? 0 : 1;
    _masterGain.connect(_ctx.destination);
    return _ctx;
  }

  /* ----------------------------------------------------------
     Resume on first user interaction (autoplay-policy)
     ---------------------------------------------------------- */

  function _resumeOnInteraction() {
    if (!_ctx) {
      _ensureContext();
    }
    if (_ctx && _ctx.state === 'suspended') {
      _ctx.resume();
    }
    if (!_contextResumed) {
      _contextResumed = true;
    }
    // Start background music on first interaction if not already playing
    if (!_bgActive && _ctx && _musicEnabled) {
      _bgActive = true;
      _playAmbientNote();
    }
  }

  /* ----------------------------------------------------------
     Background ambient music
     Pentatonic scale slowly evolving pad with low-pass filter
     ---------------------------------------------------------- */

  var _AMBIENT_CHORDS = [
    [220.00, 277.18, 329.63],
    [196.00, 246.94, 329.63],
    [246.94, 293.66, 369.99],
    [220.00, 293.66, 349.23],
  ];
  var _ambientStep = 0;

  function _playAmbientNote() {
    if (_muted || !_musicEnabled || !_bgActive || !_ctx) return;

    var ctx  = _ctx;
    var now  = ctx.currentTime;
    var chord = _AMBIENT_CHORDS[_ambientStep % _AMBIENT_CHORDS.length];
    var root = chord[0];

    _ambientStep++;

    // Duration between 5-7 seconds
    var dur = 5 + Math.random() * 2;

    // Warm pad body
    chord.forEach(function (freq, index) {
      var osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = index === 1 ? -4 : index === 2 ? 5 : 0;

      var gain = ctx.createGain();
      var peak = (index === 0 ? 0.055 : 0.032) * _masterVolume;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 1.8 + index * 0.15);
      gain.gain.setValueAtTime(peak * 0.95, now + dur - 1.7);
      gain.gain.linearRampToValueAtTime(0, now + dur);

      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = index === 0 ? 780 : 980;
      filter.Q.value = 0.5;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(_masterGain);

      osc.start(now);
      osc.stop(now + dur + 0.12);
    });

    // Low root bloom
    var sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = root / 2;

    var subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.02 * _masterVolume, now + 2.1);
    subGain.gain.setValueAtTime(0.018 * _masterVolume, now + dur - 2);
    subGain.gain.linearRampToValueAtTime(0, now + dur);

    var subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 420;

    sub.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(_masterGain);

    sub.start(now);
    sub.stop(now + dur + 0.12);

    // Occasional glassy shimmer
    if (Math.random() > 0.45) {
      var shimmer = ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = chord[1] * 2;

      var shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(0, now + 0.8);
      shimmerGain.gain.linearRampToValueAtTime(0.009 * _masterVolume, now + 2.2);
      shimmerGain.gain.linearRampToValueAtTime(0, now + dur - 0.6);

      var shimmerFilter = ctx.createBiquadFilter();
      shimmerFilter.type = 'lowpass';
      shimmerFilter.frequency.value = 1400;

      shimmer.connect(shimmerFilter);
      shimmerFilter.connect(shimmerGain);
      shimmerGain.connect(_masterGain);

      shimmer.start(now + 0.8);
      shimmer.stop(now + dur + 0.12);
    }

    // Schedule next note (overlapping slightly for smooth transitions)
    var nextDelay = (dur - 2) * 1000 + Math.random() * 1200;
    _bgTimer = setTimeout(_playAmbientNote, nextDelay);
  }

  /* ----------------------------------------------------------
     Sound Effects
     ---------------------------------------------------------- */

  /** Pickup -- soft pluck when picking up a piece */
  function _playPickup() {
    if (_muted || !_sfxEnabled || !_ctx) return;
    var ctx = _ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(430, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);

    var accent = ctx.createOscillator();
    accent.type = 'sine';
    accent.frequency.setValueAtTime(780, now + 0.01);
    accent.frequency.exponentialRampToValueAtTime(560, now + 0.08);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.065 * _masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    var accentGain = ctx.createGain();
    accentGain.gain.setValueAtTime(0.02 * _masterVolume, now + 0.01);
    accentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(_masterGain);
    accent.connect(accentGain);
    accentGain.connect(_masterGain);
    osc.start(now);
    accent.start(now + 0.01);
    osc.stop(now + 0.14);
    accent.stop(now + 0.11);
  }

  /** Rotate -- subtle tick when rotating a piece */
  function _playRotate() {
    if (_muted || !_sfxEnabled || !_ctx) return;
    var ctx = _ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(940, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.05);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035 * _masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 1.1;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Snap -- satisfying click when piece snaps into place */
  function _playSnap() {
    if (_muted || !_sfxEnabled || !_ctx) return;
    var ctx = _ctx;
    var now = ctx.currentTime;

    var click = ctx.createOscillator();
    click.type = 'sine';
    click.frequency.setValueAtTime(1500, now);
    click.frequency.exponentialRampToValueAtTime(520, now + 0.04);

    var clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.08 * _masterVolume, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    click.connect(clickGain);
    clickGain.connect(_masterGain);
    click.start(now);
    click.stop(now + 0.09);

    var tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 360;

    var toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0, now);
    toneGain.gain.linearRampToValueAtTime(0.05 * _masterVolume, now + 0.025);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    var body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.value = 248;

    var bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, now + 0.015);
    bodyGain.gain.linearRampToValueAtTime(0.03 * _masterVolume, now + 0.04);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    tone.connect(toneGain);
    toneGain.connect(_masterGain);
    body.connect(bodyGain);
    bodyGain.connect(_masterGain);
    tone.start(now + 0.01);
    body.start(now + 0.015);
    tone.stop(now + 0.26);
    body.stop(now + 0.3);
  }

  /** Invalid -- soft descending two-note motif */
  function _playInvalid() {
    if (_muted || !_sfxEnabled || !_ctx) return;
    var ctx = _ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.linearRampToValueAtTime(210, now + 0.18);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04 * _masterVolume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Win -- ascending 4-note arpeggio with gentle reverb */
  function _playWin() {
    if (_muted || !_sfxEnabled || !_ctx) return;
    var ctx = _ctx;
    var now = ctx.currentTime;

    // C5, E5, G5, C6
    var arpNotes = [523.25, 659.25, 783.99, 1046.50];
    var noteSpacing = 0.2; // seconds between each note onset
    var noteDuration = 0.72;

    // Create a subtle delay node for reverb-like effect
    var delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.18;

    var delayGain = ctx.createGain();
    delayGain.gain.value = 0.15;

    var delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2000;

    delay.connect(delayFilter);
    delayFilter.connect(delayGain);
    delayGain.connect(_masterGain);

    arpNotes.forEach(function (freq, i) {
      var offset = now + i * noteSpacing;

      // Main oscillator
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0, offset);
      gain.gain.linearRampToValueAtTime(0.08 * _masterVolume, offset + 0.05);
      gain.gain.setValueAtTime(0.08 * _masterVolume, offset + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + noteDuration);

      osc.connect(gain);
      gain.connect(_masterGain);
      gain.connect(delay);

      osc.start(offset);
      osc.stop(offset + noteDuration + 0.1);

      // Subtle harmonic fifth above (very quiet shimmer)
      if (i < 3) {
        var harm = ctx.createOscillator();
        harm.type = 'sine';
        harm.frequency.value = freq * 1.5;

        var harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(0, offset + 0.02);
        harmGain.gain.linearRampToValueAtTime(0.018 * _masterVolume, offset + 0.08);
        harmGain.gain.exponentialRampToValueAtTime(0.001, offset + noteDuration * 0.7);

        harm.connect(harmGain);
        harmGain.connect(_masterGain);

        harm.start(offset + 0.02);
        harm.stop(offset + noteDuration + 0.1);
      }
    });

    // Final sustain chord -- all four notes softly together
    var chordStart = now + arpNotes.length * noteSpacing;
    arpNotes.forEach(function (freq) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.028 * _masterVolume, chordStart);
      gain.gain.linearRampToValueAtTime(0, chordStart + 1.35);

      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(_masterGain);

      osc.start(chordStart);
      osc.stop(chordStart + 1.4);
    });
  }

  /* ----------------------------------------------------------
     Event wiring
     ---------------------------------------------------------- */

  function _wireEvents() {
    // Sound-effect events dispatched by other modules
    document.addEventListener('sfx-pickup', function () {
      _playPickup();
    });

    document.addEventListener('sfx-rotate', function () {
      _playRotate();
    });

    document.addEventListener('sfx-snap', function () {
      _playSnap();
    });

    document.addEventListener('sfx-invalid', function () {
      _playInvalid();
    });

    document.addEventListener('sfx-win', function () {
      _playWin();
    });

    // Resume audio context on first user interaction (autoplay policy)
    document.addEventListener('pointerdown', _resumeOnInteraction, { once: false });
    document.addEventListener('keydown', _resumeOnInteraction, { once: false });
  }

  /* ----------------------------------------------------------
     Public API
     ---------------------------------------------------------- */

  function _init() {
    if (_initialized) return;
    _initialized = true;

    _sfxEnabled = _readPreference(_SFX_KEY, true);
    _musicEnabled = _readPreference(_MUSIC_KEY, true);
    _ensureContext();
    _wireEvents();
  }

  function _playBgMusic() {
    if (!_ctx) _ensureContext();
    if (!_musicEnabled || _muted) return;
    if (_bgActive) return;
    _bgActive = true;
    _playAmbientNote();
  }

  function _stopBgMusic() {
    _bgActive = false;
    if (_bgTimer) {
      clearTimeout(_bgTimer);
      _bgTimer = null;
    }
  }

  function _setMuted(muted) {
    _muted = !!muted;
    if (_masterGain) {
      _masterGain.gain.setValueAtTime(_muted ? 0 : 1, _ctx.currentTime);
    }
    if (_muted) {
      _stopBgMusic();
    } else if (_contextResumed && !_bgActive && _musicEnabled) {
      _bgActive = true;
      _playAmbientNote();
    }
  }

  function _isMuted() {
    return _muted;
  }

  function _setVolume(v) {
    _masterVolume = Math.max(0, Math.min(1, v));
  }

  function _setSfxEnabled(enabled) {
    _sfxEnabled = enabled !== false;
    _writePreference(_SFX_KEY, _sfxEnabled);
  }

  function _isSfxEnabled() {
    return _sfxEnabled;
  }

  function _setMusicEnabled(enabled) {
    _musicEnabled = enabled !== false;
    _writePreference(_MUSIC_KEY, _musicEnabled);
    if (!_musicEnabled) {
      _stopBgMusic();
      return;
    }
    if (_contextResumed && !_bgActive && !_muted) {
      _bgActive = true;
      _playAmbientNote();
    }
  }

  function _isMusicEnabled() {
    return _musicEnabled;
  }

  /* ----------------------------------------------------------
     Expose on window.GameAudio
     ---------------------------------------------------------- */

  window.GameAudio = {
    init:        _init,
    playBgMusic: _playBgMusic,
    stopBgMusic: _stopBgMusic,
    playPickup:  _playPickup,
    playRotate:  _playRotate,
    playSnap:    _playSnap,
    playInvalid: _playInvalid,
    playWin:     _playWin,
    setMuted:    _setMuted,
    isMuted:     _isMuted,
    setSfxEnabled: _setSfxEnabled,
    isSfxEnabled: _isSfxEnabled,
    setMusicEnabled: _setMusicEnabled,
    isMusicEnabled: _isMusicEnabled,
    setVolume:   _setVolume,
  };

})();
