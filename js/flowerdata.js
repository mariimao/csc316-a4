class FlowerData {
    constructor(data) {
        // Process grouping by Workout_Type, diet_type, and Age group (rounded to nearest 10)
        // outside of the flower visualization class for reusability
        this.data = d3.rollup(data,
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
        
        this.waterIntakeRange = d3.extent(data, d => d["Water_Intake (liters)"]);
        this.caloriesIntake = d3.extent(data, d => d["Calories"]);
        this.caloriesBurnedRange = d3.extent(data, d => d["Calories_Burned"]);
        this.workoutFreqRange = [2, 5];
        this.bmiRange = d3.extent(data, d => d["BMI"]);
        this.dietFreqRange = d3.extent(data, d => d["Daily meals frequency"]);
        
        this.dietTypes = Array.from(new Set(data.map(d => d["diet_type"])))
    }
}