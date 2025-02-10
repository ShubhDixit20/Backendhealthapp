const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect(
    "mongodb+srv://admin:wWFvETZrhlK8byXl@cluster0.iwviz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("Failed to connect to MongoDB", err));

// Schema and Model
const instructionSchema = new mongoose.Schema({
    exercise_name: String,
    video_url: String,
    english_instructions: String,
    hindi_instructions: String,
});

const Instruction = mongoose.model("Instruction", instructionSchema);

// Multer configuration for file uploads
const upload = multer({ dest: "uploads/" });

// API to upload JSON data
app.post("/upload-instructions", upload.single("jsonFile"), (req, res) => {
    const filePath = req.file.path;

    // Read and parse JSON file
    fs.readFile(filePath, "utf8", async (err, data) => {
        if (err) {
            return res.status(500).send("Failed to read file");
        }

        try {
            const jsonData = JSON.parse(data);

            // Insert JSON data into MongoDB
            for (const exerciseName in jsonData) {
                const { video_url, english_instructions, hindi_instructions } = jsonData[exerciseName];

                await Instruction.create({
                    exercise_name: exerciseName,
                    video_url,
                    english_instructions,
                    hindi_instructions,
                });
            }

            res.status(200).send("Instructions uploaded successfully!");
        } catch (error) {
            res.status(500).send("Error parsing or uploading JSON data");
        } finally {
            // Delete the uploaded file
            fs.unlinkSync(filePath);
        }
    });
});

// **New API: Fetch exercise details**
app.get("/api/exercise", async (req, res) => {
    try {
        const { exercise_name } = req.query;
        if (!exercise_name) {
            return res.status(400).json({ error: "Exercise name is required" });
        }

        const exercise = await Instruction.findOne({ exercise_name });
        if (!exercise) {
            return res.status(404).json({ error: "Exercise not found" });
        }

        res.json(exercise);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
