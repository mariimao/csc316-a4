class Flower {

  // Constructor to initialize flower plot
  constructor(parentElement, data, workoutType = "HIIT", dietType = "Vegetarian") {
    console.log("Start initializing flower plot");
    this.parentElement = parentElement;
    this.data = data;
    this.displayData = [];
    
    this.workoutType = workoutType;
    this.dietType = dietType;
    
    this.petalLengthOption = "Calories"; // Options: "Calories", "Calories_Burned"
    
    // Compute data ranges for scaling
    this.waterIntakeRange = d3.extent(this.data, d => d["Water_Intake (liters)"]);
    this.caloriesIntake = d3.extent(this.data, d => d["Calories"]);
    this.caloriesBurnedRange = d3.extent(this.data, d => d["Calories_Burned"]);
    this.workoutFreqRange = [2, 5];
    this.bmiRange = d3.extent(this.data, d => d["BMI"]);
    this.dietFreqRange = d3.extent(this.data, d => d["Daily meals frequency"]);

    // Prepare colors for the flower petals
    this.colorPalette = d3.scaleOrdinal(d3.schemePastel1);
    this.dietTypes = Array.from(new Set(this.data.map(d => d["diet_type"])));
    this.colorPalette.domain(this.dietTypes);

    // Randomly sample 36 data points
    this.displayData = d3.shuffle(this.data).slice(0, 36);
    this.centerR = 10;
    this.maxOuterR = 200;
    this.minOuterR = 100;
    this.degOfSpread = 0.9; // 1: petals fully spread outwards; 0: rear of petal at center

    // Set format
    this.fmtInt = d3.format(",");
    this.fmt1 = d3.format(".1f");

    console.log("Finished initializing flower plot");
  }

  wrangleData() {
      let vis = this;
      
      console.log('isArray:', Array.isArray(vis.data), vis.data);
      
      // Group calories, calories burned, water intake, and workout frequency by workout type -> diet type
      const groupedData = d3.rollup(vis.data,
          v => ({
              avgWater: d3.mean(v, d => d["Water_Intake (liters)"]),
              avgCaloriesIntake: d3.mean(v, d => d["Calories"]),
              avgCaloriesBurned: d3.mean(v, d => d["Calories_Burned"]),
              avgWorkoutFreq: d3.mean(v, d => d["Workout_Frequency (days/week)"]),
              avgBMI: d3.mean(v, d => d["BMI"]),
              avgDietFreq : d3.mean(v, d => d["Daily meals frequency"]),
              count: v.length
          }),
          d => d["Workout_Type"],
          d => d["diet_type"],
          d => Math.round(d["Age"] / 10) * 10
      );
      
      const flatData = [];
      
      groupedData.forEach((dietMap, workoutType) => {
          dietMap.forEach((ageMap, dietType) => {
              ageMap.forEach((stats, ageGroup) => {
                  flatData.push({
                      Workout_Type: workoutType,
                      diet_type: dietType,
                      AgeGroup: ageGroup,
                      ...stats // flatten the rest of the attributes
                  });
              });
          });
      });
      
      vis.groupedData = groupedData;
      vis.displayData = flatData;
      
      console.log("Flattened data by workout type and diet type:");
      console.log(flatData);
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
      
    vis.wrangleData();
    
    // SVG Drawing area
    vis.svg = d3.select("#" + vis.parentElement).append("svg")
      .attr("width", vis.width + vis.margin.left + vis.margin.right)
      .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
      .append("g")
      .attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

    // Add tooltip placeholder
    vis.tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip");

    // Scales and axes
    vis.petalWidth = d3.scaleLinear()
        .domain(vis.dietFreqRange)
        .range([10, 28]);

    vis.petalLength = d3.scaleLinear()
        .range([vis.minOuterR, vis.maxOuterR]);

    vis.shading = d3.scaleLinear()
        .domain(vis.waterIntakeRange)
        .range([0.3, 1]);

    vis.numLines = d => d;

    // Initialize flower layout

    // TODO: might require change

    // Draw plate
    // vis.drawPlate();

    vis.flower = vis.svg.append("g")
        .attr("transform", `translate(${vis.width/2},${vis.height/2})`);

    // Draw flower petals
    vis.drawFlowerPetals();

    // Disabled: Draw flower center
    // vis.drawFlowerCenter();

    // Disabled: Enable breathing
    // vis.enableBreathing();
      
    
  }
  
  updateVis() {
      let vis = this;
      
      // Update scales based on user selection
      if (vis.petalLengthOption === "Calories") {
          vis.petalLength.domain(vis.caloriesIntake);
      } else if (vis.petalLengthOption === "Calories_Burned") {
          vis.petalLength.domain(vis.caloriesBurnedRange);
      }
  }

  // TODO: remove all this.xxx

  /*
  Helper to draw the flower petals.
   */
  drawFlowerPetals() {
    console.log("Drawing petals");

    const n = this.displayData.length;
    const petalLen = (d) => (this.getOuterR(d) - this.centerR) * 0.9;
    const petalWid = (d) => this.getPetalWidth(d);

    // Flower petals for every instance of this.displayData
    const petals = this.flower.selectAll("ellipse")
        .data(this.displayData)
        .join("ellipse")
        .attr("class", "petal")
        .attr("cx", (d, i) => {
            const theta = (i / n) * 2 * Math.PI; // angle for petal
            const offset = this.centerR + this.degOfSpread * petalLen(d);
            return Math.cos(theta) * offset;
        })
        .attr("cy", (d, i) => {
            const theta = (i / n) * 2 * Math.PI; // angle for petal
            const offset = this.centerR + this.degOfSpread * petalLen(d);
            return Math.sin(theta) * offset;
        })
        .attr("rx", d => petalWid(d))
        .attr("ry", d => petalLen(d))
        .attr("transform", (d, i) => {
            const theta = (i / n) * 360; // angle for petal in degrees
            const offset = this.centerR + this.degOfSpread * petalLen(d);
            const cx = Math.cos((i / n) * 2 * Math.PI) * offset;
            const cy = Math.sin((i / n) * 2 * Math.PI) * offset;
            return `rotate(${theta - 90}, ${cx}, ${cy})`;
        })
        .attr("fill", d => this.colorPalette(d["diet_type"]))
        .attr("fill-opacity", d => this.shading(d["Water_Intake (liters)"]))
        .attr("stroke", d => this.getBorderColor(d["diet_type"]))
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("mouseenter", (e, d) => {
          // Highlight the selected petal
          d3.select(event.currentTarget)
              .attr("stroke-width", 2.5)
              .attr("fill-opacity", 1)
              .raise();

          // Configure tooltip content and position
          const html =
              `<div class="h">${d.diet_type ?? "Diet type"}</div>
       <div class="kr"><span class="k">Daily calories intake:</span> ${this.fmtInt(d["Calories"])}</div>
       <div class="kr"><span class="k">Calories burned:</span> ${this.fmtInt(d["Calories_Burned"])}</div>
       <div class="kr"><span class="k">Meals/day:</span> ${this.fmt1(d["Daily meals frequency"])}</div>
       <div class="kr"><span class="k">Water intake:</span> ${this.fmt1(d["Water_Intake (liters)"])} L</div>
       <div class="kr"><span class="k">Workout freq:</span> ${this.fmt1(d["Workout_Frequency (days/week)"])} d/wk</div>`;

          this.tooltip.html(html).style("opacity", 1);
        })
        .on("mousemove", (event) => {
          this.tooltip
              .style("left", (event.pageX) + "px")
              .style("top",  (event.pageY) + "px");
        })
        .on("mouseleave", (event) => {
          d3.select(event.currentTarget)
              .attr("stroke-width", 1)
              .attr("fill-opacity", d => this.shading(d["Water_Intake (liters)"]));
          this.tooltip.style("opacity", 0);
        })
        .append("title")
        .text(d => `Diet: ${d.diet_type}
Calories: ${this.fmtInt(d["Calories_Burned"])}`);
  }

  // Helper function to draw the center of the flower
  drawFlowerCenter() {
      this.svg.append("circle")
          .attr("cx", this.width / 2)
          .attr("cy", this.height / 2)
          .attr("r", this.centerR)
          .attr("fill", "#ffcc66")
          .attr("stroke", "#cc9933")
          .attr("stroke-width", 2);
  }

  /*
    Enable breathing animation for the flower
   */
  enableBreathing() {
    const vis = this;
    vis.flower.selectAll("ellipse").attr("vector-effect", "non-scaling-stroke");

    const AMP   = 0.03;   // += 5% size change
    const SPEED = 0.2;    // frequency of breath cycles per sec

    vis._breathTimer = d3.timer(elapsed => {
      const s = 1 + AMP * Math.sin(2 * Math.PI * SPEED * (elapsed / 1000));
      vis.flower.attr(
          "transform",
          `translate(${vis.width / 2},${vis.height / 2}) scale(${s})`
      );
    });

    // Pause breathing on mouseover, resume on mouseout
    vis.flower
        .on("mouseenter", () => vis._breathTimer?.stop())
        .on("mouseleave", () => {
          if (!vis._breathTimer || vis._breathTimer.stopped) {
            vis._breathTimer = d3.timer(elapsed => {
              const s = 1 + AMP * Math.sin(2 * Math.PI * SPEED * (elapsed / 1000));
              vis.flower.attr(
                  "transform",
                  `translate(${vis.width / 2},${vis.height / 2}) scale(${s})`
              );
            });
          }
        });
  }

  // Helper function to draw the rest of the plate's shape
  drawPlate() {
      const plateColor = "#999999";

      const defs = this.svg.append("defs");
      const rg = defs.append("radialGradient").attr("id", "plateGradient");
      rg.append("stop").attr("offset","0%").attr("stop-color","#f8f8f8").attr("stop-opacity",.9);
      rg.append("stop").attr("offset","70%").attr("stop-color","#dcdcdc").attr("stop-opacity",.8);
      rg.append("stop").attr("offset","100%").attr("stop-color","#c0c0c0").attr("stop-opacity",.7);

      const tipMax = d3.max(this.displayData, d => {
        const len = 0.9 * (this.getOuterR(d) - this.centerR);
        return this.centerR + (this.degOfSpread + 1) * len;
      });

      // Inner circle of plate
      this.svg.append("circle")
          .attr("cx", this.width / 2)
          .attr("cy", this.height / 2)
          .attr("r", tipMax + 20)
          .attr("fill", "none")
          .attr("fill-opacity", 0.3)
          .attr("stroke", "rgba(255, 255, 255, .55)")
          .attr("stroke-width", 2);

      // Outer circle of plate
      this.svg.append("circle")
          .attr("cx", this.width / 2)
          .attr("cy", this.height / 2)
          .attr("r", tipMax + 25)
          .attr("fill", "url(#plateGradient)")
          .attr("fill-opacity", 0.3)
          .attr("stroke", "rgba(255, 255, 255, .35)")
          .attr("stroke-width", 2);
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
    return this.petalLength(d["Calories"]);
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
