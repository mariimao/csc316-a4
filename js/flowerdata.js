class FlowerData {
    constructor(data, options = {}) {
        // If flat mode is requested, keep raw rows and avoid aggregation.
        // This allows creating one petal per meal.
        this.flat = !!options.flat;
        if (this.flat) {
            this.raw = Array.isArray(data) ? data : [];
            // keep a minimal `data` property for backwards compatibility (not a rollup)
            this.data = { raw: this.raw };
        } else {
            // Process grouping by Workout_Type, diet_type, and Age group (rounded to nearest 10)
            // outside of the flower visualization class for reusability
            // Rollup by Workout_Type -> diet_type (do not group by age)
            this.data = d3.rollup(data,
                v => ({
                    // Keep only aggregations the visualization currently uses.
                    avgCaloriesIntake: d3.mean(v, d => d["Calories"]),
                    avgCaloriesBurned: d3.mean(v, d => d["Calories_Burned"]),
                    avgWorkoutFreq: d3.mean(v, d => d["Workout_Frequency (days/week)" ]),
                    avgDietFreq : d3.mean(v, d => d["Daily meals frequency"]),
                    count: v.length
                }),
                d => d["Workout_Type"],
                d => d["diet_type"]
            );
        }
        
        this.dietTypes = Array.from(new Set((Array.isArray(data) ? data : []).map(d => d["diet_type"])))
    }
}