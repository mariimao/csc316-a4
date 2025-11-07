class AgeGenderHeatmap {
    
    /**
     * Constructor to initialize age gender heatmap
     */
    constructor(parentElement, data) {
        this.parentElement = parentElement;
        this.data = data;
        this.displayData = [];
    }
    
    /**
     * Initialize the Age Gender Heatmap.
     */
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
        vis.xScale = d3.scaleBand().range([0, vis.width]).padding(0.05);
        vis.yScale = d3.scaleBand().range([vis.height, 0]).padding(0.05);
        vis.colorScale = d3.scaleSequential(d3.interpolateViridis);
        
        vis.xAxis = d3.axisBottom().scale(vis.xScale);
        vis.yAxis = d3.axisLeft().scale(vis.yScale);
        
        vis.svg.append("g")
            .attr("class", "x-axis axis")
            .attr("transform", "translate(0," + vis.height + ")");
        
        vis.svg.append("g")
            .attr("class", "y-axis axis");
        
        vis.wrangleData();
    }
    
    /**
     * Grouping data by age and gender with BMI
     */
    wrangleData() {
        let vis = this;
        const rolledData = d3.rollup(
            vis.data,
            v => d3.mean(v, d => d.BMI),
            d => Math.round(d.Age / 5) * 5, // Group by age in 5-year intervals
            d => d.Gender
        );
        
        // Flatten into array of objects { age, gender, bmi }
        const flattenedData = [];
        for (let [age, genderMap] of rolledData.entries()) {
            for (let [gender, bmi] of genderMap.entries()) {
                flattenedData.push({
                    age: +age,
                    gender: String(gender),
                    bmi: bmi == null ? null : +bmi
                })
            }
        }
        flattenedData.sort((a, b) => a.age - b.age) // sort by ascending age
        vis.displayData = flattenedData;
        
        vis.ageGroups = Array.from(new Set(vis.displayData.map(d => d.age)));
        vis.genderGroups = Array.from(new Set(vis.displayData.map(d => d.gender)));
        
        console.log(vis.displayData);
        
        vis.updateVis();
    }
    
    updateVis() {
        let vis = this;
        
        // Update scales
        vis.xScale.domain(vis.ageGroups);
        vis.yScale.domain(vis.genderGroups);
        
        const bmiValues = vis.displayData.map(d => d.bmi).filter(d => d != null);
        vis.colorScale.domain([d3.min(bmiValues), d3.max(bmiValues)]);
        
        // Render axes
        vis.svg.select(".x-axis").call(vis.xAxis)
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");
        
        vis.svg.select(".y-axis").call(vis.yAxis);
        
        // Bind data
        const cells = vis.chart.selectAll(".heatmap-cell")
            .data(vis.displayData, d => d.age + ':' + d.gender);
        
        let cellsEnter = cells.enter()
            .append("rect")
            .attr("class", "heatmap-cell")
            .attr("x", d => vis.xScale(d.age))
            .attr("y", d => vis.yScale(d.gender))
            .attr("width", vis.xScale.bandwidth())
            .attr("height", vis.yScale.bandwidth());
        
        cells.exit().remove();
        
        cellsEnter.merge(cells)
            .transition().duration(300)
            .attr('x', d => vis.xScale(String(d.age)))
            .attr('y', d => vis.yScale(d.gender))
            .attr('width', vis.xScale.bandwidth())
            .attr('height', vis.yScale.bandwidth())
            .attr('fill', d => d.bmi == null ? '#eee' : vis.colorScale(d.bmi));
    }
}