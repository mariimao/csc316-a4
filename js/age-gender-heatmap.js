class AgeGenderHeatmap {
    constructor(parentElement, data) {
        this.parentElement = parentElement;
        this.data = data;
        this.displayData = [];
        this.selectedCell = null;
        
        this.fmt2 = d3.format(".2f");
    }
    
    initVis() {
        let vis = this;
        
        vis.margin = {top: 40, right: 40, bottom: 80, left: 60};
        vis.width  = document.getElementById(vis.parentElement).getBoundingClientRect().width  - vis.margin.left - vis.margin.right;
        vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top  - vis.margin.bottom;
        
        vis.svg = d3.select("#" + vis.parentElement).append("svg")
            .attr("width",  vis.width  + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top  + vis.margin.bottom)
            .append("g")
            .attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");
        
        vis.tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("background-color", "black")
            .style("padding", "5px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("pointer-events", "none")
            .style("opacity", 0);
        
        vis.chart = vis.svg.append("g")
            .attr("class", "chart-area")
            .attr("width", vis.width)
            .attr("height", vis.height);
        
        vis.xScale = d3.scaleBand().range([0, vis.width]).padding(0.05);
        vis.yScale = d3.scaleBand().range([vis.height, 0]).padding(0.05);
        vis.colorScale = d3.scaleSequential(d3.interpolateViridis);
        
        vis.xAxis = d3.axisBottom().scale(vis.xScale);
        vis.yAxis = d3.axisLeft().scale(vis.yScale);
        
        vis.svg.append("g")
            .attr("class", "y-axis axis");
        
        vis.svg.append("text")
            .attr("class", "y-title")
            .attr("x", -vis.height / 2)
            .attr("y", 0)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .attr("fill", "black")
            .text("Age group");
        
        vis.genderLabels = vis.svg.append("g")
            .attr("class", "gender-labels");
        
        // legend placeholder (empty for now)
        vis.legendHeight = 15;
        vis.legendWidth  = vis.width * 0.8;
        vis.legend = vis.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(0, ${vis.height + 40})`);
        
        vis.cellPadding = 2;
        
        vis.wrangleData();
    }
    
    wrangleData() {
        let vis = this;
        
        const rolledData = d3.rollup(
            vis.data,
            v => d3.mean(v, d => d.BMI),
            d => Math.round(d.Age / 5) * 5,
            d => d.Gender
        );
        
        const flattenedData = [];
        for (let [age, genderMap] of rolledData.entries()) {
            for (let [gender, bmi] of genderMap.entries()) {
                flattenedData.push({
                    age: +age,
                    gender: String(gender),
                    bmi: bmi == null ? null : +bmi
                });
            }
        }
        flattenedData.sort((a, b) => a.age - b.age);
        
        vis.displayData  = flattenedData;
        vis.ageGroups    = Array.from(new Set(vis.displayData.map(d => d.age)));
        vis.genderGroups = Array.from(new Set(vis.displayData.map(d => d.gender)));
        
        vis.updateVis();
    }
    
    updateVis() {
        let vis = this;
        
        vis.xScale.domain(vis.genderGroups);
        vis.yScale.domain(vis.ageGroups);
        
        const cellBoxSize = Math.min(vis.xScale.bandwidth(), vis.yScale.bandwidth())
        const cellSize   = cellBoxSize - vis.cellPadding * 2;
        const totalWidth = cellBoxSize * vis.genderGroups.length;
        const startX     = (vis.width - totalWidth) / 2;
        
        vis.xScale.range([startX, startX + totalWidth]);
        
        const bmiValues = vis.displayData.map(d => d.bmi).filter(d => d != null);
        vis.bmiMin = d3.min(bmiValues);
        vis.bmiMax = d3.max(bmiValues);
        
        vis.colorScale.domain([vis.bmiMax, vis.bmiMin]);

        const ageLabels = vis.svg.selectAll(".age-label")
            .data(vis.ageGroups, d => d);
        
        ageLabels.enter()
            .append("text")
            .attr("class", "age-label")
            .merge(ageLabels)
            .attr("x", 80)
            .attr("y", d => vis.yScale(d) + vis.yScale.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "middle")
            .attr("font-size", "12px")
            .attr("fill", "black")
            .text(d => `${d}-${d + 4}`);
        
        ageLabels.exit().remove();
        
        vis.genderLabels.selectAll("text")
            .data(vis.genderGroups)
            .join("text")
            .attr("x", d => vis.xScale(d) + vis.xScale.bandwidth() / 2)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "black")
            .text(d => d);
        
        const cells = vis.chart.selectAll(".heatmap-cell")
            .data(vis.displayData, d => d.age + ':' + d.gender);
        
        const xOffset = (vis.xScale.bandwidth() - cellSize) / 2;
        const yOffset = (vis.yScale.bandwidth() - cellSize) / 2;
        
        cells.enter()
            .append("rect")
            .attr("class", "heatmap-cell")
            .merge(cells)
            .attr("x", d => vis.xScale(d.gender) + xOffset)
            .attr("y", d => vis.yScale(d.age) + yOffset)
            .attr("width",  cellSize)
            .attr("height", cellSize)
            .attr("fill", d => d.bmi == null ? "#eee" : vis.colorScale(d.bmi))
            .on("mouseover", function(event, d) {
                d3.select(this)
                    .attr("stroke", "black")
                    .attr("stroke-width", 2);
                
                vis.tooltip
                    .style("opacity", 0.9)
                    .html(`<div><span>Average BMI: </span>${vis.fmt2(d.bmi)}</div>`)
                    .style("left",  (event.pageX + 10) + "px")
                    .style("top",   (event.pageY - 28) + "px");
            })
            .on("click", function(event, d) {
                if (vis.selectedCell && vis.selectedCell !== this) {
                    d3.select(vis.selectedCell).attr("stroke", null);
                }
                vis.selectedCell = this;
                
                const selectedGender = d.gender;
                const selectedAge    = d.age;
                const selectedColor  = d.bmi == null ? "#eee" : vis.colorScale(d.bmi);
                cellSelected(selectedGender, selectedAge, selectedColor);
            })
            .on("mouseout", function() {
                vis.tooltip.style("opacity", 0);
                if (vis.selectedCell === this) return;
                d3.select(this).attr("stroke", null);
            });
        
        cells.exit().remove();
        
        // ---------- legend ----------
        vis.legend.selectAll("*").remove();
        
        vis.legendScale = d3.scaleLinear()
            .domain([vis.bmiMin, vis.bmiMax])
            .range([0, vis.legendWidth]);
        
        let defs = vis.svg.select("defs");
        if (defs.empty()) defs = vis.svg.append("defs");
        
        defs.select("#heatmap-gradient").remove();
        
        const gradient = defs.append("linearGradient")
            .attr("id", "heatmap-gradient")
            .attr("x1", "0%").attr("x2", "100%")
            .attr("y1", "0%").attr("y2", "0%");
        
        const legendStops = 10;
        for (let i = 0; i <= legendStops; i++) {
            const t     = i / legendStops;
            const value = vis.bmiMin + t * (vis.bmiMax - vis.bmiMin);
            
            gradient.append("stop")
                .attr("offset", `${t * 100}%`)
                .attr("stop-color", vis.colorScale(value));
        }
        
        vis.legend.append("rect")
            .attr("class", "legend-bar")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width",  vis.legendWidth)
            .attr("height", vis.legendHeight)
            .style("fill", "url(#heatmap-gradient)");
        
        const legendAxis = d3.axisBottom(vis.legendScale)
            .ticks(4)
            .tickFormat(vis.fmt2)
            .tickSize(4);
        
        vis.legend.append("g")
            .attr("class", "legend-axis")
            .attr("transform", `translate(0, ${vis.legendHeight})`)
            .call(legendAxis);
        
        vis.legend.append("text")
            .attr("x", vis.legendWidth / 2)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "black")
            .text("Average BMI");
    }
}