// server/routes/chat.js
const express = require('express');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');
const { generateContentWithHistory } = require('../services/geminiService');

const router = express.Router();

<<<<<<< HEAD
async function queryPythonRagService(userId, query, k = 5) {
=======
// Helper to call Python RAG Query Endpoint
async function queryPythonRagService(userId, query, k = 5, targetOriginalNames = null) { // Added targetOriginalNames
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. Cannot query RAG service.");
        throw new Error("RAG service configuration error.");
    }
    const queryUrl = `${pythonServiceUrl}/query`;
<<<<<<< HEAD
    console.log(`Querying Python RAG service for User ${userId} at ${queryUrl} with k=${k}`);
    try {
        const response = await axios.post(queryUrl, {
            user_id: userId, query: query, k: k
        }, { timeout: 30000 });
=======
    
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
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
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

<<<<<<< HEAD
router.post('/rag', tempAuth, async (req, res) => {
    const { message } = req.body;
    const userId = req.user._id.toString();
    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    console.log(`>>> POST /api/chat/rag: User=${userId}`);
    try {
        const kValue = 5;
        const relevantDocs = await queryPythonRagService(userId, message.trim(), kValue);
        console.log(`<<< POST /api/chat/rag successful for User ${userId}. Found ${relevantDocs.length} docs.`);
        res.status(200).json({ relevantDocs });
=======

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

>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
    } catch (error) {
        console.error(`!!! Error processing RAG query for User ${userId}:`, error);
        res.status(500).json({ message: "Failed to retrieve relevant documents." });
    }
});

<<<<<<< HEAD
=======

// @route   POST /api/chat/message
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
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
<<<<<<< HEAD
        if (useRAG && Array.isArray(relevantDocs) && relevantDocs.length > 0) {
            console.log(`   RAG Enabled: Processing ${relevantDocs.length} relevant docs provided by client.`);
            // --- MODIFIED PROMPT FOR RAG ---
            contextString = "You are an AI assistant. Your primary goal is to answer the user's question using ONLY the information provided in the 'Context Documents' section below. Do not use any external knowledge or pre-existing training data unless the context documents explicitly state that the information is not available and you are forced to. If the context documents do not contain the answer, you MUST clearly state 'The provided documents do not contain enough information to answer this question.' and then, if you choose to use general knowledge, you MUST explicitly state 'Based on my general knowledge...'.\n\n--- Context Documents ---\n";
            // --- END MODIFIED PROMPT ---
            relevantDocs.forEach((doc, index) => {
                if (!doc || typeof doc.documentName !== 'string' || typeof doc.content !== 'string') {
                    console.warn("   Skipping invalid doc in relevantDocs:", doc);
                    return;
                }
                const docName = doc.documentName || 'Unknown Document';
                const score = doc.score !== undefined ? `(Rel. Score: ${(1 / (1 + doc.score)).toFixed(3)})` : '';
=======
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
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
                const fullContent = doc.content;
                contextString += `\n[${index + 1}] Source: ${docName} ${score}\nContent:\n${fullContent}\n---\n`;
                citationHints.push(`[${index + 1}] ${docName}`);
            });
            contextString += "\n--- End of Context ---\n\n";
            console.log(`   Constructed context string. ${citationHints.length} valid docs used.`);
        } else {
            console.log(`   RAG Disabled or no relevant documents provided by client for this message.`);
        }

        const historyForGeminiAPI = history.map(msg => ({
             role: msg.role,
             parts: msg.parts.map(part => ({ text: part.text || '' }))
        })).filter(msg => msg && msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

<<<<<<< HEAD
        let finalSystemInstruction = systemPrompt || '';
        const messageContent = message.trim();
        
        if (useRAG && contextString) {
            const citationInstruction = `When referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name (e.g., ${citationHints.slice(0, 3).join(', ')}).`;
            finalSystemInstruction = `You are an AI assistant. Your primary goal is to answer the user's question using ONLY the information provided in the 'Context Documents' section below. Do not use any external knowledge or pre-existing training data unless the context documents explicitly state that the information is not available and you are forced to. If the context documents do not contain the answer, you MUST clearly state 'The provided documents do not contain enough information to answer this question.' and then, if you choose to use general knowledge, you MUST explicitly state 'Based on my general knowledge...'.\n\n--- Context Documents ---\n${contextString}\n--- End of Context ---\n\n${citationInstruction}\n\n` + finalSystemInstruction;
=======
        let finalUserQueryText = "";
        if (useRAG && contextString) {
            const citationInstruction = `When referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name (e.g., ${citationHints.slice(0, 3).join(', ')}).`;
            finalUserQueryText = `CONTEXT:\n${contextString}\nINSTRUCTIONS: ${citationInstruction}\n\nUSER QUESTION: ${message.trim()}`;
        } else {
            finalUserQueryText = message.trim();
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
        }
        
        // The history sent to Gemini should be the previous turns + the current user message (without RAG context prepended)
        const historyToSend = [
            ...historyForGeminiAPI,
            { role: "user", parts: [{ text: messageContent }] }
        ];
<<<<<<< HEAD
        
        console.log(`   Calling Gemini API. History length: ${historyToSend.length}. System Instruction Used: ${finalSystemInstruction.length > 0}`);
        const geminiResponseText = await generateContentWithHistory(historyToSend, finalSystemInstruction);
        const modelResponseMessage = {
            role: 'model',
            parts: [{ text: geminiResponseText }],
            timestamp: new Date()
        };
=======

        const geminiResponseText = await generateContentWithHistory(finalHistoryForGemini, systemPrompt);
        const modelResponseMessage = { role: 'model', parts: [{ text: geminiResponseText }], timestamp: new Date() };
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b

        console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
        res.status(200).json({ reply: modelResponseMessage });

    } catch (error) {
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error);
        let statusCode = error.status || 500;
        let clientMessage = error.message || "Failed to get response from AI service.";
<<<<<<< HEAD
        if (error.originalError && statusCode === 500) {
            clientMessage = "An internal server error occurred while processing the AI response.";
        }
=======
        if (error.originalError && statusCode === 500) clientMessage = "An internal server error occurred processing AI response.";
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
        res.status(statusCode).json({ message: clientMessage });
    }
});

<<<<<<< HEAD
router.post('/history', tempAuth, async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id;
    if (!sessionId) return res.status(400).json({ message: 'Session ID required.' });
=======
// ... (POST /api/chat/history, GET /api/chat/sessions, GET /api/chat/session/:sessionId routes remain the same) ...
// Ensure these routes are also present from your original file. I'll copy them for completeness if they weren't fully visible.

// --- @route   POST /api/chat/history ---
router.post('/history', tempAuth, async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id;
    if (!sessionId) return res.status(400).json({ message: 'Session ID required to save history.' });
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
    if (!Array.isArray(messages)) return res.status(400).json({ message: 'Invalid messages format.' });
    try {
        const validMessages = messages.filter(m =>
            m && typeof m.role === 'string' &&
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' && m.timestamp
        ).map(m => ({
            role: m.role, parts: [{ text: m.parts[0].text }], timestamp: m.timestamp
        }));

<<<<<<< HEAD
        if (validMessages.length === 0) {
             const newSessionId = uuidv4();
             return res.status(200).json({
                 message: 'No history saved. New session started.',
                 savedSessionId: null, newSessionId: newSessionId
             });
        }
=======
        if (validMessages.length !== messages.length) {
             console.warn(`Session ${sessionId}: Filtered out ${messages.length - validMessages.length} invalid messages during save.`);
        }
        // Allow saving empty history to effectively "clear" a session on server if client sends empty array
        // Or if generating a new session ID after a "New Chat" action.

>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessages, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
<<<<<<< HEAD
        const newSessionId = uuidv4();
        console.log(`History saved for session ${savedHistory.sessionId}. New session ID: ${newSessionId}`);
        res.status(200).json({
            message: 'Chat history saved.',
            savedSessionId: savedHistory.sessionId, newSessionId: newSessionId
        });
    } catch (error) {
        console.error(`Error saving history for session ${sessionId}:`, error);
        res.status(500).json({ message: 'Failed to save history.' });
    }
});

=======
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
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
router.get('/sessions', tempAuth, async (req, res) => {
    const userId = req.user._id;
    try {
        const sessions = await ChatHistory.find({ userId: userId })
<<<<<<< HEAD
            .sort({ updatedAt: -1 }).select('sessionId createdAt updatedAt messages').lean();
=======
            .sort({ updatedAt: -1 })
            .select('sessionId createdAt updatedAt messages') // Ensure messages field is selected
            .lean();

>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
        const sessionSummaries = sessions.map(session => {
             const firstUserMessage = session.messages?.find(m => m.role === 'user');
             let preview = 'Chat Session';
             if (firstUserMessage?.parts?.[0]?.text) {
<<<<<<< HEAD
                 preview = firstUserMessage.parts[0].text.substring(0, 75) + (firstUserMessage.parts[0].text.length > 75 ? '...' : '');
=======
                 preview = firstUserMessage.parts[0].text.substring(0, 75);
                 if (firstUserMessage.parts[0].text.length > 75) preview += '...';
             } else if (session.messages?.length > 0) {
                 preview = "Continuation..."; // Or some other placeholder
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
             }
             return {
                 sessionId: session.sessionId, createdAt: session.createdAt, updatedAt: session.updatedAt,
                 messageCount: session.messages?.length || 0, preview: preview
             };
        });
        res.status(200).json(sessionSummaries);
    } catch (error) {
        console.error(`Error fetching sessions for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve sessions.' });
    }
});

<<<<<<< HEAD
=======

// --- @route   GET /api/chat/session/:sessionId ---
>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
router.get('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ message: 'Session ID required.' });
    try {
        const session = await ChatHistory.findOne({ sessionId: sessionId, userId: userId }).lean();
        if (!session) return res.status(404).json({ message: 'Session not found or access denied.' });
        res.status(200).json(session);
    } catch (error) {
        console.error(`Error fetching session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve session.' });
    }
});

<<<<<<< HEAD
=======

>>>>>>> 1dc47d7713352974602a83a9273223c8f547e07b
module.exports = router;