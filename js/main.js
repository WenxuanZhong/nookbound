/* ============================================================
   Guiyu -- main.js
   Application bootstrap & navigation layer
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     DOM references
     ---------------------------------------------------------- */
  var _levelSelector = null;
  var _appRoot = null;
  var _selectionScreen = null;
  var _playScreen = null;
  var _btnBack = null;
  var _btnReset = null;
  var _btnRestart = null;
  var _btnSettings = null;
  var _settingsPanel = null;
  var _btnLangZh = null;
  var _btnLangEn = null;
  var _btnSfxToggle = null;
  var _btnMusicToggle = null;
  var _btnMenuHint = null;
  var _btnMenuReset = null;
  var _btnMenuRestart = null;
  var _playLevelEyebrow = null;
  var _playLevelTitle = null;
  var _playLevelMeta = null;

  /* ----------------------------------------------------------
     State
     ---------------------------------------------------------- */
  var _activeDifficulty = 'easy';
  var _currentView = 'select';
  var _groupScrollPositions = {};
  var _selectionState = {
    difficulty: 'easy',
    scrollLeft: 0,
  };
  var _canUndo = false;

  var _GROUP_ORDER = ['easy', 'medium', 'hard', 'expert'];

  /* ----------------------------------------------------------
     Helpers
     ---------------------------------------------------------- */

  function _isCompactViewport() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function _t(key, vars) {
    if (window.GameI18n && window.GameI18n.t) {
      return window.GameI18n.t(key, vars);
    }
    return '';
  }

  function _getDifficultyMeta(diff) {
    if (window.GameI18n && window.GameI18n.getDifficultyMeta) {
      return window.GameI18n.getDifficultyMeta(diff);
    }
    return {
      label: diff,
      subtitle: '',
    };
  }

  function _scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  }

  function _getBoardPreview(level) {
    var positions = level.validPositions || [];
    var spacingX = 14;
    var spacingY = 12;
    var radius = 3.4;
    var xs = [];
    var ys = [];

    if (!positions.length) {
      return '<svg class="level-card__preview-svg" viewBox="0 0 60 42" aria-hidden="true"></svg>';
    }

    positions.forEach(function (pos) {
      xs.push((pos.c - pos.r / 2) * spacingX);
      ys.push(pos.r * spacingY);
    });

    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var pad = radius + 4;
    var width = maxX - minX + pad * 2;
    var height = maxY - minY + pad * 2;
    var circles = positions.map(function (pos) {
      var cx = ((pos.c - pos.r / 2) * spacingX) - minX + pad;
      var cy = (pos.r * spacingY) - minY + pad;
      return '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + radius + '"></circle>';
    }).join('');

    return (
      '<svg class="level-card__preview-svg" viewBox="0 0 ' +
      width.toFixed(2) +
      ' ' +
      height.toFixed(2) +
      '" aria-hidden="true">' +
      circles +
      '</svg>'
    );
  }

  function _getLevelBoardName(level) {
    if (window.GameI18n && window.GameI18n.getBoardName) {
      return window.GameI18n.getBoardName(level.boardId);
    }
    return window.LevelBoards && window.LevelBoards[level.boardId]
      ? window.LevelBoards[level.boardId].name
      : level.boardId;
  }

  function _getLevelNote(level) {
    if (window.GameI18n && window.GameI18n.getPrimaryNote) {
      return window.GameI18n.getPrimaryNote(level);
    }
    return level.notes && level.notes.length
      ? level.notes[0]
      : (level.description || '');
  }

  function _getLevelName(level) {
    if (window.GameI18n && window.GameI18n.getLevelName) {
      return window.GameI18n.getLevelName(level);
    }
    return level.name;
  }

  function _getTagLabel(tag) {
    if (window.GameI18n && window.GameI18n.getTagLabel) {
      return window.GameI18n.getTagLabel(tag);
    }
    return tag;
  }

  function _isFinaleLevel(level) {
    return !!(level && level.tags && level.tags.indexOf('终局挑战') !== -1);
  }

  function _formatPiecesCount(count) {
    return _t('play.piecesCount', { count: count }) || (count + ' 块拼块');
  }

  function _buildLevelGroups() {
    var groups = { easy: [], medium: [], hard: [], expert: [] };

    window.Levels.forEach(function (level, idx) {
      var diff = level.difficulty || 'easy';
      if (!groups[diff]) groups[diff] = [];
      groups[diff].push({ level: level, idx: idx });
    });

    return groups;
  }

  function _getFirstAvailableGroup(groups) {
    for (var i = 0; i < _GROUP_ORDER.length; i++) {
      var diff = _GROUP_ORDER[i];
      if (groups[diff] && groups[diff].length) {
        return diff;
      }
    }
    return 'easy';
  }

  function _rememberGroupScroll() {
    if (!_levelSelector) return;
    var cardsWrap = _levelSelector.querySelector('.level-group__cards');
    if (!cardsWrap) return;
    _groupScrollPositions[_activeDifficulty] = cardsWrap.scrollLeft || 0;
  }

  function _restoreGroupScroll(cardsWrap, difficulty) {
    var scrollLeft = _groupScrollPositions[difficulty] || 0;
    requestAnimationFrame(function () {
      cardsWrap.scrollLeft = scrollLeft;
    });
  }

  function _setScreenState(screen, isActive) {
    if (!screen) return;

    screen.classList.toggle('screen--active', !!isActive);
    screen.classList.toggle('screen--inactive', !isActive);
    screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');

    if (isActive) {
      screen.classList.remove('screen--enter');
      requestAnimationFrame(function () {
        screen.classList.add('screen--enter');
        setTimeout(function () {
          screen.classList.remove('screen--enter');
        }, 260);
      });
    }
  }

  function _updatePlayHeader(level, idx) {
    var boardName;
    var diffMeta;
    var eyebrow;
    var meta;

    if (!_playLevelTitle || !_playLevelMeta || !_playLevelEyebrow || !level) return;

    boardName = _getLevelBoardName(level);
    diffMeta = _getDifficultyMeta(level.difficulty || 'easy');
    eyebrow = _t('play.levelLabel', { difficulty: diffMeta.label }) || (diffMeta.label + '关卡');
    meta = [
      boardName,
      _formatPiecesCount(level.pieces.length),
      _getLevelNote(level),
    ].filter(Boolean).join(' · ');

    _playLevelEyebrow.textContent = eyebrow;
    _playLevelTitle.textContent = (idx + 1) + '. ' + _getLevelName(level);
    _playLevelMeta.textContent = meta;
  }

  function _setActiveDifficulty(diff) {
    _rememberGroupScroll();
    _activeDifficulty = diff;
    _selectionState.difficulty = diff;
    _renderLevelPills();
  }

  function _enterSelectionView() {
    _currentView = 'select';
    _setSettingsOpen(false);
    if (window.Interaction && window.Interaction.collapseTransientUi) {
      window.Interaction.collapseTransientUi();
    }

    if (_selectionState.difficulty) {
      _activeDifficulty = _selectionState.difficulty;
      _renderLevelPills();
    }

    _setScreenState(_playScreen, false);
    _setScreenState(_selectionScreen, true);
    _syncSettingsUi();
    _scrollToTop();
  }

  function _enterPlayView() {
    var level = window.GameEngine && window.GameEngine.levelData ? window.GameEngine.levelData : null;
    var idx = window.GameEngine && typeof window.GameEngine.currentLevel === 'number'
      ? window.GameEngine.currentLevel
      : 0;

    _currentView = 'play';
    _setSettingsOpen(false);
    _setScreenState(_selectionScreen, false);
    _setScreenState(_playScreen, true);
    _updatePlayHeader(level, idx);
    _syncSettingsUi();
    _scrollToTop();
  }

  function _openLevel(levelIndex) {
    if (!window.GameEngine || !window.Levels || !window.Levels[levelIndex]) return;

    _rememberGroupScroll();
    _selectionState.difficulty = _activeDifficulty;
    _selectionState.scrollLeft = _groupScrollPositions[_activeDifficulty] || 0;

    window.GameEngine.loadLevel(levelIndex);
    _enterPlayView();
  }

  /* ----------------------------------------------------------
     Level card generation
     ---------------------------------------------------------- */

  function _renderLevelPills() {
    _levelSelector = document.getElementById('level-selector');
    if (!_levelSelector || !window.Levels) return;

    var groups = _buildLevelGroups();
    var currentGroup = groups[_activeDifficulty] && groups[_activeDifficulty].length
      ? _activeDifficulty
      : _getFirstAvailableGroup(groups);
    var groupMeta = _getDifficultyMeta(currentGroup);
    var activeItems = groups[currentGroup] || [];
    var summary;
    var tabsWrap;
    var groupEl;
    var cardsWrap;
    var totalCount = window.Levels.length;

    _activeDifficulty = currentGroup;
    _levelSelector.innerHTML = '';

    summary = document.createElement('div');
    summary.className = 'level-selector__summary';
    summary.innerHTML =
      '<div class="level-selector__copy">' +
        '<span class="level-selector__eyebrow">' + (_t('selector.eyebrow') || '选择关卡') + '</span>' +
        '<span class="level-selector__title">' + groupMeta.label + '</span>' +
        '<span class="level-selector__subtitle">' + groupMeta.subtitle + '</span>' +
      '</div>' +
      '<div class="level-selector__meta">' +
        '<span class="level-selector__count">' + (_t('selector.groupCount', { count: activeItems.length }) || ('本组 ' + activeItems.length + ' 关')) + '</span>' +
        '<span class="level-selector__count">' + (_t('selector.totalCount', { count: totalCount }) || ('共 ' + totalCount + ' 关')) + '</span>' +
      '</div>';

    tabsWrap = document.createElement('div');
    tabsWrap.className = 'level-tabs';

    _GROUP_ORDER.forEach(function (diff) {
      var items = groups[diff] || [];
      var tab = document.createElement('button');

      if (!items.length) return;

      tab.className = 'level-tab';
      tab.setAttribute('type', 'button');
      tab.classList.toggle('level-tab--active', diff === currentGroup);
      tab.innerHTML =
        '<span class="level-tab__label">' + _getDifficultyMeta(diff).label + '</span>' +
        '<span class="level-tab__count">' + items.length + '</span>';

      tab.addEventListener('click', function () {
        _setActiveDifficulty(diff);
      });

      tabsWrap.appendChild(tab);
    });

    groupEl = document.createElement('div');
    groupEl.className = 'level-group';

    cardsWrap = document.createElement('div');
    cardsWrap.className = 'level-group__cards';
    cardsWrap.addEventListener('scroll', function () {
      _groupScrollPositions[currentGroup] = cardsWrap.scrollLeft || 0;
      if (_currentView === 'select') {
        _selectionState.difficulty = currentGroup;
        _selectionState.scrollLeft = _groupScrollPositions[currentGroup];
      }
    }, { passive: true });

    activeItems.forEach(function (item) {
      var card = document.createElement('button');
      var boardName = _getLevelBoardName(item.level);
      var tags = (item.level.tags || []).slice(0, 2);
      var note = _getLevelNote(item.level);
      var levelName = _getLevelName(item.level);
      var isFinale = _isFinaleLevel(item.level);
      var badge = isFinale
        ? '<span class="level-card__badge">' + _getTagLabel('终局挑战') + '</span>'
        : '';

      card.className = 'level-card';
      if (isFinale) {
        card.classList.add('level-card--finale');
      }
      card.setAttribute('data-level-index', item.idx);
      card.setAttribute('type', 'button');
      card.setAttribute(
        'title',
        [
          levelName,
          window.GameI18n && window.GameI18n.getLevelDescription
            ? window.GameI18n.getLevelDescription(item.level)
            : (item.level.description || ''),
          boardName,
          note,
        ].filter(Boolean).join(' - ')
      );

      card.innerHTML =
        '<div class="level-card__top">' +
          '<div class="level-card__top-meta">' +
            '<span class="level-card__number">' + (item.idx + 1) + '</span>' +
            badge +
          '</div>' +
          '<span class="level-card__board">' + boardName + '</span>' +
        '</div>' +
        '<div class="level-card__body">' +
          '<div class="level-card__preview">' + _getBoardPreview(item.level) + '</div>' +
          '<div class="level-card__copy">' +
            '<span class="level-card__name">' + levelName + '</span>' +
            '<span class="level-card__description">' + note + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="level-card__footer">' +
          '<span class="level-card__meta">' + _formatPiecesCount(item.level.pieces.length) + '</span>' +
          '<div class="level-card__tags">' +
            tags.map(function (tag) {
              return '<span class="level-card__tag">' + _getTagLabel(tag) + '</span>';
            }).join('') +
          '</div>' +
        '</div>';

      card.addEventListener('click', function () {
        _openLevel(item.idx);
      });

      cardsWrap.appendChild(card);
    });

    groupEl.appendChild(cardsWrap);
    _levelSelector.appendChild(summary);
    _levelSelector.appendChild(tabsWrap);
    _levelSelector.appendChild(groupEl);

    _restoreGroupScroll(cardsWrap, currentGroup);
    _updateActivePill(window.GameEngine ? window.GameEngine.currentLevel : 0);
  }

  function _updateActivePill(idx) {
    if (!_levelSelector) return;
    var cards = _levelSelector.querySelectorAll('.level-card');
    cards.forEach(function (card) {
      var pillIdx = parseInt(card.getAttribute('data-level-index'), 10);
      card.classList.toggle('level-card--active', pillIdx === idx);
    });
  }

  function _setSettingsOpen(isOpen) {
    if (!_settingsPanel || !_btnSettings) return;
    _settingsPanel.classList.toggle('hidden', !isOpen);
    _settingsPanel.classList.toggle('settings-panel--open', !!isOpen);
    _settingsPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    _btnSettings.classList.toggle('btn-settings--active', !!isOpen);
    _btnSettings.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function _syncSettingsUi() {
    var language = window.GameI18n && window.GameI18n.getLanguage
      ? window.GameI18n.getLanguage()
      : 'zh';
    var inPlay = _currentView === 'play';

    if (_appRoot) {
      _appRoot.classList.toggle('app--play-view', inPlay);
    }

    if (_btnLangZh) {
      _btnLangZh.classList.toggle('settings-segment__btn--active', language === 'zh');
      _btnLangZh.setAttribute('aria-pressed', language === 'zh' ? 'true' : 'false');
    }
    if (_btnLangEn) {
      _btnLangEn.classList.toggle('settings-segment__btn--active', language === 'en');
      _btnLangEn.setAttribute('aria-pressed', language === 'en' ? 'true' : 'false');
    }
    if (_btnSfxToggle && window.GameAudio) {
      _btnSfxToggle.textContent = window.GameAudio.isSfxEnabled && window.GameAudio.isSfxEnabled()
        ? (_t('settings.sfxOn') || '音效 开')
        : (_t('settings.sfxOff') || '音效 关');
      _btnSfxToggle.classList.toggle('settings-toggle--off', !(window.GameAudio.isSfxEnabled && window.GameAudio.isSfxEnabled()));
    }
    if (_btnMusicToggle && window.GameAudio) {
      _btnMusicToggle.textContent = window.GameAudio.isMusicEnabled && window.GameAudio.isMusicEnabled()
        ? (_t('settings.musicOn') || '音乐 开')
        : (_t('settings.musicOff') || '音乐 关');
      _btnMusicToggle.classList.toggle('settings-toggle--off', !(window.GameAudio.isMusicEnabled && window.GameAudio.isMusicEnabled()));
    }
    if (_btnMenuHint) {
      _btnMenuHint.disabled = !inPlay;
      _btnMenuHint.classList.toggle('settings-toggle--off', !inPlay);
    }
    if (_btnMenuReset) {
      _btnMenuReset.disabled = !inPlay || !_canUndo;
      _btnMenuReset.classList.toggle('settings-toggle--off', !inPlay || !_canUndo);
    }
    if (_btnMenuRestart) {
      _btnMenuRestart.disabled = !inPlay;
      _btnMenuRestart.classList.toggle('settings-toggle--off', !inPlay);
    }
  }

  function _wireSettings() {
    _btnSettings = document.getElementById('btn-settings');
    _settingsPanel = document.getElementById('settings-panel');
    _btnLangZh = document.getElementById('btn-lang-zh');
    _btnLangEn = document.getElementById('btn-lang-en');
    _btnSfxToggle = document.getElementById('btn-sfx-toggle');
    _btnMusicToggle = document.getElementById('btn-music-toggle');
    _btnMenuHint = document.getElementById('btn-menu-hint');
    _btnMenuReset = document.getElementById('btn-menu-reset');
    _btnMenuRestart = document.getElementById('btn-menu-restart');

    if (_btnSettings) {
      _btnSettings.addEventListener('click', function (e) {
        e.stopPropagation();
        _setSettingsOpen(!_settingsPanel || _settingsPanel.classList.contains('hidden'));
      });
    }

    if (_btnLangZh) {
      _btnLangZh.addEventListener('click', function () {
        if (window.GameI18n && window.GameI18n.setLanguage) {
          window.GameI18n.setLanguage('zh');
        }
      });
    }

    if (_btnLangEn) {
      _btnLangEn.addEventListener('click', function () {
        if (window.GameI18n && window.GameI18n.setLanguage) {
          window.GameI18n.setLanguage('en');
        }
      });
    }

    if (_btnSfxToggle) {
      _btnSfxToggle.addEventListener('click', function () {
        if (!window.GameAudio || !window.GameAudio.setSfxEnabled || !window.GameAudio.isSfxEnabled) return;
        window.GameAudio.setSfxEnabled(!window.GameAudio.isSfxEnabled());
        _syncSettingsUi();
      });
    }

    if (_btnMusicToggle) {
      _btnMusicToggle.addEventListener('click', function () {
        if (!window.GameAudio || !window.GameAudio.setMusicEnabled || !window.GameAudio.isMusicEnabled) return;
        window.GameAudio.setMusicEnabled(!window.GameAudio.isMusicEnabled());
        _syncSettingsUi();
      });
    }

    if (_btnMenuHint) {
      _btnMenuHint.addEventListener('click', function () {
        var hintButton = document.getElementById('btn-hint');
        if (_currentView !== 'play' || !hintButton) return;
        hintButton.click();
        _setSettingsOpen(false);
      });
    }

    if (_btnMenuReset) {
      _btnMenuReset.addEventListener('click', function () {
        if (_currentView !== 'play' || !_btnReset) return;
        _btnReset.click();
        _setSettingsOpen(false);
      });
    }

    if (_btnMenuRestart) {
      _btnMenuRestart.addEventListener('click', function () {
        if (_currentView !== 'play' || !_btnRestart) return;
        _btnRestart.click();
        _setSettingsOpen(false);
      });
    }

    document.addEventListener('pointerdown', function (e) {
      if (!_settingsPanel || _settingsPanel.classList.contains('hidden')) return;
      if (e.target.closest('.settings-shell')) return;
      _setSettingsOpen(false);
    });

    _setSettingsOpen(false);
    _syncSettingsUi();
  }

  /* ----------------------------------------------------------
     Button wiring
     ---------------------------------------------------------- */

  function _wireButtons() {
    _btnBack = document.getElementById('btn-back');
    _btnReset = document.getElementById('btn-reset');
    _btnRestart = document.getElementById('btn-restart');

    if (_btnBack) {
      _btnBack.addEventListener('click', function () {
        _enterSelectionView();
      });
    }

    if (_btnReset) {
      _btnReset.addEventListener('click', function () {
        if (window.GameEngine && window.GameEngine.undoLastAction) {
          window.GameEngine.undoLastAction();
        }
      });
    }

    if (_btnRestart) {
      _btnRestart.addEventListener('click', function () {
        if (window.GameEngine) {
          window.GameEngine.loadLevel(window.GameEngine.currentLevel);
        }
      });
    }
  }

  function _syncUndoButtons(canUndo) {
    _canUndo = !!canUndo;

    if (_btnReset) {
      _btnReset.disabled = !_canUndo;
    }

    if (_btnMenuReset) {
      _btnMenuReset.disabled = _currentView !== 'play' || !_canUndo;
      _btnMenuReset.classList.toggle('settings-toggle--off', _currentView !== 'play' || !_canUndo);
    }
  }

  /* ----------------------------------------------------------
     Event listeners
     ---------------------------------------------------------- */

  function _setupEventListeners() {
    document.addEventListener('level-loaded', function (e) {
      var detail = e.detail || {};
      var idx = detail.levelIndex !== undefined ? detail.levelIndex : 0;
      var level = detail.level || null;

      if (level && level.difficulty && !_selectionState.difficulty) {
        _selectionState.difficulty = level.difficulty;
      }

      if (level) {
        _updatePlayHeader(level, idx);
      }

      _renderLevelPills();
      _updateActivePill(idx);
    });

    window.addEventListener('resize', function () {
      if (_currentView === 'select' && _isCompactViewport()) {
        _rememberGroupScroll();
      }
    });

    document.addEventListener('language-changed', function () {
      if (window.GameI18n && window.GameI18n.applyDocument) {
        window.GameI18n.applyDocument(document);
      }
      _renderLevelPills();
      if (window.GameEngine && window.GameEngine.levelData) {
        _updatePlayHeader(window.GameEngine.levelData, window.GameEngine.currentLevel || 0);
      } else {
        if (_playLevelEyebrow) _playLevelEyebrow.textContent = _t('play.currentLevel') || '当前关卡';
        if (_playLevelTitle) _playLevelTitle.textContent = _t('app.title') || '归隅';
        if (_playLevelMeta) _playLevelMeta.textContent = _t('play.emptyMeta') || '先从选关页挑一关开始。';
      }
      _syncSettingsUi();
    });

    document.addEventListener('undo-stack-changed', function (e) {
      var detail = e.detail || {};
      _syncUndoButtons(!!detail.canUndo);
    });
  }

  /* ----------------------------------------------------------
     Bootstrap
     ---------------------------------------------------------- */

  function _boot() {
    if (!window.Levels || window.Levels.length === 0) {
      console.error('[Main] No levels found. Aborting.');
      return;
    }

    if (window.GameI18n && window.GameI18n.applyDocument) {
      window.GameI18n.applyDocument(document);
    }

    _selectionScreen = document.getElementById('selection-screen');
    _playScreen = document.getElementById('play-screen');
    _appRoot = document.getElementById('app');
    _playLevelEyebrow = document.getElementById('play-level-eyebrow');
    _playLevelTitle = document.getElementById('play-level-title');
    _playLevelMeta = document.getElementById('play-level-meta');

    if (window.GameEngine) {
      window.GameEngine.levels = window.Levels;
    }

    _renderLevelPills();
    _wireButtons();
    _wireSettings();
    _setupEventListeners();
    _syncUndoButtons(false);

    if (window.GameEngine && window.GameEngine.init) {
      window.GameEngine.init();
    }

    if (window.Interaction && window.Interaction.init) {
      window.Interaction.init();
    }

    if (window.Celebration && window.Celebration.init) {
      window.Celebration.init();
    }

    if (window.GameAudio && window.GameAudio.init) {
      window.GameAudio.init();
    }
    _syncSettingsUi();

    if (window.GameEngine) {
      window.GameEngine.loadLevel(0);
    }

    _setScreenState(_selectionScreen, true);
    _setScreenState(_playScreen, false);
    if (_playLevelEyebrow) _playLevelEyebrow.textContent = _t('play.currentLevel') || '当前关卡';
    if (_playLevelTitle) _playLevelTitle.textContent = _t('app.title') || '归隅';
    if (_playLevelMeta) _playLevelMeta.textContent = _t('play.emptyMeta') || '先从选关页挑一关开始。';

    var loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) loadingMsg.classList.add('hidden');
  }

  /* ----------------------------------------------------------
     DOM Ready
     ---------------------------------------------------------- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})();
