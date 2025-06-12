// server/routes/speech.js
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { tempAuth } = require('../middleware/authMiddleware'); // Reuse auth if needed, or make public

const router = express.Router();

// Ensure OPENAI_API_KEY is available
const openaiApiKey = process.env.OPENAI_API_KEY;
let openai;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
} else {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! FATAL: OPENAI_API_KEY environment variable is not set. !!!");
    console.error("!!! Speech-to-text functionality will NOT work.          !!!");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
}

// Multer setup for handling file uploads in memory or temp storage
const upload = multer({
    storage: multer.memoryStorage(), // Store file in memory
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit, as per Whisper API recommendation
    fileFilter: (req, file, cb) => {
        // Basic check for audio mimetypes, Whisper is quite flexible
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type, only audio is allowed.'), false);
        }
    }
});

router.post('/transcribe', tempAuth, upload.single('audio'), async (req, res) => {
    if (!openai) {
        return res.status(503).json({ message: 'Speech service is not configured.' });
    }
    if (!req.file) {
        return res.status(400).json({ message: 'No audio file provided.' });
    }

    console.log(`>>> POST /api/speech/transcribe: User=${req.user.username}, File=${req.file.originalname}, Size=${req.file.size}`);

    try {
        // Create a temporary file path for the buffer to be read by OpenAI SDK
        // The SDK's `fs.createReadStream` expects a path for certain versions/flows.
        // Alternatively, some SDK versions might allow passing the buffer directly or a custom ReadableStream.
        // For simplicity and broad compatibility, we'll write to a temp file.
        const tempDir = path.join(__dirname, '..', 'temp_audio');
        if (!fs.existsSync(tempDir)){
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `${Date.now()}-${req.file.originalname}`);
        
        await fs.promises.writeFile(tempFilePath, req.file.buffer);

        const transcription = await openai.audio.transcriptions.create({
            model: "whisper-1",
            file: fs.createReadStream(tempFilePath),
            // language: "en", // Optional: specify language
            // response_format: "json" // Default is JSON with 'text' field
        });

        // Clean up the temporary file
        await fs.promises.unlink(tempFilePath);

        console.log(`<<< Transcription successful for User=${req.user.username}. Text: ${transcription.text.substring(0, 50)}...`);
        res.status(200).json({ transcription: transcription.text });

    } catch (error) {
        console.error('!!! Whisper API Error:', error.response?.data || error.message || error);
        // Clean up temp file on error too, if it exists
        if (fs.existsSync(tempFilePath || "")){
            await fs.promises.unlink(tempFilePath).catch(e => console.error("Error deleting temp file on failure:", e));
        }
        res.status(500).json({ message: 'Failed to transcribe audio.', error: error.message });
    }
});

module.exports = router;