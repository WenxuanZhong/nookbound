/* ============================================================
   Guiyu -- i18n.js
   Lightweight bilingual UI + level text helpers
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'guiyu-language';

  var UI = {
    zh: {
      app: {
        title: '归隅',
      },
      header: {
        eyebrow: '静谧逻辑玩具',
        subtitle: '挑一块棋盘，慢慢摆好每一枚珠粒，按自己的节奏把它拼完整。',
      },
      selector: {
        aria: '关卡选择',
        eyebrow: '选择关卡',
        choose: '选择关卡',
        groupCount: '本组 {count} 关',
        totalCount: '共 {count} 关',
      },
      play: {
        back: '返回选关',
        currentLevel: '当前关卡',
        emptyMeta: '先从选关页挑一关开始。',
        loadError: '这个关卡没有正常载入，请返回选关后重试。',
        boardAria: '游戏棋盘',
        trayAria: '待摆拼块',
        piecesCount: '{count} 块拼块',
        levelLabel: '{difficulty}关卡',
      },
      buttons: {
        hint: '提示',
        guide: '题解',
        reset: '归位',
        restart: '重开',
      },
      settings: {
        open: '打开设置',
        language: '语言',
        audio: '声音',
        sfxOn: '音效 开',
        sfxOff: '音效 关',
        musicOn: '音乐 开',
        musicOff: '音乐 关',
      },
      guide: {
        eyebrow: '题解引导',
        title: '分步题解',
        fullTitle: '完整摆法',
        description: '打开后会按顺序提示一个拼块。',
        fullDescription: '所有目标位置都会显示出来，你可以边看边继续摆放。',
        progressInitial: '第 1 步',
        progress: '第 {step} / {total} 步',
        mode: {
          focus: '聚焦',
          full: '全览',
        },
        prev: '上一步',
        next: '下一步',
        done: '完成',
        showFull: '显示全解',
        showStep: '只看当前',
        close: '收起题解',
      },
      hint: {
        default: '把拼块拖到棋盘里。',
        loadError: '关卡加载失败，请重开或返回选关。',
        selectedCoarse: '已选中拼块，可直接旋转或拖动。',
        selectedFine: '已选中拼块，可点按旋转，也可用 Q / E。',
        rotationTipCoarse: '提示：选中拼块后，点两侧按钮就能旋转。',
        rotationTipFine: '提示：可点旋转按钮，也可按 Q / E 调整方向。',
        rotatedLegal: '方向已调整，可以直接放下。',
        rotatedCoarse: '方向已调整，继续拖动或再次旋转。',
        rotatedFine: '方向已调整，可继续拖动，或再按一次 Q / E。',
        rotateDragCoarse: '按住拼块时，可用旋转区调整方向。',
        rotateDragFine: '拖动时可点旋转按钮，或按 Q / E。',
        readyDrop: '松手即可放下，随时都能旋转。',
        moveCloserCoarse: '再靠近棋盘一些，需要时可直接旋转。',
        moveCloserFine: '再靠近棋盘一些，可点旋转按钮或按 Q / E。',
        placed: '已放下。还可以继续调整，或换下一块。',
        returned: '这块已经回到待选区，随时都能再拖回来。',
        completedGuide: '棋盘已经完成了，如要回看可以打开题解。',
        invalid: {
          occupied: '这里被占住了，试试旁边的空位。',
          offBoard: '再往棋盘里移一点。',
          blockedEdge: '已经很接近了，但还有一部分越界或被挡住。',
          default: '继续移动，合法落点会柔和亮起。',
          rotateBlocked: '这个方向放不下，换个位置再试。',
        },
      },
      rotation: {
        title: '旋转',
        inactiveTitle: '旋转区',
        inactiveCoarse: '选中拼块后可直接点按',
        inactiveFine: '选中拼块后可点按，Q / E 仍可用',
        activeTray: '拼块 {slot}',
        activeBoard: '拼块 {slot} · 已放置',
        ccw: '向左旋转',
        cw: '向右旋转',
      },
      win: {
        title: '完成！',
        subtitle: '这一局拼好了',
        next: '下一关',
      },
      difficulty: {
        easy: '入门',
        medium: '进阶',
        hard: '挑战',
        expert: '专家',
      },
      difficultySubtitle: {
        easy: '轮廓清楚，先熟悉摆放、吸附和轻量旋转。',
        medium: '棋盘开始变宽、变斜，也更需要提前留位。',
        hard: '更大的异形棋盘，会把顺序与规划感推到前面。',
        expert: '更大的版图与更长拼块，需要持续规划与多步旋转。',
      },
      pieceTitle: {
        coarse: '拖动摆放，选中后可点旋转按钮。',
        fine: '拖动摆放，可点旋转按钮，也可按 Q / E。',
      },
      guideStep: {
        size: '{count} 格',
        text: '第 {slot} 块是一块 {size}拼块，目标在{anchor}。{rotation}',
      },
      rotationInstruction: {
        none: '这块不用额外旋转。',
        one: '把它转 60° 左右就能对齐。',
        multi: '需要先转到合适方向，再去贴边。',
      },
      anchor: {
        center: '中央',
        left: '左侧',
        right: '右侧',
        top: '上边',
        bottom: '下边',
        topLeft: '左上区域',
        topRight: '右上区域',
        bottomLeft: '左下区域',
        bottomRight: '右下区域',
      },
    },
    en: {
      app: {
        title: 'Nookbound',
      },
      header: {
        eyebrow: 'Quiet Logic Toy',
        subtitle: 'Choose a board, place each bead at your own pace, and settle the whole pattern into place.',
      },
      selector: {
        aria: 'Puzzle selection',
        eyebrow: 'Choose a Puzzle',
        choose: 'Choose a Puzzle',
        groupCount: '{count} in this tier',
        totalCount: '{count} total',
      },
      play: {
        back: 'Back to Puzzles',
        currentLevel: 'Current Puzzle',
        emptyMeta: 'Pick a puzzle from the selection screen to begin.',
        loadError: 'This puzzle did not load correctly. Return to the selection screen and try again.',
        boardAria: 'Puzzle board',
        trayAria: 'Available pieces',
        piecesCount: '{count} pieces',
        levelLabel: '{difficulty} puzzle',
      },
      buttons: {
        hint: 'Hint',
        guide: 'Guide',
        reset: 'Return',
        restart: 'Restart',
      },
      settings: {
        open: 'Open settings',
        language: 'Language',
        audio: 'Audio',
        sfxOn: 'SFX On',
        sfxOff: 'SFX Off',
        musicOn: 'Music On',
        musicOff: 'Music Off',
      },
      guide: {
        eyebrow: 'Guide',
        title: 'Step Guide',
        fullTitle: 'Full Layout',
        description: 'Open it to reveal one suggested piece at a time.',
        fullDescription: 'All target cells stay visible, so you can keep placing pieces while you look.',
        progressInitial: 'Step 1',
        progress: 'Step {step} / {total}',
        mode: {
          focus: 'Focus',
          full: 'Overview',
        },
        prev: 'Prev',
        next: 'Next',
        done: 'Done',
        showFull: 'Show Full',
        showStep: 'Current Only',
        close: 'Close guide',
      },
      hint: {
        default: 'Drag a piece onto the board.',
        loadError: 'Puzzle loading failed. Restart or return to the selection screen.',
        selectedCoarse: 'Piece selected. Rotate it or drag it into place.',
        selectedFine: 'Piece selected. Use the rotate buttons or press Q / E.',
        rotationTipCoarse: 'Tip: select a piece, then tap the rotate buttons.',
        rotationTipFine: 'Tip: use the rotate buttons, or press Q / E.',
        rotatedLegal: 'Orientation updated. You can drop it now.',
        rotatedCoarse: 'Orientation updated. Keep dragging or rotate again.',
        rotatedFine: 'Orientation updated. Keep dragging, or tap Q / E again.',
        rotateDragCoarse: 'While holding a piece, use the rotation controls nearby.',
        rotateDragFine: 'While dragging, use the rotate buttons or Q / E.',
        readyDrop: 'Release to place it. You can still rotate at any time.',
        moveCloserCoarse: 'Move closer to the board. You can still rotate if needed.',
        moveCloserFine: 'Move closer to the board. Use the rotate buttons or Q / E if needed.',
        placed: 'Placed. You can still adjust it, or move to the next piece.',
        returned: 'That piece is back in the tray and ready to place again.',
        completedGuide: 'The board is already complete. Open the guide if you want to review it.',
        invalid: {
          occupied: 'That spot is occupied. Try a nearby opening.',
          offBoard: 'Move a little farther onto the board.',
          blockedEdge: 'Very close, but part of the piece is still blocked or off the board.',
          default: 'Keep moving. A legal landing spot will glow softly.',
          rotateBlocked: 'That rotation does not fit here. Try another angle or position.',
        },
      },
      rotation: {
        title: 'Rotate',
        inactiveTitle: 'Rotate',
        inactiveCoarse: 'Select a piece to rotate it',
        inactiveFine: 'Select a piece to rotate it. Q / E still works',
        activeTray: 'Piece {slot}',
        activeBoard: 'Piece {slot} · Placed',
        ccw: 'Rotate left',
        cw: 'Rotate right',
      },
      win: {
        title: 'Complete!',
        subtitle: 'This board is solved',
        next: 'Next Puzzle',
      },
      difficulty: {
        easy: 'Starter',
        medium: 'Skilled',
        hard: 'Challenge',
        expert: 'Expert',
      },
      difficultySubtitle: {
        easy: 'Clear outlines to learn placement, snapping, and gentle rotation.',
        medium: 'Boards widen and lean, so you need to preserve space earlier.',
        hard: 'Larger irregular boards push order and planning into the foreground.',
        expert: 'Big layouts and longer pieces demand sustained planning and multi-step rotation.',
      },
      pieceTitle: {
        coarse: 'Drag to place. Select it first to rotate.',
        fine: 'Drag to place. Use the rotate buttons or press Q / E.',
      },
      guideStep: {
        size: '{count} cells ',
        text: 'Piece {slot} covers {size}and wants to land near the {anchor}. {rotation}',
      },
      rotationInstruction: {
        none: 'This one can stay as-is.',
        one: 'A single 60° turn should line it up.',
        multi: 'Rotate it into place before you commit to the edge.',
      },
      anchor: {
        center: 'center',
        left: 'left side',
        right: 'right side',
        top: 'top edge',
        bottom: 'bottom edge',
        topLeft: 'upper-left area',
        topRight: 'upper-right area',
        bottomLeft: 'lower-left area',
        bottomRight: 'lower-right area',
      },
    },
  };

  var BOARD_NAMES = {
    en: {
      triangle5: 'Small Triangle',
      triangle6: 'Middle Triangle',
      triangle7: 'Large Triangle',
      diamond12: 'Diamond',
      rectangle16: 'Terrace Rectangle',
      cove18: 'Cove Board',
      rhombus16: 'Rhombus',
      trapezoid18: 'Wide Trapezoid',
      hex18: 'Hex Bloom',
      pennant15: 'Pennant',
      pennant18: 'Long Pennant',
      ribbon18: 'Ribbon Rectangle',
      notch18: 'Notched Court',
      wideRhombus20: 'Broad Rhombus',
      harbor18: 'Harbor Steps',
      gallery25: 'Grand Gallery',
      crater24: 'Crater Court',
      hex24: 'Crown Hex',
      ridge25: 'Ridge Span',
      runway30: 'Bridge Runway',
      notch32: 'Folded Court',
      orbit36: 'Orbit Weave',
      citadel40: 'Crown Citadel',
      sanctum65: 'Sanctum Reach',
    },
  };

  var TAG_NAMES = {
    en: {
      '入门': 'Starter',
      '三角': 'Triangle',
      '免旋转': 'No Rotation',
      '菱形': 'Diamond',
      '旋转入门': 'Rotation Intro',
      '由中向外': 'Center Out',
      '矩形': 'Rectangle',
      '行列阅读': 'Row Reading',
      '大小分明': 'Clear Silhouettes',
      '异形': 'Irregular',
      '凹口': 'Inset',
      '轻不对称': 'Soft Asymmetry',
      '长矩形': 'Long Rectangle',
      '横向阅读': 'Horizontal Reading',
      '进阶起步': 'Stepping Up',
      '对角线': 'Diagonal',
      '形状辨认': 'Shape Reading',
      '缺角': 'Notched',
      '转角': 'Corner Play',
      '边缘控制': 'Edge Control',
      '梯形': 'Trapezoid',
      '次序': 'Order',
      '外框': 'Outer Frame',
      '六边形': 'Hex',
      '边缘优先': 'Edges First',
      '花瓣': 'Petal Shape',
      '旗面': 'Pennant',
      '不对称': 'Asymmetric',
      '锚点': 'Anchors',
      '挑战': 'Challenge',
      '尾部压力': 'Tail Pressure',
      '宽菱形': 'Wide Rhombus',
      '规划': 'Planning',
      '大棋盘': 'Large Board',
      '缺口': 'Cutout',
      '终盘规划': 'Endgame Planning',
      '专家': 'Expert',
      '长链路': 'Long Route',
      '中空': 'Hollow Core',
      '六瓣扩张': 'Expanded Hex',
      '脊线': 'Spine',
      '远距规划': 'Long-range Plan',
      '多步旋转': 'Multi-step Rotation',
      '高压终盘': 'Tight Endgame',
      '终局挑战': 'Finale',
      '超大棋盘': 'Oversized Board',
      '大师终局': 'Master Finale',
    },
  };

  var LEVEL_TEXT = {
    en: {
      'small-triangle': {
        name: 'Small Triangle',
        description: 'A compact opener to learn the snap rhythm.',
        notes: [
          'This one barely asks for rotation. Get comfortable with placement and snap feel first.',
          'Once the motion feels natural, wider boards read much more easily.',
        ],
      },
      'diamond-spark': {
        name: 'Diamond Spark',
        description: 'Build outward from the center and meet rotation for the first time.',
        notes: [
          'Only one piece clearly needs a turn, so the rest stays readable.',
          'A good place to connect rotation with landing positions.',
        ],
      },
      terrace: {
        name: 'Terrace',
        description: 'A stepped rectangle that makes different silhouettes easy to read.',
        notes: [
          'The board opens up like stairs, so it feels roomy without becoming noisy.',
          'Read the large pieces first, then patch the corners.',
        ],
      },
      'cove-garden': {
        name: 'Cove Garden',
        description: 'Soft cut-ins appear, but the overall flow stays gentle.',
        notes: [
          'Find the recessed spaces first, then let the edges fill in around them.',
          'It looks fresh without being cruel.',
        ],
      },
      'long-gallery': {
        name: 'Long Gallery',
        description: 'A stretched rectangle that asks you to think left and right.',
        notes: [
          'This one stops relying on triangle instincts and starts feeling like a corridor.',
          'Stabilize the middle before committing either end.',
        ],
      },
      'rhombus-weave': {
        name: 'Rhombus Weave',
        description: 'Diagonal reading matters more than counting rows.',
        notes: [
          'Your eye gets pulled along slanted lines, so it reads very differently from a rectangle.',
          'The logic is fair, but the spatial rhythm stays fresh.',
        ],
      },
      'corner-court': {
        name: 'Corner Court',
        description: 'A notched board that keeps reminding you to leave turning room.',
        notes: [
          'Untangle the corner first, then feed the center spaces.',
          'It is readable, but it punishes sealing the route too early.',
        ],
      },
      cascade: {
        name: 'Cascade',
        description: 'A broad trapezoid where outline and order matter most.',
        notes: [
          'Read the outer frame first, then let the middle pieces settle down through it.',
          'The difficulty comes from order, not from memorizing rotations.',
        ],
      },
      'hex-bloom': {
        name: 'Hex Bloom',
        description: 'A petaled board that rewards reading the rim before the center.',
        notes: [
          'Do not rush the middle. The outer ring gives you the cleaner read.',
          'The silhouette is distinctive, but the pieces stay readable.',
        ],
      },
      pennant: {
        name: 'Pennant',
        description: 'The slanted tail changes how anchor points feel.',
        notes: [
          'Stand the main body up first, then solve the projecting tail.',
          'The asymmetry creates the challenge, not a flood of rotations.',
        ],
      },
      tailwind: {
        name: 'Tailwind',
        description: 'A longer tail keeps pulling your attention toward the tip.',
        notes: [
          'Stabilize the pennant body first, then sort out the tail.',
          'Rotation matters, but it is not the only thing the puzzle asks of you.',
        ],
      },
      'broad-rhombus': {
        name: 'Broad Rhombus',
        description: 'A wider rhombus that pushes the difficulty into diagonal planning.',
        notes: [
          'As the board spreads out, the order of the left and right wings matters more.',
          'This is an endgame-style challenge, not another oversized triangle.',
        ],
      },
      'harbor-steps': {
        name: 'Harbor Steps',
        description: 'An outward-growing irregular board that keeps planning in the foreground.',
        notes: [
          'Read the shoreline and the notch together before you commit a piece.',
          'It feels like a crafted finale instead of another triangle variant.',
        ],
      },
      'echo-gallery': {
        name: 'Echo Gallery',
        description: 'A long, oversized gallery where each early decision affects the far end.',
        notes: [
          'The center can look safe, but the last corridor will punish loose planning.',
          'Long pieces now ask you to think in sequences instead of single placements.',
        ],
      },
      'crater-vault': {
        name: 'Crater Vault',
        description: 'A hollow board that turns the missing core into a constant planning constraint.',
        notes: [
          'You are solving around an absence, so every route has to breathe.',
          'The final spaces look small, but they are created several moves in advance.',
        ],
      },
      'crown-hex': {
        name: 'Crown Hex',
        description: 'A larger hex layout where outer pressure and inner timing have to balance.',
        notes: [
          'The board looks open, but it closes quickly if the ring forms in the wrong order.',
          'Several pieces only become obvious after one or two preparatory turns.',
        ],
      },
      'ridge-spine': {
        name: 'Ridge Spine',
        description: 'A wide slanted ridge that leans hard on long-range planning.',
        notes: [
          'Each branch of the ridge wants a different shape family, so the sequence matters.',
          'This is the most demanding spatial read in the set without becoming noisy.',
        ],
      },
      'bridge-runway': {
        name: 'Bridge Runway',
        description: 'A longer corridor turns the opening sequence into a real endgame commitment.',
        notes: [
          'The middle looks generous, but both ends punish the wrong early order.',
          'Several long bent pieces need turning room long before they are actually placed.',
        ],
      },
      'folded-court': {
        name: 'Folded Court',
        description: 'A notched tail splits the board into zones that quietly fight for the same routes.',
        notes: [
          'It reads like multiple areas, but nearly every move still steals space from somewhere else.',
          'Seal the fold too early and you are left with pieces that seem close, yet cannot turn in.',
        ],
      },
      'orbit-weave': {
        name: 'Orbit Weave',
        description: 'A larger six-domain board that rewards staying in rhythm across several moves.',
        notes: [
          'The challenge is not one brutal piece, but the need to balance the outer ring and inner core together.',
          'You will often need to rotate first, then decide the drop order that keeps the ring alive.',
        ],
      },
      'citadel-crown': {
        name: 'Crown Citadel',
        description: 'The 40-cell flagship board compresses long-range planning, rotation order, and endgame pressure into one puzzle.',
        notes: [
          'This is the largest board in the set, so every early move reaches far into the later game.',
          'Earlier expert boards are deep; this one is deep and long, so true global planning finally matters.',
        ],
      },
      'guiyu-finale': {
        name: 'Nookbound Finale',
        description: 'A 65-cell endgame board built to reward sequencing, rotation discipline, and long-range space planning all at once.',
        notes: [
          'Thirteen pieces share the same board, but each one fights for turning room in a different way.',
          'This is the quiet finale of the set: broad, demanding, and far less readable if you rush the opening.',
        ],
      },
    },
  };

  var _language = 'zh';

  function _getStoredLanguage() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'en' ? 'en' : 'zh';
    } catch (err) {
      return 'zh';
    }
  }

  function _storeLanguage(language) {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch (err) {
      // Ignore storage failures.
    }
  }

  function _resolvePath(source, key) {
    var parts = key.split('.');
    var value = source;
    for (var i = 0; i < parts.length; i++) {
      if (value == null) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  function _format(text, vars) {
    if (typeof text !== 'string' || !vars) return text;
    return text.replace(/\{([^}]+)\}/g, function (_, name) {
      return vars[name] !== undefined ? vars[name] : '';
    });
  }

  function _getUiText(key, vars) {
    var pack = UI[_language] || UI.zh;
    var fallback = UI.zh;
    var value = _resolvePath(pack, key);
    if (value === undefined) {
      value = _resolvePath(fallback, key);
    }
    return _format(value, vars);
  }

  function _resolveLevel(levelOrId) {
    if (!levelOrId) return null;
    if (typeof levelOrId === 'string') {
      if (!window.Levels) return { id: levelOrId };
      for (var i = 0; i < window.Levels.length; i++) {
        if (window.Levels[i].id === levelOrId) return window.Levels[i];
      }
      return { id: levelOrId };
    }
    return levelOrId;
  }

  function _getLocalizedLevelEntry(levelOrId) {
    var level = _resolveLevel(levelOrId);
    if (!level) return null;
    var levelId = level.id || levelOrId;
    return LEVEL_TEXT[_language] && LEVEL_TEXT[_language][levelId]
      ? LEVEL_TEXT[_language][levelId]
      : null;
  }

  function _applyDocument(root) {
    var scope = root || document;
    if (!scope || !scope.querySelectorAll) return;

    var textNodes = scope.querySelectorAll('[data-i18n]');
    textNodes.forEach(function (node) {
      var key = node.getAttribute('data-i18n');
      var text = _getUiText(key);
      if (text !== undefined) {
        node.textContent = text;
      }
    });

    var ariaNodes = scope.querySelectorAll('[data-i18n-aria-label]');
    ariaNodes.forEach(function (node) {
      var ariaKey = node.getAttribute('data-i18n-aria-label');
      var ariaText = _getUiText(ariaKey);
      if (ariaText !== undefined) {
        node.setAttribute('aria-label', ariaText);
      }
    });

    document.title = _getUiText('app.title');
    document.documentElement.lang = _language === 'en' ? 'en' : 'zh-CN';
  }

  function _getDifficultyLabel(difficulty) {
    return _getUiText('difficulty.' + difficulty) || difficulty;
  }

  function _getDifficultyMeta(difficulty) {
    return {
      label: _getDifficultyLabel(difficulty),
      subtitle: _getUiText('difficultySubtitle.' + difficulty) || '',
    };
  }

  function _getBoardName(boardOrId) {
    var boardId = typeof boardOrId === 'string' ? boardOrId : (boardOrId && boardOrId.id);
    if (!boardId) return '';
    if (_language === 'en' && BOARD_NAMES.en[boardId]) {
      return BOARD_NAMES.en[boardId];
    }
    if (window.LevelBoards && window.LevelBoards[boardId]) {
      return window.LevelBoards[boardId].name;
    }
    return boardId;
  }

  function _getLevelName(levelOrId) {
    var level = _resolveLevel(levelOrId);
    var localized = _getLocalizedLevelEntry(level);
    if (localized && localized.name) return localized.name;
    return level && level.name ? level.name : '';
  }

  function _getLevelDescription(levelOrId) {
    var level = _resolveLevel(levelOrId);
    var localized = _getLocalizedLevelEntry(level);
    if (localized && localized.description) return localized.description;
    return level && level.description ? level.description : '';
  }

  function _getLevelNotes(levelOrId) {
    var level = _resolveLevel(levelOrId);
    var localized = _getLocalizedLevelEntry(level);
    if (localized && localized.notes) return localized.notes.slice();
    return level && level.notes ? level.notes.slice() : [];
  }

  function _getPrimaryNote(levelOrId) {
    var notes = _getLevelNotes(levelOrId);
    if (notes.length) return notes[0];
    return _getLevelDescription(levelOrId);
  }

  function _getTagLabel(tag) {
    if (_language === 'en' && TAG_NAMES.en[tag]) {
      return TAG_NAMES.en[tag];
    }
    return tag;
  }

  function _setLanguage(language) {
    var next = language === 'en' ? 'en' : 'zh';
    if (next === _language) {
      _applyDocument(document);
      return;
    }
    _language = next;
    _storeLanguage(_language);
    _applyDocument(document);
    document.dispatchEvent(new CustomEvent('language-changed', {
      detail: { language: _language },
    }));
  }

  function _getGuideStepText(slot, size, anchor, rotationText) {
    return _getUiText('guideStep.text', {
      slot: slot,
      size: _getUiText('guideStep.size', { count: size }),
      anchor: anchor,
      rotation: rotationText || '',
    });
  }

  _language = _getStoredLanguage();
  _applyDocument(document);

  window.GameI18n = {
    applyDocument: _applyDocument,
    getLanguage: function () {
      return _language;
    },
    setLanguage: _setLanguage,
    t: _getUiText,
    getDifficultyLabel: _getDifficultyLabel,
    getDifficultyMeta: _getDifficultyMeta,
    getBoardName: _getBoardName,
    getLevelName: _getLevelName,
    getLevelDescription: _getLevelDescription,
    getLevelNotes: _getLevelNotes,
    getPrimaryNote: _getPrimaryNote,
    getTagLabel: _getTagLabel,
    getGuideStepText: _getGuideStepText,
  };
})();
