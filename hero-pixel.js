(() => {
  const GAP = 44;
  const SPEED = [46, 34, 54, 40]; // px per second, per lane
  const STEP = 8; // Wipes at each gate move on this grid, so they read as pixels.
  const LETTER_SWAP_MS = 1500;
  // Which letters can pixelate: [text run, letter, nth occurrence in that run].
  const LETTERS = [
    [0, "c", 0], [0, "s", 0], [0, "n", 0], [0, "o", 0],
    [1, "e", 0], [1, "h", 0], [1, "d", 0],
    [2, "b", 0], [2, "n", 0],
    [3, "u", 0], [3, "s", 0], [3, "n", 0], [3, "y", 0],
  ];
  // Squares per 10,000px² of page, and the sizes they come in. Mostly tiny, a few larger.
  const SQUARE_DENSITY = 1.15;
  const SQUARE_GRID = 3;
  const ACTIVE_LETTERS = 6;

  const visual = document.querySelector("[data-visual]");
  const track = document.querySelector("[data-track]");
  const sparksCanvas = document.querySelector("[data-sparks]");
  const headline = document.querySelector("[data-headline]");
  const fieldCanvas = document.querySelector("[data-field]");
  const copyArea = document.querySelector(".intro");

  const lanes = SPEED.map((speed) => ({ speed, offset: 0, items: [], y: 0, node: null, active: true }));
  const sparks = [];
  const pixelLetters = [];

  let sparkContext = null;
  let cardWidth = 0;
  let cardHeight = 0;
  let laneHeight = 0;
  let headHeight = 0;
  let width = 0;
  let gateAI = 0;
  let gateAPI = 0;
  let lastFrame = 0;
  let swapClock = 0;
  let sparkClock = 0;
  let fieldClock = 0;
  let fieldContext = null;
  let fieldSize = { width: 0, height: 0, copy: null };
  let squares = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- Cards ---------- */

  function buildRaw(job) {
    const raw = el("div", "card__raw");
    const source = job.raw?.source ?? job.source;
    raw.append(
      el("span", "", `${source ? `<!-- ${source} --> ` : ""}<h1>${job.title}</h1>`),
      el("span", "", `<p>${job.raw?.location ?? job.location}</p> ░░░░ ░░░░░░░ ░░ ░░░░░░░░ ░░░░`),
    );
    return raw;
  }

  function buildCode(job) {
    const code = el("div", "card__code");
    const [salaryMin] = job.salary.match(/\d+/g).map((value) => Number(value) * 1000);
    const salary = el("span");
    salary.append(el("i", "", '"ai_salary_min_value"'), `: ${job.ai?.ai_salary_min_value ?? salaryMin},`);
    const arrangement = el("span");
    arrangement.append(el("i", "", '"ai_work_arrangement"'), `: "${job.arrangement}"`);
    code.append(salary, arrangement);
    return code;
  }

  function buildListing(job) {
    const listing = el("div", "card__listing");
    const logo = el("img", "card__logo");
    logo.src = `assets/logos/companies/${job.logo}.jpg`;
    logo.alt = "";
    const text = el("div", "card__text");
    const meta = el("div", "card__meta");
    const arrangement = job.arrangement === "Remote Solely" ? "Remote" : job.arrangement;
    meta.append(el("b", "", `✦ ${job.salary}`), ` · ${arrangement} · ${job.organization}`);
    text.append(el("div", "card__title", job.title), meta);
    listing.append(logo, text);
    return listing;
  }

  function build() {
    const count = window.JOBS.length;
    lanes.forEach((lane, laneIndex) => {
      lane.node = el("div", "lane");
      track.append(lane.node);
      for (let round = 0; round < 2; round += 1) {
        for (let index = 0; index < count; index += 1) {
          // Each lane starts two jobs further on, so the same job doesn't stack up across lanes.
          const job = window.JOBS[(index + laneIndex * 2 + (laneIndex === 3 ? 1 : 0)) % count];
          const node = el("div", "card");
          const raw = buildRaw(job);
          const code = buildCode(job);
          const listing = buildListing(job);
          node.append(raw, code, listing);
          lane.node.append(node);
          lane.items.push({ node, raw, code, listing });
        }
      }
    });
  }

  function resize() {
    const styles = getComputedStyle(document.documentElement);
    const portion = parseFloat(styles.getPropertyValue("--gate-portion")) || 1 / 3;
    const laneCount = Number(styles.getPropertyValue("--lanes")) || 4;

    width = track.clientWidth;
    gateAI = Math.round(width * portion);
    gateAPI = width - gateAI;
    visual.style.setProperty("--gate-ai", `${gateAI}px`);
    visual.style.setProperty("--gate-api", `${gateAPI}px`);

    const first = lanes[0].items[0].node;
    cardWidth = first.offsetWidth;
    cardHeight = first.offsetHeight;
    laneHeight = parseFloat(styles.getPropertyValue("--lane-h")) || 84;
    headHeight = parseFloat(styles.getPropertyValue("--head-h")) || 52;
    lanes.forEach((lane, index) => {
      lane.active = index < laneCount;
      lane.y = (laneHeight - cardHeight) / 2;
      lane.node.style.display = lane.active ? "" : "none";
      lane.node.style.top = `${index * laneHeight}px`;
    });

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    sparksCanvas.width = visual.clientWidth * scale;
    sparksCanvas.height = visual.clientHeight * scale;
    sparkContext = sparksCanvas.getContext("2d");
    sparkContext.scale(scale, scale);
  }

  const clampCard = (value) => Math.max(0, Math.min(cardWidth, value));
  const snap = (value) => Math.round(value / STEP) * STEP;

  function setLayer(layer, left, right) {
    if (right <= left) {
      layer.style.visibility = "hidden";
      return;
    }
    layer.style.visibility = "visible";
    layer.style.clipPath = `inset(0 ${cardWidth - right}px 0 ${left}px)`;
  }

  function drawCards() {
    lanes.forEach((lane) => {
      if (!lane.active) return;
      const loop = lane.items.length * (cardWidth + GAP);
      lane.items.forEach((item, index) => {
        const raw = ((index * (cardWidth + GAP) + lane.offset) % loop) - cardWidth - GAP;
        const x = Math.round(raw);
        if (x >= width || x + cardWidth <= 0) {
          item.node.style.visibility = "hidden";
          return;
        }
        item.node.style.visibility = "visible";
        item.node.style.transform = `translate3d(${x}px, ${lane.y}px, 0)`;

        const aiEdge = clampCard(snap(gateAI - x));
        const apiEdge = clampCard(snap(gateAPI - x));
        setLayer(item.raw, 0, aiEdge);
        setLayer(item.code, aiEdge, apiEdge);
        setLayer(item.listing, apiEdge, cardWidth);
      });
    });
  }

  /* ---------- Squares shed at the gates as a card changes ---------- */

  function emitSparks() {
    lanes.forEach((lane, laneIndex) => {
      if (!lane.active) return;
      const loop = lane.items.length * (cardWidth + GAP);
      lane.items.forEach((item, index) => {
        const x = ((index * (cardWidth + GAP) + lane.offset) % loop) - cardWidth - GAP;
        [gateAI, gateAPI].forEach((gate) => {
          if (x >= gate || x + cardWidth <= gate) return;
          sparks.push({
            x: gate + (Math.random() - 0.3) * 18,
            y: headHeight + laneIndex * laneHeight + lane.y + Math.random() * cardHeight,
            vx: 18 + Math.random() * 34,
            life: 0,
            span: 300 + Math.random() * 380,
            size: Math.random() < 0.3 ? 6 : 3,
            light: gate === gateAI,
          });
        });
      });
    });
  }

  function drawSparks(delta) {
    if (!sparkContext) return;
    sparkContext.clearRect(0, 0, visual.clientWidth, visual.clientHeight);
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const spark = sparks[i];
      spark.life += delta;
      if (spark.life > spark.span) {
        sparks.splice(i, 1);
        continue;
      }
      spark.x += (spark.vx * delta) / 1000;
      // Squares blink out in steps rather than fading.
      if (spark.life / spark.span > 0.7 && Math.floor(spark.life / 60) % 2) continue;
      sparkContext.fillStyle = spark.light ? "#a5b4fc" : "#fff";
      sparkContext.fillRect(Math.round(spark.x / 3) * 3, Math.round(spark.y / 3) * 3, spark.size, spark.size);
    }
  }

  /* ---------- Pixelated letters ---------- */

  function wrapLetters() {
    const runs = [...headline.querySelectorAll("[data-px]")];
    const perLine = new Map();
    LETTERS.forEach(([lineIndex, letter, occurrence]) => {
      if (!perLine.has(lineIndex)) perLine.set(lineIndex, []);
      perLine.get(lineIndex).push({ letter, occurrence });
    });

    perLine.forEach((wanted, lineIndex) => {
      const holder = runs[lineIndex];
      const text = holder.textContent;
      const picks = new Map();
      wanted.forEach(({ letter, occurrence }) => {
        let at = -1;
        for (let n = 0; n <= occurrence; n += 1) at = text.indexOf(letter, at + 1);
        if (at >= 0) picks.set(at, letter);
      });
      holder.textContent = "";
      let cursor = 0;
      [...picks.keys()].sort((a, b) => a - b).forEach((at) => {
        holder.append(text.slice(cursor, at));
        const span = el("span", "px", text[at]);
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        span.append(canvas);
        holder.append(span);
        pixelLetters.push({ span, canvas, letter: text[at] });
        cursor = at + 1;
      });
      holder.append(text.slice(cursor));
    });
  }

  // Draw the glyph once at full size, then keep only the cells that are more than half inked.
  function rasterLetter(item) {
    const styles = getComputedStyle(item.span);
    item.span.classList.remove("is-on");
    const color = getComputedStyle(item.span).color;
    const rect = item.span.getBoundingClientRect();
    const size = parseFloat(styles.fontSize);
    const cell = Math.max(3, Math.round(size / 19));
    const pad = cell;
    const w = Math.ceil(rect.width) + pad * 2;
    const h = Math.ceil(rect.height) + pad;

    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const p = probe.getContext("2d", { willReadFrequently: true });
    p.font = `${styles.fontWeight} ${size}px ${styles.fontFamily}`;
    p.textBaseline = "alphabetic";
    p.fillStyle = "#000";
    const ascent = p.measureText(item.letter).fontBoundingBoxAscent;
    p.fillText(item.letter, pad, ascent);
    const { data } = p.getImageData(0, 0, w, h);

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    item.canvas.width = w * scale;
    item.canvas.height = h * scale;
    item.canvas.style.width = `${w}px`;
    item.canvas.style.height = `${h}px`;
    item.canvas.style.left = `${-pad}px`;
    const c = item.canvas.getContext("2d");
    c.scale(scale, scale);
    c.fillStyle = color;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        let ink = 0;
        let seen = 0;
        for (let sy = y; sy < Math.min(y + cell, h); sy += 1) {
          for (let sx = x; sx < Math.min(x + cell, w); sx += 1) {
            ink += data[(sy * w + sx) * 4 + 3];
            seen += 255;
          }
        }
        if (ink / seen > 0.5) c.fillRect(x, y, cell, cell);
      }
    }
  }

  function rasterAll() {
    const on = pixelLetters.filter((item) => item.span.classList.contains("is-on"));
    pixelLetters.forEach(rasterLetter);
    on.forEach((item) => item.span.classList.add("is-on"));
  }

  function chooseStartingLetters() {
    // An even spread across the three lines to begin with.
    pixelLetters.forEach((item, index) => {
      item.span.classList.toggle("is-on", index % 2 === 0 && index / 2 < ACTIVE_LETTERS);
    });
  }

  function swapLetter() {
    const on = pixelLetters.filter((item) => item.span.classList.contains("is-on"));
    const off = pixelLetters.filter((item) => !item.span.classList.contains("is-on"));
    if (!on.length || !off.length) return;
    on[Math.floor(Math.random() * on.length)].span.classList.remove("is-on");
    off[Math.floor(Math.random() * off.length)].span.classList.add("is-on");
  }

  /* ---------- The field: random squares flashing in and out ---------- */

  function placeSquare(square) {
    const { width: w, height: h, copy } = fieldSize;
    let x = 0;
    let y = 0;
    // Mostly keep clear of the copy, so the text stays easy to read.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      x = Math.random() * w;
      y = Math.random() * h;
      const overCopy = copy && x > copy.left && x < copy.right && y > copy.top && y < copy.bottom;
      if (!overCopy || Math.random() < 0.12) break;
    }
    const roll = Math.random();
    let size = 3;
    let peak = 0.5 + Math.random() * 0.4;
    if (roll > 0.97) {
      size = 18 + SQUARE_GRID * Math.floor(Math.random() * 5);
      peak = 0.12 + Math.random() * 0.12;
    } else if (roll > 0.82) {
      size = 9;
      peak = 0.4 + Math.random() * 0.3;
    } else if (roll > 0.5) {
      size = 6;
    }
    square.x = Math.round(x / SQUARE_GRID) * SQUARE_GRID;
    square.y = Math.round(y / SQUARE_GRID) * SQUARE_GRID;
    square.size = size;
    square.peak = peak;
    square.color = Math.random() < 0.72 ? "#ffffff" : "#111827";
    square.life = 0;
    square.span = 900 + Math.random() * 2800;
    square.wait = Math.random() * 1600;
  }

  function sizeField() {
    const page = document.documentElement;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = page.clientWidth;
    const height = page.scrollHeight;
    const pageTop = window.scrollY;
    const box = copyArea.getBoundingClientRect();
    fieldSize = {
      width,
      height,
      copy: { left: box.left + width * 0.08, right: box.right - width * 0.08, top: box.top + pageTop + 40, bottom: box.bottom + pageTop - 40 },
    };
    fieldCanvas.width = width * scale;
    fieldCanvas.height = height * scale;
    fieldContext = fieldCanvas.getContext("2d");
    fieldContext.scale(scale, scale);

    const count = Math.round((width * height) / 10000 * SQUARE_DENSITY);
    while (squares.length < count) squares.push({});
    squares.length = count;
    squares.forEach((square) => {
      placeSquare(square);
      // Start part-way through, so the page opens already flickering.
      square.wait = 0;
      square.life = Math.random() * square.span;
    });
  }

  function drawField(delta) {
    const c = fieldContext;
    c.clearRect(0, 0, fieldSize.width, fieldSize.height);
    squares.forEach((square) => {
      if (square.wait > 0) {
        square.wait -= delta;
        return;
      }
      square.life += delta;
      if (square.life >= square.span) {
        placeSquare(square);
        return;
      }
      // In quickly, out slowly, in steps rather than a smooth fade.
      const t = square.life / square.span;
      const envelope = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
      c.globalAlpha = (Math.ceil(envelope * 5) / 5) * square.peak;
      c.fillStyle = square.color;
      c.fillRect(square.x, square.y, square.size, square.size);
    });
    c.globalAlpha = 1;
  }

  /* ---------- Clock ---------- */

  function frame(now) {
    const delta = Math.min(now - lastFrame, 50);
    lastFrame = now;
    lanes.forEach((lane) => {
      lane.offset += (lane.speed * delta) / 1000;
    });
    drawCards();

    sparkClock += delta;
    if (sparkClock > 70) {
      sparkClock = 0;
      emitSparks();
    }
    drawSparks(delta);

    swapClock += delta;
    if (swapClock > LETTER_SWAP_MS) {
      swapClock = 0;
      swapLetter();
    }

    fieldClock += delta;
    if (fieldClock > 33) {
      drawField(fieldClock);
      fieldClock = 0;
    }
    requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      rasterAll();
      drawCards();
      sizeField();
    }, 120);
  });

  function init() {
    wrapLetters();
    pixelLetters.forEach(rasterLetter);
    chooseStartingLetters();
    build();
    resize();

    // Open with every lane mid-flow: a card crossing a gate in each.
    const opening = [gateAPI - cardWidth * 0.55, gateAI - cardWidth * 0.6, gateAPI - cardWidth * 0.2, gateAI - cardWidth * 0.3];
    lanes.forEach((lane, index) => {
      const step = cardWidth + GAP;
      const loop = lane.items.length * step;
      lane.offset = (((opening[index] + step) % loop) + loop) % loop;
    });

    drawCards();
    sizeField();
    drawField(0);
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  (document.fonts?.ready ?? Promise.resolve()).then(init);
})();
