// server/routes/chat.js
const express = require('express');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');
const { generateContentWithHistory } = require('../services/geminiService');

const router = express.Router();

// Helper to call Python RAG Query Endpoint
async function queryPythonRagService(userId, query, k = 5, targetOriginalNames = null) { // Added targetOriginalNames
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. Cannot query RAG service.");
        throw new Error("RAG service configuration error.");
    }
    const queryUrl = `${pythonServiceUrl}/query`;
    
    const payload = {
        user_id: userId,
        query: query,
        k: k
    };
    if (targetOriginalNames && Array.isArray(targetOriginalNames) && targetOriginalNames.length > 0) {
        payload.target_original_names = targetOriginalNames; // Key for Python service
        console.log(`Querying Python RAG for User ${userId} at ${queryUrl} with k=${k}, targeting files: ${targetOriginalNames.join(', ')}`);
    } else {
        console.log(`Querying Python RAG for User ${userId} at ${queryUrl} with k=${k} (all user files)`);
    }

    try {
        const response = await axios.post(queryUrl, payload, { timeout: 30000 });
        if (response.data && Array.isArray(response.data.relevantDocs)) {
            console.log(`Python RAG service returned ${response.data.relevantDocs.length} results.`);
            return response.data.relevantDocs;
        } else {
             console.warn(`Python RAG service returned unexpected data structure:`, response.data);
             return [];
        }
    } catch (error) {
        console.error(`Error querying Python RAG service for User ${userId}:`, error.response?.data || error.message);
        return [];
    }
}


// @route   POST /api/chat/rag
router.post('/rag', tempAuth, async (req, res) => {
    const { message, targetOriginalNames } = req.body; // Destructure targetOriginalNames
    const userId = req.user._id.toString();

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    // Validate targetOriginalNames if present
    if (targetOriginalNames && !Array.isArray(targetOriginalNames)) {
        return res.status(400).json({ message: 'Invalid targetOriginalNames format, must be an array.'});
    }

    console.log(`>>> POST /api/chat/rag: User=${userId}`);
    if (targetOriginalNames && targetOriginalNames.length > 0) {
        console.log(`   Targeting specific files: ${targetOriginalNames.join(', ')}`);
    }

    try {
        const kValue = 5;
        // Pass targetOriginalNames to the helper
        const relevantDocs = await queryPythonRagService(userId, message.trim(), kValue, targetOriginalNames);
        console.log(`<<< POST /api/chat/rag successful for User ${userId}. Found ${relevantDocs.length} docs.`);
        res.status(200).json({ relevantDocs });

    } catch (error) {
        console.error(`!!! Error processing RAG query for User ${userId}:`, error);
        res.status(500).json({ message: "Failed to retrieve relevant documents." });
    }
});


// @route   POST /api/chat/message
router.post('/message', tempAuth, async (req, res) => {
    const { message, history, sessionId, systemPrompt, isRagEnabled, relevantDocs } = req.body;
    const userId = req.user._id.toString();

    if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ message: 'Message text required.' });
    if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ message: 'Session ID required.' });
    if (!Array.isArray(history)) return res.status(400).json({ message: 'Invalid history format.'});
    const useRAG = !!isRagEnabled;

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRAG}`);

    let contextString = "";
    let citationHints = [];

    try {
        // Context construction from RAG results (relevantDocs from /api/chat/rag)
        if (useRAG && Array.isArray(relevantDocs) && relevantDocs.length > 0) {
            console.log(`   RAG Enabled: Processing ${relevantDocs.length} relevant documents provided by client.`);
            contextString = "Answer the user's question based primarily on the following context documents.\nIf the context documents do not contain the necessary information to answer the question fully, clearly state what information is missing from the context *before* potentially providing an answer based on your general knowledge.\n\n--- Context Documents ---\n";
            relevantDocs.forEach((doc, index) => {
                if (!doc || typeof doc.documentName !== 'string' || typeof doc.content !== 'string') {
                    console.warn("   Skipping invalid/incomplete document in relevantDocs:", doc);
                    return;
                }
                const docName = doc.documentName || 'Unknown Document';
                const score = doc.score !== undefined ? `(Rel. Score: ${(1 / (1 + doc.score)).toFixed(3)})` : ''; // Or use raw score if preferred
                const fullContent = doc.content;
                contextString += `\n[${index + 1}] Source: ${docName} ${score}\nContent:\n${fullContent}\n---\n`;
                citationHints.push(`[${index + 1}] ${docName}`);
            });
            contextString += "\n--- End of Context ---\n\n";
            console.log(`   Constructed context string using full content. ${citationHints.length} valid docs used.`);
        } else {
            console.log(`   RAG Disabled or no relevant documents provided by client for this message.`);
        }

        const historyForGeminiAPI = history.map(msg => ({
             role: msg.role,
             parts: msg.parts.map(part => ({ text: part.text || '' }))
        })).filter(msg => msg && msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        let finalUserQueryText = "";
        if (useRAG && contextString) {
            const citationInstruction = `When referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name (e.g., ${citationHints.slice(0, 3).join(', ')}).`;
            finalUserQueryText = `CONTEXT:\n${contextString}\nINSTRUCTIONS: ${citationInstruction}\n\nUSER QUESTION: ${message.trim()}`;
        } else {
            finalUserQueryText = message.trim();
        }

        const finalHistoryForGemini = [
            ...historyForGeminiAPI,
            { role: "user", parts: [{ text: finalUserQueryText }] }
        ];

        const geminiResponseText = await generateContentWithHistory(finalHistoryForGemini, systemPrompt);
        const modelResponseMessage = { role: 'model', parts: [{ text: geminiResponseText }], timestamp: new Date() };

        console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
        res.status(200).json({ reply: modelResponseMessage });

    } catch (error) {
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error);
        let statusCode = error.status || 500;
        let clientMessage = error.message || "Failed to get response from AI service.";
        if (error.originalError && statusCode === 500) clientMessage = "An internal server error occurred processing AI response.";
        res.status(statusCode).json({ message: clientMessage });
    }
});

// ... (POST /api/chat/history, GET /api/chat/sessions, GET /api/chat/session/:sessionId routes remain the same) ...
// Ensure these routes are also present from your original file. I'll copy them for completeness if they weren't fully visible.

// --- @route   POST /api/chat/history ---
router.post('/history', tempAuth, async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id;
    if (!sessionId) return res.status(400).json({ message: 'Session ID required to save history.' });
    if (!Array.isArray(messages)) return res.status(400).json({ message: 'Invalid messages format.' });

    try {
        const validMessages = messages.filter(m =>
            m && typeof m.role === 'string' &&
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' &&
            m.timestamp
        ).map(m => ({
            role: m.role,
            parts: [{ text: m.parts[0].text }],
            timestamp: m.timestamp
        }));

        if (validMessages.length !== messages.length) {
             console.warn(`Session ${sessionId}: Filtered out ${messages.length - validMessages.length} invalid messages during save.`);
        }
        // Allow saving empty history to effectively "clear" a session on server if client sends empty array
        // Or if generating a new session ID after a "New Chat" action.

        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessages, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        const newSessionId = uuidv4(); // Always generate a new session ID for the client for the *next* chat
        console.log(`History saved for session ${savedHistory.sessionId}. New client session ID for next chat: ${newSessionId}`);
        res.status(200).json({
            message: 'Chat history saved successfully.',
            savedSessionId: savedHistory.sessionId, // The ID of the session that was just saved
            newSessionId: newSessionId // The ID the client should use for its *next* new chat
        });
    } catch (error) {
        console.error(`Error saving chat history for session ${sessionId}:`, error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: "Validation Error: " + error.message });
        if (error.code === 11000) return res.status(409).json({ message: "Conflict: Session ID might already exist." });
        res.status(500).json({ message: 'Failed to save chat history.' });
    }
});


// --- @route   GET /api/chat/sessions ---
router.get('/sessions', tempAuth, async (req, res) => {
    const userId = req.user._id;
    try {
        const sessions = await ChatHistory.find({ userId: userId })
            .sort({ updatedAt: -1 })
            .select('sessionId createdAt updatedAt messages') // Ensure messages field is selected
            .lean();

        const sessionSummaries = sessions.map(session => {
             const firstUserMessage = session.messages?.find(m => m.role === 'user');
             let preview = 'Chat Session';
             if (firstUserMessage?.parts?.[0]?.text) {
                 preview = firstUserMessage.parts[0].text.substring(0, 75);
                 if (firstUserMessage.parts[0].text.length > 75) preview += '...';
             } else if (session.messages?.length > 0) {
                 preview = "Continuation..."; // Or some other placeholder
             }
             return {
                 sessionId: session.sessionId,
                 createdAt: session.createdAt,
                 updatedAt: session.updatedAt,
                 messageCount: session.messages?.length || 0,
                 preview: preview
             };
        });
        res.status(200).json(sessionSummaries);
    } catch (error) {
        console.error(`Error fetching chat sessions for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat sessions.' });
    }
});


// --- @route   GET /api/chat/session/:sessionId ---
router.get('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ message: 'Session ID parameter is required.' });
    try {
        const session = await ChatHistory.findOne({ sessionId: sessionId, userId: userId }).lean();
        if (!session) return res.status(404).json({ message: 'Chat session not found or access denied.' });
        res.status(200).json(session);
    } catch (error) {
        console.error(`Error fetching chat session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});


module.exports = router;