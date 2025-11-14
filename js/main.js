
let flower;
let ageGenderHeatmap;
let scatter;

loadData();

function loadData() {
    d3.csv("data/Final_data.csv").then(data => {
        console.log("Loaded");

        const prepared = prepareLifestyleData(data);

        console.log("Prepared", prepared);

        // flower = new Flower("flower", prepared);
        // flower.initVis();
        ageGenderHeatmap = new AgeGenderHeatmap("age-gender-heatmap", prepared);
        ageGenderHeatmap.initVis();
        
        scatter = new ExerciseScatter("scatter", prepared);
        scatter.initVis();
    })
}


function prepareLifestyleData(data) {
    return data.map(row => {
        let newRow = {};
        // Converts numeric values from strings to numbers if applicable
        // Otherwise, keep the original string
        for (let [key, value] of Object.entries(row)) {
            let num = +value;
            newRow[key] = isNaN(num) ? value : num;
        }
        return newRow;
    });
}

function cellSelected(gender, age, cellColor) {
    // Invoke change on scatter plot
    scatter.updateFilter(gender, age, cellColor);
}
