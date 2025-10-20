class Flower {

  // Constructor to initialize flower plot
  constructor(parentElement, data) {
    console.log("Start initializing flower plot");
    this.parentElement = parentElement;
    this.data = data;

    // Prepare colors for the flower petals
    this.colorPalette = d3.scaleOrdinal(d3.schemePastel1);
    this.dietTypes = Array.from(new Set(this.data.map(d => d["diet_type"])));
    this.colorPalette.domain(this.dietTypes);

    // Randomly sample 36 data points
    this.displayData = d3.shuffle(this.data).slice(0, 36);
    this.centerR = 20;

    // Process data for visualization
    this.prepareData(this.displayData);

    console.log("Finished initializing flower plot");
  }

  prepareData(displayData) {
    this.frequencyOfDiet = displayData.map(d => Math.round(d["Daily meals frequency"]));
    this.caloriedBurned = displayData.map(d => +d["Calories_Burned"]);
    this.waterIntake = displayData.map(d => +d["Water_Intake (liters)"]);
    this.workoutFrequency = displayData.map(d => Math.round(d["Workout_Frequency (days/week)"]));
  }

  /*
	 * Method that initializes the visualization (static content, e.g. SVG area or axes)
 	*/
  initVis() {
    let vis = this;
    vis.margin = { top: 20, right: 20, bottom: 20, left: 20 };

    console.log("Initializing flower plot dimensions");
    console.log(document.getElementById(vis.parentElement).getBoundingClientRect().width);
    console.log(document.getElementById(vis.parentElement).getBoundingClientRect().height);
    vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
    vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;
    console.log(`Flower plot dimensions: ${vis.width} x ${vis.height}`);

    // SVG Drawing area
    vis.svg = d3.select("#" + vis.parentElement).append("svg")
      .attr("width", vis.width + vis.margin.left + vis.margin.right)
      .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
      .append("g")
      .attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

    // Scales and axes
    vis.petalWidth = d3.scaleLinear()
        .domain(d3.extent(vis.frequencyOfDiet))
        .range([10, 28]);

    vis.petalLength = d3.scaleLinear()
        .domain(d3.extent(vis.caloriedBurned))
        .range([100, 200]);

    vis.shading = d3.scaleLinear()
        .domain(d3.extent(vis.waterIntake)) // TODO: should be proportion of area shaded, not percentage of alpha
        .range([0.3, 1]);

    vis.numLines = d => d;

    // Initialize flower layout
    // Flower center
    vis.svg.append("circle")
        .attr("cx", vis.width / 2)
        .attr("cy", vis.height / 2)
        .attr("r", vis.centerR)
        .attr("fill", "#ffcc66");

    // TODO: might require change
    vis.flower = vis.svg.append("g")
        .attr("transform", `translate(${vis.width/2},${vis.height/2})`);

    // Draw flower petals
    vis.drawFlowerPetals();

  }

  // TODO: remove all this.xxx

  /*
  Helper to draw the flower petals.
   */
  drawFlowerPetals() {
    console.log("Drawing petals");
    // Flower petals for every instance of this.displayData
    let petals = this.flower.selectAll("ellipse").data(this.displayData);

    petals
        .enter()
        .append("ellipse")
        .attr("cx", 0)
        .attr("cy", d => -(this.centerR + (this.getOuterR(d) - this.centerR) * 0.65))
        .attr("rx", d => this.getPetalWidth(d))
        .attr("ry", d => (this.getOuterR(d) - this.centerR) * 0.9) // TODO: might require adjustment
        .attr("transform", (d, i) => `rotate(${(i / this.displayData.length) * 360})`)
        .attr("fill", d => this.colorPalette(d["diet_type"]))
        .attr("fill-opacity", d => this.shading(d["Water_Intake (liters)"])) // TODO: should be percentage of shading, not opacity of shading
        .attr("stroke", d => this.getBorderColor(d["diet_type"]))
        .attr("stroke-width", 1);

    // Delete petals that are no longer needed
    petals.exit().remove();
  }

  /*
  Helper to get the border color for a given diet type.
   */
  getBorderColor(dietType) {
    const baseColor = this.colorPalette(dietType);
    return darkenColor(baseColor);
  }

  // Animation - breathing effect
  // TODO: might require change similar to vis.flower
  breathe(t) {
    const s = 1 + Math.sin(t / 900) * 0.03;
    this.flower.attr("transform", `translate(${this.width/2},${this.height/2}) scale(${s})`);
    requestAnimationFrame(this.breathe);
  }

  // Helper to get outer radius of petal based on length
  getOuterR(d) {
    return this.petalLength(d["Calories_Burned"]);
  }

  // Helper to get petal width
  getPetalWidth(d) {
    return this.petalWidth(d["Daily meals frequency"]);
  }
}

// Helper function to darken a color
// Input: color string
// Output: darkened color string
function darkenColor(color) {
    const c = d3.color(color);
    c.r = Math.max(0, c.r - 30);
    c.g = Math.max(0, c.g - 30);
    c.b = Math.max(0, c.b - 30);
    return c.toString();
}
