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

    // enable panning by dragging the background rect (updates panGroup transform)
    const bg = svg.select('rect.category');
    bg.call(
      d3.drag()
        .on('start', () => bg.style('cursor', 'grabbing'))
        .on('drag', (event) => {
          // event.dx/dy are in screen pixels; move content with the drag
          svgApi.pan.x += event.dx;
          svgApi.pan.y += event.dy;
          panGroup.attr('transform', `translate(${Math.round(svgApi.pan.x)},${Math.round(svgApi.pan.y)})`);
        })
        .on('end', () => bg.style('cursor', 'grab'))
    );

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
      tooltip = d3.select('body').append('div').attr('class', 'viz-tooltip').style('display', 'none');
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
      const plateOuterR = Math.round(r + strokeW + Math.max(12, r * 0.22));
      const plateInnerR = Math.round(r + Math.max(6, r * 0.08));

  // outer plate ring
  g.append('circle').attr('class', 'plate-outer').attr('cx', cx).attr('cy', cy).attr('r', plateOuterR);
  // inner plate (slightly lighter)
  g.append('circle').attr('class', 'plate-inner').attr('cx', cx).attr('cy', cy).attr('r', plateInnerR);

      // create a full-circle path (two half-arcs) so we can attach textPath (category stroke sits on plate)
      const pathD = `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy}`;
      g.append('path')
        .attr('id', `cat-path-${i}`)
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', 'black')
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
        .attr('startOffset', '60%')
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

      // dynamic node radius based on a numeric meal attribute (Calories)
      // compute numeric calories for meals (use all meals to keep sizes consistent)
      const mealCalories = allMeals.map(m => {
        const c = Number(m.Calories || m['Calories'] || m.Calories_Burned || m.Calories_Burned);
        return isFinite(c) ? c : NaN;
      }).filter(c => !Number.isNaN(c));

  // default node radius range as fractions of the parent circle so they scale responsively
  const minNode = Math.max(3, Math.round(r * 0.04));
  const maxNode = Math.max(minNode + 2, Math.round(r * 0.18));

      let sizeScale = null;
      if (mealCalories.length >= 2) {
        const minC = d3.min(mealCalories);
        const maxC = d3.max(mealCalories);
        sizeScale = d3.scaleSqrt().domain([minC, maxC]).range([minNode, maxNode]);
      }

      // create nodes for simulation from ALL meals, with radius per node (dynamic). Mark whether they match filters.
      const nodes = allMeals.map((m, idx) => {
        const rawCal = Number(m.Calories || m['Calories'] || m.Calories_Burned || m.Calories_Burned);
        const cal = isFinite(rawCal) ? rawCal : d3.mean(mealCalories) || (minNode + maxNode) / 2;
        const ndR = sizeScale ? Math.round(sizeScale(cal)) : Math.max(6, Math.min(12, Math.floor(r / 6)));
        return {
          id: `${i}-${idx}`,
          meal: m,
          x: cx + (Math.random() - 0.5) * r * 0.8,
          y: cy + (Math.random() - 0.5) * r * 0.8,
          r: ndR,
          // blob animation params
          _phase: Math.random() * Math.PI * 2,
          _freq: 0.6 + Math.random() * 1.2,
          _amp: 0.06 + Math.random() * 0.12,
          matched: mealMatchesFilters(m),
        };
      });

      // bind nodes to animated blob path elements (inside pan-group)
      const blobs = (svgApi.panGroup || svg)
        .selectAll(`.meal-blob-${i}`)
        .data(nodes, d => d.id)
        .join('path')
        .attr('class', `meal-blob meal-blob-${i}`)
        .attr('d', d => blobPath(d.x, d.y, d.r, 8, d._phase, d._freq, d._amp))
        .attr('fill', nd => (nd.matched ? dietColor(nd.meal.diet_type) : '#cfcfcf'))
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .attr('stroke-width', 1)
        .attr('opacity', d => (d.matched ? 1 : 0.65))
        .on('mouseover', function (event, nd) {
          d3.select(this).attr('stroke', '#000').attr('stroke-width', 1.5);
          const tt = d3.select('body').select('.viz-tooltip');
          tt.style('display', 'block').html(`<strong>${nd.meal.meal_name || 'Meal'}</strong><br/>Diet: ${nd.meal.diet_type || '—'}`);
        })
        .on('mousemove', function (event) {
          d3.select('body').select('.viz-tooltip').style('left', event.pageX + 12 + 'px').style('top', event.pageY + 12 + 'px');
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke', 'rgba(0,0,0,0.06)').attr('stroke-width', 1);
          d3.select('body').select('.viz-tooltip').style('display', 'none');
        });

      // live force simulation to avoid overlaps and animate when nodes move (supports dragging)
      const sim = d3.forceSimulation(nodes)
        .velocityDecay(0.2)
        .force('charge', d3.forceManyBody().strength(0))
        .force('collide', d3.forceCollide().radius(d => d.r + 1).iterations(2))
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
          const maxDist = r - n.r - 1;
          if (dist > maxDist) {
            const scale = maxDist / dist;
            n.x = cx + dx * scale;
            n.y = cy + dy * scale;
          }
        });

        // update only this category's blobs (path 'd')
        (svgApi.panGroup || svg).selectAll(`.meal-blob-${i}`).attr('d', d => blobPath(d.x, d.y, d.r, 8, d._phase, d._freq, d._amp));
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
          const maxDist = r - d.r - 1;
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

  // apply drag to blobs of this category (inside pan-group)
  (svgApi.panGroup || svg).selectAll(`.meal-blob-${i}`).call(drag);
    });
  }

  // bootstrap: create svg and then load data
  const svgApi = createFullscreenSVG('#viz');

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

    // Start a continuous animation loop to update blob shapes even when the force is idle
    (function animateBlobs() {
      try {
        if (svgApi && svgApi.panGroup) {
          svgApi.panGroup.selectAll('.meal-blob').each(function (d) {
            if (!d) return;
            d3.select(this).attr('d', blobPath(d.x, d.y, d.r, 8, d._phase, d._freq, d._amp));
          });
        } else if (svgApi && svgApi.svg) {
          svgApi.svg.selectAll('.meal-blob').each(function (d) {
            if (!d) return;
            d3.select(this).attr('d', blobPath(d.x, d.y, d.r, 8, d._phase, d._freq, d._amp));
          });
        }
      } catch (e) {
        // ignore animation errors
      }
      requestAnimationFrame(animateBlobs);
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
    // Title above the filtering options
    container.append('h3').attr('class', 'controls-title').text('Find me a meal with...');
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

    // --- numeric nutrient sliders ---
    // // pick likely nutrient columns by matching header names
    // const headers = raw.length ? Object.keys(raw[0]) : [];
    // const detectedNutrients = headers.filter(h => /calor|protein|fat|carb|sugar|sodium|cholesterol/i.test(h));

    // // Store a user-selectable set of nutrients to show (defaults to all detected)
    // if (!svgApi.nutrientSelection) {
    //   svgApi.nutrientSelection = {};
    //   detectedNutrients.forEach(k => { svgApi.nutrientSelection[k] = true; });
    // }

    // // Container and chooser UI so users can remove some nutrients from the controls
    // const chooser = container.append('div').attr('class', 'control-group');
    // chooser.append('h3').text('Choose nutrients');
    // const chooserRow = chooser.append('div').attr('class', 'control-row').style('display', 'flex').style('flex-wrap', 'wrap').style('gap', '8px');

    // detectedNutrients.forEach(field => {
    //   const label = chooserRow.append('label').attr('class', 'control-row').style('align-items', 'center').style('gap', '6px');
    //   label.append('input')
    //     .attr('type', 'checkbox')
    //     .property('checked', !!svgApi.nutrientSelection[field])
    //     .on('change', function () {
    //       svgApi.nutrientSelection[field] = this.checked;
    //       // re-render sliders when selection changes
    //       renderNutrientSliders();
    //     });
    //   label.append('span').attr('class', 'control-label').text(field).style('font-size', '12px');
    // });

    // // container where sliders are rendered; renderNutrientSliders will populate it
    // const slidersWrapper = container.append('div').attr('id', 'nutrient-sliders');

    // // render sliders for currently selected nutrients
    // function renderNutrientSliders() {
    //   slidersWrapper.html('');
    //   const nutrientKeys = detectedNutrients.filter(k => svgApi.nutrientSelection[k]);
    //   if (nutrientKeys.length === 0) return;
    //   const ng = slidersWrapper.append('div').attr('class', 'control-group');
    //   ng.append('h3').text('Nutrient filters');

    //   nutrientKeys.forEach(field => {
    //     const values = raw.map(r => Number(r[field])).filter(v => isFinite(v));
    //     if (values.length === 0) return;
    //     const minV = Math.min(...values);
    //     const maxV = Math.max(...values);

    //     // store initial full-range in filters if not present
    //     if (!svgApi.filters.nutrients[field]) svgApi.filters.nutrients[field] = { min: minV, max: maxV };

    //     const fg = ng.append('div').attr('class', 'control-group');
    //     fg.append('div').attr('class', 'control-row').html(`<span class="control-label">${field}</span><span class="slider-value" id="${safeId(field)}-val">${Math.round(svgApi.filters.nutrients[field].min)}–${Math.round(svgApi.filters.nutrients[field].max)}</span>`);

    //     const row = fg.append('div').attr('class', 'control-row').style('flex-direction', 'column').style('gap', '6px');

    //     // min slider
    //     row.append('input')
    //       .attr('type', 'range')
    //       .attr('min', minV)
    //       .attr('max', maxV)
    //       .attr('value', svgApi.filters.nutrients[field].min)
    //       .attr('step', Math.max(1, (maxV - minV) / 100))
    //       .on('input', function () {
    //         const v = Number(this.value);
    //         svgApi.filters.nutrients[field].min = v;
    //         d3.select(`#${safeId(field)}-val`).text(Math.round(svgApi.filters.nutrients[field].min) + '–' + Math.round(svgApi.filters.nutrients[field].max));
    //         debouncedRedraw();
    //       });

    //     // max slider
    //     row.append('input')
    //       .attr('type', 'range')
    //       .attr('min', minV)
    //       .attr('max', maxV)
    //       .attr('value', svgApi.filters.nutrients[field].max)
    //       .attr('step', Math.max(1, (maxV - minV) / 100))
    //       .on('input', function () {
    //         const v = Number(this.value);
    //         svgApi.filters.nutrients[field].max = v;
    //         d3.select(`#${safeId(field)}-val`).text(Math.round(svgApi.filters.nutrients[field].min) + '–' + Math.round(svgApi.filters.nutrients[field].max));
    //         debouncedRedraw();
    //       });
    //   });
    // }

    // // initial render
    // renderNutrientSliders();

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

    // --- Size meaning: sample min/avg/max for Calories (blob size) ---
    const calorieVals = raw.map(m => {
      const c = Number(m.Calories || m['Calories'] || m.Calories_Burned || m.Calories_Burned);
      return isFinite(c) ? c : NaN;
    }).filter(v => !Number.isNaN(v));
    if (calorieVals.length > 0) {
      const minC = Math.round(d3.min(calorieVals));
      const avgC = Math.round(d3.mean(calorieVals));
      const maxC = Math.round(d3.max(calorieVals));

      const sizeTitle = document.createElement('h4');
      sizeTitle.textContent = 'Blob size (≈)';
      legendEl.appendChild(sizeTitle);

      // simple sqrt scale for sample diameters in legend
      const sampleScale = d3.scaleSqrt().domain([minC, maxC]).range([8, 24]);
      const samples = [ {label: `min: ${minC}` , value: minC}, {label: `avg: ${avgC}`, value: avgC}, {label: `max: ${maxC}`, value: maxC} ];
      samples.forEach(s => {
        const row = document.createElement('div');
        row.className = 'legend-size-item';
        const sw = document.createElement('span');
        sw.className = 'sswatch';
        const dpx = Math.max(6, Math.round(sampleScale(s.value) * 2));
        sw.style.width = dpx + 'px';
        sw.style.height = dpx + 'px';
        row.appendChild(sw);
        const lbl = document.createElement('span');
        lbl.className = 'label';
        lbl.textContent = `${s.label} kcal`;
        row.appendChild(lbl);
        legendEl.appendChild(row);
      });

      const note = document.createElement('div');
      note.style.fontSize = '12px';
      note.style.color = '#444';
      note.style.marginTop = '6px';
      note.textContent = 'Blob area ≈ Calories (larger = more calories)';
      legendEl.appendChild(note);
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
    blobContainer.selectAll('.meal-blob').each(function (d) {
      if (!d || !d.meal) return;
      d.matched = matchesFilters(d.meal, filters);
    });

    // animate color and slight opacity change to visually transition
    blobContainer.selectAll('.meal-blob')
      .transition()
      .duration(450)
      .attr('fill', d => (d.matched ? dietColor(d.meal.diet_type) : '#cfcfcf'))
      .attr('opacity', d => (d.matched ? 1 : 0.65));
  }, 120);
})();
