// js/visualization.js
// Creates a fullscreen SVG that resizes with the window and draws a simple responsive demo.

(function () {
  // Small debounce helper to avoid doing too many redraws during resize
  function debounce(fn, delay) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Create the SVG inside #viz and return a small API
  function createFullscreenSVG(containerSelector) {
    const container = d3.select(containerSelector);

    // remove any previous svg
    container.select('svg').remove();

    const svg = container
      .append('svg')
      .attr('role', 'img')
      .attr('preserveAspectRatio', 'none');

    function size() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
      return { w, h };
    }

    // initialize size
    size();

    // public API
    return {
      svg,
      size,
    };
  }

  // Helper to test if a meal passes provided filters
  function matchesFilters(meal, filters) {
    if (!filters) return true;
    if (filters.meal_type && filters.meal_type !== 'All') {
      if (meal.meal_type !== filters.meal_type) return false;
    }
    if (filters.nutrients) {
      for (const [field, range] of Object.entries(filters.nutrients)) {
        if (!range) continue;
        const v = Number(meal[field]);
        if (!isFinite(v)) return false;
        if (v < range.min || v > range.max) return false;
      }
    }
    return true;
  }

  // Generate an organic 'blob' SVG path around (x,y) with base radius r.
  // Uses time-based sinusoidal perturbations for animation.
  function blobPath(x, y, r, points = 8, phase = 0, freq = 1.0, amp = 0.12) {
    const t = (performance.now() || Date.now()) / 1000;
    const coords = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = 1 + amp * Math.sin(t * freq + phase + i);
      const rad = Math.max(0.5, r * wobble);
      coords.push([x + Math.cos(angle) * rad, y + Math.sin(angle) * rad]);
    }

    // Build a smooth path using quadratic curves between midpoints
    let d = '';
    if (coords.length === 0) return d;
    const m = coords.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const firstMid = mid(coords[m - 1], coords[0]);
    d += `M ${firstMid[0]} ${firstMid[1]}`;
    for (let i = 0; i < m; i++) {
      const curr = coords[i];
      const next = coords[(i + 1) % m];
      const midPt = mid(curr, next);
      d += ` Q ${curr[0]} ${curr[1]} ${midPt[0]} ${midPt[1]}`;
    }
    d += ' Z';
    return d;
  }

  // Food-like palette for meal blobs (greens, browns, reds, mustard)
  const FOOD_PALETTE = ['#4db874ff', '#7a4426', '#f63826ff', '#375023', '#d69d2f', '#dd6835ff', '#6b8e23', '#8c3f2f'];

  // Create a diet_type color scale from the raw rows using the food palette
  function getDietColorScale(rawRows) {
    const rows = rawRows || [];
    const dietTypes = Array.from(new Set(rows.map(d => d.diet_type).filter(Boolean)));
    return d3.scaleOrdinal().domain(dietTypes).range(dietTypes.map((_, i) => FOOD_PALETTE[i % FOOD_PALETTE.length]));
  }

  // Draw circles for top-4 Workout_Type categories
  function drawCategories(svgApi) {
    const { svg, size, data } = svgApi;
    const { w, h } = size();

    svg.selectAll('.category').remove();

    // background rect (keeps hit area consistent)
    svg
      .append('rect')
      .attr('class', 'category')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', h)
      .attr('fill', 'transparent')
      .style('cursor', 'grab');

    // initialize pan state on svgApi so it persists across redraws/resizes
    svgApi.pan = svgApi.pan || { x: 0, y: 0 };

    // create (or select) a pan-group that will contain the visualization content;
    // we'll transform this group on drag which is much cheaper than updating viewBox repeatedly
    let panGroup = svg.select('g.pan-group');
    if (panGroup.empty()) {
      panGroup = svg.append('g').attr('class', 'pan-group');
    }
    // apply existing pan to the group transform
    panGroup.attr('transform', `translate(${svgApi.pan.x},${svgApi.pan.y})`);
    // store reference for animation loop and other code paths
    svgApi.panGroup = panGroup;

    // Background dragging (panning) intentionally disabled to avoid accidental pan when clicking the background.
    // If you want to re-enable panning by background drag, replace the following lines with the d3.drag() call.
    const bg = svg.select('rect.category');
    bg.style('cursor', 'default');

    if (!data || data.length === 0) {
      // fallback label if no data
      svg
        .append('text')
        .attr('class', 'category category-text demo-text')
        .attr('x', w / 2)
        .attr('y', h / 2)
        .attr('text-anchor', 'middle')
        .text('No Workout_Type data available');
      return;
    }

    const counts = data.map(d => d.count);
    const maxCount = d3.max(counts);

    // base dimension for responsive sizing
    const minDim = Math.min(w, h);

    // radius scale (sqrt for area proportionality) — range expressed as fraction of viewport
    const rScale = d3
      .scaleSqrt()
      .domain([0, maxCount])
      .range([Math.max(28, Math.round(minDim * 0.06)), Math.max(40, Math.round(minDim * 0.26))]);

  // color scale for the top-level category outlines (not used for meal dots)
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(data.map(d => d.key));

    // prepare diet_type color scale (for individual meals)
  const raw = svgApi.raw || [];
  const dietColor = getDietColorScale(raw);

    // Calculate left padding based on controls panel so plates shift right and leave space for controls
    const controlsEl = document.querySelector('.controls-panel');
    const leftPadding = controlsEl ? Math.max(180, Math.round(controlsEl.getBoundingClientRect().width + 18)) : 260;

    // Positions: custom staggered layout to match the sketch (two plates near the top-right area and two lower-left/center-right)
    const innerW = Math.max(240, w - leftPadding - 40);
    const innerH = Math.max(240, h);

    // Hard-coded relative positions (fractions) that mirror the sketch composition.
    // We'll map these fractions into the available innerW/innerH area and then offset by leftPadding.
    const rel = [
      { x: 0.40, y: 0.25 }, // top-left plate
      { x: 0.87, y: 0.25 }, // top-right plate
      { x: 0.20, y: 0.75 }, // bottom-left plate
      { x: 0.65, y: 0.75 }, // bottom-right plate
    ];

    const positions = data.map((d, i) => {
      const r = rel[i] || { x: 0.5, y: 0.5 };
      const x = leftPadding + Math.round(r.x * innerW);
      const y = Math.round(r.y * innerH);
      return { x, y };
    });

    // Tooltip div
    let tooltip = d3.select('body').select('.viz-tooltip');
    if (tooltip.empty()) {
      // create tooltip with initial opacity 0 so it can be shown via opacity transitions
      tooltip = d3.select('body')
        .append('div')
        .attr('class', 'viz-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('pointer-events', 'none');
    }

    const panGroupSel = svgApi.panGroup || svg.select('g.pan-group');
    const group = panGroupSel
      .selectAll('.category-group')
      .data(data)
      .join('g')
      .attr('class', 'category category-group');

    // For each category draw a stroked circular path and attach curved text along that path
    group.each(function (d, i) {
      const g = d3.select(this);
      const cx = positions[i].x;
      const cy = positions[i].y;
      const r = rScale(d.count);

  // Plate background: outer + inner circles to create plate look
      const strokeW = Math.max(1, Math.min(6, Math.round(r / 24)));
      const plateOuterR = Math.round(r + strokeW + 30);
      const plateInnerR = Math.round(r);

  // subtle solid drop shadow (offset) behind the plate for depth — color/style in CSS
  g.append('circle')
    .attr('class', 'plate-shadow')
    .attr('cx', cx + Math.round(r * -0.04))
    .attr('cy', cy + Math.round(r * 0.04))
    .attr('r', plateOuterR);

  // outer plate ring (main background)
  g.append('circle')
    .attr('class', 'plate-outer')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', plateOuterR);

  // inner plate (white center)
  g.append('circle')
    .attr('class', 'plate-inner')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', plateInnerR);

  // decorative concentric rim lines (two thin rings inside the outer rim)
  const rim1R = Math.round(plateInnerR - Math.max(6, r * 0.03));
  const rim2R = Math.round(plateInnerR - Math.max(12, r * 0.06));
  g.append('circle')
    .attr('class', 'plate-rim plate-rim-1')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', rim1R)
    .attr('fill', 'none');
  g.append('circle')
    .attr('class', 'plate-rim plate-rim-2')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', rim2R)
    .attr('fill', 'none');

      // create a full-circle path (two half-arcs) so we can attach textPath (category stroke sits on plate)
      const pathD = `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy}`;
      g.append('path')
        .attr('id', `cat-path-${i}`)
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0, 0, 0, 0.06)')
        .attr('stroke-width', strokeW)
        .attr('opacity', 1);

      // create a slightly smaller invisible path for the text to sit inside the circle
      const textR = Math.max(1, r - strokeW - 3); // push text inward from the stroke
      const pathDText = `M ${cx + textR} ${cy} A ${textR} ${textR} 0 1 0 ${cx - textR} ${cy} A ${textR} ${textR} 0 1 0 ${cx + textR} ${cy}`;
      g.append('path')
        .attr('id', `cat-text-path-${i}`)
        .attr('d', pathDText)
        .attr('fill', 'none')
        .attr('stroke', 'none');

      // add curved text along the inner text path so it sits inside the circle edge
      // text size scales with the circle; keep it readable at small sizes
      const textSizePx = Math.max(10, Math.round(textR / 6));
      g.append('text')
        .attr('class', 'category-text demo-text')
        .style('font-size', `${textSizePx}px`)
        .append('textPath')
        .attr('href', `#cat-text-path-${i}`)
        .attr('startOffset', '70%')
        .text(`${d.key}`)
        .style('fill', '#000');

  // --- draw meal dots inside this category circle ---
      // collect ALL meals for this Workout_Type; we'll mark which ones match active filters
    const allMeals = raw.filter(row => row.Workout_Type === d.key);
      const filters = svgApi.filters || {};

      // helper to test whether a meal passes current filters
      function mealMatchesFilters(m) {
        if (filters.meal_type && filters.meal_type !== 'All') {
          if (m.meal_type !== filters.meal_type) return false;
        }
        if (filters.nutrients) {
          for (const [field, range] of Object.entries(filters.nutrients)) {
            if (!range) continue;
            const v = Number(m[field]);
            if (!isFinite(v)) return false;
            if (v < range.min || v > range.max) return false;
          }
        }
        return true;
      }

      if (allMeals.length === 0) return;

      // GROUP meals by diet_type for this category — each node will represent a diet_type
      const dietMap = d3.rollup(allMeals, v => ({
        count: v.length,
        meals: v,
        caloriesSum: d3.sum(v, m => Number(m.Calories || m['Calories'] || m.Calories_Burned || m.Calories_Burned) || 0)
      }), m => m.diet_type || 'Unknown');

      const dietEntries = Array.from(dietMap, ([diet, info]) => ({ diet, ...info }));

      // default node radius range as fractions of the parent circle so they scale responsively
      const minNode = Math.max(6, Math.round(r * 0.06));
      const maxNode = Math.max(minNode + 4, Math.round(r * 0.22));

      // size by count (or caloriesSum if you prefer)
      const countExtent = d3.extent(dietEntries, e => e.count);
      const sizeScale = d3.scaleSqrt().domain(countExtent).range([minNode, maxNode]);

      // create nodes for simulation from diet groups
      const nodes = dietEntries.map((g, idx) => {
        const ndR = Math.round(sizeScale(g.count));
        return {
          id: `${i}-diet-${idx}`,
          diet: g.diet,
          meals: g.meals,
          count: g.count,
          caloriesSum: g.caloriesSum,
          x: cx + (Math.random() - 0.5) * r * 0.6,
          y: cy + (Math.random() - 0.5) * r * 0.6,
          r: ndR,
          _phase: Math.random() * Math.PI * 2,
          _freq: 0.6 + Math.random() * 1.2,
          _amp: 0.06 + Math.random() * 0.12,
          // matched if any meal in this diet group passes filters
          matched: g.meals.some(m => mealMatchesFilters(m)),
        };
      });

      // Instead of SVG path blobs, render a small Flower widget per diet-group
      // Create an overlay-backed div for each node and instantiate Flower + FlowerData
      const overlay = svgApi.overlay || d3.select('#viz').select('.viz-overlay');
      const categoryKey = d.key; // workout type for this category

      const flowers = overlay
        .selectAll(`.mini-flower-${i}`)
        .data(nodes, d => d.id)
        .join(
          enter => enter.append('div')
            .attr('class', `mini-flower mini-flower-${i}`)
            .style('position', 'absolute')
            .style('pointer-events', 'auto')
            .each(function (nd) {
              // size the container conservatively around the node radius
              const sizePx = Math.max(48, nd.r * 3); // smaller base and multiplier to reduce petals
              nd.containerSize = sizePx; // store on node for collision and clamping
              d3.select(this).style('width', sizePx + 'px').style('height', sizePx + 'px');
              // unique id used by Flower constructor (no #)
              const fid = `flower-${nd.id}`;
              d3.select(this).attr('id', fid);
              // create FlowerData and Flower instance for this diet-group
              try {
                // create FlowerData in flat mode so each meal becomes its own petal
                const fd = new FlowerData(nd.meals, { flat: true });
                // instantiate Flower; workoutType = categoryKey, dietType = nd.diet
                const widget = new Flower(fid, fd, categoryKey, nd.diet);

                // Scale down the default radii so petals are appropriate for the small container.
                // Use container-based heuristics: center radius ~8% of size, outer radii fractions
                widget.centerR = Math.max(4, Math.round(sizePx * 0.08));
                widget.minOuterR = Math.max(8, Math.round(sizePx * 0.22));
                widget.maxOuterR = Math.max(widget.minOuterR + 6, Math.round(sizePx * 0.45));
                // petal width range relative to container
                widget.petalDisplayWidthRange = [Math.max(6, Math.round(sizePx * 0.12)), Math.max(10, Math.round(sizePx * 0.22))];
                // keep shading/opactiy defaults but ensure reasonable range
                widget.opacityDisplayRange = [0.45, 0.9];

                // Ensure the widget uses the same diet color scale as the main legend
                try { widget.colorPalette = dietColor; } catch (e) { /* ignore */ }
                nd._flowerWidget = widget;
                nd._flowerWidget.initVis();
                // reduce pointer-events on inner svg to allow dragging the container
                d3.select(`#${fid}`).select('svg').style('pointer-events', 'auto');
              } catch (err) {
                console.warn('Failed to create Flower widget', err);
              }
            }),
          update => update.each(function (nd) {
            const sizePx = Math.max(48, nd.r * 3);
            nd.containerSize = sizePx;
            d3.select(this).style('width', sizePx + 'px').style('height', sizePx + 'px');
          }),
          exit => exit.remove()
        );

      // live force simulation to avoid overlaps and animate when nodes move (supports dragging)
      const sim = d3.forceSimulation(nodes)
        .velocityDecay(0.2)
        .force('charge', d3.forceManyBody().strength(0))
        .force('collide', d3.forceCollide().radius(d => ((d.containerSize ? d.containerSize / 2 : d.r) + 6)).iterations(2))
        .force('x', d3.forceX(cx).strength(0.06))
        .force('y', d3.forceY(cy).strength(0.06));

      // store simulation on group element so drag handlers can access it later if needed
      try { g.node().__sim = sim; } catch (e) { /* ignore if not accessible */ }

      // tick handler: clamp nodes inside the parent circle and update SVG positions
      sim.on('tick', () => {
        nodes.forEach(n => {
          const dx = n.x - cx;
          const dy = n.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const maxDist = r - (n.containerSize ? n.containerSize / 2 : n.r) - 4;
          if (dist > maxDist) {
            const scale = maxDist / dist;
            n.x = cx + dx * scale;
            n.y = cy + dy * scale;
          }
        });

        // update mini-flower container positions for this category
        try {
          const ov = svgApi.overlay || d3.select('#viz').select('.viz-overlay');
          ov.selectAll(`.mini-flower-${i}`).style('left', function(d) {
            const size = (d.containerSize || Math.max(48, d.r * 3));
            return (d.x - size / 2) + 'px';
          }).style('top', function(d) {
            const size = (d.containerSize || Math.max(48, d.r * 3));
            return (d.y - size / 2) + 'px';
          });
        } catch (e) {
          // ignore overlay positioning errors
        }
      });

      // initialize the simulation with a small nudge so it settles visually
      sim.alpha(0.8).restart();

      // drag behavior: fix node position while dragging and unfix on end to let simulation relax
      const drag = d3.drag()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          // constrain dragged point inside the circle bounds
          const nx = event.x;
          const ny = event.y;
          const dx = nx - cx;
          const dy = ny - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const maxDist = r - (d.containerSize ? d.containerSize / 2 : d.r) - 4;
          if (dist > maxDist) {
            const scale = maxDist / dist;
            d.fx = cx + dx * scale;
            d.fy = cy + dy * scale;
          } else {
            d.fx = nx;
            d.fy = ny;
          }
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          // release the fixed position so physics takes over, but keep a short alpha to let others settle
          d.fx = null;
          d.fy = null;
        });

  // apply drag to the mini-flower containers for this category (overlay)
  try {
    const ov = svgApi.overlay || d3.select('#viz').select('.viz-overlay');
    ov.selectAll(`.mini-flower-${i}`).call(drag);
  } catch (e) {
    try { (svgApi.panGroup || svg).selectAll(`.meal-blob-${i}`).call(drag); } catch (ee) { /* ignore */ }
  }
    });
  }

  // bootstrap: create svg and then load data
  const svgApi = createFullscreenSVG('#viz');

  // create an overlay container (absolute) inside #viz for small HTML flower widgets
  try {
    const containerSel = d3.select('#viz');
    // ensure container is positioned for absolutely positioned children
    containerSel.style('position', 'relative');
    if (containerSel.select('.viz-overlay').empty()) {
      containerSel.append('div')
        .attr('class', 'viz-overlay')
        .style('position', 'absolute')
        .style('left', 0)
        .style('top', 0)
        .style('width', '100%')
        .style('height', '100%')
        .style('pointer-events', 'none'); // allow pointer events on child flowers explicitly
    }
    svgApi.overlay = containerSel.select('.viz-overlay');
  } catch (e) {
    // ignore overlay creation failures
  }

  // Load CSV, wrangle, and draw top-4 Workout_Type categories
  d3.csv('data/meal_metadata.csv').then(raw => {
    // Count occurrences per Workout_Type
    const countsMap = d3.rollup(raw, v => v.length, d => d.Workout_Type);
    let entries = Array.from(countsMap, ([key, count]) => ({ key, count }));

    // sort descending and take top 4
    entries.sort((a, b) => b.count - a.count);
    const top4 = entries.slice(0, 4);

  // attach data and raw rows to svgApi for redraws
  svgApi.data = top4;
  svgApi.raw = raw;

  // populate legend after raw is available
  renderLegend(svgApi);

  // initialize filters store
  svgApi.filters = {
    meal_type: 'All',
    nutrients: {},
  };

  // Build UI controls based on available meal_type values and numeric columns
  setupControls(svgApi);

    drawCategories(svgApi);

    // On resize, update size and redraw (debounced)
    window.addEventListener(
      'resize',
      debounce(() => {
        svgApi.size();
        drawCategories(svgApi);
      }, 80)
    );

    // Start a light animation loop. We no longer animate SVG blob paths; keep loop for
    // potential future widget refreshes. Currently it ensures requestAnimationFrame keeps running.
    (function animateWidgets() {
      try {
        // Future: we could add subtle widget breathing here by scaling mini-flower containers.
      } catch (e) {
        // ignore
      }
      requestAnimationFrame(animateWidgets);
    })();

    // Expose for debugging
    window.__fullscreenSvg = svgApi;
  }).catch(err => {
    // If loading fails, draw fallback message
    console.error('Failed to load CSV:', err);
    svgApi.data = [];
    drawCategories(svgApi);
    window.__fullscreenSvg = svgApi;
  });

  // Setup filter controls UI and wire events to redraw the visualization
  function setupControls(svgApi) {
    const container = d3.select('#controls');
    if (container.empty()) return;
    container.html('');
    // Header with stronger storytelling and visual hierarchy
    const header = container.append('div').attr('class', 'controls-header');
    header.append('h2').attr('class', 'controls-title').text('Meals for Your Workout Routine');
    header.append('p').attr('class', 'controls-subtitle')
      .text('Ever wondered what your workout habits say about your meal choices? Explore how each workout routine looks like on a plate.');
    // Source link for the dataset (shown under the subtitle)
    header.append('p')
      .attr('class', 'controls-source')
      .html('Source: <a href="https://www.kaggle.com/datasets/jockeroika/life-style-data/" target="_blank" rel="noopener noreferrer">Kaggle — Life Style Data</a>');
    const raw = svgApi.raw || [];

    // --- meal_type radio buttons ---
    const mealTypes = Array.from(new Set(raw.map(d => d.meal_type).filter(Boolean)));
    const mg = container.append('div').attr('class', 'control-group');
    mg.append('h3').text('Meal type');
    // pill-style buttons for meal_type selection
    const pillRow = mg.append('div').attr('class', 'pill-group');

    // helper to create a pill button
    function makePill(key) {
      const btn = pillRow.append('button')
        .attr('type', 'button')
        .attr('class', 'pill')
        .text(key)
        .on('click', function () {
          // update active class
          pillRow.selectAll('button.pill').classed('active', false);
          d3.select(this).classed('active', true);
          svgApi.filters.meal_type = key;
          debouncedRedraw();
        });
      return btn;
    }

    // All button (default)
    makePill('All').classed('active', true);

    mealTypes.forEach(mt => {
      makePill(mt);
    });

    // small helper to make an id-safe string
    function safeId(s) { return 'fld-' + s.replace(/[^a-z0-9_-]/gi, '_'); }
  }

  // Render a simple legend into #legend using diet_type colors
  function renderLegend(svgApi) {
    const raw = svgApi.raw || [];
    const legendEl = document.getElementById('legend');
    if (!legendEl) return;
    // Clear existing
    legendEl.innerHTML = '';

    const dietTypes = Array.from(new Set(raw.map(d => d.diet_type).filter(Boolean)));
    if (dietTypes.length === 0) return;

    const dietColor = getDietColorScale(raw);

    const title = document.createElement('h4');
    title.textContent = 'Diet type';
    legendEl.appendChild(title);

    dietTypes.forEach(dt => {
      const row = document.createElement('div');
      row.className = 'legend-item';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.backgroundColor = dietColor(dt);
      row.appendChild(sw);
      const lbl = document.createElement('span');
      lbl.className = 'label';
      lbl.textContent = dt;
      row.appendChild(lbl);
      legendEl.appendChild(row);
    });

    // --- Petal length: sample short / avg / long (≈ calories) ---
    const calorieVals = raw.map(m => {
      const c = Number(m.Calories || m['Calories'] || m.Calories_Burned || m.Calories_Burned);
      return isFinite(c) ? c : NaN;
    }).filter(v => !Number.isNaN(v));
    if (calorieVals.length > 0) {
      const minC = Math.round(d3.min(calorieVals));
      const avgC = Math.round(d3.mean(calorieVals));
      const maxC = Math.round(d3.max(calorieVals));

      const lenTitle = document.createElement('h4');
      lenTitle.textContent = 'Petal length (calories intake)';
      legendEl.appendChild(lenTitle);

      // Map sample calories to visual petal lengths for the legend
      const sampleScale = d3.scaleLinear().domain([minC, maxC]).range([10, 34]);
      const samples = [ {label: `short · ${minC}`, value: minC}, {label: `avg · ${avgC}`, value: avgC}, {label: `long · ${maxC}`, value: maxC} ];

      // Create a horizontal container with small SVG samples and labels
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.gap = '8px';
      samples.forEach(s => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'center';

        const svgNs = 'http://www.w3.org/2000/svg';
  const ry = Math.max(6, Math.round(sampleScale(s.value)));
  const rx = 12;
  // size the SVG to fit the ellipse (add a small vertical padding)
  const svgHeight = Math.max(ry * 2 + 12, 44);
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', 48);
  svg.setAttribute('height', svgHeight);
  const cx = 24;
  const cy = Math.round(svgHeight / 2);

        const ell = document.createElementNS(svgNs, 'ellipse');
        ell.setAttribute('cx', cx);
        ell.setAttribute('cy', cy);
        ell.setAttribute('rx', rx);
        ell.setAttribute('ry', ry);
        ell.setAttribute('fill', '#cfcfcf');
        ell.setAttribute('stroke', '#6d6d6d');
        ell.setAttribute('stroke-width', 1);
        svg.appendChild(ell);

        const lbl = document.createElement('div');
        lbl.className = 'label';
        lbl.style.fontSize = '12px';
        lbl.style.marginTop = '4px';
        lbl.textContent = s.label;

        item.appendChild(svg);
        item.appendChild(lbl);
        container.appendChild(item);
      });

      legendEl.appendChild(container);
    }
  }

  // debounced visual-only update used by UI events: update dot colors/opacities without changing positions
  const debouncedRedraw = debounce(() => {
    if (!svgApi.raw) return;
    const filters = svgApi.filters || {};
    const svg = svgApi.svg;

  // recreate dietColor to ensure consistent mapping (use food-like palette)
  const dietColor = getDietColorScale(svgApi.raw);

    // update each bound node's matched flag (use panGroup when present)
    const blobContainer = (svgApi.panGroup || svgApi.svg);
    // Nodes may be diet-group objects (with .meals and .diet) or legacy per-meal nodes (with .meal).
    blobContainer.selectAll('.meal-blob').each(function (d) {
      if (!d) return;
      if (d.meals && Array.isArray(d.meals)) {
        // diet-group node: matched if any meal in the group passes filters
        d.matched = d.meals.some(m => matchesFilters(m, filters));
      } else if (d.meal) {
        // legacy single-meal node
        d.matched = matchesFilters(d.meal, filters);
      } else {
        d.matched = false;
      }
    });

    // animate color and slight opacity change to visually transition
    blobContainer.selectAll('.meal-blob')
      .transition()
      .duration(450)
      .attr('fill', d => {
        // use diet property when available, otherwise fall back to meal.diet_type
        const dietKey = d.diet || (d.meal && d.meal.diet_type) || 'Unknown';
        return d.matched ? dietColor(dietKey) : '#e9e9e9ff';
      })
      .attr('opacity', d => (d.matched ? 1 : 0.65));

    // Update overlay mini-flowers (if present): refresh widget data and adjust opacity
    try {
      const ov = svgApi.overlay || d3.select('#viz').select('.viz-overlay');
      ov.selectAll('.mini-flower').each(function (nd) {
        // set container opacity for matched state (node-level)
        d3.select(this).style('opacity', nd.matched ? 1 : 0.65);
        // if there's a Flower widget, rebuild its data but keep all petals and mark which
        // individual meals match the filters so the Flower can grey-out non-matching petals.
        if (nd._flowerWidget) {
          const annotated = (nd.meals || []).map(m => Object.assign({}, m, { __matched: matchesFilters(m, filters) }));
          // create FlowerData in flat mode with annotated rows so Flower.wrangleData preserves matched info
          const fd = new FlowerData(annotated, { flat: true });
          try {
            nd._flowerWidget.data = fd;
            nd._flowerWidget.wrangleData();
            nd._flowerWidget.updateVis();
          } catch (err) {
            // ignore widget update errors
          }
        }
      });
    } catch (e) {
      // ignore overlay update errors
    }
  }, 120);
})();
