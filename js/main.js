const width = 800;
const height = 800;
const radius = 350; // kept for reference (not used for grid layout)

// select SVG and ensure it has size attributes (defensive)
const svg = d3.select("#petri-dish")
  .attr("width", width)
  .attr("height", height);

const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Nutrient used for sizing bubbles
const sizeScale = d3.scaleSqrt().range([4, 20]); // For example, sugar_g

const tooltip = d3.select("body").append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

d3.csv("data/meal_metadata.csv", d3.autoType)
  .then(data => {
    if (!data || data.length === 0) {
      console.error("CSV loaded but contains no rows or is empty.");
      return;
    }

    // set size scale domain early so legend uses the same mapping as bubbles
    sizeScale.domain(d3.extent(data, d => d.serving_size_g));

    // compute dietTypes for coloring (colour by diet_type)
    const dietTypes = Array.from(new Set(data.map(d => d.diet_type))).sort();
    colorScale.domain(dietTypes);

    // populate legend (diet_type -> color) into dedicated color container so it appears before size legend
    const colorContainer = d3.select("#color-legend-items");
    colorContainer.selectAll(".legend-item").remove();
    const items = colorContainer.selectAll(".legend-item")
      .data(dietTypes)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items.append("span")
      .attr("class", "swatch")
      .style("background-color", d => colorScale(d));

    items.append("span")
      .attr("class", "label")
      .text(d => d);

    // --- size legend (serving_size_g) ---
    // compute extent and mean for serving size
    const sizeExtent = d3.extent(data, d => +d.serving_size_g);
    const sizeMean = d3.mean(data, d => +d.serving_size_g);
    // samples: min, mean, max (rounded)
    const sizeSamples = [
      {label: "min", value: Math.round(sizeExtent[0])},
      {label: "avg", value: Math.round(sizeMean)},
      {label: "max", value: Math.round(sizeExtent[1])}
    ];

    // container inside legend for sizes (ensure exists)
    const sizeContainer = d3.select("#size-legend");
    sizeContainer.selectAll(".legend-size-item").remove();

    // append one row per sample: circle sized by sizeScale(radius) and label
    const sizeItems = sizeContainer.selectAll(".legend-size-item")
      .data(sizeSamples)
      .enter()
      .append("div")
      .attr("class", "legend-size-item");

    sizeItems.append("span")
      .attr("class", "sswatch")
      .each(function(d) {
        // compute radius from sizeScale (sizeScale maps to radius)
        const r = sizeScale(d.value) || 4;
        const diameter = Math.max(6, Math.round(r * 2));
        d3.select(this).style("width", diameter + "px").style("height", diameter + "px");
      });

    sizeItems.append("span")
      .attr("class", "label")
      .text(d => `${d.label}: ${d.value} g`);
    // --- end size legend ---

    // GROUP BY meal_type instead of diet_type
    const mealTypes = Array.from(new Set(data.map(d => d.meal_type))).sort();

    // grid layout based on mealTypes
    const cols = Math.min(4, mealTypes.length);
    const rows = Math.ceil(mealTypes.length / cols);
    const dishRadius = 100;
    const xSpacing = width / (cols + 1);
    const ySpacing = height / (rows + 1);

    // create one dish per meal type
    mealTypes.forEach((meal, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = (col + 1) * xSpacing;
      const cy = (row + 1) * ySpacing;

      // compute a rectangular cell size per grid slot (centered at group origin)
      const cellPadding = 20;
      const cellWidth = Math.max(120, (width / cols) - cellPadding * 2);
      const cellHeight = Math.min(300, (height / rows) - cellPadding * 2);
      const halfW = cellWidth / 2;
      const halfH = cellHeight / 2;

      const g = svg.append("g")
        .attr("transform", `translate(${cx},${cy})`);

      // draw rectangular cell (centered)
      g.append("rect")
        .attr("class", "cell")
        .attr("x", -halfW)
        .attr("y", -halfH)
        .attr("width", cellWidth)
        .attr("height", cellHeight)
        .attr("fill", "#fafafa")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 2)
        .attr("rx", 6);

      // label below the cell
      g.append("text")
        .attr("y", halfH + 18)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", "#333")
        .text(meal);

      // items for this meal_type
      const items = data.filter(d => d.meal_type === meal);

      // init positions inside disk
      // initialize positions inside the rectangular cell
      items.forEach(d => {
        const r = (sizeScale(d.serving_size_g) || 4);
        const maxX = Math.max(0, halfW - r - 2);
        const maxY = Math.max(0, halfH - r - 2);
        d.x = (Math.random() * 2 - 1) * maxX;
        d.y = (Math.random() * 2 - 1) * maxY;
      });

      // create bubbles, colour by diet_type
      const nodes = g.selectAll("circle.bubble")
        .data(items)
        .enter()
        .append("circle")
        .classed("bubble", true)
        .attr("r", d => sizeScale(d.serving_size_g))
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .style("cursor", "pointer")
        // store original color on the bound datum then apply it
        .each(function(d) { d._color = colorScale(d.diet_type); })
        .attr("fill", d => d._color)
        .on("mouseover", (event, d) => {
          tooltip.transition().duration(120).style("opacity", 0.95);
          tooltip.html(`
            <strong>${d.meal_name}</strong><br>
            Type: ${d.meal_type}<br>
            Diet: ${d.diet_type}<br>
            Sugar: ${d.sugar_g}g<br>
            Sodium: ${d.sodium_mg}mg<br>
            Cholesterol: ${d.cholesterol_mg}mg
          `)
            .style("left", (event.pageX + 12) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
          tooltip.transition().duration(250).style("opacity", 0);
        });

      // force simulation per dish
      const sim = d3.forceSimulation(items)
         .force("x", d3.forceX(0).strength(0.06))
         .force("y", d3.forceY(0).strength(0.06))
         .force("collide", d3.forceCollide(d => (sizeScale(d.serving_size_g) || 4) + 2))
         .force("charge", d3.forceManyBody().strength(-6))
         .alphaDecay(0.03)
         .on("tick", ticked);

      function ticked() {
        nodes
          .attr("cx", d => {
            // clamp inside rectangle horizontally
            const r = (sizeScale(d.serving_size_g) || 4);
            const maxX = Math.max(0, halfW - r - 2);
            if (d.x > maxX) d.x = maxX;
            if (d.x < -maxX) d.x = -maxX;
            return d.x;
          })
          .attr("cy", d => {
            // clamp inside rectangle vertically
            const r = (sizeScale(d.serving_size_g) || 4);
            const maxY = Math.max(0, halfH - r - 2);
            if (d.y > maxY) d.y = maxY;
            if (d.y < -maxY) d.y = -maxY;
            return d.y;
          });
      }

      // make nodes draggable: convert SVG drag coords to group-local by subtracting group center (cx,cy)
      nodes.call(d3.drag()
        .on("start", function(event, d) {
          if (!event.active) sim.alphaTarget(0.3).restart();
          // event.x/y are already in the group's local coordinates (no subtraction)
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("drag", function(event, d) {
          d.fx = event.x;
          d.fy = event.y;
          d3.select(this).attr("cx", d.fx).attr("cy", d.fy);
        })
        .on("end", function(event, d) {
          if (!event.active) sim.alphaTarget(0);
          // release fixed position so simulation continues
          d.fx = null;
          d.fy = null;
        })
      );
    });

    let sugarExtent = d3.extent(data, d => +d.sugar_g);
    let sodiumExtent = d3.extent(data, d => +d.sodium_mg);
    let cholExtent = d3.extent(data, d => +d.cholesterol_mg);

    const sugarMean = d3.mean(data, d => +d.sugar_g);
    const sodiumMean = d3.mean(data, d => +d.sodium_mg);
    const cholMean = d3.mean(data, d => +d.cholesterol_mg);

    function setupSingleRange(id, currId, minId, maxId, meanId, extent, meanValue, step) {
      const input = d3.select(`#${id}`)
        .attr("min", extent[0])
        .attr("max", extent[1])
        .attr("step", step)
        .attr("value", extent[1]);

      d3.select(`#${minId}`).text(Number(extent[0]).toFixed(step < 1 ? 1 : 0));
      d3.select(`#${maxId}`).text(Number(extent[1]).toFixed(step < 1 ? 1 : 0));
      d3.select(`#${meanId}`).text(Number(meanValue).toFixed(step < 1 ? 1 : 0));
      d3.select(`#${currId}`).text(input.node().value);

      input.on("input", function() {
        d3.select(`#${currId}`).text(this.value);
        applyFilters();
      });
    }

    setupSingleRange("sugar", "sugar-val", "sugar-min-val", "sugar-max-val", "sugar-mean", sugarExtent, sugarMean, 0.1);
    setupSingleRange("sodium", "sodium-val", "sodium-min-val", "sodium-max-val", "sodium-mean", sodiumExtent, sodiumMean, 1);
    setupSingleRange("chol", "chol-val", "chol-min-val", "chol-max-val", "chol-mean", cholExtent, cholMean, 1);

    d3.select("#reset-filters").on("click", () => {
      document.getElementById("sugar").value = sugarExtent[1];
      document.getElementById("sodium").value = sodiumExtent[1];
      document.getElementById("chol").value = cholExtent[1];

      d3.select("#sugar-val").text(Number(sugarExtent[1]).toFixed(1));
      d3.select("#sodium-val").text(Number(sodiumExtent[1]).toFixed(0));
      d3.select("#chol-val").text(Number(cholExtent[1]).toFixed(0));

      d3.select("#sugar-min-val").text(Number(sugarExtent[0]).toFixed(1));
      d3.select("#sugar-max-val").text(Number(sugarExtent[1]).toFixed(1));
      d3.select("#sugar-mean").text(Number(sugarMean).toFixed(1));

      d3.select("#sodium-min-val").text(Number(sodiumExtent[0]).toFixed(0));
      d3.select("#sodium-max-val").text(Number(sodiumExtent[1]).toFixed(0));
      d3.select("#sodium-mean").text(Number(sodiumMean).toFixed(0));

      d3.select("#chol-min-val").text(Number(cholExtent[0]).toFixed(0));
      d3.select("#chol-max-val").text(Number(cholExtent[1]).toFixed(0));
      d3.select("#chol-mean").text(Number(cholMean).toFixed(0));

      applyFilters();
    });

    function applyFilters() {
      const sMin = sugarExtent[0], sMax = parseFloat(document.getElementById("sugar").value);
      const soMin = sodiumExtent[0], soMax = parseFloat(document.getElementById("sodium").value);
      const chMin = cholExtent[0], chMax = parseFloat(document.getElementById("chol").value);

      d3.selectAll("circle.bubble").each(function(d) {
        const ok =
          +d.sugar_g >= sMin && +d.sugar_g <= sMax &&
          +d.sodium_mg >= soMin && +d.sodium_mg <= soMax &&
          +d.cholesterol_mg >= chMin && +d.cholesterol_mg <= chMax;
        const sel = d3.select(this);
        // show matched nodes in original colour; unmatched -> grey + reduced opacity
        if (ok) {
          sel.attr("fill", d._color).style("opacity", 1);
        } else {
          sel.attr("fill", "#dfdfdfff").style("opacity", 1);
        }
      });
    }

    applyFilters();

  })
  .catch(error => {
    console.error("Failed to load CSV data:", error);
  });
