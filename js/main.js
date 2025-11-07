
let flower;

loadData();

function loadData() {
    d3.csv("data/Final_data.csv").then(data => {
        console.log("Loaded");

        const prepared = prepareLifestyleData(data);

        console.log("Prepared", prepared);

        // To plot a flower, create a FlowerData instance which needs the above data
        // Then pass the FlowerData instance to the Flower visualization
        // Optional: pass in Workout_Type (string) and diet_type (string)
        const workout_type = "HIIT";
        const diet_type = "Vegan";
        const flower_data = new FlowerData(prepared);
        flower = new Flower("flower", flower_data, workout_type, diet_type);
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
