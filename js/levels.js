/*
 * Guiyu - Handcrafted Level Data
 * =============================================
 * This file keeps the existing runtime contract intact:
 *   - window.Levels: array of level objects
 *
 * Internally it now organizes the data into:
 *   - boards
 *   - piece sets
 *   - handcrafted level blueprints
 *
 * Notes:
 *   - Only deterministic legality checks live here.
 *   - No solver, brute-force search, or background validation is used.
 *   - Solution entries keep an explicit rotation field for future hint / solver work.
 */

(function () {
  "use strict";

  var COLORS = [
    "#7BA7BC",
    "#BC7B8F",
    "#8FBC7B",
    "#BCB07B",
    "#9B7BBC",
    "#7BBCB0",
    "#BC957B",
    "#7B8FBC",
    "#BC7BAA",
    "#A0BC7B",
    "#7BBCA0",
    "#BC7B7B",
  ];

  var ROTATION_PATTERNS = {
    easy: [0, 1, 0, 1, 0, 1, 0, 1],
    medium: [1, 2, 0, 3, 1, 2, 0, 3],
    hard: [2, 4, 1, 3, 5, 2, 4, 1],
    expert: [5, 2, 4, 1, 3, 0, 5, 2],
  };

  function clonePositions(positions) {
    var result = [];
    for (var i = 0; i < positions.length; i++) {
      result.push({ r: positions[i].r, c: positions[i].c });
    }
    return result;
  }

  function cloneShape(shape) {
    var result = [];
    for (var i = 0; i < shape.length; i++) {
      result.push({ dr: shape[i].dr, dc: shape[i].dc });
    }
    return result;
  }

  function posKey(pos) {
    return pos.r + "," + pos.c;
  }

  function sortPositions(positions) {
    return positions.slice().sort(function (a, b) {
      if (a.r !== b.r) return a.r - b.r;
      return a.c - b.c;
    });
  }

  function dedupePositions(positions) {
    var seen = {};
    var result = [];
    for (var i = 0; i < positions.length; i++) {
      var key = posKey(positions[i]);
      if (!seen[key]) {
        seen[key] = true;
        result.push({ r: positions[i].r, c: positions[i].c });
      }
    }
    return sortPositions(result);
  }

  function normalizeRotation(rotation) {
    return ((rotation % 6) + 6) % 6;
  }

  function rotateShape(shape, rotation) {
    var turns = normalizeRotation(rotation);
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

  function cells(spec) {
    var tokens = spec.split(/\s+/);
    var result = [];

    for (var i = 0; i < tokens.length; i++) {
      if (!tokens[i]) continue;
      var parts = tokens[i].split(",");
      result.push({
        r: parseInt(parts[0], 10),
        c: parseInt(parts[1], 10),
      });
    }

    return result;
  }

  function positionsFromSpans(spans) {
    var positions = [];
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      for (var c = span.start; c <= span.end; c++) {
        positions.push({ r: span.r, c: c });
      }
    }
    return dedupePositions(positions);
  }

  function fullTriangle(numRows) {
    var spans = [];
    for (var r = 0; r < numRows; r++) {
      spans.push({ r: r, start: 0, end: r });
    }
    return positionsFromSpans(spans);
  }

  function maxRow(positions) {
    var value = 0;
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].r > value) {
        value = positions[i].r;
      }
    }
    return value;
  }

  function createBoard(id, name, positions) {
    var validPositions = dedupePositions(positions);
    return {
      id: id,
      name: name,
      rows: maxRow(validPositions) + 1,
      validPositions: validPositions,
    };
  }

  function areAdjacent(a, b) {
    var dr = b.r - a.r;
    var dc = b.c - a.c;

    if (dr === 0 && (dc === 1 || dc === -1)) return true;
    if (dr === 1 && (dc === 0 || dc === 1)) return true;
    if (dr === -1 && (dc === 0 || dc === -1)) return true;

    return false;
  }

  function isConnected(cellsToCheck) {
    if (!cellsToCheck || cellsToCheck.length <= 1) {
      return true;
    }

    var queue = [0];
    var visited = { 0: true };
    var seenCount = 1;

    while (queue.length > 0) {
      var index = queue.shift();
      for (var i = 0; i < cellsToCheck.length; i++) {
        if (!visited[i] && areAdjacent(cellsToCheck[index], cellsToCheck[i])) {
          visited[i] = true;
          queue.push(i);
          seenCount++;
        }
      }
    }

    return seenCount === cellsToCheck.length;
  }

  function normalizeSolvedCells(pieceCells) {
    var ordered = sortPositions(pieceCells);
    var anchor = ordered[0];
    var shape = [];

    for (var i = 0; i < ordered.length; i++) {
      shape.push({
        dr: ordered[i].r - anchor.r,
        dc: ordered[i].c - anchor.c,
      });
    }

    return {
      anchorRow: anchor.r,
      anchorCol: anchor.c,
      shape: shape,
    };
  }

  function shapeToAbsolute(shape, anchorRow, anchorCol) {
    var positions = [];
    for (var i = 0; i < shape.length; i++) {
      positions.push({
        r: anchorRow + shape[i].dr,
        c: anchorCol + shape[i].dc,
      });
    }
    return dedupePositions(positions);
  }

  function cloneBoardLibrary(boardLibrary) {
    var result = {};
    var ids = Object.keys(boardLibrary);

    for (var i = 0; i < ids.length; i++) {
      var board = boardLibrary[ids[i]];
      result[ids[i]] = {
        id: board.id,
        name: board.name,
        rows: board.rows,
        validPositions: clonePositions(board.validPositions),
      };
    }

    return result;
  }

  function clonePieceSetLibrary(pieceSetLibrary) {
    var result = {};
    var ids = Object.keys(pieceSetLibrary);

    for (var i = 0; i < ids.length; i++) {
      var setId = ids[i];
      result[setId] = [];

      for (var j = 0; j < pieceSetLibrary[setId].length; j++) {
        var piece = pieceSetLibrary[setId][j];
        result[setId].push({
          slot: piece.slot,
          size: piece.size,
          color: piece.color,
          shape: cloneShape(piece.shape),
        });
      }
    }

    return result;
  }

  function validateLevel(level) {
    var boardKeys = {};
    var boardKeyList = [];
    var totalPieceCells = 0;
    var covered = {};
    var coveredList = [];
    var pieceIds = [];
    var i;

    if (!level.validPositions || level.validPositions.length === 0) {
      throw new Error("Level " + level.id + " has no board cells.");
    }

    if (!isConnected(level.validPositions)) {
      throw new Error("Board for level " + level.id + " is disconnected.");
    }

    for (i = 0; i < level.validPositions.length; i++) {
      var boardKey = posKey(level.validPositions[i]);
      if (boardKeys[boardKey]) {
        throw new Error("Board for level " + level.id + " has duplicate cell " + boardKey + ".");
      }
      boardKeys[boardKey] = true;
      boardKeyList.push(boardKey);
    }

    for (i = 0; i < level.pieces.length; i++) {
      var piece = level.pieces[i];
      var shapeCells = [];
      totalPieceCells += piece.shape.length;
      pieceIds.push(piece.id);

      for (var j = 0; j < piece.shape.length; j++) {
        shapeCells.push({ r: piece.shape[j].dr, c: piece.shape[j].dc });
      }

      if (!isConnected(shapeCells)) {
        throw new Error("Piece " + piece.id + " in level " + level.id + " is disconnected.");
      }

      if (!level.solution[piece.id]) {
        throw new Error("Level " + level.id + " is missing a solution entry for " + piece.id + ".");
      }
    }

    if (totalPieceCells !== level.validPositions.length) {
      throw new Error(
        "Level " +
          level.id +
          " has " +
          totalPieceCells +
          " piece cells for " +
          level.validPositions.length +
          " board cells."
      );
    }

    for (i = 0; i < pieceIds.length; i++) {
      var pieceId = pieceIds[i];
      var placement = level.solution[pieceId];
      var placedPiece = null;

      for (var p = 0; p < level.pieces.length; p++) {
        if (level.pieces[p].id === pieceId) {
          placedPiece = level.pieces[p];
          break;
        }
      }

      if (!placedPiece) {
        throw new Error("Could not find piece " + pieceId + " while validating " + level.id + ".");
      }

      var solvedShape = rotateShape(placedPiece.shape, placement.rotation || 0);
      var absoluteCells = shapeToAbsolute(
        solvedShape,
        placement.anchorRow,
        placement.anchorCol
      );

      if (absoluteCells.length !== placedPiece.shape.length) {
        throw new Error("Piece " + pieceId + " in level " + level.id + " has duplicate solved cells.");
      }

      for (var a = 0; a < absoluteCells.length; a++) {
        var key = posKey(absoluteCells[a]);
        if (!boardKeys[key]) {
          throw new Error(
            "Piece " + pieceId + " in level " + level.id + " reaches invalid cell " + key + "."
          );
        }
        if (covered[key]) {
          throw new Error(
            "Pieces overlap at " + key + " while validating level " + level.id + "."
          );
        }
        covered[key] = pieceId;
        coveredList.push(key);
      }
    }

    boardKeyList.sort();
    coveredList.sort();

    if (boardKeyList.length !== coveredList.length) {
      throw new Error("Level " + level.id + " does not fully cover the board.");
    }

    for (i = 0; i < boardKeyList.length; i++) {
      if (boardKeyList[i] !== coveredList[i]) {
        throw new Error("Level " + level.id + " has a board/solution mismatch.");
      }
    }
  }

  var BOARD_LIBRARY = {
    triangle5: createBoard("triangle5", "小三角", fullTriangle(5)),
    triangle6: createBoard("triangle6", "中三角", fullTriangle(6)),
    triangle7: createBoard("triangle7", "大三角", fullTriangle(7)),
    diamond12: createBoard(
      "diamond12",
      "菱形",
      positionsFromSpans([
        { r: 1, start: 0, end: 1 },
        { r: 2, start: 0, end: 2 },
        { r: 3, start: 0, end: 3 },
        { r: 4, start: 1, end: 3 },
      ])
    ),
    rectangle16: createBoard(
      "rectangle16",
      "阶台矩形",
      positionsFromSpans([
        { r: 0, start: 0, end: 2 },
        { r: 1, start: 1, end: 3 },
        { r: 2, start: 1, end: 4 },
        { r: 3, start: 2, end: 4 },
        { r: 4, start: 2, end: 4 },
      ])
    ),
    cove18: createBoard(
      "cove18",
      "湾形凹口",
      positionsFromSpans([
        { r: 0, start: 0, end: 1 },
        { r: 1, start: 0, end: 2 },
        { r: 2, start: 0, end: 3 },
        { r: 3, start: 1, end: 3 },
        { r: 4, start: 1, end: 4 },
        { r: 5, start: 2, end: 3 },
      ])
    ),
    rhombus16: createBoard(
      "rhombus16",
      "斜菱形",
      positionsFromSpans([
        { r: 0, start: 0, end: 3 },
        { r: 1, start: 1, end: 4 },
        { r: 2, start: 2, end: 5 },
        { r: 3, start: 3, end: 6 },
      ])
    ),
    pennant15: createBoard(
      "pennant15",
      "短旗面",
      positionsFromSpans([
        { r: 1, start: 0, end: 1 },
        { r: 2, start: 0, end: 2 },
        { r: 3, start: 0, end: 3 },
        { r: 4, start: 1, end: 3 },
        { r: 5, start: 2, end: 4 },
      ])
    ),
    trapezoid18: createBoard(
      "trapezoid18",
      "宽梯形",
      positionsFromSpans([
        { r: 2, start: 0, end: 2 },
        { r: 3, start: 0, end: 3 },
        { r: 4, start: 0, end: 4 },
        { r: 5, start: 0, end: 5 },
      ])
    ),
    hex18: createBoard(
      "hex18",
      "六瓣棋盘",
      positionsFromSpans([
        { r: 0, start: 0, end: 2 },
        { r: 1, start: 0, end: 3 },
        { r: 2, start: 1, end: 4 },
        { r: 3, start: 1, end: 4 },
        { r: 4, start: 2, end: 4 },
      ])
    ),
    pennant18: createBoard(
      "pennant18",
      "长旗面",
      positionsFromSpans([
        { r: 1, start: 0, end: 1 },
        { r: 2, start: 0, end: 2 },
        { r: 3, start: 0, end: 3 },
        { r: 4, start: 1, end: 3 },
        { r: 5, start: 2, end: 4 },
        { r: 6, start: 3, end: 5 },
      ])
    ),
    ribbon18: createBoard(
      "ribbon18",
      "长廊矩形",
      positionsFromSpans([
        { r: 0, start: 0, end: 3 },
        { r: 1, start: 0, end: 4 },
        { r: 2, start: 1, end: 5 },
        { r: 3, start: 2, end: 5 },
      ])
    ),
    notch18: createBoard(
      "notch18",
      "缺角庭",
      positionsFromSpans([
        { r: 0, start: 1, end: 2 },
        { r: 1, start: 0, end: 3 },
        { r: 2, start: 0, end: 4 },
        { r: 3, start: 1, end: 4 },
        { r: 4, start: 3, end: 5 },
      ])
    ),
    wideRhombus20: createBoard(
      "wideRhombus20",
      "宽菱阵",
      positionsFromSpans([
        { r: 0, start: 0, end: 3 },
        { r: 1, start: 1, end: 4 },
        { r: 2, start: 2, end: 5 },
        { r: 3, start: 3, end: 6 },
        { r: 4, start: 4, end: 7 },
      ])
    ),
    harbor18: createBoard(
      "harbor18",
      "海湾阶岸",
      positionsFromSpans([
        { r: 0, start: 1, end: 2 },
        { r: 1, start: 0, end: 2 },
        { r: 2, start: 0, end: 4 },
        { r: 3, start: 1, end: 4 },
        { r: 4, start: 2, end: 5 },
      ])
    ),
    gallery25: createBoard(
      "gallery25",
      "长廊大矩形",
      positionsFromSpans([
        { r: 0, start: 0, end: 4 },
        { r: 1, start: 1, end: 5 },
        { r: 2, start: 1, end: 5 },
        { r: 3, start: 2, end: 6 },
        { r: 4, start: 2, end: 6 },
      ])
    ),
    crater24: createBoard(
      "crater24",
      "中空庭",
      dedupePositions(
        positionsFromSpans([
          { r: 0, start: 0, end: 4 },
          { r: 1, start: 1, end: 5 },
          { r: 2, start: 1, end: 5 },
          { r: 3, start: 2, end: 6 },
          { r: 4, start: 2, end: 6 },
        ]).filter(function (pos) {
          return !(pos.r === 2 && pos.c === 3);
        })
      )
    ),
    hex24: createBoard(
      "hex24",
      "大六瓣",
      positionsFromSpans([
        { r: 0, start: 0, end: 2 },
        { r: 1, start: 0, end: 3 },
        { r: 2, start: 0, end: 4 },
        { r: 3, start: 1, end: 5 },
        { r: 4, start: 2, end: 5 },
        { r: 5, start: 3, end: 5 },
      ])
    ),
    ridge25: createBoard(
      "ridge25",
      "长脊宽菱",
      positionsFromSpans([
        { r: 0, start: 0, end: 4 },
        { r: 1, start: 1, end: 5 },
        { r: 2, start: 2, end: 6 },
        { r: 3, start: 3, end: 7 },
        { r: 4, start: 4, end: 8 },
      ])
    ),
    runway30: createBoard(
      "runway30",
      "长桥走廊",
      positionsFromSpans([
        { r: 0, start: 0, end: 5 },
        { r: 1, start: 0, end: 6 },
        { r: 2, start: 1, end: 6 },
        { r: 3, start: 1, end: 6 },
        { r: 4, start: 2, end: 6 },
      ])
    ),
    notch32: createBoard(
      "notch32",
      "缺庭折岸",
      positionsFromSpans([
        { r: 0, start: 1, end: 4 },
        { r: 1, start: 0, end: 5 },
        { r: 2, start: 0, end: 6 },
        { r: 3, start: 1, end: 4 },
        { r: 4, start: 2, end: 6 },
        { r: 5, start: 3, end: 8 },
      ])
    ),
    orbit36: createBoard(
      "orbit36",
      "回环六域",
      positionsFromSpans([
        { r: 0, start: 0, end: 3 },
        { r: 1, start: 0, end: 4 },
        { r: 2, start: 0, end: 5 },
        { r: 3, start: 1, end: 6 },
        { r: 4, start: 2, end: 7 },
        { r: 5, start: 3, end: 7 },
        { r: 6, start: 4, end: 7 },
      ])
    ),
    citadel40: createBoard(
      "citadel40",
      "穹环王座",
      positionsFromSpans([
        { r: 0, start: 0, end: 4 },
        { r: 1, start: 0, end: 5 },
        { r: 2, start: 0, end: 6 },
        { r: 3, start: 1, end: 7 },
        { r: 4, start: 2, end: 7 },
        { r: 5, start: 3, end: 7 },
        { r: 6, start: 4, end: 7 },
      ])
    ),
    sanctum65: createBoard(
      "sanctum65",
      "回湾穹庭",
      positionsFromSpans([
        { r: 0, start: 0, end: 4 },
        { r: 1, start: 0, end: 5 },
        { r: 2, start: 0, end: 6 },
        { r: 3, start: 1, end: 7 },
        { r: 4, start: 1, end: 8 },
        { r: 5, start: 2, end: 9 },
        { r: 6, start: 2, end: 10 },
        { r: 7, start: 3, end: 10 },
        { r: 8, start: 4, end: 10 },
      ])
    ),
  };

  var PIECE_SET_LIBRARY = {
    set_triangle5_classic: [
      { cells: cells("0,0 1,0 1,1") },
      { cells: cells("2,0 2,1 3,0") },
      { cells: cells("2,2 3,2 3,3") },
      { cells: cells("3,1 4,0 4,1") },
      { cells: cells("4,2 4,3 4,4") },
    ],
    set_diamond12_classic: [
      { cells: cells("1,0 1,1 2,1") },
      { cells: cells("2,0 3,0 3,1") },
      { cells: cells("2,2 3,2 3,3") },
      { cells: cells("4,1 4,2 4,3") },
    ],
    set_rectangle16_terrace: [
      { cells: cells("0,0 0,1 1,1") },
      { cells: cells("0,2 1,2 1,3 2,3") },
      { cells: cells("2,1 2,2 3,2 4,2 4,3") },
      { cells: cells("2,4 3,3 3,4 4,4") },
    ],
    set_cove18_garden: [
      { cells: cells("0,0 0,1 1,1") },
      { cells: cells("1,0 2,0 2,1 3,1") },
      { cells: cells("1,2 2,2 2,3 3,3") },
      { cells: cells("3,2 4,1 4,2 5,2") },
      { cells: cells("4,3 4,4 5,3") },
    ],
    set_rhombus16_weave: [
      { cells: cells("0,0 0,1 0,2 1,1") },
      { cells: cells("0,3 1,3 1,4 2,4") },
      { cells: cells("1,2 2,2 2,3 3,3") },
      { cells: cells("2,5 3,4 3,5 3,6") },
    ],
    set_hex18_bloom: [
      { cells: cells("0,0 1,0 1,1 2,1") },
      { cells: cells("0,1 0,2 1,2 1,3") },
      { cells: cells("2,2 2,3 3,3 4,3") },
      { cells: cells("3,1 3,2 4,2") },
      { cells: cells("2,4 3,4 4,4") },
    ],
    set_triangle6_bands: [
      { cells: cells("0,0 1,0 1,1 2,1") },
      { cells: cells("2,0 3,0 3,1") },
      { cells: cells("2,2 3,2 3,3") },
      { cells: cells("4,0 4,1 4,2 4,3 4,4") },
      { cells: cells("5,0 5,1 5,2") },
      { cells: cells("5,3 5,4 5,5") },
    ],
    set_triangle6_guided: [
      { cells: cells("0,0 1,0 1,1") },
      { cells: cells("2,0 3,0 4,0 5,0 5,1") },
      { cells: cells("2,1 2,2 3,2 3,3") },
      { cells: cells("3,1 4,1 4,2 5,2") },
      { cells: cells("4,3 4,4 5,3 5,4 5,5") },
    ],
    set_pennant15: [
      { cells: cells("1,0 1,1 2,1 2,2") },
      { cells: cells("2,0 3,0 3,1 4,1") },
      { cells: cells("3,2 3,3 4,2 4,3") },
      { cells: cells("5,2 5,3 5,4") },
    ],
    set_trapezoid18_cascade: [
      { cells: cells("2,0 3,0 3,1 4,1") },
      { cells: cells("2,1 2,2 3,2 3,3 4,3") },
      { cells: cells("4,0 5,0 5,1") },
      { cells: cells("4,2 5,2 5,3") },
      { cells: cells("4,4 5,4 5,5") },
    ],
    set_pennant18_tail: [
      { cells: cells("1,0 1,1 2,1 2,2") },
      { cells: cells("2,0 3,0 3,1 4,1") },
      { cells: cells("3,2 3,3 4,2 4,3") },
      { cells: cells("5,2 5,3 5,4") },
      { cells: cells("6,3 6,4 6,5") },
    ],
    set_triangle7_strata: [
      { cells: cells("0,0 1,0 1,1 2,1") },
      { cells: cells("2,0 3,0 3,1") },
      { cells: cells("2,2 3,2 3,3") },
      { cells: cells("4,0 4,1 4,2 4,3 4,4") },
      { cells: cells("5,0 5,1 5,2 5,3 5,4") },
      { cells: cells("5,5 6,5 6,6") },
      { cells: cells("6,0 6,1 6,2 6,3 6,4") },
    ],
    set_triangle7_summit: [
      { cells: cells("0,0 1,0 1,1 2,1") },
      { cells: cells("2,0 3,0 4,0 4,1 5,1") },
      { cells: cells("2,2 3,2 3,3 4,3") },
      { cells: cells("3,1 4,2 5,2 5,3") },
      { cells: cells("4,4 5,4 5,5 6,5 6,6") },
      { cells: cells("5,0 6,0 6,1") },
      { cells: cells("6,2 6,3 6,4") },
    ],
    set_ribbon18_gallery: [
      { cells: cells("0,0 0,1 1,1") },
      { cells: cells("0,2 0,3 1,2 1,3") },
      { cells: cells("1,0 2,1 2,2 3,2") },
      { cells: cells("1,4 2,4 2,5 3,5") },
      { cells: cells("2,3 3,3 3,4") },
    ],
    set_notch18_corner: [
      { cells: cells("0,1 0,2 1,2") },
      { cells: cells("1,0 1,1 2,0 2,1") },
      { cells: cells("1,3 2,2 2,3 3,3") },
      { cells: cells("2,4 3,4 4,4 4,5") },
      { cells: cells("3,1 3,2 4,3") },
    ],
    set_widerhombus20_peak: [
      { cells: cells("0,0 0,1 1,1 1,2") },
      { cells: cells("0,2 0,3 1,3 1,4") },
      { cells: cells("2,2 2,3 3,3 4,4") },
      { cells: cells("2,4 2,5 3,4 3,5") },
      { cells: cells("3,6 4,5 4,6 4,7") },
    ],
    set_harbor18_drift: [
      { cells: cells("0,1 0,2 1,1") },
      { cells: cells("1,0 2,0 2,1 3,1") },
      { cells: cells("1,2 2,2 2,3 3,3") },
      { cells: cells("2,4 3,4 4,4 4,5") },
      { cells: cells("3,2 4,2 4,3") },
    ],
    set_gallery25_echo: [
      { cells: cells("0,0 0,1 0,2 1,1 1,2") },
      { cells: cells("0,3 0,4 1,3 1,4 2,3") },
      { cells: cells("1,5 2,4 2,5 3,5 3,6") },
      { cells: cells("2,1 2,2 3,2 3,3 4,2") },
      { cells: cells("3,4 4,3 4,4 4,5 4,6") },
    ],
    set_crater24_vault: [
      { cells: cells("0,0 0,1 1,1 2,1 2,2") },
      { cells: cells("0,2 0,3 1,2 1,3 1,4") },
      { cells: cells("0,4 1,5 2,4 2,5 3,5") },
      { cells: cells("3,2 3,3 4,2 4,3 4,4") },
      { cells: cells("3,4 3,6 4,5 4,6") },
    ],
    set_hex24_crown: [
      { cells: cells("0,0 0,1 1,0 1,1") },
      { cells: cells("0,2 1,2 1,3 2,3 2,4") },
      { cells: cells("2,0 2,1 3,1 3,2 4,2") },
      { cells: cells("2,2 3,3 3,4 4,3 5,3") },
      { cells: cells("3,5 4,4 4,5 5,4 5,5") },
    ],
    set_ridge25_spine: [
      { cells: cells("0,0 0,1 0,2 1,1 1,2") },
      { cells: cells("0,3 0,4 1,3 1,4 2,4") },
      { cells: cells("1,5 2,5 2,6 3,6 3,7") },
      { cells: cells("2,2 2,3 3,3 3,4 4,4") },
      { cells: cells("3,5 4,5 4,6 4,7 4,8") },
    ],
    set_runway30_bridge: [
      { cells: cells("0,0 0,1 1,0 1,1 1,2") },
      { cells: cells("0,2 0,3 0,4 0,5 1,5") },
      { cells: cells("1,3 1,4 2,3 2,4 3,4") },
      { cells: cells("1,6 2,5 2,6 3,5 3,6") },
      { cells: cells("2,1 2,2 3,1 3,2 4,2") },
      { cells: cells("3,3 4,3 4,4 4,5 4,6") },
    ],
    set_notch32_fold: [
      { cells: cells("0,1 1,0 1,1 1,2 2,0 2,1") },
      { cells: cells("0,2 0,3 0,4 1,3 1,4 1,5") },
      { cells: cells("2,2 2,3 3,1 3,2 3,3 4,2") },
      { cells: cells("2,4 2,5 2,6 3,4 4,4") },
      { cells: cells("4,3 5,3 5,4 5,5 5,6") },
      { cells: cells("4,5 4,6 5,7 5,8") },
    ],
    set_orbit36_weave: [
      { cells: cells("0,0 0,1 1,0 1,1 2,0 2,1") },
      { cells: cells("0,2 0,3 1,2 1,3 2,3 2,4") },
      { cells: cells("2,2 3,1 3,2 3,3 4,2 4,3") },
      { cells: cells("1,4 2,5 3,4 3,5 3,6 4,6") },
      { cells: cells("4,4 4,5 5,3 5,4 5,5 6,4") },
      { cells: cells("4,7 5,6 5,7 6,5 6,6 6,7") },
    ],
    set_citadel40_crown: [
      { cells: cells("0,0 0,1 1,0 1,1 2,0 2,1") },
      { cells: cells("0,2 0,3 0,4 1,2 1,3 1,4") },
      { cells: cells("1,5 2,4 2,5 2,6 3,5 3,6") },
      { cells: cells("2,2 2,3 3,1 3,2 3,3 4,2") },
      { cells: cells("3,4 4,3 4,4 4,5 5,4 5,5") },
      { cells: cells("3,7 4,6 4,7 5,6 5,7") },
      { cells: cells("5,3 6,4 6,5 6,6 6,7") },
    ],
    set_sanctum65_finale: [
      { cells: cells("0,0 0,1 1,0 1,1 2,1") },
      { cells: cells("0,2 0,3 1,2 1,3 2,2") },
      { cells: cells("0,4 1,4 1,5 2,4 2,5") },
      { cells: cells("2,0 3,1 3,2 4,1 4,2 5,2") },
      { cells: cells("2,3 3,3 3,4 4,3 5,3") },
      { cells: cells("2,6 3,5 3,6 4,6 4,7") },
      { cells: cells("3,7 4,8 5,8 5,9") },
      { cells: cells("4,4 4,5 5,4 5,5") },
      { cells: cells("5,6 5,7 6,6 6,7 7,7") },
      { cells: cells("6,2 6,3 7,3 7,4 8,4 8,5") },
      { cells: cells("6,4 6,5 7,5 7,6 8,6") },
      { cells: cells("6,8 6,9 7,8 8,7 8,8") },
      { cells: cells("6,10 7,9 7,10 8,9 8,10") },
    ],
  };

  var LEVEL_BLUEPRINTS = [
    {
      id: "small-triangle",
      name: "小三角",
      description: "紧凑清晰的起步关，先熟悉吸附节奏。",
      difficulty: "easy",
      boardId: "triangle5",
      pieceSetId: "set_triangle5_classic",
      colorOffset: 0,
      solutionRotations: [0, 0, 0, 0, 0],
      tags: ["入门", "三角", "免旋转"],
      notes: [
        "这一关几乎不用转向，先感受吸附和摆放的节奏。",
        "熟悉手感后，再去处理更复杂的棋盘会轻松很多。",
      ],
      audit: {
        rotationLoad: "none",
        deadEndRisk: "low",
        silhouetteVariety: "medium",
      },
    },
    {
      id: "diamond-spark",
      name: "菱光",
      description: "从中心向外铺开，第一次轻量接触旋转。",
      difficulty: "easy",
      boardId: "diamond12",
      pieceSetId: "set_diamond12_classic",
      colorOffset: 4,
      solutionRotations: [0, 1, 0, 0],
      tags: ["菱形", "旋转入门", "由中向外"],
      notes: [
        "只有一块明显需要转向，其他位置都比较顺眼。",
        "适合用来理解旋转和落点之间的关系。",
      ],
      audit: {
        rotationLoad: "low",
        deadEndRisk: "low",
        silhouetteVariety: "medium",
      },
    },
    {
      id: "terrace",
      name: "阶台",
      description: "阶梯矩形让大小不同的拼块更容易辨认。",
      difficulty: "easy",
      boardId: "rectangle16",
      pieceSetId: "set_rectangle16_terrace",
      colorOffset: 7,
      solutionRotations: [0, 0, 1, 0],
      tags: ["矩形", "行列阅读", "大小分明"],
      notes: [
        "棋盘更像台阶，空间变大但不会显得乱。",
        "先看大块，再补边角，读图会很顺。",
      ],
      audit: {
        rotationLoad: "low",
        deadEndRisk: "low",
        silhouetteVariety: "high",
      },
    },
    {
      id: "cove-garden",
      name: "湾园",
      description: "不规则凹口开始出现，但整体仍然温和。",
      difficulty: "easy",
      boardId: "cove18",
      pieceSetId: "set_cove18_garden",
      colorOffset: 9,
      solutionRotations: [0, 1, 0, 1, 0],
      tags: ["异形", "凹口", "轻不对称"],
      notes: [
        "先找凹进去的位置，再把边缘慢慢补齐。",
        "它看起来新鲜，但不会故意为难你。",
      ],
      audit: {
        rotationLoad: "low",
        deadEndRisk: "low",
        silhouetteVariety: "high",
      },
    },
    {
      id: "long-gallery",
      name: "长廊",
      description: "横向铺开的长矩形，需要你开始考虑左右展开。",
      difficulty: "medium",
      boardId: "ribbon18",
      pieceSetId: "set_ribbon18_gallery",
      colorOffset: 1,
      solutionRotations: [0, 1, 0, 1, 0],
      tags: ["长矩形", "横向阅读", "进阶起步"],
      notes: [
        "这一关不再靠三角直觉，而是更像在铺一条长廊。",
        "先稳住中段，再决定两端谁先落位。",
      ],
      audit: {
        rotationLoad: "low",
        deadEndRisk: "medium",
        silhouetteVariety: "high",
      },
    },
    {
      id: "rhombus-weave",
      name: "菱阵织影",
      description: "斜向阅读比数行更重要。",
      difficulty: "medium",
      boardId: "rhombus16",
      pieceSetId: "set_rhombus16_weave",
      colorOffset: 2,
      solutionRotations: [0, 1, 0, 1],
      tags: ["菱形", "对角线", "形状辨认"],
      notes: [
        "视线会被斜向拉走，读法会和矩形完全不同。",
        "逻辑不算狠，但空间节奏会很新鲜。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "low",
        silhouetteVariety: "high",
      },
    },
    {
      id: "corner-court",
      name: "转角庭",
      description: "缺角棋盘会不断提醒你留出转身空间。",
      difficulty: "medium",
      boardId: "notch18",
      pieceSetId: "set_notch18_corner",
      colorOffset: 3,
      solutionRotations: [0, 1, 0, 1, 0],
      tags: ["缺角", "转角", "边缘控制"],
      notes: [
        "先把转角附近理顺，再去填饱中间的空位。",
        "它是可读的，但更考验你别太早把路堵住。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "medium",
        silhouetteVariety: "medium",
      },
    },
    {
      id: "cascade",
      name: "叠瀑",
      description: "宽梯形更看重外框和落位顺序。",
      difficulty: "medium",
      boardId: "trapezoid18",
      pieceSetId: "set_trapezoid18_cascade",
      colorOffset: 7,
      solutionRotations: [0, 1, 0, 1, 0],
      tags: ["梯形", "次序", "外框"],
      notes: [
        "先看外轮廓，再让中间几块顺着落下来。",
        "难点在顺序，不在硬记旋转。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "medium",
        silhouetteVariety: "high",
      },
    },
    {
      id: "hex-bloom",
      name: "六瓣",
      description: "像花瓣一样的棋盘，边缘先读会更稳。",
      difficulty: "hard",
      boardId: "hex18",
      pieceSetId: "set_hex18_bloom",
      colorOffset: 10,
      solutionRotations: [0, 1, 0, 0, 1],
      tags: ["六边形", "边缘优先", "花瓣"],
      notes: [
        "别急着抢中心，先把外圈读顺会轻松很多。",
        "轮廓很特别，但拼块差异足够清楚。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "pennant",
      name: "旗影",
      description: "斜尾会改变你对锚点的直觉。",
      difficulty: "medium",
      boardId: "pennant15",
      pieceSetId: "set_pennant15",
      colorOffset: 5,
      solutionRotations: [0, 0, 1, 0],
      tags: ["旗面", "不对称", "锚点"],
      notes: [
        "先把主体立稳，再处理伸出去的那一截。",
        "这里的难点来自不对称，不是疯狂旋转。",
      ],
      audit: {
        rotationLoad: "low",
        deadEndRisk: "medium",
        silhouetteVariety: "high",
      },
    },
    {
      id: "tailwind",
      name: "长风旗",
      description: "更长的旗尾会持续把注意力拉向尖端。",
      difficulty: "hard",
      boardId: "pennant18",
      pieceSetId: "set_pennant18_tail",
      colorOffset: 1,
      solutionRotations: [0, 1, 0, 1, 1],
      tags: ["旗面", "挑战", "尾部压力"],
      notes: [
        "先稳住旗身，再去解尾巴。",
        "旋转当然重要，但不是整关唯一的事。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "high",
        silhouetteVariety: "medium",
      },
    },
    {
      id: "broad-rhombus",
      name: "宽菱峰",
      description: "更宽的菱形棋盘，把难点放在斜向规划上。",
      difficulty: "hard",
      boardId: "wideRhombus20",
      pieceSetId: "set_widerhombus20_peak",
      colorOffset: 6,
      solutionRotations: [0, 1, 2, 0, 1],
      tags: ["宽菱形", "规划", "大棋盘"],
      notes: [
        "棋盘变宽以后，左右两翼的先后手会更重要。",
        "它是终盘型难度，不再靠一堆小三角制造压力。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "harbor-steps",
      name: "海湾阶岸",
      description: "缺角又外扩的异形棋盘，会把计划感推到最后。",
      difficulty: "hard",
      boardId: "harbor18",
      pieceSetId: "set_harbor18_drift",
      colorOffset: 11,
      solutionRotations: [0, 1, 0, 1, 1],
      tags: ["异形", "缺口", "终盘规划"],
      notes: [
        "先看外沿和缺口的呼应，再决定哪块先占位。",
        "这更像成品关卡的收尾，而不是再来一个大三角。",
      ],
      audit: {
        rotationLoad: "medium",
        deadEndRisk: "high",
        silhouetteVariety: "medium",
      },
    },
    {
      id: "echo-gallery",
      name: "回声长廊",
      description: "更长的矩形棋盘，会把每一步的连锁影响拉得很远。",
      difficulty: "expert",
      boardId: "gallery25",
      pieceSetId: "set_gallery25_echo",
      colorOffset: 0,
      solutionRotations: [0, 2, 1, 3, 4],
      tags: ["专家", "长矩形", "长链路"],
      notes: [
        "中段看起来很宽松，但两端会把早期顺序全部放大。",
        "这已经不是看一块放一块，而是要提前想几步之后的走向。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "crater-vault",
      name: "中空穹庭",
      description: "中心留空以后，所有路线都必须学会绕行与让位。",
      difficulty: "expert",
      boardId: "crater24",
      pieceSetId: "set_crater24_vault",
      colorOffset: 4,
      solutionRotations: [1, 3, 0, 2, 4],
      tags: ["专家", "中空", "高压终盘"],
      notes: [
        "这里的难点不在棋盘变大，而在中央的空洞会不断干扰你的直觉。",
        "最后几格往往早在前半局就已经决定了能不能顺利收尾。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "crown-hex",
      name: "冠环六瓣",
      description: "更大的六边形布局会同时考验外圈节奏与中心时机。",
      difficulty: "expert",
      boardId: "hex24",
      pieceSetId: "set_hex24_crown",
      colorOffset: 8,
      solutionRotations: [0, 2, 4, 1, 3],
      tags: ["专家", "六瓣扩张", "多步旋转"],
      notes: [
        "外圈如果收得太快，中心就会变成真正的瓶颈。",
        "几块大件需要先预留转向空间，读法会比前面的六瓣明显更深。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "ridge-spine",
      name: "脊线长坡",
      description: "宽而斜的长脊棋盘，会把远距规划和顺序压得很实。",
      difficulty: "expert",
      boardId: "ridge25",
      pieceSetId: "set_ridge25_spine",
      colorOffset: 2,
      solutionRotations: [5, 2, 4, 1, 3],
      tags: ["专家", "脊线", "远距规划"],
      notes: [
        "左右两翼虽然都能先放，但真正合理的顺序很少。",
        "这是目前最依赖整体布局感的一关，而不是单点旋转技巧。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "bridge-runway",
      name: "桥脊长廊",
      description: "更长的主通道会把前几步的顺序影响一路放到终局。",
      difficulty: "expert",
      boardId: "runway30",
      pieceSetId: "set_runway30_bridge",
      colorOffset: 5,
      solutionRotations: [1, 3, 0, 4, 2, 5],
      tags: ["专家", "长矩形", "远距规划"],
      notes: [
        "中段像走廊一样宽，但真正危险的是两端会被后手不断锁死。",
        "几块长折角必须提前给出转身空间，否则后半局会非常紧。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "folded-court",
      name: "缺庭回折",
      description: "缺角与下沉尾部会把局面拆成多个彼此牵制的小区块。",
      difficulty: "expert",
      boardId: "notch32",
      pieceSetId: "set_notch32_fold",
      colorOffset: 9,
      solutionRotations: [2, 0, 4, 1, 5, 3],
      tags: ["专家", "缺角", "高压终盘"],
      notes: [
        "它看起来像多块区域，其实几乎每一块都在互相争路。",
        "如果太早封住回折区，最后往往只会剩下看似能放却转不开的大块。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "orbit-weave",
      name: "回环织影",
      description: "更大的六域棋盘开始要求连续几步都围绕同一个节奏推进。",
      difficulty: "expert",
      boardId: "orbit36",
      pieceSetId: "set_orbit36_weave",
      colorOffset: 1,
      solutionRotations: [5, 2, 4, 1, 3, 0],
      tags: ["专家", "六瓣扩张", "多步旋转"],
      notes: [
        "这里不是单块难，而是每一块都会逼你同时兼顾外环和内芯。",
        "你会频繁遇到需要先转好方向、再决定落点顺序的局面。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "citadel-crown",
      name: "穹环王座",
      description: "40 格主挑战盘会把远距规划、旋转顺序和终局压缩感一起推满。",
      difficulty: "expert",
      boardId: "citadel40",
      pieceSetId: "set_citadel40_crown",
      colorOffset: 7,
      solutionRotations: [4, 1, 5, 2, 0, 3, 1],
      tags: ["专家", "大棋盘", "远距规划"],
      notes: [
        "这是当前规模最大的棋盘，前半局的每一步都会影响很远的位置。",
        "如果说前面的专家关是深，这一关就是深而且长，必须真正做全局规划。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
    {
      id: "guiyu-finale",
      name: "归隅终局",
      description: "13 块拼块会在 65 格大盘里持续争夺转身空间，是当前整套内容的压轴挑战。",
      difficulty: "expert",
      boardId: "sanctum65",
      pieceSetId: "set_sanctum65_finale",
      colorOffset: 9,
      solutionRotations: [4, 1, 5, 2, 0, 3, 1, 4, 2, 5, 1, 3, 0],
      tags: ["终局挑战", "超大棋盘", "大师终局"],
      notes: [
        "这不是单纯把棋盘做大，而是让长短拼块在同一块盘里不断争路、抢角和互相锁死。",
        "前半局的顺序会深刻影响后半局的转身空间，真正的难点在全局规划，而不是盲目试错。",
      ],
      audit: {
        rotationLoad: "high",
        deadEndRisk: "high",
        silhouetteVariety: "high",
      },
    },
  ];

  var PUBLIC_PIECE_SETS = {};

  function buildLevel(blueprint, levelIndex) {
    var board = BOARD_LIBRARY[blueprint.boardId];
    var recipes = PIECE_SET_LIBRARY[blueprint.pieceSetId];
    var pieces = [];
    var solution = {};
    var publicSet = [];
    var pattern = ROTATION_PATTERNS[blueprint.difficulty] || ROTATION_PATTERNS.easy;

    if (!board) {
      throw new Error("Unknown boardId: " + blueprint.boardId);
    }

    if (!recipes || recipes.length === 0) {
      throw new Error("Unknown or empty pieceSetId: " + blueprint.pieceSetId);
    }

    for (var i = 0; i < recipes.length; i++) {
      var recipe = recipes[i];
      var normalized = normalizeSolvedCells(recipe.cells);
      var solutionRotation =
        recipe.rotation !== undefined
          ? normalizeRotation(recipe.rotation)
          : blueprint.solutionRotations && blueprint.solutionRotations[i] !== undefined
            ? normalizeRotation(blueprint.solutionRotations[i])
          : normalizeRotation(pattern[i % pattern.length]);
      var baseShape = rotateShape(normalized.shape, -solutionRotation);
      var pieceId = blueprint.id + "-p" + (i + 1);
      var color = recipe.color || COLORS[(blueprint.colorOffset + i + levelIndex) % COLORS.length];

      pieces.push({
        id: pieceId,
        shape: baseShape,
        color: color,
      });

      solution[pieceId] = {
        anchorRow: normalized.anchorRow,
        anchorCol: normalized.anchorCol,
        rotation: solutionRotation,
      };

      publicSet.push({
        slot: i + 1,
        size: baseShape.length,
        color: color,
        shape: cloneShape(baseShape),
      });
    }

    var level = {
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description,
      difficulty: blueprint.difficulty,
      tags: blueprint.tags ? blueprint.tags.slice() : [],
      notes: blueprint.notes ? blueprint.notes.slice() : [],
      audit: blueprint.audit
        ? {
            rotationLoad: blueprint.audit.rotationLoad || "medium",
            deadEndRisk: blueprint.audit.deadEndRisk || "medium",
            silhouetteVariety: blueprint.audit.silhouetteVariety || "medium",
          }
        : null,
      rows: board.rows,
      boardId: blueprint.boardId,
      pieceSetId: blueprint.pieceSetId,
      validPositions: clonePositions(board.validPositions),
      pieces: pieces,
      solution: solution,
    };

    validateLevel(level);

    if (!PUBLIC_PIECE_SETS[blueprint.pieceSetId]) {
      PUBLIC_PIECE_SETS[blueprint.pieceSetId] = publicSet;
    }

    return level;
  }

  var levels = [];
  for (var i = 0; i < LEVEL_BLUEPRINTS.length; i++) {
    levels.push(buildLevel(LEVEL_BLUEPRINTS[i], i));
  }

  window.LevelBoards = cloneBoardLibrary(BOARD_LIBRARY);
  window.LevelPieceSets = clonePieceSetLibrary(PUBLIC_PIECE_SETS);
  window.Levels = levels;
})();
