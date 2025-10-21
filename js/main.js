
let flower;

loadData();

function loadData() {
    d3.csv("data/Final_data.csv").then(data => {
        console.log("Loaded");

        const prepared = prepareLifestyleData(data);

        console.log("Prepared", prepared);

        flower = new Flower("flower", prepared);
        flower.initVis();
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
