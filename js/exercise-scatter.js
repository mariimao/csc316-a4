class ExerciseScatter {
    constructor(parentElement, data, xValue,
                yValue, colorValue) {
        this.parentElement = parentElement;
        this.data = data;
        this.xValue = xValue;
        this.yValue = yValue;
        this.colorValue = colorValue;
        this.displayData = [];
    }
    
    initVis() {
        let vis = this;
        
        // Set up margins and dimensions
        vis.margin = {top: 40, right: 40, bottom: 60, left: 60};
        vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width -
            vis.margin.left - vis.margin.right;
        vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height -
            vis.margin.top - vis.margin.bottom;
        
        // Create SVG area
        vis.svg = d3.select("#" + vis.parentElement).append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");
        
        vis.chart = vis.svg.append("g")
            .attr("class", "chart-area")
            .attr("width", vis.width)
            .attr("height", vis.height);
        
        // Scales and axes
        vis.xScale = d3.scaleLinear().range([0, vis.width]);
        vis.yScale = d3.scaleLinear().range([vis.height, 0]);
        
        vis.xAxis = d3.axisBottom().scale(vis.xScale);
        vis.yAxis = d3.axisLeft().scale(vis.yScale);
        
        vis.svg.append("g")
            .attr("class", "x-axis axis")
            .attr("transform", "translate(0," + vis.height + ")");
        
        vis.svg.append("g")
            .attr("class", "y-axis axis");
        
        vis.svg.append("text")
            .attr("class", "x-title")
            .attr("x", vis.width / 2)
            .attr("y", vis.height + 40)
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .attr("fill", "black");
        
        vis.svg.append("text")
            .attr("class", "y-title")
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .attr("fill", "black")
            .attr("transform", `translate(-50, ${vis.height / 2}) rotate(-90)`)
        
        vis.wrangleData();
    }
    
    updateFilter(xValue, yValue, colorValue) {
        let vis = this;
        vis.xValue = xValue;
        vis.yValue = yValue;
        vis.colorValue = colorValue;
        vis.wrangleData();
    }
    
    wrangleData() {
        // Filter vis.data that only equals vis.xValue and vis.yValue
        // Get the workout frequency and calories burned for that
        let vis = this;
        
        let filtered = vis.data.filter(d => {
            return d.Gender === vis.xValue &&
            Math.round(d.Age / 5) * 5 === vis.yValue;
        });
        
        vis.displayData = filtered
            .map(d => ({
                gender: d.Gender,
                age: Math.round(d.Age / 5) * 5,
                workout: +d["Workout_Frequency (days/week)"],
                calories: +d["Calories_Burned"]
            }))
            .filter(d => !isNaN(d.workout) && !isNaN(d.calories));
        
        console.log(vis.displayData);
        
        vis.updateVis();
    }
    
    updateVis() {
        let vis = this;
        
        // Update scales
        vis.xScale.domain(d3.extent(vis.displayData, d => d.workout)).nice();
        vis.yScale.domain(d3.extent(vis.displayData, d => d.calories)).nice();
        
        // Update axes
        vis.svg.select(".x-axis").transition().duration(500).call(vis.xAxis);
        vis.svg.select(".y-axis").transition().duration(500).call(vis.yAxis);
        
        vis.svg.select(".x-title")
            .text("Workout Frequency (days/week)");
        
        vis.svg.select(".y-title")
            .text("Energy Burned during a Workout Session (calories)");
        
        
        // Draw circles
        let circles = vis.chart.selectAll("circle")
            .data(vis.displayData);
        
        circles.exit().remove();
        
        circles.enter()
            .append("circle")
            .attr("class", "data-point")
            .attr("x", d => vis.xScale(d.workout))
            .attr("y", d => vis.yScale(d.calories))
            .attr("r", 5)
            .attr("fill", vis.colorValue)
            .merge(circles)
            .transition().duration(500)
            .attr("cx", d => vis.xScale(d.workout))
            .attr("cy", d => vis.yScale(d.calories))
            .attr("fill", vis.colorValue);
        
    }
}