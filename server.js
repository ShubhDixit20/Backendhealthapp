const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const router = express.Router();
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

const conn = mongoose.createConnection(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

let gfs;
conn.once("open", () => {
    gfs = new GridFSBucket(conn.db, { bucketName: "videos" }); // Bucket for storing video files
    console.log("GridFS connected");
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

// 3. Upload videos to GridFS
app.post("/upload-video", upload.single("videoFile"), (req, res) => {
    const { originalname, path } = req.file;

    try {
        // Open a stream to GridFS
        const uploadStream = gfs.openUploadStream(originalname);
        fs.createReadStream(path)
            .pipe(uploadStream)
            .on("error", (err) => {
                console.error("Error uploading video to GridFS:", err);
                res.status(500).json({ error: "Error uploading video" });
            })
            .on("finish", () => {
                fs.unlinkSync(path); // Delete temp file after upload
                res.status(200).json({ message: "Video uploaded successfully", fileId: uploadStream.id });
            });
    } catch (error) {
        console.error("Error handling video upload:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Route to fetch video by exercise name
app.get("/api/video/:exercise_name", async (req, res) => {
    const { exercise_name } = req.params;

    if (!exercise_name) {
        return res.status(400).json({ error: "Exercise name is required" });
    }

    try {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        
        // Check if the file exists in GridFS
        const files = await bucket.find({ filename: exercise_name }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ error: "Video not found" });
        }

        // Stream the video
        res.set("Content-Type", files[0].contentType || "video/mp4");
        const downloadStream = bucket.openDownloadStreamByName(exercise_name);
        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error fetching video:", error);
        res.status(500).json({ error: "Server error while fetching video" });
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
