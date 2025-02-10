const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const { GridFSBucket } = require("mongodb");

// Initialize app and middleware
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
const MONGO_URI = "mongodb+srv://admin:admin@cluster0.iwviz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("Failed to connect to MongoDB:", err));

// GridFS bucket and connection
let gfs;
const conn = mongoose.connection;
conn.once("open", () => {
    gfs = new GridFSBucket(conn.db, { bucketName: "videos" });
    console.log("GridFS Bucket initialized");
});

// Instruction schema and model
const instructionSchema = new mongoose.Schema({
    exercise_name: String,
    video_url: String,
    english_instructions: String,
    hindi_instructions: String,
});
const Instruction = mongoose.model("Instruction", instructionSchema);

// Multer configuration for file uploads
const upload = multer({ dest: "uploads/" });

// **Routes**
// 1. Upload JSON data and store in MongoDB
app.post("/upload-instructions", upload.single("jsonFile"), (req, res) => {
    const filePath = req.file.path;

    // Read and parse JSON file
    fs.readFile(filePath, "utf8", async (err, data) => {
        if (err) return res.status(500).send("Failed to read file");

        try {
            const jsonData = JSON.parse(data);

            // Insert each instruction into MongoDB
            const bulkOperations = Object.keys(jsonData).map(exerciseName => {
                const { video_url, english_instructions, hindi_instructions } = jsonData[exerciseName];
                return {
                    updateOne: {
                        filter: { exercise_name: exerciseName },
                        update: { exercise_name: exerciseName, video_url, english_instructions, hindi_instructions },
                        upsert: true,
                    },
                };
            });

            await Instruction.bulkWrite(bulkOperations);
            res.status(200).send("Instructions uploaded successfully!");
        } catch (error) {
            console.error("Error parsing or uploading JSON data:", error);
            res.status(500).send("Error parsing or uploading JSON data");
        } finally {
            // Delete the uploaded file
            fs.unlinkSync(filePath);
        }
    });
});

// 2. Fetch exercise details
app.get("/api/exercise", async (req, res) => {
    const { exercise_name } = req.query;

    if (!exercise_name) {
        return res.status(400).json({ error: "Exercise name is required" });
    }

    try {
        const exercise = await Instruction.findOne({ exercise_name });
        if (!exercise) return res.status(404).json({ error: "Exercise not found" });

        res.json(exercise);
    } catch (error) {
        console.error("Error fetching exercise details:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// 3. Stream video by exercise name
app.get("/api/video/:exerciseName", async (req, res) => {
    const { exerciseName } = req.params;

    try {
        const files = await conn.db.collection("videos.files").find({ filename: exerciseName }).toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ error: "Video not found" });
        }

        const file = files[0];

        // Set headers for video streaming
        res.set({
            "Content-Type": file.contentType,
            "Content-Length": file.length,
        });

        const downloadStream = gfs.openDownloadStreamByName(exerciseName);
        downloadStream.pipe(res);

        downloadStream.on("error", (err) => {
            console.error("Stream error:", err);
            res.status(500).json({ error: "Failed to stream video" });
        });
    } catch (err) {
        console.error("Error streaming video:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
