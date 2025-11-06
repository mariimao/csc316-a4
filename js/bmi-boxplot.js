/**
 * BMI Box Plot Visualization
 * Code is partially adapted from AI-generated content.
 */
class BMIBox {
    
    constructor(parentElement, data) {
        console.log("Start initializing BMI box plot");
        this.parentElement = parentElement;
        this.data = data
        this.displayData = [];
    }
    
    /*
    Initialize visualization.
     */
    initVis() {
        let vis = this;
        vis.margin = {top: 20, right: 30, bottom: 40, left: 40};
        vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
        vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;
        console.log(`BMI box plot dimensions: ${vis.width}x${vis.height}`);
        let constant_bmi_range = [10, 55]
        
        // SVG drawing area
        vis.svg = d3.select("#" + vis.parentElement).append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");
        
        // Scales and axes
        vis.xScale = d3.scaleBand()
            .domain(d3.range(2, 6))  // Workout frequency from 2 to 5 days/week
            .range([0, vis.width])
            .paddingInner(0.3)
            .paddingOuter(0.4);
        
        vis.yScale = d3.scaleLinear().nice()
            .domain(constant_bmi_range)  // BMI range
            .range([vis.height, 0]);
        
        vis.xAxis = d3.axisBottom(vis.xScale).tickFormat(d3.format("d"));
        vis.yAxis = d3.axisLeft(vis.yScale);
        
        
        
        // Append axes
        vis.svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", "translate(0," + vis.height + ")")
            .call(vis.xAxis)
            .append("text")
            .attr("x", vis.width / 2)
            .attr("y", 35)
            .attr("fill", "black")
            .style("text-anchor", "middle")
            .style("font-size", "16px")
            .text("Workout Frequency (days/week)");
        
        vis.svg.append("g")
            .attr("class", "y-axis")
            .call(vis.yAxis)
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -vis.height / 2)
            .attr("y", -25)
            .attr("fill", "black")
            .style("text-anchor", "middle")
            .style("font-size", "16px")
            .text("BMI");
        
        // Initialize interactions
        vis.initInteractions();
        
        vis.wrangleData();
    }
    
    /**
     * Initialize components for interactions.
     */
    initInteractions() {
        let vis = this;
        
        vis.overlay = vis.svg.insert("rect", ":first-child")
            .attr("x", 0).attr("y", 0)
            .attr("width", vis.width)
            .attr("height", vis.height)
            .style("fill", "transparent")
            .style("pointer-events", "all");
        
        vis.hoverLine = vis.svg.append("line")
            .attr("class", "hover-line")
            .attr("x1", 0).attr("x2", vis.width)
            .attr("y1", 0).attr("y2", 0)
            .attr("stroke", "gray")
            .attr("stroke-dasharray", "4,4")
            .style("opacity", 0);
        
        vis.hoverLabel = vis.svg.append("text")
            .attr("class", "hover-line-label")
            .attr("x", vis.width - 4)
            .attr("text-anchor", "end")
            .attr("dy", -4)
            .style("font-size", "12px")
            .style("fill", "gray")
            .style("opacity", 0);
    }
    
    drawboxPlot() {
        let vis = this;
        const fmt = d3.format(".1f");
        
        // For each group, compute box plot statistics and draw
        vis.displayData.forEach((values, key) => {
            let bmiValues = values.map(d => d["BMI"]).sort(d3.ascending);
            let q1 = d3.quantile(bmiValues, 0.25);
            let median = d3.quantile(bmiValues, 0.5);
            let q3 = d3.quantile(bmiValues, 0.75);
            let interQuantileRange = q3 - q1;
            let min_outlier = q1 - 1.5 * interQuantileRange;
            let max_outlier = q3 + 1.5 * interQuantileRange;
            let max_value = d3.min([max_outlier, d3.max(bmiValues)]);
            let min_value = d3.max([min_outlier, d3.min(bmiValues)]);
            
            
            // Draw box
            vis.svg.append("rect")
                .attr("x", vis.xScale(key))
                .attr("y", vis.yScale(q3))
                .attr("width", vis.xScale.bandwidth())
                .attr("height", vis.yScale(q1) - vis.yScale(q3))
                .attr("fill", "#69b3a2");
            
            // border of box
            vis.svg.append("rect")
                .attr("x", vis.xScale(key))
                .attr("y", vis.yScale(q3))
                .attr("width", vis.xScale.bandwidth())
                .attr("height", vis.yScale(q1) - vis.yScale(q3))
                .attr("fill", "none")
                .attr("stroke", "black");
            
            // Draw median line
            vis.svg.append("line")
                .attr("x1", vis.xScale(key))
                .attr("x2", vis.xScale(key) + vis.xScale.bandwidth())
                .attr("y1", vis.yScale(median))
                .attr("y2", vis.yScale(median))
                .attr("stroke", "black");

            // Draw whiskers
            const center_x_of_box = vis.xScale(key) + vis.xScale.bandwidth() / 2
            vis.svg.append("line")
                .attr("class", "whisker")
                .attr("x1", center_x_of_box)
                .attr("x2", center_x_of_box)
                .attr("y1", vis.yScale(max_value))
                .attr("y2", vis.yScale(q3))
                .attr("stroke", "black");
            
            vis.svg.append("line")
                .attr("class", "whisker")
                .attr("x1", center_x_of_box)
                .attr("x2", center_x_of_box)
                .attr("y1", vis.yScale(min_value))
                .attr("y2", vis.yScale(q1))
                .attr("stroke", "black");
            
            vis.svg.append("line")
                .attr("class", "whisker")
                .attr("x1", (vis.xScale(key) + vis.xScale.bandwidth() * 0.25))
                .attr("x2", (vis.xScale(key) + vis.xScale.bandwidth() * 0.75))
                .attr("y1", vis.yScale(min_value))
                .attr("y2", vis.yScale(min_value))
                .attr("stroke", "black");
            
            vis.svg.append("line")
                .attr("class", "whisker")
                .attr("x1", (vis.xScale(key) + vis.xScale.bandwidth() * 0.25))
                .attr("x2", (vis.xScale(key) + vis.xScale.bandwidth() * 0.75))
                .attr("y1", vis.yScale(max_value))
                .attr("y2", vis.yScale(max_value))
                .attr("stroke", "black");
            
            // Draw outlier points
            vis.svg.selectAll("circle.outlier-" + key)
                .data(bmiValues.filter(v => v < min_outlier || v > max_outlier))
                .enter()
                .append("circle")
                .attr("class", "outlier-" + key)
                .attr("cx", center_x_of_box)
                .attr("cy", d => vis.yScale(d))
                .attr("r", 3)
                .attr("fill", "gray")
                .on("mouseover", function() {
                    d3.select(this)
                        .attr("r", 6)
                        .attr("fill", "orange")
                        .attr("stroke", "black")
                        .attr("stroke-width", 1.5);
                })
                .on("mouseleave", function() {
                    d3.select(this)
                        .attr("r", 3)
                        .attr("fill", "gray")
                        .attr("stroke", "none");
                });
        });
        
        // Add interaction
        vis.svg
            .on("mouseenter", () => {
                vis.hoverLine.style("opacity", 1);
                vis.hoverLabel.style("opacity", 1);
                vis.hoverLine.raise();
                vis.hoverLabel.raise();
            })
            .on("mousemove", (event) => {
                const [, yRaw] = d3.pointer(event, vis.svg.node());
                const y = Math.max(0, Math.min(vis.height, yRaw));
                const bmi = vis.yScale.invert(y);
                vis.hoverLine.attr("y1", y).attr("y2", y);
                vis.hoverLabel.attr("y", y).text(`BMI: ${fmt(bmi)}`);
            })
            .on("mouseleave", () => {
                vis.hoverLine.style("opacity", 0);
                vis.hoverLabel.style("opacity", 0);
            });
        
        vis.overlay
            .on("mouseenter", () => {
                vis.hoverLine.style("opacity", 1);
                vis.hoverLabel.style("opacity", 1);
                vis.hoverLine.raise();
                vis.hoverLabel.raise();
            })
            .on("mousemove", (event) => {
                const [, yRaw] = d3.pointer(event, vis.svg.node());
                const y = Math.max(0, Math.min(vis.height, yRaw));
                const bmi = vis.yScale.invert(y);
                vis.hoverLine.attr("y1", y).attr("y2", y);
                vis.hoverLabel.attr("y", y).text(`BMI: ${fmt(bmi)}`);
            })
            .on("mouseleave", () => {
                vis.hoverLine.style("opacity", 0);
                vis.hoverLabel.style("opacity", 0);
            });
        
    }
    
    /*
 	* Data wrangling: transforming and cleaning raw data for use
 	*/
    wrangleData() {
        let vis = this;
        
        // Group data by workout frequency
        vis.displayData = d3.group(vis.data, d => Math.round(d["Workout_Frequency (days/week)"]));
        
        
        // Update the visualization
        vis.updateVis();
    }
    
    updateVis() {
        let vis = this;
        
        // Update axes
        vis.svg.select(".y-axis").transition().duration(500).call(vis.yAxis);
        
        // Draw box plot
        vis.drawboxPlot();
    }
}
