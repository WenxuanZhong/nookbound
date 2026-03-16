/*
 * Guiyu - Game Engine
 * ====================================
 * Core game logic: board state, piece placement, validation, coordinate math.
 * Exposes window.GameEngine per SHARED_INTERFACE.md contract.
 *
 * Coordinate system:
 *   Triangular grid row r has positions c = 0..r
 *   Screen position of (r, c):
 *     x = boardCenterX + (c - r/2) * spacingX
 *     y = boardTopY + r * spacingY
 *
 * Adjacency (r,c) neighbors:
 *   Same row: (r, c-1), (r, c+1)
 *   Upper row: (r-1, c-1), (r-1, c)
 *   Lower row: (r+1, c), (r+1, c+1)
 *
 * Rotation (60-degree steps on triangular grid):
 *   CW 60:  (dr, dc) -> (dr - dc, dr)
 *   CCW 60: (dr, dc) -> (dc, dc - dr)
 */

(function () {
  "use strict";

  // Grid spacing constants (must match SHARED_INTERFACE.md)
  var SPACING_X = 50;
  var SPACING_Y = 43;
  var CIRCLE_RADIUS = 20;
  var SNAP_THRESHOLD = 36;
  var SNAP_PREVIEW_THRESHOLD = 50;
  var INVALID_PREVIEW_THRESHOLD = 68;
  var SEARCH_RADIUS = 4; // How many positions to search around for snapping
  var STICKY_SNAP_BONUS = 12;

  // ====================================================================
  // GameEngine
  // ====================================================================

  var GameEngine = {
    currentLevel: 0,
    board: {},           // "r,c" -> pieceId | null
    validPositions: [],  // [{r, c}, ...] for current level
    pieces: [],          // piece definitions for current level
    placedPieces: {},    // pieceId -> [{r, c}, ...]
    levelData: null,     // full level definition reference
    pieceRotations: {},  // pieceId -> rotation (0-5)
    _pieceMap: {},       // pieceId -> piece definition
    _rotatedShapeCache: {}, // pieceId -> { rotation -> shape }

    // Board geometry cache
    _boardCenterX: 0,
    _boardTopY: 0,
    _validPosSet: {},    // "r,c" -> true, for fast lookup
    _maxRow: 0,

    // ------------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------------

    /**
     * Initialize the game engine. Should be called once on startup.
     * Loads the first level by default.
     */
    init: function () {
      if (!window.Levels || window.Levels.length === 0) {
        console.error("GameEngine.init: No levels found. Make sure levels.js is loaded first.");
        return;
      }
      this.loadLevel(0);
    },

    // ------------------------------------------------------------------
    // Level management
    // ------------------------------------------------------------------

    /**
     * Load a level by index. Resets all board state.
     * @param {number} levelIndex - Index into window.Levels array
     */
    loadLevel: function (levelIndex) {
      if (!window.Levels || levelIndex < 0 || levelIndex >= window.Levels.length) {
        console.error("GameEngine.loadLevel: Invalid level index:", levelIndex);
        return;
      }

      this.currentLevel = levelIndex;
      this.levelData = window.Levels[levelIndex];

      // Deep copy valid positions so we don't mutate level data
      this.validPositions = [];
      for (var i = 0; i < this.levelData.validPositions.length; i++) {
        var pos = this.levelData.validPositions[i];
        this.validPositions.push({ r: pos.r, c: pos.c });
      }

      // Deep copy pieces
      this.pieces = [];
      this._pieceMap = {};
      this._rotatedShapeCache = {};
      for (var j = 0; j < this.levelData.pieces.length; j++) {
        var src = this.levelData.pieces[j];
        var shapeCopy = [];
        for (var k = 0; k < src.shape.length; k++) {
          shapeCopy.push({ dr: src.shape[k].dr, dc: src.shape[k].dc });
        }
        this.pieces.push({
          id: src.id,
          shape: shapeCopy,
          color: src.color,
        });
        this._pieceMap[src.id] = this.pieces[this.pieces.length - 1];
        this._rotatedShapeCache[src.id] = { 0: shapeCopy };
      }

      // Build valid-position lookup set
      this._validPosSet = {};
      this._maxRow = 0;
      for (var v = 0; v < this.validPositions.length; v++) {
        var vp = this.validPositions[v];
        this._validPosSet[vp.r + "," + vp.c] = true;
        if (vp.r > this._maxRow) {
          this._maxRow = vp.r;
        }
      }

      // Compute board center for coordinate conversions
      this._computeBoardGeometry();

      // Initialize empty board
      this.board = {};
      for (var b = 0; b < this.validPositions.length; b++) {
        var bp = this.validPositions[b];
        this.board[bp.r + "," + bp.c] = null;
      }

      // Clear placed pieces and rotations
      this.placedPieces = {};
      this.pieceRotations = {};

      // Dispatch level-loaded event
      this._dispatch("level-loaded", { levelIndex: levelIndex, level: this.levelData });
    },

    /**
     * Get the valid positions for the current level.
     * @returns {Array<{r: number, c: number}>}
     */
    getValidPositions: function () {
      return this.validPositions;
    },

    /**
     * Get the piece definitions for the current level.
     * @returns {Array}
     */
    getPieces: function () {
      return this.pieces;
    },

    /**
     * Get a piece definition by ID.
     * @param {string} pieceId
     * @returns {Object|null}
     */
    getPieceById: function (pieceId) {
      return this._pieceMap[pieceId] || null;
    },

    _getCachedRotatedShape: function (pieceId, rotation) {
      var piece = this.getPieceById(pieceId);
      if (!piece) return null;

      var turns = ((rotation % 6) + 6) % 6;
      var cache = this._rotatedShapeCache[pieceId];
      if (!cache) {
        cache = {};
        this._rotatedShapeCache[pieceId] = cache;
      }

      if (!cache[turns]) {
        cache[turns] = this.getRotatedShape(piece.shape, turns);
      }

      return cache[turns];
    },

    /**
     * Get the solution for the current level (for hints).
     * @returns {Object} mapping of pieceId -> {anchorRow, anchorCol}
     */
    getSolution: function () {
      return this.levelData ? this.levelData.solution : null;
    },

    // ------------------------------------------------------------------
    // Rotation system
    // ------------------------------------------------------------------

    /**
     * Apply CW 60-degree rotation `rotation` times to each offset in shape.
     * CW 60: (dr, dc) -> (dr - dc, dr)
     * @param {Array<{dr: number, dc: number}>} shape - Relative offsets
     * @param {number} rotation - Number of 60-degree CW rotations (0-5)
     * @returns {Array<{dr: number, dc: number}>} New rotated shape
     */
    getRotatedShape: function (shape, rotation) {
      var r = ((rotation % 6) + 6) % 6; // normalize to 0-5
      var result = [];
      for (var i = 0; i < shape.length; i++) {
        var dr = shape[i].dr, dc = shape[i].dc;
        for (var step = 0; step < r; step++) {
          var newDr = dr - dc;
          var newDc = dr;
          dr = newDr;
          dc = newDc;
        }
        result.push({ dr: dr, dc: dc });
      }
      return result;
    },

    /**
     * Get the current rotation (0-5) for a piece.
     * @param {string} pieceId
     * @returns {number}
     */
    getPieceRotation: function (pieceId) {
      return this.pieceRotations[pieceId] || 0;
    },

    /**
     * Rotate a piece 60 degrees clockwise. Stores rotation and dispatches event.
     * @param {string} pieceId
     */
    rotatePieceCW: function (pieceId) {
      var current = this.pieceRotations[pieceId] || 0;
      var next = (current + 1) % 6;
      this.pieceRotations[pieceId] = next;
      this._dispatch("piece-rotated", { pieceId: pieceId, rotation: next });
    },

    /**
     * Rotate a piece 60 degrees counter-clockwise. Stores rotation and dispatches event.
     * @param {string} pieceId
     */
    rotatePieceCCW: function (pieceId) {
      var current = this.pieceRotations[pieceId] || 0;
      var next = ((current - 1) % 6 + 6) % 6;
      this.pieceRotations[pieceId] = next;
      this._dispatch("piece-rotated", { pieceId: pieceId, rotation: next });
    },

    /**
     * Get the piece's shape after applying its current rotation.
     * @param {string} pieceId
     * @returns {Array<{dr: number, dc: number}>|null}
     */
    getPieceCurrentShape: function (pieceId) {
      var rotation = this.pieceRotations[pieceId] || 0;
      return this._getCachedRotatedShape(pieceId, rotation);
    },

    // ------------------------------------------------------------------
    // Core game logic
    // ------------------------------------------------------------------

    /**
     * Check if a piece can be placed at the given absolute positions.
     * @param {string} pieceId - The piece to place
     * @param {Array<{r: number, c: number}>} positions - Absolute positions
     * @returns {boolean}
     */
    canPlace: function (pieceId, positions) {
      if (!positions || positions.length === 0) {
        return false;
      }

      for (var i = 0; i < positions.length; i++) {
        var pos = positions[i];
        var key = pos.r + "," + pos.c;

        // Must be a valid board position
        if (!this._validPosSet[key]) {
          return false;
        }

        // Must not be occupied by another piece
        var occupant = this.board[key];
        if (occupant !== null && occupant !== undefined && occupant !== pieceId) {
          return false;
        }
      }

      return true;
    },

    /**
     * Inspect a placement and describe why it is or is not legal.
     * Used by the interaction layer for ghost previews and invalid feedback.
     * @param {string} pieceId
     * @param {Array<{r: number, c: number}>} positions
     * @returns {Object}
     */
    getPlacementState: function (pieceId, positions) {
      var state = {
        isLegal: true,
        outOfBounds: 0,
        overlapCount: 0,
        validCount: 0,
        reason: "legal",
      };

      if (!positions || positions.length === 0) {
        state.isLegal = false;
        state.reason = "empty";
        return state;
      }

      for (var i = 0; i < positions.length; i++) {
        var pos = positions[i];
        var key = pos.r + "," + pos.c;

        if (!this._validPosSet[key]) {
          state.isLegal = false;
          state.outOfBounds++;
          continue;
        }

        state.validCount++;

        var occupant = this.board[key];
        if (occupant !== null && occupant !== undefined && occupant !== pieceId) {
          state.isLegal = false;
          state.overlapCount++;
        }
      }

      if (state.outOfBounds > 0 && state.overlapCount > 0) {
        state.reason = "blocked-edge";
      } else if (state.outOfBounds > 0) {
        state.reason = "off-board";
      } else if (state.overlapCount > 0) {
        state.reason = "occupied";
      }

      return state;
    },

    /**
     * Place a piece on the board at the given positions.
     * @param {string} pieceId - The piece to place
     * @param {Array<{r: number, c: number}>} positions - Absolute positions
     * @returns {boolean} true if placement succeeded
     */
    placePiece: function (pieceId, positions) {
      if (!this.canPlace(pieceId, positions)) {
        return false;
      }

      // If piece is already placed, remove it first
      if (this.placedPieces[pieceId]) {
        this.removePiece(pieceId);
      }

      // Mark positions on board
      var storedPositions = [];
      for (var i = 0; i < positions.length; i++) {
        var pos = positions[i];
        var key = pos.r + "," + pos.c;
        this.board[key] = pieceId;
        storedPositions.push({ r: pos.r, c: pos.c });
      }

      this.placedPieces[pieceId] = storedPositions;

      // Dispatch event
      this._dispatch("piece-placed", { pieceId: pieceId, positions: storedPositions });

      return true;
    },

    /**
     * Remove a piece from the board.
     * @param {string} pieceId - The piece to remove
     */
    removePiece: function (pieceId) {
      var positions = this.placedPieces[pieceId];
      if (!positions) {
        return;
      }

      // Clear board positions
      for (var i = 0; i < positions.length; i++) {
        var key = positions[i].r + "," + positions[i].c;
        if (this.board[key] === pieceId) {
          this.board[key] = null;
        }
      }

      delete this.placedPieces[pieceId];

      // Dispatch event
      this._dispatch("piece-removed", { pieceId: pieceId });
    },

    /**
     * Check if the puzzle is solved (all valid positions filled).
     * @returns {boolean}
     */
    checkWin: function () {
      for (var i = 0; i < this.validPositions.length; i++) {
        var key = this.validPositions[i].r + "," + this.validPositions[i].c;
        if (this.board[key] === null || this.board[key] === undefined) {
          return false;
        }
      }
      return true;
    },

    /**
     * Reset the current level (remove all placed pieces).
     */
    resetLevel: function () {
      // Clear all placed pieces
      var pieceIds = Object.keys(this.placedPieces);
      for (var i = 0; i < pieceIds.length; i++) {
        this.removePiece(pieceIds[i]);
      }

      // Ensure board is clean
      for (var j = 0; j < this.validPositions.length; j++) {
        var key = this.validPositions[j].r + "," + this.validPositions[j].c;
        this.board[key] = null;
      }

      this.placedPieces = {};
      this.pieceRotations = {};

      // Dispatch event
      this._dispatch("game-reset", {});
    },

    /**
     * Check whether a piece is currently placed on the board.
     * @param {string} pieceId
     * @returns {boolean}
     */
    isPiecePlaced: function (pieceId) {
      return !!this.placedPieces[pieceId];
    },

    /**
     * Get the number of pieces placed on the board.
     * @returns {number}
     */
    getPlacedCount: function () {
      return Object.keys(this.placedPieces).length;
    },

    /**
     * Get the total number of pieces for the current level.
     * @returns {number}
     */
    getTotalPieces: function () {
      return this.pieces.length;
    },

    // ------------------------------------------------------------------
    // Coordinate conversion
    // ------------------------------------------------------------------

    /**
     * Given a piece shape and anchor position, compute absolute board positions.
     * This is the function referenced as getPieceScreenPositions in the interface.
     * @param {Array<{dr: number, dc: number}>} shape - Relative offsets
     * @param {number} anchorRow - Row of anchor point
     * @param {number} anchorCol - Column of anchor point
     * @returns {Array<{r: number, c: number}>} Absolute positions
     */
    getPieceScreenPositions: function (shape, anchorRow, anchorCol) {
      var positions = [];
      for (var i = 0; i < shape.length; i++) {
        positions.push({
          r: anchorRow + shape[i].dr,
          c: anchorCol + shape[i].dc,
        });
      }
      return positions;
    },

    /**
     * Alias for getPieceScreenPositions for internal use.
     */
    getPiecePositions: function (shape, anchorRow, anchorCol) {
      return this.getPieceScreenPositions(shape, anchorRow, anchorCol);
    },

    /**
     * Convert a board position (r, c) to screen/SVG coordinates.
     * @param {number} r - Row
     * @param {number} c - Column
     * @returns {{x: number, y: number}}
     */
    posToScreen: function (r, c) {
      var x = this._boardCenterX + (c - r / 2) * SPACING_X;
      var y = this._boardTopY + r * SPACING_Y;
      return { x: x, y: y };
    },

    /**
     * Convert a board position using an arbitrary board origin.
     * Used by the snap system, which operates in Interaction's SVG space.
     * @private
     */
    _posToScreenWithOrigin: function (r, c, centerX, topY) {
      return {
        x: centerX + (c - r / 2) * SPACING_X,
        y: topY + r * SPACING_Y,
      };
    },

    /**
     * Get the visual center of a placement in screen/SVG space.
     * @private
     */
    _getPlacementCenter: function (positions, centerX, topY) {
      var sumX = 0;
      var sumY = 0;

      for (var i = 0; i < positions.length; i++) {
        var screen = this._posToScreenWithOrigin(
          positions[i].r,
          positions[i].c,
          centerX,
          topY
        );
        sumX += screen.x;
        sumY += screen.y;
      }

      return {
        x: sumX / positions.length,
        y: sumY / positions.length,
      };
    },

    /**
     * Convert screen/SVG coordinates to the nearest valid board position.
     * @param {number} screenX
     * @param {number} screenY
     * @returns {{r: number, c: number}|null} The nearest valid position or null
     */
    screenToNearestPos: function (screenX, screenY) {
      var bestDist = Infinity;
      var bestPos = null;

      for (var i = 0; i < this.validPositions.length; i++) {
        var pos = this.validPositions[i];
        var screen = this.posToScreen(pos.r, pos.c);
        var dx = screenX - screen.x;
        var dy = screenY - screen.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < bestDist) {
          bestDist = dist;
          bestPos = pos;
        }
      }

      return bestPos;
    },

    /**
     * Evaluate nearby snap candidates for a dragged piece.
     * Returns both the best legal placement and the nearest invalid candidate,
     * which the interaction layer uses for clearer previews and error feedback.
     *
     * screenX / screenY should describe the visual center of the dragged piece.
     */
    getSnapState: function (
      pieceId,
      screenX,
      screenY,
      boardCX,
      boardCY,
      preferredAnchorRow,
      preferredAnchorCol
    ) {
      var piece = this.getPieceById(pieceId);
      if (!piece) {
        return { legal: null, invalid: null };
      }

      var rotation = this.pieceRotations[pieceId] || 0;
      var rotatedShape = this._getCachedRotatedShape(pieceId, rotation);
      var cx = (boardCX !== undefined) ? boardCX : this._boardCenterX;
      var cy = (boardCY !== undefined) ? boardCY : this._boardTopY;
      var estRow = (screenY - cy) / SPACING_Y;
      var estCol = (screenX - cx) / SPACING_X + estRow / 2;
      var baseRow = Math.round(estRow);
      var baseCol = Math.round(estCol);
      var seenAnchors = {};
      var anchorQueue = [];
      var bestResult = null;
      var bestLegalScore = Infinity;
      var bestInvalid = null;
      var bestInvalidScore = Infinity;

      function queueAnchor(r, c) {
        var key = r + "," + c;
        if (seenAnchors[key]) {
          return;
        }
        seenAnchors[key] = true;
        anchorQueue.push({ anchorRow: r, anchorCol: c });
      }

      if (preferredAnchorRow !== undefined && preferredAnchorCol !== undefined) {
        for (var pdr = -1; pdr <= 1; pdr++) {
          for (var pdc = -1; pdc <= 1; pdc++) {
            queueAnchor(preferredAnchorRow + pdr, preferredAnchorCol + pdc);
          }
        }
      }

      for (var dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; dr++) {
        for (var dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; dc++) {
          queueAnchor(baseRow + dr, baseCol + dc);
        }
      }

      for (var i = 0; i < anchorQueue.length; i++) {
        var candidate = anchorQueue[i];
        var anchorRow = candidate.anchorRow;
        var anchorCol = candidate.anchorCol;
        var positions = this.getPiecePositions(rotatedShape, anchorRow, anchorCol);
        var placement = this.getPlacementState(pieceId, positions);
        var center = this._getPlacementCenter(positions, cx, cy);
        var anchorScreen = this._posToScreenWithOrigin(anchorRow, anchorCol, cx, cy);
        var centerDx = screenX - center.x;
        var centerDy = screenY - center.y;
        var anchorDx = screenX - anchorScreen.x;
        var anchorDy = screenY - anchorScreen.y;
        var centerDist = Math.sqrt(centerDx * centerDx + centerDy * centerDy);
        var anchorDist = Math.sqrt(anchorDx * anchorDx + anchorDy * anchorDy);
        var stickyBonus =
          preferredAnchorRow === anchorRow && preferredAnchorCol === anchorCol
            ? STICKY_SNAP_BONUS
            : 0;
        var score = centerDist + anchorDist * 0.12 - stickyBonus;

        if (placement.isLegal) {
          if (centerDist <= SNAP_PREVIEW_THRESHOLD && score < bestLegalScore) {
            bestLegalScore = score;
            bestResult = {
              positions: positions,
              anchorRow: anchorRow,
              anchorCol: anchorCol,
              centerX: center.x,
              centerY: center.y,
              distance: centerDist,
              reason: "legal",
            };
          }
        } else if (centerDist <= INVALID_PREVIEW_THRESHOLD) {
          var invalidScore =
            score +
            placement.outOfBounds * 18 +
            placement.overlapCount * 16;

          if (invalidScore < bestInvalidScore) {
            bestInvalidScore = invalidScore;
            bestInvalid = {
              positions: positions,
              anchorRow: anchorRow,
              anchorCol: anchorCol,
              centerX: center.x,
              centerY: center.y,
              distance: centerDist,
              reason: placement.reason,
              outOfBounds: placement.outOfBounds,
              overlapCount: placement.overlapCount,
            };
          }
        }
      }

      return {
        legal: bestResult,
        invalid: bestInvalid,
      };
    },

    findSnapPosition: function (
      pieceId,
      screenX,
      screenY,
      boardCX,
      boardCY,
      preferredAnchorRow,
      preferredAnchorCol
    ) {
      // Legacy helper kept for compatibility with existing UI calls.
      var state = this.getSnapState(
        pieceId,
        screenX,
        screenY,
        boardCX,
        boardCY,
        preferredAnchorRow,
        preferredAnchorCol
      );
      return state.legal;
    },

    // ------------------------------------------------------------------
    // Board geometry
    // ------------------------------------------------------------------

    /**
     * Check if a position (r, c) is a valid board position in the current level.
     * @param {number} r
     * @param {number} c
     * @returns {boolean}
     */
    isValidPosition: function (r, c) {
      return !!this._validPosSet[r + "," + c];
    },

    /**
     * Get the board dimensions and viewBox info for SVG rendering.
     * Returns an object with all the info needed to set up the board SVG.
     * @returns {Object}
     */
    getBoardDimensions: function () {
      if (this.validPositions.length === 0) {
        return {
          viewBox: "0 0 100 100",
          width: 100,
          height: 100,
          centerX: 50,
          topY: 50,
          positions: [],
        };
      }

      // Compute screen positions for all valid positions
      var screenPositions = [];
      var minX = Infinity,
        maxX = -Infinity;
      var minY = Infinity,
        maxY = -Infinity;

      for (var i = 0; i < this.validPositions.length; i++) {
        var pos = this.validPositions[i];
        var screen = this.posToScreen(pos.r, pos.c);
        screenPositions.push({ r: pos.r, c: pos.c, x: screen.x, y: screen.y });

        if (screen.x < minX) minX = screen.x;
        if (screen.x > maxX) maxX = screen.x;
        if (screen.y < minY) minY = screen.y;
        if (screen.y > maxY) maxY = screen.y;
      }

      var padding = CIRCLE_RADIUS * 2;
      var viewBoxX = minX - padding;
      var viewBoxY = minY - padding;
      var viewBoxW = maxX - minX + padding * 2;
      var viewBoxH = maxY - minY + padding * 2;

      return {
        viewBox: viewBoxX + " " + viewBoxY + " " + viewBoxW + " " + viewBoxH,
        width: viewBoxW,
        height: viewBoxH,
        centerX: this._boardCenterX,
        topY: this._boardTopY,
        minX: minX,
        maxX: maxX,
        minY: minY,
        maxY: maxY,
        padding: padding,
        positions: screenPositions,
        spacingX: SPACING_X,
        spacingY: SPACING_Y,
        circleRadius: CIRCLE_RADIUS,
      };
    },

    /**
     * Get the screen coordinates for all cells of a piece at its current placement.
     * Returns null if the piece is not placed.
     * @param {string} pieceId
     * @returns {Array<{r: number, c: number, x: number, y: number}>|null}
     */
    getPlacedPieceScreenPositions: function (pieceId) {
      var positions = this.placedPieces[pieceId];
      if (!positions) {
        return null;
      }

      var result = [];
      for (var i = 0; i < positions.length; i++) {
        var screen = this.posToScreen(positions[i].r, positions[i].c);
        result.push({
          r: positions[i].r,
          c: positions[i].c,
          x: screen.x,
          y: screen.y,
        });
      }
      return result;
    },

    /**
     * Get the screen coordinates for a piece shape at a specific anchor.
     * Used by the UI for rendering piece previews and during drag.
     * @param {string} pieceId
     * @param {number} anchorRow
     * @param {number} anchorCol
     * @returns {Array<{r: number, c: number, x: number, y: number}>}
     */
    getPieceScreenCoords: function (pieceId, anchorRow, anchorCol) {
      var piece = this.getPieceById(pieceId);
      if (!piece) {
        return [];
      }

      var result = [];
      for (var i = 0; i < piece.shape.length; i++) {
        var r = anchorRow + piece.shape[i].dr;
        var c = anchorCol + piece.shape[i].dc;
        var screen = this.posToScreen(r, c);
        result.push({ r: r, c: c, x: screen.x, y: screen.y });
      }
      return result;
    },

    // ------------------------------------------------------------------
    // Adjacency and connectivity helpers
    // ------------------------------------------------------------------

    /**
     * Check if two positions are adjacent in the triangular grid.
     * @param {{r: number, c: number}} a
     * @param {{r: number, c: number}} b
     * @returns {boolean}
     */
    areAdjacent: function (a, b) {
      var dr = b.r - a.r;
      var dc = b.c - a.c;

      // Same row, adjacent columns
      if (dr === 0 && (dc === 1 || dc === -1)) return true;
      // One row down: c stays or c+1
      if (dr === 1 && (dc === 0 || dc === 1)) return true;
      // One row up: c stays or c-1
      if (dr === -1 && (dc === 0 || dc === -1)) return true;

      return false;
    },

    /**
     * Check if a set of positions forms a connected piece.
     * @param {Array<{r: number, c: number}>} cells
     * @returns {boolean}
     */
    isConnected: function (cells) {
      if (cells.length <= 1) return true;

      var visited = {};
      visited[0] = true;
      var queue = [0];
      var count = 1;

      while (queue.length > 0) {
        var idx = queue.shift();
        for (var j = 0; j < cells.length; j++) {
          if (!visited[j] && this.areAdjacent(cells[idx], cells[j])) {
            visited[j] = true;
            queue.push(j);
            count++;
          }
        }
      }

      return count === cells.length;
    },

    /**
     * Get all neighbors of a position that are valid board positions.
     * @param {number} r
     * @param {number} c
     * @returns {Array<{r: number, c: number}>}
     */
    getNeighbors: function (r, c) {
      var candidates = [
        { r: r, c: c - 1 },     // left
        { r: r, c: c + 1 },     // right
        { r: r - 1, c: c - 1 }, // upper-left
        { r: r - 1, c: c },     // upper-right
        { r: r + 1, c: c },     // lower-left
        { r: r + 1, c: c + 1 }, // lower-right
      ];

      var result = [];
      for (var i = 0; i < candidates.length; i++) {
        if (this.isValidPosition(candidates[i].r, candidates[i].c)) {
          result.push(candidates[i]);
        }
      }
      return result;
    },

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /**
     * Compute board geometry (center and top position).
     * Called when a level is loaded.
     * @private
     */
    _computeBoardGeometry: function () {
      if (this.validPositions.length === 0) {
        this._boardCenterX = 0;
        this._boardTopY = 0;
        return;
      }

      // Find the range of rows to determine board center
      var minRow = Infinity,
        maxRow = -Infinity;
      var minCol = Infinity,
        maxCol = -Infinity;

      for (var i = 0; i < this.validPositions.length; i++) {
        var pos = this.validPositions[i];
        if (pos.r < minRow) minRow = pos.r;
        if (pos.r > maxRow) maxRow = pos.r;
        if (pos.c < minCol) minCol = pos.c;
        if (pos.c > maxCol) maxCol = pos.c;
      }

      // Board center X: the point where row's middle column is at x=0
      // For a standard triangle (row r has cols 0..r), the center is at x = 0
      // when boardCenterX = 0. We'll use 0 as center and offset via viewBox.
      this._boardCenterX = 0;
      this._boardTopY = 0;
      this._maxRow = maxRow;
    },

    /**
     * Dispatch a custom event on the document.
     * @param {string} eventName
     * @param {Object} detail
     * @private
     */
    _dispatch: function (eventName, detail) {
      if (typeof document !== "undefined" && document.dispatchEvent) {
        var event;
        try {
          event = new CustomEvent(eventName, { detail: detail });
        } catch (e) {
          // Fallback for older browsers
          event = document.createEvent("CustomEvent");
          event.initCustomEvent(eventName, true, true, detail);
        }
        document.dispatchEvent(event);
      }
    },

    // ------------------------------------------------------------------
    // Constants exposed for external use
    // ------------------------------------------------------------------

    SPACING_X: SPACING_X,
    SPACING_Y: SPACING_Y,
    CIRCLE_RADIUS: CIRCLE_RADIUS,
    SNAP_THRESHOLD: SNAP_THRESHOLD,
    SNAP_PREVIEW_THRESHOLD: SNAP_PREVIEW_THRESHOLD,
    INVALID_PREVIEW_THRESHOLD: INVALID_PREVIEW_THRESHOLD,
  };

  // Export
  window.GameEngine = GameEngine;
})();
