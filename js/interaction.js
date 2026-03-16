/* ============================================================
   Guiyu -- interaction.js
   Drag-drop, snap, rotation, ghost preview, and board rendering
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     Constants (mirror SHARED_INTERFACE.md)
     ---------------------------------------------------------- */
  var SPACING_X = 50;
  var SPACING_Y = 43;
  var CIRCLE_R  = 20;
  var SNAP_THRESHOLD = 36;          // SVG-unit distance to trigger snap preview
  var RETURN_DURATION = 240;        // ms for return-to-tray animation
  var INVALID_FLASH_MS = 320;       // ms for red flash on invalid placement
  var HINT_RESTORE_MS = 1800;
  var ROTATION_TIP_KEY = 'guiyu-rotation-tip-seen';
  var DRAG_START_THRESHOLD = 6;
  var DRAG_START_THRESHOLD_COARSE = 7;
  var DRAG_HOLD_DELAY_COARSE = 90;
  var PIECE_SPACING_X = 30;
  var PIECE_SPACING_Y = 26;
  var PIECE_RADIUS = 12;
  var PIECE_PAD = PIECE_RADIUS + 4;
  var TRAY_PIECE_PAD = PIECE_RADIUS + 1;
  var TRAY_DENSE_COUNT = 10;
  var TRAY_CROWDED_COUNT = 12;
  var DRAG_RECALC_EPSILON = 0.75;

  /* ----------------------------------------------------------
     Module state
     ---------------------------------------------------------- */
  var _boardSvg       = null;
  var _appEl          = null;
  var _pitGroup       = null;
  var _highlightGroup = null;
  var _guideGroup     = null;
  var _pieceGroup     = null;
  var _tray           = null;
  var _rotationBar    = null;
  var _hintBar        = null;
  var _hintText       = null;
  var _guideOverlay   = null;
  var _guideTitle     = null;
  var _guideDescription = null;
  var _guideProgress  = null;
  var _guideMode      = null;
  var _loadingMessage = null;
  var _btnHint        = null;
  var _btnGuide       = null;
  var _btnGuidePrev   = null;
  var _btnGuideNext   = null;
  var _btnGuideToggle = null;
  var _btnGuideClose  = null;
  var _hintTimer      = null;
  var _hintState      = { text: '', mode: '' };
  var _baseHintText   = '把拼块拖到棋盘里。';
  var _rotationTipSeen = false;
  var _DIFFICULTY_LABELS = {
    easy: '入门',
    medium: '进阶',
    hard: '挑战',
    expert: '专家',
  };

  var _drag = {
    active:    false,
    el:        null,               // the .piece-wrapper being dragged
    pieceId:   null,
    offsetX:   0,
    offsetY:   0,
    startRect: null,               // DOMRect of piece in the tray before drag
    returnRect: null,
    restoreRect: null,
    snapPos:   null,               // current snap candidate {positions, anchor}
    invalidSnap: null,             // nearest invalid candidate for feedback
    wasPlaced: false,              // true if piece was on the board when drag began
    source:    'tray',
    originPositions: null,
    originRotation: 0,
    width: 0,
    height: 0,
    currentX: 0,
    currentY: 0,
    color: '#7BA7BC',
    targetFrameId: 0,
    trayRect: null,
    boardRect: null,
    pointerX: 0,
    pointerY: 0,
    lastProbeX: null,
    lastProbeY: null,
    lastProbeRotation: null,
  };

  var _guide = {
    mode: 'none',
    stepIndex: 0,
    full: false,
    highlightedPieceId: null,
  };

  var _selectedPieceId = null;
  var _highlightedTrayPieceId = null;
  var _press = {
    active: false,
    pieceId: null,
    wrapper: null,
    boardNode: null,
    source: 'tray',
    startX: 0,
    startY: 0,
    dragReady: true,
    holdTimerId: 0,
    pointerId: null,
  };

  var _boardOrigin = { cx: 0, cy: 0 };   // pixel centre of the SVG in page coords
  var _svgScale    = 1;                    // current px-per-SVG-unit ratio
  var _validPositions = [];                // [{r,c}, ...] for current level
  var _pieces         = [];                // piece definitions for current level
  var _pieceMap       = Object.create(null);
  var _pieceIndexMap  = Object.create(null);
  var _pieceWrapperMap = Object.create(null);
  var _trayFrame      = null;
  var _previewKey     = '';

  /* ----------------------------------------------------------
     Helpers
     ---------------------------------------------------------- */

  /** Dispatch a CustomEvent on document */
  function _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /** SVG namespace helper */
  function _svgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /** Convert board (r,c) to SVG-coordinate pixel position.
   *  cx / cy are the centre of the board in SVG units. */
  function _posToSVG(r, c, cx, cy) {
    return {
      x: cx + (c - r / 2) * SPACING_X,
      y: cy + r * SPACING_Y,
    };
  }

  /** Compute SVG viewBox & centre from a set of valid positions. */
  function _computeViewBox(positions) {
    if (!positions || positions.length === 0) {
      return { vb: '0 0 300 270', cx: 150, cy: 20 };
    }
    // temporary centre at 0,0 to find extents
    var xs = [], ys = [];
    positions.forEach(function (p) {
      var pt = _posToSVG(p.r, p.c, 0, 0);
      xs.push(pt.x);
      ys.push(pt.y);
    });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);

    var pad = CIRCLE_R + 18;  // padding around outermost circles
    var w = (maxX - minX) + pad * 2;
    var h = (maxY - minY) + pad * 2;

    // centre of the coordinate space within the viewBox
    var cx = -minX + pad;
    var cy = -minY + pad;

    return {
      vb: '0 0 ' + w + ' ' + h,
      cx: cx,
      cy: cy,
    };
  }

  /** Recalculate transform from SVG-user-units to page-pixels. */
  function _recalcSvgTransform() {
    if (!_boardSvg) return;
    var rect = _boardSvg.getBoundingClientRect();
    // viewBox width
    var vb   = _boardSvg.viewBox.baseVal;
    if (!vb || vb.width === 0) return;
    _svgScale = rect.width / vb.width;
    // origin of (0,0) SVG units in page-pixel space
    _boardOrigin.pageLeft = rect.left + (-vb.x) * _svgScale;
    _boardOrigin.pageTop  = rect.top  + (-vb.y) * _svgScale;
    _previewKey = '';
  }

  /** Convert page-pixel position to SVG-user-unit coords. */
  function _pageToSVG(pageX, pageY) {
    if (!_svgScale) {
      _recalcSvgTransform();
    }
    return {
      x: (pageX - _boardOrigin.pageLeft) / _svgScale,
      y: (pageY - _boardOrigin.pageTop)  / _svgScale,
    };
  }

  /** Get piece data from _pieces by id */
  function _getPieceData(pieceId) {
    if (pieceId && _pieceMap[pieceId]) {
      return _pieceMap[pieceId];
    }
    return null;
  }

  function _getPieceIndex(pieceId) {
    if (pieceId && _pieceIndexMap[pieceId] !== undefined) {
      return _pieceIndexMap[pieceId];
    }
    return -1;
  }

  function _indexPieces(pieces) {
    _pieceMap = Object.create(null);
    _pieceIndexMap = Object.create(null);

    (pieces || []).forEach(function (piece, index) {
      _pieceMap[piece.id] = piece;
      _pieceIndexMap[piece.id] = index;
    });
  }

  function _computeTrayFrame(pieces) {
    var contentWidth = PIECE_RADIUS * 2;
    var contentHeight = PIECE_RADIUS * 2;
    var contentSize;

    (pieces || []).forEach(function (piece) {
      var frame = _getPieceFrame(piece);
      contentWidth = Math.max(contentWidth, frame.width - PIECE_PAD * 2);
      contentHeight = Math.max(contentHeight, frame.height - PIECE_PAD * 2);
    });

    contentSize = Math.max(contentWidth, contentHeight);

    return {
      width: Math.ceil(contentSize + TRAY_PIECE_PAD * 2),
      height: Math.ceil(contentSize + TRAY_PIECE_PAD * 2),
    };
  }

  function _positionsKey(positions) {
    if (!positions || positions.length === 0) return '';

    return positions.map(function (pos) {
      return pos.r + ',' + pos.c;
    }).join('|');
  }

  function _applyTrayDensity(count) {
    if (!_tray) return;

    _tray.classList.toggle('pieces-tray--dense', count >= TRAY_DENSE_COUNT);
    _tray.classList.toggle('pieces-tray--crowded', count >= TRAY_CROWDED_COUNT);
    _tray.setAttribute('data-piece-count', count);
  }

  function _getBoardReleaseZone(pageX, pageY) {
    var boardContainer = document.getElementById('board-container');
    var trayRect = _drag.trayRect;
    var boardRect = _drag.boardRect;

    if (!boardRect && boardContainer) {
      boardRect = boardContainer.getBoundingClientRect();
    }
    if (boardRect && _isPointInRect(pageX, pageY, boardRect, 4)) {
      return 'board';
    }

    if (!trayRect && _tray) {
      trayRect = _tray.getBoundingClientRect();
    }
    if (trayRect && _isPointInRect(pageX, pageY, trayRect, 20)) {
      return 'tray';
    }

    return 'tray';
  }

  function _isCoarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function _getDragStartThreshold() {
    return _isCoarsePointer() ? DRAG_START_THRESHOLD_COARSE : DRAG_START_THRESHOLD;
  }

  function _getImmediateTrayDragThreshold() {
    return Math.max(_getDragStartThreshold() + 5, 12);
  }

  function _shouldUseTrayHold(source) {
    return _isCoarsePointer() && source === 'tray';
  }

  function _getDragScale() {
    return _isCoarsePointer() ? 1.02 : 1.05;
  }

  function _setDragScrollLock(locked) {
    if (!_isCoarsePointer()) return;
    document.documentElement.classList.toggle('drag-scroll-locked', !!locked);
    document.body.classList.toggle('drag-scroll-locked', !!locked);
  }

  function _t(key, vars) {
    if (window.GameI18n && window.GameI18n.t) {
      return window.GameI18n.t(key, vars);
    }
    return '';
  }

  function _getDifficultyLabel(diff) {
    if (window.GameI18n && window.GameI18n.getDifficultyLabel) {
      return window.GameI18n.getDifficultyLabel(diff);
    }
    return _DIFFICULTY_LABELS[diff] || diff;
  }

  function _getLevelNote(level) {
    if (!level) return '';
    if (window.GameI18n && window.GameI18n.getPrimaryNote) {
      return window.GameI18n.getPrimaryNote(level);
    }
    return level.notes && level.notes.length > 0 ? level.notes[0] : level.description;
  }

  function _getPieceTooltip() {
    return _isCoarsePointer()
      ? _t('pieceTitle.coarse') || '拖动摆放，选中后可点旋转按钮。'
      : _t('pieceTitle.fine') || '拖动摆放，可点旋转按钮，也可按 Q / E。';
  }

  function _levelHintText(level) {
    var rotateHint = _isCoarsePointer()
      ? ' ' + (_t('hint.rotationTipCoarse') || '提示：选中拼块后，点两侧按钮就能旋转。')
      : ' ' + (_t('hint.rotationTipFine') || '提示：可点旋转按钮，也可按 Q / E 调整方向。');

    if (!level) {
      return _isCoarsePointer()
        ? (_t('hint.default') || '把拼块拖到棋盘里。')
        : (_t('hint.default') || '把拼块拖到棋盘里。');
    }

    var note = _getLevelNote(level);
    var prefix = level.difficulty && _getDifficultyLabel(level.difficulty)
      ? _getDifficultyLabel(level.difficulty) + ' · '
      : '';
    return prefix + note + rotateHint;
  }

  function _getBoardExtents() {
    var minRow = Infinity;
    var maxRow = -Infinity;
    var minCol = Infinity;
    var maxCol = -Infinity;

    for (var i = 0; i < _validPositions.length; i++) {
      var pos = _validPositions[i];
      if (pos.r < minRow) minRow = pos.r;
      if (pos.r > maxRow) maxRow = pos.r;
      if (pos.c < minCol) minCol = pos.c;
      if (pos.c > maxCol) maxCol = pos.c;
    }

    return {
      minRow: isFinite(minRow) ? minRow : 0,
      maxRow: isFinite(maxRow) ? maxRow : 0,
      minCol: isFinite(minCol) ? minCol : 0,
      maxCol: isFinite(maxCol) ? maxCol : 0,
    };
  }

  function _describeAnchor(pos) {
    var extents = _getBoardExtents();
    var rowSpan = Math.max(1, extents.maxRow - extents.minRow);
    var colSpan = Math.max(1, extents.maxCol - extents.minCol);
    var rowRatio = (pos.r - extents.minRow) / rowSpan;
    var colRatio = (pos.c - extents.minCol) / colSpan;
    var vertical = rowRatio < 0.22 ? 'top' : rowRatio > 0.72 ? 'bottom' : 'middle';
    var horizontal = colRatio < 0.28 ? 'left' : colRatio > 0.68 ? 'right' : 'center';

    if (vertical === 'middle' && horizontal === 'center') {
      return _t('anchor.center') || '中央';
    }
    if (vertical === 'middle') {
      return horizontal === 'left'
        ? (_t('anchor.left') || '左侧')
        : (_t('anchor.right') || '右侧');
    }
    if (horizontal === 'center') {
      return vertical === 'top'
        ? (_t('anchor.top') || '上边')
        : (_t('anchor.bottom') || '下边');
    }
    if (horizontal === 'left' && vertical === 'top') return _t('anchor.topLeft') || '左上区域';
    if (horizontal === 'right' && vertical === 'top') return _t('anchor.topRight') || '右上区域';
    if (horizontal === 'left' && vertical === 'bottom') return _t('anchor.bottomLeft') || '左下区域';
    return _t('anchor.bottomRight') || '右下区域';
  }

  function _getSolutionPlacement(pieceId) {
    if (!window.GameEngine || !window.GameEngine.levelData || !window.GameEngine.levelData.solution) {
      return null;
    }
    return window.GameEngine.levelData.solution[pieceId] || null;
  }

  function _getSolvedPositions(pieceId) {
    var piece = _getPieceData(pieceId);
    var placement = _getSolutionPlacement(pieceId);
    if (!piece || !placement || !window.GameEngine || !window.GameEngine.getRotatedShape) {
      return [];
    }

    var solvedShape = window.GameEngine.getRotatedShape(piece.shape, placement.rotation || 0);
    return solvedShape.map(function (cell) {
      return {
        r: placement.anchorRow + cell.dr,
        c: placement.anchorCol + cell.dc,
      };
    });
  }

  function _getHintPieceId() {
    for (var i = 0; i < _pieces.length; i++) {
      if (!window.GameEngine || !window.GameEngine.isPiecePlaced || !window.GameEngine.isPiecePlaced(_pieces[i].id)) {
        return _pieces[i].id;
      }
    }
    return null;
  }

  function _highlightTrayPiece(pieceId) {
    if (!_tray) return;
    if (pieceId === _highlightedTrayPieceId) return;

    var previousWrapper = _highlightedTrayPieceId ? _getPieceWrapper(_highlightedTrayPieceId) : null;
    if (previousWrapper) {
      previousWrapper.classList.remove('piece--suggested');
    }

    var nextWrapper = pieceId ? _getPieceWrapper(pieceId) : null;
    if (nextWrapper) {
      nextWrapper.classList.add('piece--suggested');
    }

    _highlightedTrayPieceId = pieceId || null;
  }

  function _clearGuideOverlay() {
    if (_guideGroup) {
      _guideGroup.innerHTML = '';
    }
    _highlightTrayPiece(null);
  }

  function _getPieceWrapper(pieceId) {
    if (pieceId && _pieceWrapperMap[pieceId]) {
      return _pieceWrapperMap[pieceId];
    }
    return _tray ? _tray.querySelector('[data-piece-id="' + pieceId + '"]') : null;
  }

  function _rotateShapeLocally(shape, rotation) {
    var turns = ((rotation % 6) + 6) % 6;
    var result = [];

    for (var i = 0; i < shape.length; i++) {
      var dr = shape[i].dr;
      var dc = shape[i].dc;

      for (var step = 0; step < turns; step++) {
        var nextDr = dr - dc;
        var nextDc = dr;
        dr = nextDr;
        dc = nextDc;
      }

      result.push({ dr: dr, dc: dc });
    }

    return result;
  }

  function _measureShapeBounds(shape) {
    var xs = [];
    var ys = [];

    shape.forEach(function (s) {
      xs.push((s.dc - s.dr / 2) * PIECE_SPACING_X);
      ys.push(s.dr * PIECE_SPACING_Y);
    });

    return {
      minX: Math.min.apply(null, xs),
      maxX: Math.max.apply(null, xs),
      minY: Math.min.apply(null, ys),
      maxY: Math.max.apply(null, ys),
    };
  }

  function _getPieceFrame(piece) {
    if (!piece) {
      return {
        minX: 0,
        minY: 0,
        width: 64,
        height: 64,
      };
    }

    if (piece.frame) {
      return piece.frame;
    }

    var sourceShape = piece.baseShape || piece.shape || [];
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;

    for (var rotation = 0; rotation < 6; rotation++) {
      var bounds = _measureShapeBounds(_rotateShapeLocally(sourceShape, rotation));
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
    }

    piece.frame = {
      minX: minX,
      minY: minY,
      width: (maxX - minX) + PIECE_PAD * 2,
      height: (maxY - minY) + PIECE_PAD * 2,
    };

    return piece.frame;
  }

  function _refreshPieceWrapper(pieceId) {
    var wrapper = _getPieceWrapper(pieceId);
    var piece = _getPieceData(pieceId);
    var rotation;
    var rotatedShape;
    var tempPiece;
    var newSvg;
    var oldSvg;

    if (!wrapper || !piece || !window.GameEngine) return;

    rotation = window.GameEngine.getPieceRotation ? window.GameEngine.getPieceRotation(pieceId) : 0;
    rotatedShape = window.GameEngine.getRotatedShape
      ? window.GameEngine.getRotatedShape(piece.shape, rotation)
      : piece.shape;
    tempPiece = {
      id: piece.id,
      shape: rotatedShape,
      color: piece.color,
      baseShape: piece.shape,
      frame: _getPieceFrame(piece),
      renderFrame: _trayFrame,
    };
    newSvg = _createPieceSVG(tempPiece);
    oldSvg = wrapper.querySelector('.piece-svg');

    if (oldSvg) {
      wrapper.replaceChild(newSvg, oldSvg);
    } else {
      wrapper.appendChild(newSvg);
    }

    wrapper.setAttribute('title', _getPieceTooltip());
  }

  function _syncSelectedClasses() {
    if (_tray) {
      var wrappers = _tray.querySelectorAll('.piece-wrapper');
      wrappers.forEach(function (wrapper) {
        wrapper.classList.toggle('piece--selected', wrapper.getAttribute('data-piece-id') === _selectedPieceId);
      });
    }

    if (_pieceGroup) {
      var boardPieces = _pieceGroup.querySelectorAll('.board-piece');
      boardPieces.forEach(function (group) {
        group.classList.toggle('board-piece--selected', group.getAttribute('data-piece-id') === _selectedPieceId);
      });
    }
  }

  function _setSelectedPiece(pieceId, silent) {
    _selectedPieceId = pieceId || null;
    _syncSelectedClasses();
    _showRotationBar();

    if (!_selectedPieceId || silent) return;

    _setHint(
      _isCoarsePointer()
        ? (_t('hint.selectedCoarse') || '已选中拼块，可直接旋转或拖动。')
        : (_t('hint.selectedFine') || '已选中拼块，可点按旋转，也可用 Q / E。'),
      'active',
      HINT_RESTORE_MS
    );
  }

  function _clearSelection() {
    _selectedPieceId = null;
    _syncSelectedClasses();
    if (!_drag.active) {
      _hideRotationBar();
    }
  }

  function _getPlacementSvgCenter(positions) {
    var sumX = 0;
    var sumY = 0;
    var i;
    var pt;

    if (!positions || !positions.length) {
      return null;
    }

    for (i = 0; i < positions.length; i++) {
      pt = _posToSVG(positions[i].r, positions[i].c, _boardOrigin.cx, _boardOrigin.cy);
      sumX += pt.x;
      sumY += pt.y;
    }

    return {
      x: sumX / positions.length,
      y: sumY / positions.length,
    };
  }

  function _getPlacementPageCenter(positions) {
    var svgCenter = _getPlacementSvgCenter(positions);
    if (!svgCenter) {
      return null;
    }

    if (!_svgScale || _boardOrigin.pageLeft === undefined || _boardOrigin.pageTop === undefined) {
      _recalcSvgTransform();
    }

    return {
      x: _boardOrigin.pageLeft + svgCenter.x * _svgScale,
      y: _boardOrigin.pageTop + svgCenter.y * _svgScale,
    };
  }

  function _isPointInRect(x, y, rect, margin) {
    var left;
    var top;
    var right;
    var bottom;

    if (!rect) return false;
    margin = margin || 0;

    left = rect.left;
    top = rect.top;
    right = rect.right !== undefined ? rect.right : rect.left + rect.width;
    bottom = rect.bottom !== undefined ? rect.bottom : rect.top + rect.height;

    return (
      x >= left - margin &&
      x <= right + margin &&
      y >= top - margin &&
      y <= bottom + margin
    );
  }

  function _setHint(text, mode, autoRestoreMs) {
    if (!_hintBar || !_hintText) return;
    var nextText = text || _baseHintText;
    var nextMode = mode || '';

    if (_hintTimer) {
      clearTimeout(_hintTimer);
      _hintTimer = null;
    }

    if (_hintState.text !== nextText) {
      _hintText.textContent = nextText;
      _hintState.text = nextText;
    }

    if (_hintState.mode !== nextMode) {
      _hintBar.classList.remove(
        'play-hint-bar--active',
        'play-hint-bar--warning',
        'play-hint-bar--success'
      );

      if (nextMode === 'active') {
        _hintBar.classList.add('play-hint-bar--active');
      } else if (nextMode === 'warning') {
        _hintBar.classList.add('play-hint-bar--warning');
      } else if (nextMode === 'success') {
        _hintBar.classList.add('play-hint-bar--success');
      }

      _hintState.mode = nextMode;
    }

    if (autoRestoreMs) {
      _hintTimer = setTimeout(function () {
        _setHint(_baseHintText);
      }, autoRestoreMs);
    }
  }

  function _setBaseHintFromLevel(level) {
    _baseHintText = _levelHintText(level);
    _setHint(_baseHintText);
  }

  function _loadRotationTipSeen() {
    try {
      _rotationTipSeen = window.sessionStorage.getItem(ROTATION_TIP_KEY) === '1';
    } catch (err) {
      _rotationTipSeen = false;
    }
  }

  function _storeRotationTipSeen() {
    _rotationTipSeen = true;
    try {
      window.sessionStorage.setItem(ROTATION_TIP_KEY, '1');
    } catch (err) {
      // Ignore storage errors; the hint will just show again next session.
    }
  }

  function _maybeShowRotationTip() {
    if (_rotationTipSeen) return;

    if (_isCoarsePointer()) {
      _setHint(_t('hint.rotationTipCoarse') || '提示：选中拼块后，点两侧按钮就能旋转。', 'active', HINT_RESTORE_MS + 400);
    } else {
      _setHint(_t('hint.rotationTipFine') || '提示：可点旋转按钮，也可按 Q / E 调整方向。', 'active', HINT_RESTORE_MS + 400);
    }

    _storeRotationTipSeen();
  }

  function _invalidHintText(reason) {
    if (reason === 'occupied') {
      return _t('hint.invalid.occupied') || '这里被占住了，试试旁边的空位。';
    }
    if (reason === 'off-board') {
      return _t('hint.invalid.offBoard') || '再往棋盘里移一点。';
    }
    if (reason === 'blocked-edge') {
      return _t('hint.invalid.blockedEdge') || '已经很接近了，但还有一部分越界或被挡住。';
    }
    return _t('hint.invalid.default') || '继续移动，合法落点会柔和亮起。';
  }

  function _getDraggedReferencePoint() {
    if (!_drag.el) return null;

    if (_drag.width && _drag.height) {
      return {
        pageX: _drag.currentX + _drag.width / 2,
        pageY: _drag.currentY + _drag.height / 2,
      };
    }

    var left = parseFloat(_drag.el.style.left);
    var top = parseFloat(_drag.el.style.top);
    var width = _drag.width || parseFloat(_drag.el.style.width) || _drag.el.offsetWidth;
    var height = _drag.height || parseFloat(_drag.el.style.height) || _drag.el.offsetHeight;

    if (isNaN(left) || isNaN(top)) {
      var rect = _drag.el.getBoundingClientRect();
      left = rect.left;
      top = rect.top;
      width = rect.width;
      height = rect.height;
    }

    return {
      pageX: left + width / 2,
      pageY: top + height / 2,
    };
  }

  function _cancelDragTargetUpdate() {
    if (_drag.targetFrameId) {
      cancelAnimationFrame(_drag.targetFrameId);
      _drag.targetFrameId = 0;
    }
  }

  function _cancelReturnAnimation(el) {
    if (el && el._returnTimerId) {
      clearTimeout(el._returnTimerId);
      el._returnTimerId = 0;
    }
  }

  function _applyDragTransform(el, scale) {
    var startRect;
    var translateX;
    var translateY;
    var dragScale;

    if (!el) return;

    startRect = _drag.startRect || _drag.restoreRect || { left: _drag.currentX, top: _drag.currentY };
    translateX = _drag.currentX - startRect.left;
    translateY = _drag.currentY - startRect.top;
    dragScale = scale !== undefined ? scale : _getDragScale();

    el.style.transform =
      'translate3d(' + translateX + 'px, ' + translateY + 'px, 0) scale(' + dragScale + ')';
  }

  function _commitDragPosition(el) {
    if (!el) return;

    el.style.left = _drag.currentX + 'px';
    el.style.top = _drag.currentY + 'px';
    el.style.transform = 'translate3d(0, 0, 0)';
  }

  function _queueDragTargetUpdate() {
    if (_drag.targetFrameId || !_drag.active) return;
    _drag.targetFrameId = requestAnimationFrame(function () {
      _drag.targetFrameId = 0;
      if (_drag.active) {
        _updateDragTargets(false);
      }
    });
  }

  /** Local snap-finding: finds the closest valid grid position to SVG coords.
   *  Returns {positions: [{r,c},...], anchor: {r,c}} or null.
   *  Works by finding the nearest pit to the cursor, then checking if the
   *  piece (anchored at that pit) fits entirely on valid, empty positions.
   *  Uses the rotated shape when rotation is available. */
  function _localFindSnap(pieceId, svgX, svgY) {
    if (!_validPositions || _validPositions.length === 0) return null;
    if (!window.GameEngine) return null;

    var cx = _boardOrigin.cx;
    var cy = _boardOrigin.cy;

    // Find closest valid position to cursor
    var bestDist = Infinity;
    var bestPos  = null;
    _validPositions.forEach(function (vp) {
      var pt = _posToSVG(vp.r, vp.c, cx, cy);
      var dx = svgX - pt.x;
      var dy = svgY - pt.y;
      var d  = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        bestPos  = vp;
      }
    });

    if (!bestPos || bestDist > SNAP_THRESHOLD + SPACING_X * 0.5) return null;

    // Get the piece shape - use rotated shape if available
    var piece = _getPieceData(pieceId);
    if (!piece || !piece.shape) return null;

    var rotation = (window.GameEngine.getPieceRotation)
      ? window.GameEngine.getPieceRotation(pieceId)
      : 0;
    var shapeToUse = (window.GameEngine.getRotatedShape)
      ? window.GameEngine.getRotatedShape(piece.shape, rotation)
      : piece.shape;

    // Calculate board positions for this piece anchored at bestPos
    var positions = shapeToUse.map(function (s) {
      return { r: bestPos.r + s.dr, c: bestPos.c + s.dc };
    });

    // Check if all positions are valid using the engine
    if (window.GameEngine.canPlace) {
      if (!window.GameEngine.canPlace(pieceId, positions)) {
        // Try nearby positions as well
        var neighbors = [];
        _validPositions.forEach(function (vp) {
          var pt = _posToSVG(vp.r, vp.c, cx, cy);
          var dx = svgX - pt.x;
          var dy = svgY - pt.y;
          var d  = Math.sqrt(dx * dx + dy * dy);
          if (d < SNAP_THRESHOLD + SPACING_X && vp !== bestPos) {
            neighbors.push({ pos: vp, dist: d });
          }
        });
        neighbors.sort(function (a, b) { return a.dist - b.dist; });

        var found = false;
        for (var i = 0; i < neighbors.length; i++) {
          var altAnchor = neighbors[i].pos;
          var altPositions = shapeToUse.map(function (s) {
            return { r: altAnchor.r + s.dr, c: altAnchor.c + s.dc };
          });
          if (window.GameEngine.canPlace(pieceId, altPositions)) {
            positions = altPositions;
            bestPos = altAnchor;
            found = true;
            break;
          }
        }
        if (!found) return null;
      }
    }

    return { positions: positions, anchor: bestPos };
  }

  /** Lighten a hex colour by blending towards white. */
  function _lighten(hex, amount) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** Darken a hex colour by blending towards black. */
  function _darken(hex, amount) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.round(r * (1 - amount)));
    g = Math.max(0, Math.round(g * (1 - amount)));
    b = Math.max(0, Math.round(b * (1 - amount)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** Create an SVG gradient definition for a piece colour (polished bead look). */
  function _ensureGradient(color, id) {
    var defs = _boardSvg.querySelector('defs');
    if (defs.querySelector('#' + id)) return;
    var grad = _svgEl('radialGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('cx', '35%');
    grad.setAttribute('cy', '30%');
    grad.setAttribute('r', '65%');
    var stop1 = _svgEl('stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', _lighten(color, 0.45));
    var stop2 = _svgEl('stop');
    stop2.setAttribute('offset', '60%');
    stop2.setAttribute('stop-color', color);
    var stop3 = _svgEl('stop');
    stop3.setAttribute('offset', '100%');
    stop3.setAttribute('stop-color', _darken(color, 0.18));
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    grad.appendChild(stop3);
    defs.appendChild(grad);
  }

  /* ----------------------------------------------------------
     Board rendering
     ---------------------------------------------------------- */

  function _renderBoard(validPositions) {
    _validPositions = validPositions || [];
    _pitGroup.innerHTML = '';
    _highlightGroup.innerHTML = '';
    if (_guideGroup) _guideGroup.innerHTML = '';
    _pieceGroup.innerHTML = '';

    var vb = _computeViewBox(_validPositions);
    _boardSvg.setAttribute('viewBox', vb.vb);
    _boardOrigin.cx = vb.cx;
    _boardOrigin.cy = vb.cy;

    _validPositions.forEach(function (pos) {
      var pt = _posToSVG(pos.r, pos.c, vb.cx, vb.cy);
      var circle = _svgEl('circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', CIRCLE_R);
      circle.setAttribute('data-row', pos.r);
      circle.setAttribute('data-col', pos.c);
      circle.setAttribute('filter', 'url(#pit-shadow)');
      _pitGroup.appendChild(circle);
    });

    _recalcSvgTransform();
  }

  /* ----------------------------------------------------------
     Piece SVG creation (for the tray)
     ---------------------------------------------------------- */

  function _createPieceSVG(piece) {
    var shape = piece.shape;
    var color = piece.color || '#7BA7BC';
    var frame = piece.frame || _getPieceFrame(piece);
    var renderFrame = piece.renderFrame || frame;
    var w = renderFrame.width;
    var h = renderFrame.height;
    var pieceWidth = Math.max(frame.width - PIECE_PAD * 2, PIECE_RADIUS * 2);
    var pieceHeight = Math.max(frame.height - PIECE_PAD * 2, PIECE_RADIUS * 2);
    var offX = -frame.minX + (w - pieceWidth) / 2;
    var offY = -frame.minY + (h - pieceHeight) / 2;

    var svg = _svgEl('svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', 'piece-svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // gradient defs inside the piece SVG
    var defs = _svgEl('defs');
    var gradId = 'pg-' + piece.id;
    var grad = _svgEl('radialGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('cx', '35%');
    grad.setAttribute('cy', '30%');
    grad.setAttribute('r', '65%');
    var s1 = _svgEl('stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', _lighten(color, 0.4));
    var s2 = _svgEl('stop');
    s2.setAttribute('offset', '55%');
    s2.setAttribute('stop-color', color);
    var s3 = _svgEl('stop');
    s3.setAttribute('offset', '100%');
    s3.setAttribute('stop-color', _darken(color, 0.15));
    grad.appendChild(s1);
    grad.appendChild(s2);
    grad.appendChild(s3);
    defs.appendChild(grad);
    svg.appendChild(defs);

    shape.forEach(function (s) {
      var cx = offX + (s.dc - s.dr / 2) * PIECE_SPACING_X;
      var cy = offY + s.dr * PIECE_SPACING_Y;
      var circle = _svgEl('circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', PIECE_RADIUS);
      circle.setAttribute('fill', 'url(#' + gradId + ')');
      svg.appendChild(circle);
    });

    return svg;
  }

  /* ----------------------------------------------------------
     Render pieces in the tray
     ---------------------------------------------------------- */

  function _renderPieces(pieces) {
    _pieces = pieces || [];
    _indexPieces(_pieces);
    _trayFrame = _computeTrayFrame(_pieces);
    _pieceWrapperMap = Object.create(null);
    _tray.innerHTML = '';
    _previewKey = '';
    var fragment = document.createDocumentFragment();

    _applyTrayDensity(_pieces.length);

    _pieces.forEach(function (piece, index) {
      var wrapper = document.createElement('div');
      wrapper.className = 'piece-wrapper';
      wrapper.setAttribute('data-piece-id', piece.id);
      wrapper.setAttribute('data-piece-slot', index + 1);
      wrapper.setAttribute('data-color', piece.color || '#7BA7BC');
      wrapper.setAttribute('touch-action', _isCoarsePointer() ? 'pan-y' : 'none');
      wrapper.setAttribute(
        'title',
        _getPieceTooltip()
      );

      // Use the rotated shape for rendering if rotation is available
      var rotation = (window.GameEngine && window.GameEngine.getPieceRotation)
        ? window.GameEngine.getPieceRotation(piece.id) : 0;
      var rotatedShape = (window.GameEngine && window.GameEngine.getRotatedShape)
        ? window.GameEngine.getRotatedShape(piece.shape, rotation) : piece.shape;
      var tempPiece = {
        id: piece.id,
        shape: rotatedShape,
        color: piece.color,
        baseShape: piece.shape,
        frame: _getPieceFrame(piece),
        renderFrame: _trayFrame,
      };
      var svg = _createPieceSVG(tempPiece);
      wrapper.appendChild(svg);
      _pieceWrapperMap[piece.id] = wrapper;
      fragment.appendChild(wrapper);

      _enableDrag(wrapper);
    });

    _tray.appendChild(fragment);

    _syncSelectedClasses();
  }

  /* ----------------------------------------------------------
     Ghost preview & highlights
     ---------------------------------------------------------- */

  function _clearPitPreviewState() {
    if (!_pitGroup) return;

    var highlighted = _pitGroup.querySelectorAll('.pit--highlight, .pit--candidate-invalid');
    highlighted.forEach(function (pitCircle) {
      pitCircle.classList.remove('pit--highlight', 'pit--candidate-invalid');
    });
  }

  function _markPitTargets(positions, className) {
    if (!_pitGroup || !positions) return;

    positions.forEach(function (pos) {
      var selector = 'circle[data-row="' + pos.r + '"][data-col="' + pos.c + '"]';
      var pitCircle = _pitGroup.querySelector(selector);
      if (pitCircle) {
        pitCircle.classList.add(className);
      }
    });
  }

  /** Show ghost preview with piece gradient at reduced opacity */
  function _showGhostPreview(positions, color, pieceId, options) {
    options = options || {};
    if (!positions || positions.length === 0) {
      _clearHighlights();
      return;
    }

    var cx = _boardOrigin.cx;
    var cy = _boardOrigin.cy;
    var gradId = 'ghost-grad-' + pieceId;
    var isInvalid = !!options.invalid;
    var previewKey =
      (pieceId || '') + ':' +
      (isInvalid ? 'invalid' : 'legal') + ':' +
      _positionsKey(positions);

    if (_previewKey === previewKey) {
      return;
    }

    _previewKey = previewKey;
    _highlightGroup.innerHTML = '';
    var previewClass = isInvalid ? 'snap-preview--invalid' : 'snap-preview--legal';
    var ringColor = isInvalid ? 'var(--invalid, #c0635a)' : 'var(--accent)';

    _ensureGradient(color, gradId);
    _clearPitPreviewState();
    _markPitTargets(positions, isInvalid ? 'pit--candidate-invalid' : 'pit--highlight');

    positions.forEach(function (pos) {
      var pt = _posToSVG(pos.r, pos.c, cx, cy);

      var ring = _svgEl('circle');
      ring.setAttribute('cx', pt.x);
      ring.setAttribute('cy', pt.y);
      ring.setAttribute('r', CIRCLE_R + (isInvalid ? 1.5 : 2));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', ringColor);
      ring.setAttribute('stroke-width', isInvalid ? '1.5' : '2');
      ring.setAttribute('opacity', isInvalid ? '0.45' : '0.7');
      ring.classList.add('snap-preview', previewClass, 'snap-preview--ring');
      if (!isInvalid) {
        ring.setAttribute('filter', 'url(#highlight-glow)');
      }
      _highlightGroup.appendChild(ring);

      var circle = _svgEl('circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', CIRCLE_R);
      circle.setAttribute('fill', isInvalid ? ringColor : 'url(#' + gradId + ')');
      circle.setAttribute('opacity', isInvalid ? '0.22' : '0.42');
      circle.classList.add('snap-preview', previewClass);
      _highlightGroup.appendChild(circle);
    });
  }

  function _showInvalidPreview(candidate, color, pieceId) {
    if (!candidate || !candidate.positions) {
      _clearHighlights();
      return;
    }
    _showGhostPreview(candidate.positions, color, pieceId, { invalid: true });
  }

  function _clearHighlights() {
    if (!_previewKey) return;
    _previewKey = '';
    _clearPitPreviewState();
    _highlightGroup.innerHTML = '';
  }

  function _renderGuidePiece(pieceId, positions, color, tone) {
    if (!_guideGroup || !positions || positions.length === 0) return;

    var cx = _boardOrigin.cx;
    var cy = _boardOrigin.cy;
    var gradId = 'guide-grad-' + pieceId + '-' + (tone || 'focus');
    var ringOpacity = tone === 'soft' ? '0.22' : '0.52';
    var fillOpacity = tone === 'soft' ? '0.11' : '0.26';

    _ensureGradient(color, gradId);

    positions.forEach(function (pos) {
      var pt = _posToSVG(pos.r, pos.c, cx, cy);

      var ring = _svgEl('circle');
      ring.setAttribute('cx', pt.x);
      ring.setAttribute('cy', pt.y);
      ring.setAttribute('r', CIRCLE_R + 3);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', tone === 'soft' ? '1.2' : '1.7');
      ring.setAttribute('opacity', ringOpacity);
      ring.classList.add('guide-preview', tone === 'soft' ? 'guide-preview--soft' : 'guide-preview--focus');
      _guideGroup.appendChild(ring);

      var circle = _svgEl('circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', CIRCLE_R);
      circle.setAttribute('fill', 'url(#' + gradId + ')');
      circle.setAttribute('opacity', fillOpacity);
      circle.classList.add('guide-preview', tone === 'soft' ? 'guide-preview--soft' : 'guide-preview--focus');
      _guideGroup.appendChild(circle);
    });
  }

  function _renderGuideState() {
    _clearGuideOverlay();

    if (!window.GameEngine || !_pieces.length || _drag.active) {
      return;
    }

    if (_guide.mode === 'hint') {
      if (
        _guide.highlightedPieceId &&
        window.GameEngine &&
        window.GameEngine.isPiecePlaced &&
        window.GameEngine.isPiecePlaced(_guide.highlightedPieceId)
      ) {
        _guide.highlightedPieceId = _getHintPieceId();
      }
      if (_guide.highlightedPieceId) {
        _highlightTrayPiece(_guide.highlightedPieceId);
        _renderGuidePiece(
          _guide.highlightedPieceId,
          _getSolvedPositions(_guide.highlightedPieceId),
          _getPieceData(_guide.highlightedPieceId).color || '#7BA7BC',
          'focus'
        );
      }
      return;
    }

    if (_guide.mode !== 'solution') {
      return;
    }

    var stepPiece = _pieces[_guide.stepIndex] ? _pieces[_guide.stepIndex].id : null;

    if (_guide.full) {
      _pieces.forEach(function (piece) {
        _renderGuidePiece(piece.id, _getSolvedPositions(piece.id), piece.color || '#7BA7BC', piece.id === stepPiece ? 'focus' : 'soft');
      });
    } else if (stepPiece) {
      _renderGuidePiece(stepPiece, _getSolvedPositions(stepPiece), _getPieceData(stepPiece).color || '#7BA7BC', 'focus');
    }

    _highlightTrayPiece(stepPiece);
  }

  function _renderGuideStateIfActive() {
    if (_guide.mode === 'hint' || _guide.mode === 'solution') {
      _renderGuideState();
    }
  }

  function _showLevelRenderError(message) {
    if (_loadingMessage) {
      _loadingMessage.classList.remove('hidden');
      _loadingMessage.classList.add('loading-message--error');
      _loadingMessage.textContent = message;
    }
  }

  function _hideLevelRenderError() {
    if (_loadingMessage) {
      _loadingMessage.classList.remove('loading-message--error');
      _loadingMessage.innerHTML =
        '<span class="loading-dot"></span>' +
        '<span class="loading-dot"></span>' +
        '<span class="loading-dot"></span>';
      _loadingMessage.classList.add('hidden');
    }
  }

  function _showInvalidFeedback(positions) {
    if (!positions || positions.length === 0) return;
    var cx = _boardOrigin.cx;
    var cy = _boardOrigin.cy;

    // Flash red tint on the target pit positions
    positions.forEach(function (pos) {
      var selector = 'circle[data-row="' + pos.r + '"][data-col="' + pos.c + '"]';
      var pitCircle = _pitGroup.querySelector(selector);
      if (pitCircle) {
        pitCircle.classList.add('pit--invalid');
      }
    });

    // Also render red highlight circles briefly
    var tmpHighlights = [];
    positions.forEach(function (pos) {
      var pt = _posToSVG(pos.r, pos.c, cx, cy);
      var circle = _svgEl('circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', CIRCLE_R);
      circle.setAttribute('fill', 'var(--invalid, #c0635a)');
      circle.setAttribute('opacity', '0.35');
      circle.classList.add('snap-preview', 'snap-preview--invalid');
      _highlightGroup.appendChild(circle);
      tmpHighlights.push(circle);
    });

    setTimeout(function () {
      positions.forEach(function (pos) {
        var selector = 'circle[data-row="' + pos.r + '"][data-col="' + pos.c + '"]';
        var pitCircle = _pitGroup.querySelector(selector);
        if (pitCircle) {
          pitCircle.classList.remove('pit--invalid');
        }
      });
      tmpHighlights.forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }, INVALID_FLASH_MS);
  }

  /* ----------------------------------------------------------
     Placed pieces on the board SVG
     ---------------------------------------------------------- */

  function _renderPlacedPiece(pieceId, positions, color) {
    var cx = _boardOrigin.cx;
    var cy = _boardOrigin.cy;
    var gradId = 'board-grad-' + pieceId;
    _ensureGradient(color, gradId);

    // Remove any existing circles for this piece
    _removePlacedPiece(pieceId);

    var group = _svgEl('g');
    group.setAttribute('data-piece-id', pieceId);
    group.classList.add('board-piece');

    positions.forEach(function (pos) {
      var pt = _posToSVG(pos.r, pos.c, cx, cy);
      var circle = _svgEl('circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', CIRCLE_R);
      circle.setAttribute('fill', 'url(#' + gradId + ')');
      circle.setAttribute('data-piece-id', pieceId);
      circle.classList.add('pit--occupied');
      group.appendChild(circle);
    });

    group.addEventListener('pointerdown', _onBoardPiecePointerDown, { passive: false });
    _pieceGroup.appendChild(group);
    _syncSelectedClasses();
  }

  function _removePlacedPiece(pieceId) {
    var group = _pieceGroup
      ? _pieceGroup.querySelector('.board-piece[data-piece-id="' + pieceId + '"]')
      : null;

    if (group && group.parentNode) {
      group.parentNode.removeChild(group);
    }
  }

  /* ----------------------------------------------------------
     Update board visual state from engine data
     ---------------------------------------------------------- */

  function _updateBoardState(board, pieces) {
    // Clear all placed piece visuals
    _pieceGroup.innerHTML = '';

    if (!board || !pieces) return;

    // Find which pieces are placed, gather their positions
    var placedMap = {};  // pieceId -> [{r,c}, ...]
    Object.keys(board).forEach(function (key) {
      var pid = board[key];
      if (pid) {
        var parts = key.split(',');
        var pos = { r: parseInt(parts[0], 10), c: parseInt(parts[1], 10) };
        if (!placedMap[pid]) placedMap[pid] = [];
        placedMap[pid].push(pos);
      }
    });

    // Render each placed piece and update tray state
    Object.keys(placedMap).forEach(function (pid) {
      var piece = _getPieceData(pid);
      if (!piece) return;
      _renderPlacedPiece(pid, placedMap[pid], piece.color || '#7BA7BC');
      var wrapper = _tray.querySelector('[data-piece-id="' + pid + '"]');
      if (wrapper) wrapper.classList.add('piece--placed');
    });

    // Un-dim tray wrappers for unplaced pieces
    pieces.forEach(function (piece) {
      if (!placedMap[piece.id]) {
        var wrapper = _tray.querySelector('[data-piece-id="' + piece.id + '"]');
        if (wrapper) {
          wrapper.classList.remove('piece--placed');
        }
      }
    });

    _renderGuideState();
    _syncSelectedClasses();
  }

  function _renderCurrentLevel(detail) {
    if (!window.GameEngine) return;

    var validPos = window.GameEngine.getValidPositions
      ? window.GameEngine.getValidPositions()
      : (detail.validPositions || []);
    var pieces = window.GameEngine.getPieces
      ? window.GameEngine.getPieces()
      : (window.GameEngine.pieces || detail.pieces || []);

    if (!validPos || !validPos.length || !pieces || !pieces.length) {
      throw new Error('Missing board or piece data for current level.');
    }

    _renderBoard(validPos);
    _renderPieces(pieces);

    if (window.GameEngine.board && window.GameEngine.pieces) {
      _updateBoardState(window.GameEngine.board, window.GameEngine.pieces);
    }

    _hideLevelRenderError();
  }

  /* ----------------------------------------------------------
     Mobile rotation bar
     ---------------------------------------------------------- */

  function _createRotationBar() {
    var bar = document.createElement('div');
    bar.id = 'rotation-bar';
    bar.className = 'rotation-bar rotation-bar--inactive';
    bar.innerHTML =
      '<div class="rotation-bar__hint">' +
      '<span class="rotation-bar__title">' + (_t('rotation.inactiveTitle') || '旋转区') + '</span>' +
      '<span class="rotation-bar__keys">' + (
        _isCoarsePointer()
          ? (_t('rotation.inactiveCoarse') || '选中拼块后可直接点按')
          : (_t('rotation.inactiveFine') || '选中拼块后可点按，Q / E 仍可用')
      ) + '</span>' +
      '</div>' +
      '<button class="btn btn--subtle rotation-btn" data-dir="ccw" type="button" aria-label="向左旋转">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 3v4h4M3.5 11.5A6 6 0 1 0 5 5L3 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<button class="btn btn--subtle rotation-btn" data-dir="cw" type="button" aria-label="向右旋转">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M15 3v4h-4M14.5 11.5A6 6 0 1 1 13 5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>';

    var controls = document.getElementById('controls');
    if (controls) {
      controls.insertBefore(bar, controls.firstChild);
    } else {
      document.getElementById('app').appendChild(bar);
    }

    var btns = bar.querySelectorAll('.rotation-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('pointerdown', function (e) {
          var dir;

          e.preventDefault();
          e.stopPropagation();
          dir = btn.getAttribute('data-dir');
          _rotateActivePiece(dir);
        });
      })(btns[i]);
    }

    return bar;
  }

  function _getRotationTargetPieceId() {
    if (_drag.active && _drag.pieceId) {
      return _drag.pieceId;
    }
    return _selectedPieceId;
  }

  function _updateRotationBarCopy(pieceId) {
    var title;
    var keys;
    var slot;
    var isPlaced;
    var buttons;

    if (!_rotationBar) return;

    title = _rotationBar.querySelector('.rotation-bar__title');
    keys = _rotationBar.querySelector('.rotation-bar__keys');
    buttons = _rotationBar.querySelectorAll('.rotation-btn');
    slot = pieceId ? _getPieceIndex(pieceId) + 1 : 0;
    isPlaced = !!(pieceId && window.GameEngine && window.GameEngine.isPiecePlaced && window.GameEngine.isPiecePlaced(pieceId));

    if (title) {
      title.textContent = pieceId
        ? (isPlaced
            ? (_t('rotation.activeBoard', { slot: slot }) || ('拼块 ' + slot + ' · 已放置'))
            : (_t('rotation.activeTray', { slot: slot }) || ('拼块 ' + slot)))
        : (_t('rotation.inactiveTitle') || '旋转区');
    }
    if (keys) {
      keys.textContent = pieceId
        ? (_isCoarsePointer()
            ? (isPlaced
                ? (_t('hint.rotateDragCoarse') || '按住拼块时，可用旋转区调整方向。')
                : (_t('rotation.inactiveCoarse') || '选中拼块后可直接点按'))
            : (isPlaced
                ? (_t('hint.rotateDragFine') || '拖动时可点旋转按钮，或按 Q / E。')
                : (_t('rotation.inactiveFine') || '选中拼块后可点按，Q / E 仍可用')))
        : (_isCoarsePointer()
            ? (_t('rotation.inactiveCoarse') || '选中拼块后可直接点按')
            : (_t('rotation.inactiveFine') || '选中拼块后可点按，Q / E 仍可用'));
    }

    buttons.forEach(function (btn) {
      btn.disabled = !pieceId;
    });
    if (buttons[0]) {
      buttons[0].setAttribute('aria-label', _t('rotation.ccw') || '向左旋转');
    }
    if (buttons[1]) {
      buttons[1].setAttribute('aria-label', _t('rotation.cw') || '向右旋转');
    }

    _rotationBar.classList.toggle('rotation-bar--inactive', !pieceId);
    _rotationBar.classList.toggle('rotation-bar--active', !!pieceId);
  }

  function _showRotationBar() {
    if (_rotationBar) {
      _updateRotationBarCopy(_getRotationTargetPieceId());
    }
  }

  function _hideRotationBar() {
    if (_rotationBar) {
      _updateRotationBarCopy(null);
    }
  }

  /* ----------------------------------------------------------
     Rotation handling during drag
     ---------------------------------------------------------- */

  function _onRotationChanged(pieceId) {
    var piece = _getPieceData(pieceId);
    if (!piece || !window.GameEngine) return;

    if (_drag.el) {
      _refreshPieceWrapper(pieceId);

      _drag.el.style.transition = 'transform 120ms ease';
      _applyDragTransform(_drag.el, _getDragScale() + 0.03);
      setTimeout(function () {
        if (_drag.el) {
          _applyDragTransform(_drag.el);
          _drag.el.style.transition = 'none';
        }
      }, 120);
    } else {
      _refreshPieceWrapper(pieceId);
    }

    if (_drag.active) {
      _recalcSnap();
    }

    _setHint(
      _drag.active && _drag.snapPos
        ? (_t('hint.rotatedLegal') || '方向已调整，可以直接放下。')
        : (_isCoarsePointer()
            ? (_t('hint.rotatedCoarse') || '方向已调整，继续拖动或再次旋转。')
            : (_t('hint.rotatedFine') || '方向已调整，可继续拖动，或再按一次 Q / E。')),
      _drag.active && _drag.snapPos ? 'success' : 'active',
      _drag.active && _drag.snapPos ? 0 : HINT_RESTORE_MS
    );

    document.dispatchEvent(new CustomEvent('sfx-rotate'));
    _syncSelectedClasses();
    _showRotationBar();
  }

  function _rotatePlacedSelection(pieceId) {
    var piece = _getPieceData(pieceId);
    var positions = window.GameEngine.placedPieces[pieceId];
    var anchor = positions && positions.length ? positions[0] : null;
    var center = _getPlacementSvgCenter(positions);
    var snapState;
    var color;

    if (!piece || !positions || !positions.length || !anchor || !center || !window.GameEngine.getSnapState) {
      return false;
    }

    snapState = window.GameEngine.getSnapState(
      pieceId,
      center.x,
      center.y,
      _boardOrigin.cx,
      _boardOrigin.cy,
      anchor.r,
      anchor.c
    );

    if (!snapState.legal || !snapState.legal.positions) {
      color = piece.color || '#7BA7BC';
      if (snapState.invalid) {
        _showInvalidPreview(snapState.invalid, color, pieceId);
      } else {
        _showInvalidFeedback(positions);
      }
      _setHint(_t('hint.invalid.rotateBlocked') || '这个方向放不下，换个位置再试。', 'warning', HINT_RESTORE_MS);
      document.dispatchEvent(new CustomEvent('sfx-invalid'));
      setTimeout(function () {
        _clearHighlights();
      }, INVALID_FLASH_MS);
      return false;
    }

    if (window.GameEngine.placePiece) {
      window.GameEngine.placePiece(pieceId, snapState.legal.positions);
    }
    _renderPlacedPiece(pieceId, snapState.legal.positions, piece.color || '#7BA7BC');
    _onRotationChanged(pieceId);
    return true;
  }

  function _rotateActivePiece(dir) {
    var pieceId = _getRotationTargetPieceId();
    var wasPlaced;
    var previousRotation;

    if (!pieceId || !window.GameEngine) return;

    previousRotation = window.GameEngine.getPieceRotation ? window.GameEngine.getPieceRotation(pieceId) : 0;
    wasPlaced = window.GameEngine.isPiecePlaced && window.GameEngine.isPiecePlaced(pieceId);

    if (dir === 'cw') {
      window.GameEngine.rotatePieceCW(pieceId);
    } else {
      window.GameEngine.rotatePieceCCW(pieceId);
    }

    if (wasPlaced && !_drag.active) {
      if (!_rotatePlacedSelection(pieceId)) {
        window.GameEngine.pieceRotations[pieceId] = previousRotation;
        _refreshPieceWrapper(pieceId);
        return;
      }
    } else {
      _onRotationChanged(pieceId);
    }

    _setSelectedPiece(pieceId, true);
    _renderGuideState();
  }

  /** Keyboard handler for rotation during drag (Q = CCW, E = CW) */
  function _onKeyDown(e) {
    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      _rotateActivePiece('ccw');
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      _rotateActivePiece('cw');
    }
  }

  /** Mouse wheel handler for rotation during drag */
  function _onWheel(e) {
    if (!_drag.active && !_selectedPieceId) return;
    e.preventDefault();

    if (e.deltaY < 0) {
      _rotateActivePiece('ccw');
    } else {
      _rotateActivePiece('cw');
    }
  }

  function _updateDragTargets(force) {
    if (!_drag.active || !_drag.el) return;

    var refPoint = _getDraggedReferencePoint();
    if (!refPoint) return;
    var panelPoint = (_drag.source === 'board' && _drag.pointerX && _drag.pointerY)
      ? { pageX: _drag.pointerX, pageY: _drag.pointerY }
      : refPoint;
    var releaseZone =
      _drag.source === 'board'
        ? _getBoardReleaseZone(panelPoint.pageX, panelPoint.pageY)
        : 'board';
    var rotation = window.GameEngine && window.GameEngine.getPieceRotation
      ? window.GameEngine.getPieceRotation(_drag.pieceId)
      : 0;

    if (
      !force &&
      _drag.lastProbeX !== null &&
      Math.abs(refPoint.pageX - _drag.lastProbeX) < DRAG_RECALC_EPSILON &&
      Math.abs(refPoint.pageY - _drag.lastProbeY) < DRAG_RECALC_EPSILON &&
      _drag.lastProbeRotation === rotation
    ) {
      return;
    }

    _drag.lastProbeX = refPoint.pageX;
    _drag.lastProbeY = refPoint.pageY;
    _drag.lastProbeRotation = rotation;

    if (releaseZone === 'tray') {
      _drag.snapPos = null;
      _drag.invalidSnap = null;
      _clearHighlights();
      _setHint(_baseHintText, 'active');
      return;
    }

    var svgPt = _pageToSVG(refPoint.pageX, refPoint.pageY);
    var previousSnap = _drag.snapPos;

    _drag.snapPos = null;
    _drag.invalidSnap = null;

    if (window.GameEngine && window.GameEngine.getSnapState) {
      var state = window.GameEngine.getSnapState(
        _drag.pieceId,
        svgPt.x,
        svgPt.y,
        _boardOrigin.cx,
        _boardOrigin.cy,
        previousSnap ? previousSnap.anchorRow : undefined,
        previousSnap ? previousSnap.anchorCol : undefined
      );

      if (state.legal && state.legal.positions && state.legal.positions.length > 0) {
        _drag.snapPos = state.legal;
      }
      if (state.invalid && state.invalid.positions && state.invalid.positions.length > 0) {
        _drag.invalidSnap = state.invalid;
      }
    } else if (window.GameEngine && window.GameEngine.findSnapPosition) {
      var result = window.GameEngine.findSnapPosition(
        _drag.pieceId,
        svgPt.x,
        svgPt.y,
        _boardOrigin.cx,
        _boardOrigin.cy,
        previousSnap ? previousSnap.anchorRow : undefined,
        previousSnap ? previousSnap.anchorCol : undefined
      );
      if (result && result.positions && result.positions.length > 0) {
        _drag.snapPos = result;
      }
    }

    if (!_drag.snapPos) {
      var localResult = _localFindSnap(_drag.pieceId, svgPt.x, svgPt.y);
      if (localResult) {
        _drag.snapPos = localResult;
      }
    }

    if (_drag.snapPos) {
      var legalColor = _drag.color || '#7BA7BC';
      _showGhostPreview(_drag.snapPos.positions, legalColor, _drag.pieceId);
      _setHint(_t('hint.readyDrop') || '松手即可放下，随时都能旋转。', 'success');
    } else if (_drag.invalidSnap) {
      var invalidColor = _drag.color || '#7BA7BC';
      _showInvalidPreview(_drag.invalidSnap, invalidColor, _drag.pieceId);
      _setHint(_invalidHintText(_drag.invalidSnap.reason), 'warning');
    } else {
      _clearHighlights();
      _setHint(
        _isCoarsePointer()
          ? (_t('hint.moveCloserCoarse') || '再靠近棋盘一些，需要时可直接旋转。')
          : (_t('hint.moveCloserFine') || '再靠近棋盘一些，可点旋转按钮或按 Q / E。'),
        'active'
      );
    }
  }

  /** Recalculate snap position (used after rotation changes and during drag move) */
  function _recalcSnap() {
    _updateDragTargets(true);
  }

  /* ----------------------------------------------------------
     Drag system
     ---------------------------------------------------------- */

  function _getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function _attachPointerListeners() {
    document.addEventListener('pointermove', _onPointerMove, { passive: false });
    document.addEventListener('pointerup', _onPointerUp, { passive: false });
    document.addEventListener('pointercancel', _onPointerUp, { passive: false });
  }

  function _detachPointerListeners() {
    document.removeEventListener('pointermove', _onPointerMove);
    document.removeEventListener('pointerup', _onPointerUp);
    document.removeEventListener('pointercancel', _onPointerUp);
  }

  function _queuePress(wrapper, pieceId, pointerEvent, source, boardNode) {
    var pos = _getPointerPos(pointerEvent);
    var useTrayHold = _shouldUseTrayHold(source || 'tray');

    _press.active = true;
    _press.pieceId = pieceId;
    _press.wrapper = wrapper;
    _press.boardNode = boardNode || null;
    _press.source = source || 'tray';
    _press.startX = pos.x;
    _press.startY = pos.y;
    _press.dragReady = !useTrayHold;
    _press.holdTimerId = 0;
    _press.pointerId = pointerEvent.pointerId;

    if (useTrayHold) {
      _press.holdTimerId = setTimeout(function () {
        if (!_press.active || _press.pieceId !== pieceId) return;
        _press.dragReady = true;
      }, DRAG_HOLD_DELAY_COARSE);
    }

    _setSelectedPiece(pieceId, true);
    _attachPointerListeners();
    _showRotationBar();
  }

  function _clearPress() {
    if (_press.holdTimerId) {
      clearTimeout(_press.holdTimerId);
    }
    _press.active = false;
    _press.pieceId = null;
    _press.wrapper = null;
    _press.boardNode = null;
    _press.source = 'tray';
    _press.startX = 0;
    _press.startY = 0;
    _press.dragReady = true;
    _press.holdTimerId = 0;
    _press.pointerId = null;
  }

  function _enableDrag(el) {
    el.addEventListener('pointerdown', _onPointerDown, { passive: false });
    el.addEventListener('touchstart',  _onTouchStart,  { passive: false });
  }

  function _onTouchStart(e) {
    // Allow the page to keep scrolling naturally until a drag actually begins.
  }

  function _cloneRect(rect) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right !== undefined ? rect.right : rect.left + rect.width,
      bottom: rect.bottom !== undefined ? rect.bottom : rect.top + rect.height,
      width: rect.width,
      height: rect.height,
    };
  }

  function _rectFromCenter(cx, cy, width, height) {
    return {
      left: cx - width / 2,
      top: cy - height / 2,
      width: width,
      height: height,
    };
  }

  function _beginDrag(wrapper, pieceId, pointerPos, startRect, options, pointerId) {
    options = options || {};
    var anchorX = options.anchorX !== undefined ? options.anchorX : pointerPos.x;
    var anchorY = options.anchorY !== undefined ? options.anchorY : pointerPos.y;

    _clearPress();
    _setSelectedPiece(pieceId, true);
    _drag.active = true;
    _drag.el = wrapper;
    _drag.pieceId = pieceId;
    _drag.startRect = _cloneRect(startRect);
    _drag.returnRect = _cloneRect(options.returnRect || startRect);
    _drag.restoreRect = _cloneRect(options.restoreRect || startRect);
    _drag.wasPlaced = !!options.wasPlaced;
    _drag.source = options.source || 'tray';
    _drag.originPositions = options.originPositions ? options.originPositions.slice() : null;
    _drag.originRotation = options.originRotation || 0;
    _drag.width = startRect.width;
    _drag.height = startRect.height;
    _drag.currentX = startRect.left;
    _drag.currentY = startRect.top;
    _drag.color = wrapper.getAttribute('data-color') || '#7BA7BC';
    _drag.trayRect = options.trayRect ? _cloneRect(options.trayRect) : null;
    _drag.boardRect = options.boardRect ? _cloneRect(options.boardRect) : null;
    _drag.pointerX = pointerPos.x;
    _drag.pointerY = pointerPos.y;
    _drag.lastProbeX = null;
    _drag.lastProbeY = null;
    _drag.lastProbeRotation = null;
    _drag.offsetX = anchorX - startRect.left - startRect.width / 2;
    _drag.offsetY = anchorY - startRect.top - startRect.height / 2;
    _drag.currentX = pointerPos.x - startRect.width / 2 - _drag.offsetX;
    _drag.currentY = pointerPos.y - startRect.height / 2 - _drag.offsetY;
    _drag.snapPos = null;
    _drag.invalidSnap = null;
    _cancelDragTargetUpdate();
    _cancelReturnAnimation(wrapper);

    wrapper.classList.add('piece--dragging');
    wrapper.style.left = startRect.left + 'px';
    wrapper.style.top = startRect.top + 'px';
    wrapper.style.width = startRect.width + 'px';
    wrapper.style.height = startRect.height + 'px';
    wrapper.style.transition = 'none';
    _applyDragTransform(wrapper);

    if (pointerId !== undefined && wrapper.setPointerCapture) {
      try {
        wrapper.setPointerCapture(pointerId);
      } catch (err) {
        // Ignore capture errors from SVG/touch edge cases.
      }
    }

    _clearGuideOverlay();
    _recalcSvgTransform();

    document.dispatchEvent(new CustomEvent('sfx-pickup'));
    _emit('piece-drag-start', { pieceId: pieceId });
    _setDragScrollLock(true);

    _attachPointerListeners();
    document.addEventListener('wheel', _onWheel, { passive: false });

    _showRotationBar();
    if (!_rotationTipSeen) {
      _maybeShowRotationTip();
    } else {
      _setHint(
        _isCoarsePointer()
          ? (_t('hint.rotateDragCoarse') || '按住拼块时，可用旋转区调整方向。')
          : (_t('hint.rotateDragFine') || '拖动时可点旋转按钮，或按 Q / E。'),
        'active',
        HINT_RESTORE_MS
      );
    }

    _queueDragTargetUpdate();
  }

  function _startBoardDrag(pieceId, pointerEvent, boardNode) {
    if (!window.GameEngine || !window.GameEngine.placedPieces) return;

    var wrapper = _getPieceWrapper(pieceId);
    if (!wrapper) return;

    var originPositions = window.GameEngine.placedPieces[pieceId];
    if (!originPositions || !originPositions.length) return;

    var pointerPos = _getPointerPos(pointerEvent);
    var wrapperRect;
    var boardRect;
    var boardContainer;
    var cancelBoardRect;
    var dragRect;
    var placementCenter;
    var trayRect;
    var rotation = window.GameEngine.getPieceRotation ? window.GameEngine.getPieceRotation(pieceId) : 0;

    wrapper.classList.remove('piece--placed');
    wrapper.style.pointerEvents = '';
    wrapper.style.cursor = '';
    wrapperRect = wrapper.getBoundingClientRect();
    boardRect = boardNode && boardNode.getBoundingClientRect ? boardNode.getBoundingClientRect() : wrapperRect;
    boardContainer = document.getElementById('board-container');
    cancelBoardRect = boardContainer && boardContainer.getBoundingClientRect
      ? boardContainer.getBoundingClientRect()
      : boardRect;
    trayRect = _tray && _tray.getBoundingClientRect ? _tray.getBoundingClientRect() : wrapperRect;
    _recalcSvgTransform();
    placementCenter = _getPlacementPageCenter(originPositions);
    dragRect = _rectFromCenter(
      placementCenter ? placementCenter.x : (boardRect.left + boardRect.width / 2),
      placementCenter ? placementCenter.y : (boardRect.top + boardRect.height / 2),
      wrapperRect.width,
      wrapperRect.height
    );

    if (window.GameEngine.removePiece) {
      window.GameEngine.removePiece(pieceId);
    }
    _removePlacedPiece(pieceId);

    _beginDrag(
      wrapper,
      pieceId,
      pointerPos,
      dragRect,
      {
        source: 'board',
        wasPlaced: true,
        originPositions: originPositions.map(function (pos) {
          return { r: pos.r, c: pos.c };
        }),
        originRotation: rotation,
        returnRect: wrapperRect,
        restoreRect: dragRect,
        trayRect: trayRect,
        boardRect: cancelBoardRect,
        anchorX: _press.startX,
        anchorY: _press.startY,
      },
      pointerEvent.pointerId
    );
  }

  function _onBoardPiecePointerDown(e) {
    if (_drag.active) return;
    if (e.button && e.button !== 0) return;

    var group = e.currentTarget;
    var pieceId = group ? group.getAttribute('data-piece-id') : null;
    var wrapper;
    if (!pieceId) return;

    e.preventDefault();
    e.stopPropagation();
    wrapper = _getPieceWrapper(pieceId);
    _queuePress(wrapper, pieceId, e, 'board', group);
  }

  function _onPointerDown(e) {
    if (_drag.active) return;
    if (e.button && e.button !== 0) return;

    var wrapper = e.currentTarget;
    var pieceId = wrapper ? wrapper.getAttribute('data-piece-id') : null;
    var boardNode;
    var isPlaced;

    if (!wrapper || !pieceId) return;

    isPlaced = wrapper.classList.contains('piece--placed');

    if (!(_isCoarsePointer() && !isPlaced)) {
      e.preventDefault();
    }
    e.stopPropagation();

    if (isPlaced) {
      boardNode = _pieceGroup
        ? _pieceGroup.querySelector('.board-piece[data-piece-id="' + pieceId + '"]')
        : null;
      _queuePress(wrapper, pieceId, e, 'board', boardNode);
      return;
    }

    _queuePress(wrapper, pieceId, e, 'tray', null);
  }

  function _onPointerMove(e) {
    var pos;
    var dx;
    var dy;
    var rect;
    if (_drag.active) {
      e.preventDefault();

      pos = _getPointerPos(e);
      var el  = _drag.el;
      var w   = _drag.width || parseFloat(el.style.width)  || el.offsetWidth;
      var h   = _drag.height || parseFloat(el.style.height) || el.offsetHeight;

      _drag.currentX = pos.x - w / 2 - _drag.offsetX;
      _drag.currentY = pos.y - h / 2 - _drag.offsetY;
      _drag.pointerX = pos.x;
      _drag.pointerY = pos.y;
      _applyDragTransform(el);
      _queueDragTargetUpdate();
      return;
    }

    if (!_press.active) return;

    pos = _getPointerPos(e);
    dx = pos.x - _press.startX;
    dy = pos.y - _press.startY;
    if (_press.source === 'tray' && !_press.dragReady) {
      if (Math.sqrt(dx * dx + dy * dy) < _getImmediateTrayDragThreshold()) {
        return;
      }
      _press.dragReady = true;
      if (_press.holdTimerId) {
        clearTimeout(_press.holdTimerId);
        _press.holdTimerId = 0;
      }
    }
    if (Math.sqrt(dx * dx + dy * dy) < _getDragStartThreshold()) {
      return;
    }

    e.preventDefault();

    if (_press.source === 'board') {
      _startBoardDrag(_press.pieceId, e, _press.boardNode);
      return;
    }

    rect = _press.wrapper ? _press.wrapper.getBoundingClientRect() : null;
    if (!rect || !_press.wrapper) return;

    _beginDrag(
      _press.wrapper,
      _press.pieceId,
      pos,
      rect,
      {
        source: 'tray',
        wasPlaced: false,
        returnRect: rect,
        anchorX: _press.startX,
        anchorY: _press.startY,
      },
      e.pointerId
    );
  }

  function _onPointerUp(e) {
    if (!_drag.active && _press.active) {
      e.preventDefault();
      _clearPress();
      _showRotationBar();
      if (!_rotationTipSeen) {
        _maybeShowRotationTip();
      } else {
        _setHint(
          _isCoarsePointer()
            ? (_t('hint.selectedCoarse') || '已选中拼块，可旋转或拖动。')
            : (_t('hint.selectedFine') || '已选中拼块，可点旋转，也可按 Q / E。'),
          'active',
          HINT_RESTORE_MS
        );
      }
      _detachPointerListeners();
      return;
    }

    if (!_drag.active) return;
    e.preventDefault();

    _detachPointerListeners();
    _setDragScrollLock(false);

    // Remove rotation listeners
    document.removeEventListener('wheel', _onWheel);
    _cancelDragTargetUpdate();

    var el      = _drag.el;
    var pieceId = _drag.pieceId;
    var releaseWidth;
    var releaseHeight;
    var releasePos = _getPointerPos(e);

    if (el) {
      if (e.pointerId !== undefined && el.releasePointerCapture) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (err) {
          // Ignore pointer capture cleanup errors.
        }
      }
      releaseWidth = _drag.width || parseFloat(el.style.width) || el.offsetWidth;
      releaseHeight = _drag.height || parseFloat(el.style.height) || el.offsetHeight;
      _drag.currentX = releasePos.x - releaseWidth / 2 - _drag.offsetX;
      _drag.currentY = releasePos.y - releaseHeight / 2 - _drag.offsetY;
      _commitDragPosition(el);
      _updateDragTargets(true);
    }

    var snap    = _drag.snapPos;
    var invalidSnap = _drag.invalidSnap;
    var success = false;
    var delayRotationBar = false;
    var panelReleasePoint =
      _drag.source === 'board' && _drag.pointerX && _drag.pointerY
        ? { pageX: _drag.pointerX, pageY: _drag.pointerY }
        : { pageX: releasePos.x, pageY: releasePos.y };
    var boardReleaseZone =
      _drag.source === 'board'
        ? _getBoardReleaseZone(panelReleasePoint.pageX, panelReleasePoint.pageY)
        : 'tray';

    _drag.active = false;
    el.classList.remove('piece--dragging');
    _clearHighlights();

    if (_drag.source === 'board' && boardReleaseZone === 'tray') {
      delayRotationBar = true;
      _cancelBoardPieceToTray(el);
    } else if (snap && snap.positions && window.GameEngine) {
      // Verify placement is valid
      var canPlace = window.GameEngine.canPlace
        ? window.GameEngine.canPlace(pieceId, snap.positions)
        : true;

      if (canPlace) {
        // Place the piece
        if (window.GameEngine.placePiece) {
          window.GameEngine.placePiece(pieceId, snap.positions);
        }

        // Get piece colour
        var color = _drag.color || '#7BA7BC';

        // Audio feedback for successful snap
        document.dispatchEvent(new CustomEvent('sfx-snap'));

        // Render piece circles on the board
        _renderPlacedPiece(pieceId, snap.positions, color);

        // Mark tray element as placed
        el.classList.add('piece--placed');

        // Reset fixed positioning styles
        _resetPieceStyle(el);

        success = true;
        _setHint(_t('hint.placed') || '已放下。还可以继续调整，或换下一块。', 'success', HINT_RESTORE_MS);
        _renderGuideStateIfActive();

        // Check win condition
        if (window.GameEngine.checkWin && window.GameEngine.checkWin()) {
          // Audio feedback for win
          document.dispatchEvent(new CustomEvent('sfx-win'));
          // Small delay so placement renders before celebration
          setTimeout(function () {
            _emit('game-won', {});
          }, 250);
        }
      } else {
        // Invalid placement: show feedback then return to tray
        document.dispatchEvent(new CustomEvent('sfx-invalid'));
        _showInvalidFeedback(snap.positions);
        _setHint(_t('hint.invalid.occupied') || '这里被占住了，试试旁边的空位。', 'warning', HINT_RESTORE_MS);
        if (_drag.source === 'board' && _drag.originPositions) {
          delayRotationBar = true;
          _restoreOriginPlacement(el);
        } else {
          _shakeAndReturn(el);
        }
      }
    } else if (invalidSnap && invalidSnap.positions) {
      document.dispatchEvent(new CustomEvent('sfx-invalid'));
      _showInvalidFeedback(invalidSnap.positions);
      _setHint(_invalidHintText(invalidSnap.reason), 'warning', HINT_RESTORE_MS);
      if (_drag.source === 'board' && _drag.originPositions) {
        delayRotationBar = true;
        if (boardReleaseZone === 'tray') {
          _cancelBoardPieceToTray(el);
        } else {
          _restoreOriginPlacement(el);
        }
      } else {
        _shakeAndReturn(el);
      }
    } else {
      if (_drag.source === 'board' && _drag.originPositions) {
        delayRotationBar = true;
        if (boardReleaseZone === 'tray') {
          _cancelBoardPieceToTray(el);
        } else {
          _setHint(_baseHintText, 'active', HINT_RESTORE_MS);
          _restoreOriginPlacement(el);
        }
      } else {
        _setHint(_baseHintText, 'active', HINT_RESTORE_MS);
        _returnToTray(el);
      }
    }

    if (_drag.source !== 'board' || !_drag.originPositions) {
      _renderGuideStateIfActive();
    }

    _emit('piece-drag-end', { pieceId: pieceId, success: success });
    _drag.el      = null;
    _drag.pieceId = null;
    _drag.snapPos = null;
    _drag.invalidSnap = null;
    _drag.returnRect = null;
    _drag.restoreRect = null;
    _drag.originPositions = null;
    _drag.originRotation = 0;
    _drag.source = 'tray';
    _drag.trayRect = null;
    _drag.boardRect = null;
    _drag.pointerX = 0;
    _drag.pointerY = 0;
    _drag.width = 0;
    _drag.height = 0;
    _drag.currentX = 0;
    _drag.currentY = 0;
    _drag.color = '#7BA7BC';
    _drag.lastProbeX = null;
    _drag.lastProbeY = null;
    _drag.lastProbeRotation = null;
    if (delayRotationBar) {
      setTimeout(function () {
        _showRotationBar();
      }, RETURN_DURATION + 20);
    } else {
      _showRotationBar();
    }
  }

  /* ----------------------------------------------------------
     Piece return animation
     ---------------------------------------------------------- */

  function _resetPieceStyle(el) {
    el.style.position   = '';
    el.style.left       = '';
    el.style.top        = '';
    el.style.width      = '';
    el.style.height     = '';
    el.style.transition = '';
    el.style.transform  = '';
    el.style.zIndex     = '';
    el.style.willChange = '';
    _cancelReturnAnimation(el);
  }

  function _returnToRect(el, rect) {
    if (!rect) {
      _resetPieceStyle(el);
      return;
    }

    var startLeft = parseFloat(el.style.left);
    var startTop = parseFloat(el.style.top);
    var startWidth = parseFloat(el.style.width);
    var startHeight = parseFloat(el.style.height);
    var deltaX = rect.left - startLeft;
    var deltaY = rect.top - startTop;

    if (isNaN(startLeft)) startLeft = _drag.currentX || rect.left;
    if (isNaN(startTop)) startTop = _drag.currentY || rect.top;
    if (isNaN(startWidth)) startWidth = _drag.width || rect.width;
    if (isNaN(startHeight)) startHeight = _drag.height || rect.height;
    deltaX = rect.left - startLeft;
    deltaY = rect.top - startTop;

    el.style.transition = 'none';
    el.style.position = 'fixed';
    el.style.left   = startLeft + 'px';
    el.style.top    = startTop  + 'px';
    el.style.width  = startWidth + 'px';
    el.style.height = startHeight + 'px';
    el.style.transform = 'translate3d(0, 0, 0)';
    el.style.zIndex = '999';
    el.style.willChange = 'transform';

    requestAnimationFrame(function () {
      el.style.transition = 'transform ' + RETURN_DURATION + 'ms cubic-bezier(.22,1,.36,1)';
      el.style.transform = 'translate3d(' + deltaX + 'px, ' + deltaY + 'px, 0)';
    });

    _cancelReturnAnimation(el);
    el._returnTimerId = setTimeout(function () {
      el._returnTimerId = 0;
      _resetPieceStyle(el);
    }, RETURN_DURATION + 20);
  }

  function _returnToTray(el) {
    _returnToRect(el, _drag.returnRect);
  }

  function _cancelBoardPieceToTray(el) {
    _setHint(_t('hint.returned') || '这块已经回到待选区，随时都能再拖回来。', 'active', HINT_RESTORE_MS);
    _returnToTray(el);
    setTimeout(function () {
      _renderGuideStateIfActive();
    }, RETURN_DURATION + 20);
  }

  function _restoreOriginPlacement(el) {
    var pieceId = _drag.pieceId;
    var originPositions = _drag.originPositions
      ? _drag.originPositions.map(function (pos) {
          return { r: pos.r, c: pos.c };
        })
      : null;
    var originRotation = _drag.originRotation || 0;
    var color = el ? el.getAttribute('data-color') : '#7BA7BC';

    _returnToRect(el, _drag.restoreRect);

    setTimeout(function () {
      if (!pieceId || !originPositions || !window.GameEngine) return;

      if (window.GameEngine.pieceRotations) {
        window.GameEngine.pieceRotations[pieceId] = originRotation;
      }
      if (window.GameEngine.placePiece) {
        window.GameEngine.placePiece(pieceId, originPositions);
      }
      _renderPlacedPiece(pieceId, originPositions, color);

      if (el) {
        el.classList.add('piece--placed');
      }

      _renderGuideStateIfActive();
    }, RETURN_DURATION + 20);
  }

  function _shakeAndReturn(el) {
    // Quick shake then return
    el.style.transition = 'transform 60ms ease-in-out';
    el.style.transform  = 'translateX(6px)';

    setTimeout(function () {
      el.style.transform = 'translateX(-6px)';
    }, 60);
    setTimeout(function () {
      el.style.transform = 'translateX(4px)';
    }, 120);
    setTimeout(function () {
      el.style.transform = 'translateX(-2px)';
    }, 180);
    setTimeout(function () {
      el.style.transform = 'translateX(0)';
    }, 240);
    setTimeout(function () {
      _returnToTray(el);
    }, 300);
  }

  function _getRotationInstruction(pieceId) {
    var placement = _getSolutionPlacement(pieceId);
    var currentRotation = window.GameEngine && window.GameEngine.getPieceRotation
      ? window.GameEngine.getPieceRotation(pieceId)
      : 0;
    var delta;

    if (!placement) return '';

    delta = ((placement.rotation || 0) - currentRotation + 6) % 6;

    if (delta === 0) {
      return ' ' + (_t('rotationInstruction.none') || '暂时不用转向。');
    }
    if (delta === 1) {
      return ' ' + (_t('rotationInstruction.one') || '把它转 60° 左右就能对齐。');
    }
    return ' ' + (_t('rotationInstruction.multi') || '需要先转到合适方向，再去贴边。');
  }

  function _setGuideOverlayOpen(isOpen) {
    if (!_guideOverlay) return;
    _guideOverlay.classList.toggle('hidden', !isOpen);
    _guideOverlay.classList.toggle('guide-shell--open', !!isOpen);
    _guideOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (_appEl) {
      _appEl.classList.toggle('app--guide-open', !!isOpen);
    }
    if (_btnGuide) {
      _btnGuide.classList.toggle('btn--accent', !!isOpen);
      _btnGuide.classList.toggle('btn--subtle', !isOpen);
    }
  }

  function _describeGuideStep(pieceId) {
    var slot = _getPieceIndex(pieceId) + 1;
    var placement = _getSolutionPlacement(pieceId);
    var piece = _getPieceData(pieceId);
    var anchorText = placement ? _describeAnchor({ r: placement.anchorRow, c: placement.anchorCol }) : (_t('anchor.center') || '中央');

    if (window.GameI18n && window.GameI18n.getGuideStepText) {
      return window.GameI18n.getGuideStepText(
        slot,
        piece ? piece.shape.length : 0,
        anchorText,
        _getRotationInstruction(pieceId)
      );
    }

    return '第 ' + slot + ' 块拼块的目标在' + anchorText + '。' + _getRotationInstruction(pieceId);
  }

  function _openGuide() {
    if (!_pieces.length) return;

    if (_guideOverlay && !_guideOverlay.classList.contains('hidden')) {
      _closeGuide();
      return;
    }

    _guide.mode = 'solution';
    _guide.full = false;
    _guide.highlightedPieceId = null;
    _guide.stepIndex = Math.max(0, _getPieceIndex(_getHintPieceId()));
    _setGuideOverlayOpen(true);
    _renderGuidePanel();
  }

  function _closeGuide() {
    _guide.mode = 'none';
    _guide.full = false;
    _guide.highlightedPieceId = null;
    _setGuideOverlayOpen(false);
    _clearGuideOverlay();
    _setHint(_baseHintText);
  }

  function _renderGuidePanel() {
    var stepPiece;

    if (_guide.mode !== 'solution' || !_pieces.length) {
      return;
    }

    if (_guide.stepIndex < 0) _guide.stepIndex = 0;
    if (_guide.stepIndex > _pieces.length - 1) _guide.stepIndex = _pieces.length - 1;

    stepPiece = _pieces[_guide.stepIndex].id;

    if (_guideTitle) {
      _guideTitle.textContent = _guide.full
        ? (_t('guide.fullTitle') || '完整摆法')
        : (_t('guide.title') || '分步题解');
    }
    if (_guideDescription) {
      _guideDescription.textContent = _guide.full
        ? (_t('guide.fullDescription') || '所有目标位置都会显示出来，你可以边看边继续摆放。')
        : _describeGuideStep(stepPiece);
    }
    if (_guideProgress) {
      _guideProgress.textContent = _t('guide.progress', {
        step: _guide.stepIndex + 1,
        total: _pieces.length,
      }) || ('第 ' + (_guide.stepIndex + 1) + ' / ' + _pieces.length + ' 步');
    }
    if (_guideMode) {
      _guideMode.textContent = _guide.full
        ? (_t('guide.mode.full') || '全览')
        : (_t('guide.mode.focus') || '聚焦');
    }
    if (_btnGuidePrev) {
      _btnGuidePrev.disabled = _guide.stepIndex === 0;
    }
    if (_btnGuideNext) {
      _btnGuideNext.textContent = _guide.stepIndex === _pieces.length - 1
        ? (_t('guide.done') || '完成')
        : (_t('guide.next') || '下一步');
    }
    if (_btnGuideToggle) {
      _btnGuideToggle.textContent = _guide.full
        ? (_t('guide.showStep') || '只看当前')
        : (_t('guide.showFull') || '显示全解');
    }

    _renderGuideState();
  }

  function _showHintGuide() {
    var pieceId = _getHintPieceId();

    if (!pieceId) {
      _setHint(_t('hint.completedGuide') || '棋盘已经完成了，如要回看可以打开题解。', 'success', HINT_RESTORE_MS);
      return;
    }

    _guide.mode = 'hint';
    _guide.full = false;
    _guide.highlightedPieceId = pieceId;
    _setGuideOverlayOpen(false);
    _renderGuideState();
    _setHint(_describeGuideStep(pieceId), 'active', HINT_RESTORE_MS + 600);
  }

  /* ----------------------------------------------------------
     Reset
     ---------------------------------------------------------- */

  function _reset() {
    _drag.active    = false;
    _drag.el        = null;
    _drag.pieceId   = null;
    _drag.snapPos   = null;
    _drag.invalidSnap = null;
    _drag.wasPlaced = false;
    _drag.returnRect = null;
    _drag.restoreRect = null;
    _drag.originPositions = null;
    _drag.originRotation = 0;
    _drag.source = 'tray';
    _drag.trayRect = null;
    _drag.boardRect = null;
    _drag.width = 0;
    _drag.height = 0;
    _drag.currentX = 0;
    _drag.currentY = 0;
    _drag.color = '#7BA7BC';
    _cancelDragTargetUpdate();
    _setDragScrollLock(false);
    _guide.mode = 'none';
    _guide.stepIndex = 0;
    _guide.full = false;
    _guide.highlightedPieceId = null;
    _selectedPieceId = null;
    _highlightedTrayPieceId = null;
    _pieceWrapperMap = Object.create(null);
    _clearPress();

    _clearHighlights();
    _clearGuideOverlay();
    if (_pieceGroup) _pieceGroup.innerHTML = '';

    // Reset all piece wrappers
    if (_tray) {
      var wrappers = _tray.querySelectorAll('.piece-wrapper');
      wrappers.forEach(function (w) {
        _cancelReturnAnimation(w);
        w.classList.remove('piece--placed', 'piece--dragging', 'piece--selected');
        _resetPieceStyle(w);
        w.style.pointerEvents = '';
        w.style.cursor = '';
      });
    }

    // Clear piece rotations in engine
    if (window.GameEngine && window.GameEngine.pieceRotations) {
      window.GameEngine.pieceRotations = {};
    }

    // Hide rotation bar
    _hideRotationBar();
    _setGuideOverlayOpen(false);
    _hintState.text = '';
    _hintState.mode = '';
    _setHint(_baseHintText);

    _detachPointerListeners();
    document.removeEventListener('wheel', _onWheel);
  }

  function _collapseTransientUi() {
    if (_drag.active || _press.active) return;
    _clearSelection();
    _clearHighlights();
    _closeGuide();
    _setHint(_baseHintText);
  }

  /* ----------------------------------------------------------
     Initialization
     ---------------------------------------------------------- */

  function _init() {
    _appEl          = document.getElementById('app');
    _boardSvg       = document.getElementById('board-svg');
    _pitGroup       = document.getElementById('board-pits');
    _highlightGroup = document.getElementById('board-highlights');
    _guideGroup     = document.getElementById('board-guides');
    _pieceGroup     = document.getElementById('board-pieces');
    _tray           = document.getElementById('pieces-tray');
    _loadingMessage = document.getElementById('loading-message');

    if (!_boardSvg || !_tray) {
      console.warn('[Interaction] Required DOM elements not found; deferring init.');
      return;
    }

    // Create the mobile rotation bar
    _rotationBar = _createRotationBar();
    _hintBar = document.getElementById('play-hint-bar');
    _hintText = document.getElementById('play-hint-text');
    _guideOverlay = document.getElementById('guide-overlay');
    _guideTitle = document.getElementById('guide-title');
    _guideDescription = document.getElementById('guide-description');
    _guideProgress = document.getElementById('guide-progress');
    _guideMode = document.getElementById('guide-mode');
    _btnHint = document.getElementById('btn-hint');
    _btnGuide = document.getElementById('btn-guide');
    _btnGuidePrev = document.getElementById('btn-guide-prev');
    _btnGuideNext = document.getElementById('btn-guide-next');
    _btnGuideToggle = document.getElementById('btn-guide-toggle');
    _btnGuideClose = document.getElementById('btn-guide-close');
    _loadRotationTipSeen();
    document.addEventListener('keydown', _onKeyDown);

    _hideLevelRenderError();

    if (_btnHint) {
      _btnHint.addEventListener('click', function () {
        _showHintGuide();
      });
    }

    if (_btnGuide) {
      _btnGuide.addEventListener('click', function () {
        _openGuide();
      });
    }

    if (_btnGuidePrev) {
      _btnGuidePrev.addEventListener('click', function () {
        if (_guide.stepIndex > 0) {
          _guide.stepIndex--;
          _renderGuidePanel();
        }
      });
    }

    if (_btnGuideNext) {
      _btnGuideNext.addEventListener('click', function () {
        if (_guide.stepIndex >= _pieces.length - 1) {
          _closeGuide();
          return;
        }
        _guide.stepIndex++;
        _renderGuidePanel();
      });
    }

    if (_btnGuideToggle) {
      _btnGuideToggle.addEventListener('click', function () {
        _guide.full = !_guide.full;
        _renderGuidePanel();
      });
    }

    if (_btnGuideClose) {
      _btnGuideClose.addEventListener('click', function () {
        _closeGuide();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _guideOverlay && !_guideOverlay.classList.contains('hidden')) {
        _closeGuide();
      }
    });

    document.addEventListener('pointerdown', function (e) {
      var target = e.target;
      if (_drag.active || _press.active) return;
      if (!target) return;
      if (target.closest('.piece-wrapper') || target.closest('.board-piece') || target.closest('#rotation-bar')) {
        return;
      }
      _clearSelection();
    });

    // Listen for level changes
    document.addEventListener('level-loaded', function (e) {
      var detail = e.detail || {};
      _reset();
      _setBaseHintFromLevel(detail.level || null);

      if (window.GameEngine) {
        try {
          _renderCurrentLevel(detail);
        } catch (err) {
          console.error('[Interaction] Failed to render level:', detail.level && detail.level.id, err);
          _renderBoard([]);
          if (_tray) {
            _tray.innerHTML = '';
          }
          _pieceWrapperMap = Object.create(null);
          _applyTrayDensity(0);
          _showLevelRenderError(
            _t('play.loadError') || '这个关卡没有正常载入，请返回选关后重试。'
          );
          _setHint(
            _t('hint.loadError') || '关卡加载失败，请重开或返回选关。',
            'warning'
          );
        }
      }
    });

    // Listen for reset events
    document.addEventListener('game-reset', function () {
      _reset();
      if (window.GameEngine && window.GameEngine.levelData) {
        _setBaseHintFromLevel(window.GameEngine.levelData);
      }
      if (window.GameEngine) {
        var pieces = window.GameEngine.getPieces
          ? window.GameEngine.getPieces()
          : (window.GameEngine.pieces || []);
        _renderPieces(pieces);
      }
    });

    document.addEventListener('language-changed', function () {
      if (window.GameEngine && window.GameEngine.levelData) {
        _setBaseHintFromLevel(window.GameEngine.levelData);
      } else {
        _setHint(_t('hint.default') || '把拼块拖到棋盘里。');
      }

      if (_pieces.length && !_drag.active) {
        _renderPieces(_pieces);
        if (window.GameEngine && window.GameEngine.board && window.GameEngine.pieces) {
          _updateBoardState(window.GameEngine.board, window.GameEngine.pieces);
        }
      }

      if (_guide.mode === 'solution') {
        _renderGuidePanel();
      } else {
        _renderGuideState();
      }

      _showRotationBar();
    });

    // Handle window resize for transform recalculation
    window.addEventListener('resize', function () {
      _recalcSvgTransform();
      _showRotationBar();
    });
  }

  /* ----------------------------------------------------------
     Public API
     ---------------------------------------------------------- */

  window.Interaction = {
    init:                _init,
    createPieceSVG:      _createPieceSVG,
    renderPieces:        _renderPieces,
    enableDrag:          _enableDrag,
    returnToTray:        _returnToTray,
    renderBoard:         _renderBoard,
    updateBoardState:    _updateBoardState,
    showGhostPreview:    _showGhostPreview,
    clearHighlights:     _clearHighlights,
    showInvalidFeedback: _showInvalidFeedback,
    reset:               _reset,
    collapseTransientUi: _collapseTransientUi,
  };

})();
