/*
  Draws the sky on an 8px dot lattice, with windows on a 16px grid centred in each building.
  Coordinates are in the Figma frame (1440 wide, ground bar at y = 856). layout() maps them
  to the page: the city sits on the ground bar and mirrors outward on wider screens.
*/
(() => {
  const FRAME_WIDTH = 1440;
  const GROUND_Y = 856;
  const PITCH = 8;
  const WINDOW_W = 8;
  const WINDOW_H = 10;
  const WINDOW_PITCH = 16;
  const GLOW_SIZE = 44;
  const RING_RADIUS = 10;
  const NARROW_CENTRE = 1015;
  const WHITE = "#ffffff";
  const INDIGO = "#a5b4fc";
  const PINK = "#f472b6";
  const MAGENTA = "#d946ef";
  const COLOURS = [WHITE, WHITE, WHITE, INDIGO, INDIGO, PINK, PINK, MAGENTA];

  // Same massing as the Figma "Buildings" layers. [x, width, top, facade, crown]
  const GHOSTS = [
    [32, 72, 520], [216, 56, 552], [424, 56, 496], [616, 64, 520],
    [872, 64, 544], [1112, 56, 480], [1256, 48, 528], [1368, 56, 512],
  ];
  const BACK = [
    [-16, 88, 744, "pin"], [80, 56, 720, "half"], [136, 48, 752, "floors"], [184, 80, 704, "pin"],
    [272, 32, 752, "dots"], [304, 64, 704, "half"], [368, 40, 704, "floors", "slant-right"], [408, 56, 736, "pin"],
    [464, 64, 696, "half", "slant-left"], [536, 48, 720, "floors"], [584, 56, 720, "pin"], [640, 32, 720, "dots"],
    [680, 80, 656, "half"], [768, 32, 648, "pin", "antenna"], [800, 48, 648, "floors"], [848, 56, 752, "pin"],
    [904, 32, 752, "dots"], [936, 96, 632, "half", "slant-left"], [1032, 64, 608, "pin", "antenna"], [1096, 72, 760, "floors"],
    [1168, 48, 656, "half"], [1216, 72, 760, "pin"], [1288, 56, 664, "half", "slant-right"], [1344, 56, 728, "floors"],
    [1408, 72, 768, "pin"],
  ];
  const FRONT = [
    [-16, 48, 808, "dots"], [32, 56, 816, "dots"], [88, 56, 792, "half"], [152, 64, 808, "dots"],
    [216, 88, 800, "floors"], [304, 48, 792, "dots"], [352, 96, 808, "half"], [448, 72, 808, "dots"],
    [520, 48, 752, "dots"], [568, 56, 744, "half", "slant-right"], [624, 40, 776, "dots"], [664, 88, 776, "floors"],
    [752, 72, 712, "half"], [824, 48, 776, "dots"], [872, 88, 712, "dots", "slant-left"], [960, 48, 792, "half"],
    [1016, 96, 800, "dots"], [1112, 80, 800, "floors"], [1192, 40, 688, "half", "antenna"], [1232, 40, 752, "dots"],
    [1272, 48, 704, "half"], [1320, 48, 696, "dots", "slant-right"], [1368, 88, 800, "floors"],
  ];

  // Each card's tether ends on the window nearest one of these points, and moves to the next point
  // whenever the card changes job. elbowY is where the line turns. Stacked layouts use closer points.
  const TARGETS_WIDE = [
    [{ x: 1043, y: 635, elbowY: 427 }, { x: 1080, y: 700, elbowY: 484 }, { x: 1000, y: 680, elbowY: 484 }, { x: 1064, y: 760, elbowY: 484 }],
    [{ x: 1203, y: 699 }, { x: 1300, y: 720 }, { x: 1176, y: 750 }, { x: 1250, y: 780 }],
    [{ x: 827, y: 691, elbowY: 575 }, { x: 900, y: 740 }, { x: 760, y: 700 }, { x: 860, y: 790 }],
  ];
  const TARGETS_STACKED = [
    [{ x: 1059, y: 635 }, { x: 1000, y: 680 }, { x: 1080, y: 700 }],
    [{ x: 1123, y: 779 }, { x: 1176, y: 750 }, { x: 1150, y: 700 }],
    [{ x: 859, y: 767 }, { x: 900, y: 740 }, { x: 780, y: 700 }],
  ];
  const TETHER_COLOURS = [PINK, INDIGO, PINK];

  // How the cards change job: lines pull back, text scrambles, then lines reach a new window.
  const HOLD = 5600; // ms each set of jobs stays up
  const RETRACT = 450;
  const SCRAMBLE = 900;
  const LIGHT = 350;
  const REACH = 650;
  const STAGGER = 160; // between cards
  const FORCED_WINDOWS = [
    [1043, 635, PINK], [1059, 635, WHITE], [1203, 699, INDIGO], [1219, 699, WHITE],
    [827, 691, PINK], [827, 707, PINK], [1123, 779, INDIGO], [859, 767, PINK],
  ];

  const hero = document.querySelector("[data-hero]");
  const stage = document.querySelector("[data-stage]");
  const copy = document.querySelector("[data-copy]");
  const ground = document.querySelector("[data-ground]");
  const sceneCanvas = document.querySelector("[data-scene]");
  const fxCanvas = document.querySelector("[data-fx]");
  const roleCards = [...document.querySelectorAll("[data-role]")];
  const scene = sceneCanvas.getContext("2d");
  const fx = fxCanvas.getContext("2d");
  const wideLayout = window.matchMedia("(min-width: 1120px)");

  const glowSprites = new Map();

  let width = 0;
  let height = 0;
  let ratio = 1;
  let originX = 0;
  let originY = 0;
  let visibleTwinkles = [];
  let darkCells = [];
  let arrivals = [];
  let nextArrival = 0;
  let lastFrame = 0;
  let frameId = 0;

  // Seeded, so the city looks the same on every visit and every resize.
  function seededRandom(seed) {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function placeInTile([x, w, top, facade, crown], tile) {
    if (tile % 2 === 0) return { x: x + FRAME_WIDTH * tile, w, top, facade, crown };
    const flipped = { "slant-left": "slant-right", "slant-right": "slant-left" }[crown] ?? crown;
    return { x: FRAME_WIDTH * (tile + 1) - x - w, w, top, facade, crown: flipped };
  }

  const inside = (px, py, b) => px >= b.x && px < b.x + b.w && py >= b.top;
  const latticeStart = (value) => Math.ceil((value - 3) / PITCH) * PITCH + 3;

  function buildModel() {
    const random = seededRandom(20261105);
    const tiles = [-3, -2, -1, 0, 1, 2, 3];
    const ghosts = tiles.flatMap((tile) => GHOSTS.map((item) => placeInTile(item, tile)));
    const back = tiles.flatMap((tile) => BACK.map((item) => placeInTile(item, tile)));
    const front = tiles.flatMap((tile) => FRONT.map((item) => placeInTile(item, tile)));

    const roofAt = (b, x) => {
      const drop = Math.min(24, b.w / 2);
      const along = (x - b.x) / b.w;
      if (b.crown === "slant-left") return b.top + drop * (1 - along);
      if (b.crown === "slant-right") return b.top + drop * along;
      return b.top;
    };
    const covers = (x, y, other) => x + WINDOW_W / 2 > other.x && x - WINDOW_W / 2 < other.x + other.w && y + WINDOW_H / 2 + 2 > other.top;

    // Columns are centred in the building and rows hang from its roof.
    const cellsFor = (buildings, hiddenBy) => buildings.flatMap((b) => {
      const columns = Math.floor((b.w - 8) / WINDOW_PITCH);
      const firstX = b.x + (b.w - (columns * WINDOW_PITCH - (WINDOW_PITCH - WINDOW_W))) / 2 + WINDOW_W / 2;
      const cells = [];
      for (let y = b.top + 16; y + WINDOW_H / 2 < GROUND_Y - 6; y += WINDOW_PITCH) {
        for (let column = 0; column < columns; column += 1) {
          const x = firstX + column * WINDOW_PITCH;
          if (y - WINDOW_H / 2 < roofAt(b, x) + 6 || hiddenBy.some((other) => covers(x, y, other))) continue;
          cells.push({ x, y });
        }
      }
      return cells;
    });

    const backCells = cellsFor(back, front);
    const frontCells = cellsFor(front, []);
    const allCells = [...backCells, ...frontCells];
    const nearestCell = (x, y) => allCells.reduce((best, cell) => (Math.hypot(cell.x - x, cell.y - y) < Math.hypot(best.x - x, best.y - y) ? cell : best));

    FORCED_WINDOWS.forEach(([x, y, colour]) => {
      nearestCell(x, y).colour = colour;
    });
    const snapTarget = (target) => {
      const cell = nearestCell(target.x, target.y);
      return { x: cell.x, y: cell.y, elbowY: target.elbowY ?? 0 };
    };
    const targetsWide = TARGETS_WIDE.map((slot) => slot.map(snapTarget));
    const targetsStacked = TARGETS_STACKED.map((slot) => slot.map(snapTarget));

    const light = (cells, chance) => {
      const lit = [];
      const dark = [];
      cells.forEach((cell) => {
        if (cell.colour) lit.push({ ...cell, twinkle: false });
        else if (random() < chance) lit.push({ ...cell, colour: COLOURS[Math.floor(random() * COLOURS.length)], twinkle: random() < 0.22, phase: random() * 6.28, rate: 0.5 + random() });
        else dark.push(cell);
      });
      return { lit, dark };
    };
    const backLights = light(backCells, 0.3);
    const frontLights = light(frontCells, 0.34);

    // Mostly pinpricks, with a few bright stars and the odd four-point sparkle.
    const starRandom = seededRandom(1969);
    const oneTile = Array.from({ length: 190 }, () => {
      const roll = starRandom();
      let radius;
      if (roll < 0.52) radius = 0.5 + starRandom() * 0.4;
      else if (roll < 0.8) radius = 1 + starRandom() * 0.5;
      else if (roll < 0.94) radius = 1.7 + starRandom() * 0.8;
      else radius = 5 + starRandom() * 6;
      return {
        x: 40 + starRandom() * (FRAME_WIDTH - 80), // Clear of the mirror line, so no star gets a twin.
        y: 60 + starRandom() * 720,
        radius,
        alpha: 0.5 + starRandom() * 0.5,
        colour: COLOURS[Math.floor(starRandom() * COLOURS.length)],
      };
    });
    const stars = tiles.flatMap((tile) => oneTile.map((star) => ({
      ...star,
      x: tile % 2 === 0 ? star.x + FRAME_WIDTH * tile : FRAME_WIDTH * (tile + 1) - star.x,
    })));

    const antennas = [...back, ...front]
      .filter((b) => b.crown === "antenna")
      .map((b) => ({ x: b.x + Math.floor(b.w / 2 / PITCH) * PITCH + 3, y: b.top - 28, phase: b.x * 0.01 }));

    return {
      ghosts,
      back,
      front,
      backWindows: backLights.lit,
      frontWindows: frontLights.lit,
      backDark: backLights.dark,
      frontDark: frontLights.dark,
      targetsWide,
      targetsStacked,
      stars,
      antennas,
    };
  }

  const model = buildModel();

  const toX = (x) => x + originX;
  const toY = (y) => y + originY;
  const onScreen = (b) => toX(b.x + b.w) > -8 && toX(b.x) < width + 8;
  const smoothstep = (a, b, v) => {
    const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };

  function hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function glow(colour) {
    if (glowSprites.has(colour)) return glowSprites.get(colour);
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const c = sprite.getContext("2d");
    const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, g, b] = hexToRgb(colour);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    gradient.addColorStop(0.35, `rgba(${r},${g},${b},0.16)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
    glowSprites.set(colour, sprite);
    return sprite;
  }

  function drawWindow(c, win, alpha = 1) {
    const x = toX(win.x);
    const y = toY(win.y);
    c.globalAlpha = alpha;
    c.globalCompositeOperation = "lighter";
    c.drawImage(glow(win.colour), x - GLOW_SIZE / 2, y - GLOW_SIZE / 2, GLOW_SIZE, GLOW_SIZE);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = win.colour;
    c.beginPath();
    c.roundRect(x - WINDOW_W / 2, y - WINDOW_H / 2, WINDOW_W, WINDOW_H, 1);
    c.fill();
    c.globalAlpha = 1;
  }

  // Unlit panes, so every building reads as a grid of windows.
  function drawDarkWindows(c, cells, alpha) {
    c.fillStyle = `rgba(199,210,254,${alpha})`;
    cells.forEach((cell) => {
      c.beginPath();
      c.roundRect(toX(cell.x) - WINDOW_W / 2, toY(cell.y) - WINDOW_H / 2, WINDOW_W, WINDOW_H, 1);
      c.fill();
    });
  }

  // How far a sky dot is from the copy, so the text never has dots running behind it.
  function copyFade(copyBox, x, y) {
    const dx = Math.max(copyBox.left - x, 0, x - copyBox.right);
    const dy = Math.max(copyBox.top - y, 0, y - copyBox.bottom);
    return smoothstep(0, 96, Math.hypot(dx, dy));
  }

  // Halftone sky: dots swell toward the horizon along a slow wave, like the stream's fixed-level dots.
  function drawSky(c, copyBox) {
    const firstY = latticeStart(248);
    const firstX = latticeStart(-originX);
    for (let y = firstY; y < GROUND_Y; y += PITCH) {
      const depth = smoothstep(248, 830, y);
      for (let x = firstX; toX(x) < width; x += PITCH) {
        const fade = copyFade(copyBox, toX(x), toY(y));
        if (fade <= 0) continue;
        const wave = 0.5 + 0.5 * Math.sin(x * 0.0105 + 1.8 * Math.sin(y * 0.012 + x * 0.0024));
        const radius = (0.35 + 1.25 * depth ** 1.7) * (0.55 + 0.6 * wave);
        const alpha = (0.1 + 0.55 * depth ** 1.2) * (0.55 + 0.45 * wave) * fade;
        const warm = smoothstep(0.55, 1, depth);
        c.fillStyle = `rgba(${Math.round(165 + 75 * warm)},${Math.round(180 - 10 * warm)},${Math.round(252)},${alpha})`;
        c.beginPath();
        c.arc(toX(x), toY(y), radius, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function drawStars(c, copyBox) {
    model.stars.forEach((star) => {
      const x = toX(star.x);
      const y = toY(star.y);
      if (x < -20 || x > width + 20) return;
      const fade = copyFade(copyBox, x, y);
      if (fade <= 0) return;
      const r = star.radius;
      c.globalAlpha = star.alpha * fade;
      if (r > 1.6) {
        const halo = r > 4 ? r * 4 : r * 7;
        c.globalCompositeOperation = "lighter";
        c.drawImage(glow(star.colour), x - halo / 2, y - halo / 2, halo, halo);
        c.globalCompositeOperation = "source-over";
      }
      c.fillStyle = star.colour;
      c.beginPath();
      if (r > 4) {
        c.moveTo(x, y - r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.quadraticCurveTo(x, y, x, y + r);
        c.quadraticCurveTo(x, y, x - r, y);
        c.quadraticCurveTo(x, y, x, y - r);
      } else {
        c.arc(x, y, r, 0, Math.PI * 2);
      }
      c.fill();
      c.globalAlpha = 1;
    });
  }

  // Pale towers drawn only as a dotted outline: the same "not yet enriched" dots as the stream cards.
  function drawGhosts(c, copyBox) {
    model.ghosts.filter(onScreen).forEach((b) => {
      const left = latticeStart(b.x);
      const right = latticeStart(b.x + b.w - PITCH);
      const top = latticeStart(b.top);
      for (let y = top; y < GROUND_Y; y += PITCH) {
        for (let x = left; x <= right; x += PITCH) {
          const edge = x === left || x === right || y === top;
          const fade = copyFade(copyBox, toX(x), toY(y));
          c.fillStyle = `rgba(224,231,255,${(edge ? 0.62 : 0.1) * fade})`;
          c.beginPath();
          c.arc(toX(x), toY(y), edge ? 1.15 : 0.9, 0, Math.PI * 2);
          c.fill();
        }
      }
    });
  }

  function tracePath(c, b, radius) {
    const left = toX(b.x);
    const right = toX(b.x + b.w);
    const top = toY(b.top);
    const bottom = toY(GROUND_Y + 8);
    const drop = Math.min(24, b.w / 2);
    const leftTop = b.crown === "slant-left" ? top + drop : top;
    const rightTop = b.crown === "slant-right" ? top + drop : top;
    c.beginPath();
    c.moveTo(left, bottom);
    c.lineTo(left, leftTop + radius);
    c.quadraticCurveTo(left, leftTop, left + radius, leftTop + (leftTop === rightTop ? 0 : radius * (rightTop - leftTop) / b.w));
    c.lineTo(right - radius, rightTop + (leftTop === rightTop ? 0 : radius * (leftTop - rightTop) / b.w));
    c.quadraticCurveTo(right, rightTop, right, rightTop + radius);
    c.lineTo(right, bottom);
  }

  function drawFacade(c, b, tint, strength) {
    if (b.facade === "dots") return; // The window grid is this building's whole facade.
    const firstX = latticeStart(b.x + 2);
    const firstY = latticeStart(b.top + 4);
    const rows = Math.max(GROUND_Y - b.top, 1);
    if (b.facade === "pin") {
      c.lineWidth = 1;
      for (let x = firstX; x < b.x + b.w; x += PITCH) {
        const line = c.createLinearGradient(0, toY(b.top), 0, toY(b.top + 150));
        line.addColorStop(0, `rgba(${tint},${0.34 * strength})`);
        line.addColorStop(1, `rgba(${tint},${0.05 * strength})`);
        c.strokeStyle = line;
        c.beginPath();
        c.moveTo(toX(x) + 0.5, toY(b.top));
        c.lineTo(toX(x) + 0.5, toY(GROUND_Y));
        c.stroke();
      }
      return;
    }
    if (b.facade === "floors") {
      c.lineWidth = 1;
      for (let y = firstY; y < GROUND_Y; y += PITCH) {
        const fall = 1 - (y - b.top) / rows;
        c.strokeStyle = `rgba(${tint},${(0.05 + 0.24 * fall) * strength})`;
        c.beginPath();
        c.moveTo(toX(b.x), toY(y) + 0.5);
        c.lineTo(toX(b.x + b.w), toY(y) + 0.5);
        c.stroke();
      }
      return;
    }
    for (let y = firstY; y < GROUND_Y; y += PITCH) {
      const fall = 1 - (y - b.top) / rows;
      const radius = b.facade === "half" ? 0.35 + 1.45 * fall ** 1.5 : 0.85;
      const alpha = b.facade === "half" ? 0.14 + 0.46 * fall : 0.2;
      c.fillStyle = `rgba(${tint},${alpha * strength})`;
      for (let x = firstX; x < b.x + b.w; x += PITCH) {
        c.beginPath();
        c.arc(toX(x), toY(y), radius, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function drawBuilding(c, b, { fillTop, fillBottom, tint, strength, rim }) {
    const fill = c.createLinearGradient(0, toY(b.top), 0, toY(GROUND_Y));
    fill.addColorStop(0, fillTop);
    fill.addColorStop(1, fillBottom);

    c.save();
    tracePath(c, b, 4);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.clip();
    drawFacade(c, b, tint, strength);
    c.restore();

    // Hairline rim light that dies away down the building.
    const rimLine = c.createLinearGradient(0, toY(b.top), 0, toY(b.top + 110));
    rimLine.addColorStop(0, rim);
    rimLine.addColorStop(1, "rgba(129,140,248,0)");
    tracePath(c, b, 4);
    c.strokeStyle = rimLine;
    c.lineWidth = 1;
    c.stroke();

    if (b.crown === "antenna") {
      const mast = toX(b.x + Math.floor(b.w / 2 / PITCH) * PITCH + 3) + 0.5;
      c.strokeStyle = rim;
      c.beginPath();
      c.moveTo(mast, toY(b.top));
      c.lineTo(mast, toY(b.top - 28));
      c.stroke();
    }
  }

  function renderScene() {
    const copyRect = copy.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const copyBox = {
      left: copyRect.left - heroRect.left,
      right: copyRect.right - heroRect.left,
      top: copyRect.top - heroRect.top,
      bottom: copyRect.bottom - heroRect.top,
    };

    const c = scene;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);

    drawSky(c, copyBox);
    drawStars(c, copyBox);
    drawGhosts(c, copyBox);

    const backStyle = { fillTop: "#2a2596", fillBottom: "#14114f", tint: "165,180,252", strength: 1, rim: "rgba(199,210,254,0.85)" };
    const frontStyle = { fillTop: "#0d0f33", fillBottom: "#040616", tint: "165,180,252", strength: 0.8, rim: "rgba(244,114,182,0.8)" };
    const backVisible = model.back.filter(onScreen);
    const frontVisible = model.front.filter(onScreen);

    backVisible.forEach((b) => drawBuilding(c, b, backStyle));
    drawDarkWindows(c, model.backDark, 0.16);
    model.backWindows.forEach((win) => !win.twinkle && drawWindow(c, win));

    frontVisible.forEach((b) => drawBuilding(c, b, frontStyle));
    drawDarkWindows(c, model.frontDark, 0.13);
    model.frontWindows.forEach((win) => !win.twinkle && drawWindow(c, win));
  }

  function cardBox(card) {
    const heroRect = hero.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    return { left: rect.left - heroRect.left, right: rect.right - heroRect.left, top: rect.top - heroRect.top, bottom: rect.bottom - heroRect.top };
  }

  // In the wide layout the first card's line drops through the gap between the other two cards.
  function routeTether(index, target, wide) {
    const box = cardBox(roleCards[index]);
    const endX = toX(target.x);
    const endY = toY(target.y) - RING_RADIUS;
    let startX = (box.left + box.right) / 2;
    if (wide && index === 0) {
      const lower = cardBox(roleCards[2]).right + 12;
      const upper = cardBox(roleCards[1]).left - 12;
      startX = Math.min(Math.max(startX, lower), upper, box.right - 20);
    }
    if (!wide || Math.abs(startX - endX) <= PITCH) {
      startX = Math.min(Math.max(endX, box.left + 20), box.right - 20);
    }
    const points = Math.abs(startX - endX) < 1
      ? [[endX, box.bottom], [endX, endY]]
      : (() => {
          const elbow = wide && target.elbowY ? toY(target.elbowY) : (box.bottom + endY) / 2;
          return [[startX, box.bottom], [startX, elbow], [endX, elbow], [endX, endY]];
        })();
    return points.map(([x, y]) => [Math.round(x) + 0.5, y]);
  }

  // Tether state lives here, so a resize mid-change keeps each card on its current window.
  const slots = roleCards.map((card, index) => ({ card, index, choice: 0, points: [], drawn: 1, lit: 1, hover: false }));

  function targetFor(slot) {
    const list = (wideLayout.matches ? model.targetsWide : model.targetsStacked)[slot.index];
    return list[slot.choice % list.length];
  }

  function buildTethers() {
    const wide = wideLayout.matches;
    slots.forEach((slot) => {
      slot.points = routeTether(slot.index, targetFor(slot), wide);
    });
  }

  roleCards.forEach((card, index) => {
    card.addEventListener("mouseenter", () => { slots[index].hover = true; });
    card.addEventListener("mouseleave", () => { slots[index].hover = false; });
  });

  function polylineLength(points) {
    return points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0);
  }

  // Draws the first `share` of the line, measured from the card.
  function drawTether(c, slot) {
    const points = slot.points;
    if (points.length < 2 || slot.drawn <= 0) return;
    let remaining = polylineLength(points) * slot.drawn;
    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = 1;
    c.strokeStyle = `rgba(255,255,255,${slot.hover ? 1 : 0.7})`;
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length && remaining > 0; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const length = Math.hypot(x1 - x0, y1 - y0);
      const share = Math.min(1, remaining / length);
      c.lineTo(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
      remaining -= length;
    }
    c.stroke();
    c.restore();

    const target = targetFor(slot);
    const ringAlpha = smoothstep(0.85, 1, slot.drawn);
    if (ringAlpha > 0) {
      c.globalAlpha = ringAlpha;
      c.strokeStyle = "#fff";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(toX(target.x), toY(target.y), RING_RADIUS, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  function layout() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    const heroRect = hero.getBoundingClientRect();
    width = Math.round(heroRect.width);
    height = Math.round(heroRect.height);
    [sceneCanvas, fxCanvas].forEach((canvas) => {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    });

    const stageRect = stage.getBoundingClientRect();
    // Wide layouts keep the city locked to the right edge of the content, like the roles.
    originX = wideLayout.matches ? Math.round(stageRect.right - heroRect.left - 1360) : Math.round(width / 2 - NARROW_CENTRE);
    originY = Math.round(ground.getBoundingClientRect().top - heroRect.top - GROUND_Y);

    const visible = (win) => toX(win.x) > -20 && toX(win.x) < width + 20;
    visibleTwinkles = [...model.backWindows, ...model.frontWindows].filter((win) => win.twinkle && visible(win));
    darkCells = [...model.backDark, ...model.frontDark].filter(visible);
    arrivals = [];

    renderScene();
    buildTethers();
    renderFx(performance.now());
  }

  function renderFx(now) {
    const c = fx;
    const time = now / 1000;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);

    visibleTwinkles.forEach((win) => {
      const alpha = 0.35 + 0.65 * smoothstep(-0.4, 0.8, Math.sin(time * win.rate + win.phase));
      drawWindow(c, win, alpha);
    });

    model.antennas.forEach((beacon) => {
      if (toX(beacon.x) < -20 || toX(beacon.x) > width + 20) return;
      const alpha = 0.25 + 0.75 * smoothstep(0.2, 1, Math.sin(time * 1.4 + beacon.phase));
      c.globalAlpha = alpha;
      c.globalCompositeOperation = "lighter";
      c.drawImage(glow(PINK), toX(beacon.x) - 11, toY(beacon.y) - 11, 22, 22);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(toX(beacon.x) + 0.5, toY(beacon.y), 1.5, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    });

    // A new role: a dark window lights up with a ring, then settles back after a few seconds.
    if (now > nextArrival && darkCells.length) {
      const cell = darkCells[Math.floor(Math.random() * darkCells.length)];
      arrivals.push({ ...cell, colour: COLOURS[Math.floor(Math.random() * COLOURS.length)], born: now });
      nextArrival = now + 700 + Math.random() * 1100;
    }
    arrivals = arrivals.filter((win) => now - win.born < 6000);
    arrivals.forEach((win) => {
      const age = (now - win.born) / 1000;
      if (!win.ringOnly) drawWindow(c, win, smoothstep(0, 0.25, age) * (1 - smoothstep(4.6, 6, age)));
      if (age < 1.2) {
        const grow = age / 1.2;
        c.strokeStyle = win.colour;
        c.globalAlpha = (1 - grow) * 0.85;
        c.lineWidth = 1.25;
        c.beginPath();
        c.arc(toX(win.x), toY(win.y), 4 + grow * 15, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
    });

    runJobCycle(now);

    // Each card's window stays lit while its line is attached.
    slots.forEach((slot) => {
      if (slot.lit <= 0) return;
      const target = targetFor(slot);
      drawWindow(c, { x: target.x, y: target.y, colour: TETHER_COLOURS[slot.index] }, slot.lit);
    });
    slots.forEach((slot) => drawTether(c, slot));

    // Data travels up each fully drawn tether from its window to its card.
    slots.forEach((slot, index) => {
      if (slot.drawn < 1) return;
      const points = slot.points;
      const cycle = (time + index * 1.9) % 5.7;
      if (cycle > 1.9) return;
      const reversed = [...points].reverse();
      const lengths = reversed.slice(1).map((point, i) => Math.hypot(point[0] - reversed[i][0], point[1] - reversed[i][1]));
      let travel = smoothstep(0, 1, cycle / 1.9) * lengths.reduce((sum, value) => sum + value, 0);
      let segment = 0;
      while (segment < lengths.length - 1 && travel > lengths[segment]) {
        travel -= lengths[segment];
        segment += 1;
      }
      const share = lengths[segment] ? travel / lengths[segment] : 0;
      const x = reversed[segment][0] + (reversed[segment + 1][0] - reversed[segment][0]) * share;
      const y = reversed[segment][1] + (reversed[segment + 1][1] - reversed[segment][1]) * share;
      c.globalCompositeOperation = "lighter";
      c.drawImage(glow(WHITE), x - 12, y - 12, 24, 24);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(x, y, 2, 0, Math.PI * 2);
      c.fill();
    });
  }

  /* ---------- Job cycle: cards change to the next jobs the request returns ---------- */
  const JOBS = window.SKYLINE_JOBS || [];
  const SETS = Math.floor(JOBS.length / roleCards.length);
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const responseFields = [...document.querySelectorAll("[data-response]")];
  let setIndex = 0;
  let nextSwitch = performance.now() + HOLD;
  let switchStart = -Infinity;
  let scrambles = [];

  const salaryText = (job) => `$${Math.round(job.salaryMin / 1000)}k–$${Math.round(job.salaryMax / 1000)}k`;
  const arrangementText = (job) => ({ "Remote Solely": "Remote", "Remote OK": "Remote OK", Hybrid: "Hybrid", "On-site": "On-site" })[job.arrangement] ?? job.arrangement;

  function scrambleTo(el, text, now, delay = 0) {
    el.textContent = text;
    scrambles.push({ el, text, start: now + delay, seed: Math.random() * 1000 });
  }

  // Letters and digits cycle at random, then settle left to right. Spaces and punctuation hold still.
  function stepScrambles(now) {
    scrambles = scrambles.filter((item) => {
      const elapsed = now - item.start;
      if (elapsed >= SCRAMBLE) {
        item.el.textContent = item.text;
        return false;
      }
      if (elapsed < 0) return true;
      const length = item.text.length;
      let out = "";
      for (let i = 0; i < length; i += 1) {
        const ch = item.text[i];
        const settleAt = SCRAMBLE * (0.2 + 0.8 * (i / Math.max(length - 1, 1)));
        if (elapsed >= settleAt || !/[A-Za-z0-9]/.test(ch)) out += ch;
        else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      item.el.textContent = out;
      return true;
    });
  }

  function fillCard(slot, job, now, delay) {
    const card = slot.card;
    card.style.width = "";
    const parts = {
      title: job.title,
      meta: `${job.organization} · ${job.location}`,
      salary: salaryText(job),
      arrangement: arrangementText(job),
      page: job.page,
    };
    Object.entries(parts).forEach(([key, value]) => {
      card.querySelector(`[data-field="${key}"]`).textContent = value;
    });
    card.querySelector("[data-summary]").textContent = `${job.title}, ${job.organization}, ${job.location}. ${parts.salary}, ${parts.arrangement}. Found on ${job.page}.`;
    card.querySelector("[data-field='source-icon']").src = `assets/sources/${job.source}.png`;
    const logo = card.querySelector("[data-field='logo']");
    logo.classList.add("is-swapping");
    logo.onload = () => logo.classList.remove("is-swapping");
    logo.src = `assets/logos/companies/${job.logo}`;
    // Lock the final width so the card doesn't jitter while the letters scramble.
    card.style.width = `${card.getBoundingClientRect().width}px`;
    Object.entries(parts).forEach(([key, value]) => scrambleTo(card.querySelector(`[data-field="${key}"]`), value, now, delay));
  }

  function fillResponse(job, now) {
    const values = { title: job.title, salary: String(job.salaryMin), arrangement: job.arrangement };
    responseFields.forEach((el) => scrambleTo(el, values[el.dataset.response], now, 0));
  }

  function runJobCycle(now) {
    if (SETS < 2) return;
    if (slots.some((slot) => slot.hover) && now > switchStart + RETRACT + SCRAMBLE + REACH + STAGGER * 3) {
      nextSwitch = Math.max(nextSwitch, now + 1200); // Hold still while someone reads a card.
    }
    if (now >= nextSwitch) {
      switchStart = now;
      nextSwitch = now + HOLD + RETRACT + SCRAMBLE + REACH;
      setIndex = (setIndex + 1) % SETS;
      slots.forEach((slot) => { slot.swapped = false; });
    }
    const wide = wideLayout.matches;
    slots.forEach((slot) => {
      const t = now - switchStart - slot.index * STAGGER;
      if (t < 0 || t > RETRACT + SCRAMBLE + REACH + 200) return;
      if (t < RETRACT) {
        slot.drawn = 1 - smoothstep(0, RETRACT, t);
        slot.lit = slot.drawn;
        return;
      }
      if (!slot.swapped) {
        slot.swapped = true;
        slot.drawn = 0;
        slot.lit = 0;
        slot.choice += 1;
        const job = JOBS[setIndex * roleCards.length + slot.index];
        fillCard(slot, job, now, 0);
        if (slot.index === 0) fillResponse(job, now);
        slot.points = routeTether(slot.index, targetFor(slot), wide);
      }
      const after = t - RETRACT;
      slot.lit = smoothstep(SCRAMBLE - LIGHT, SCRAMBLE, after);
      slot.drawn = smoothstep(SCRAMBLE - 150, SCRAMBLE - 150 + REACH, after);
      if (after >= SCRAMBLE - LIGHT && !slot.announced) {
        slot.announced = true;
        const target = targetFor(slot);
        arrivals.push({ x: target.x, y: target.y, colour: TETHER_COLOURS[slot.index], born: now, ringOnly: true });
      }
      if (after > SCRAMBLE + REACH) {
        slot.card.style.width = "";
        slot.announced = false;
      }
    });
    stepScrambles(now);
  }

  function frame(now) {
    frameId = requestAnimationFrame(frame);
    if (now - lastFrame < 32) return; // The effects are slow; 30fps is plenty.
    lastFrame = now;
    renderFx(now);
  }

  // Plays on load, with no pause control, as the design asks.
  function start() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }

  // Terminal: language tabs
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const snippets = [...document.querySelectorAll("[data-snippet]")];
  function selectTab(tab) {
    tabs.forEach((other) => {
      const isSelected = other === tab;
      other.setAttribute("aria-selected", String(isSelected));
      other.tabIndex = isSelected ? 0 : -1;
    });
    snippets.forEach((snippet) => {
      snippet.hidden = snippet.dataset.snippet !== tab.dataset.tab;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  let resizeTimer;
  const scheduleLayout = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  };

  layout();
  start();
  const sizeWatcher = new ResizeObserver(scheduleLayout);
  sizeWatcher.observe(hero);
  sizeWatcher.observe(ground); // The city stands on the bar, so it moves when the bar changes height.
  // Roles and copy change size when the webfonts arrive, so measure again.
  document.fonts?.ready.then(layout);
})();
