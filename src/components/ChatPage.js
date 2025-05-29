// client/src/components/ChatPage.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendMessage, saveChatHistory, getUserFiles, queryRagService } from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { v4 as uuidv4 } from 'uuid';

import SystemPromptWidget, { availablePrompts, getPromptTextById } from './SystemPromptWidget';
import HistoryModal from './HistoryModal';
import FileUploadWidget from './FileUploadWidget';
import FileManagerWidget from './FileManagerWidget';

import './ChatPage.css'; // Ensure this is imported

// Web Speech API Polyfills (optional, for broader browser support if needed, but modern browsers are good)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSynthesis = window.speechSynthesis;


const ChatPage = ({ setIsAuthenticated }) => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRagLoading, setIsRagLoading] = useState(false);
    const [error, setError] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [userId, setUserId] = useState('');
    const [username, setUsername] = useState('');
    const [currentSystemPromptId, setCurrentSystemPromptId] = useState('friendly');
    const [editableSystemPromptText, setEditableSystemPromptText] = useState(() => getPromptTextById('friendly'));
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);
    const [hasFiles, setHasFiles] = useState(false);
    const [isRagEnabled, setIsRagEnabled] = useState(false);
    const [selectedOriginalNamesForRag, setSelectedOriginalNamesForRag] = useState([]); // For selected files

    // STT states
    const [isRecording, setIsRecording] = useState(false);
    const [sttError, setSttError] = useState('');
    const recognitionRef = useRef(null);

    // TTS states
    const [isTtsEnabled, setIsTtsEnabled] = useState(false);

    const messagesEndRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    useEffect(() => {
        const storedSessionId = localStorage.getItem('sessionId');
        const storedUserId = localStorage.getItem('userId');
        const storedUsername = localStorage.getItem('username');
        const storedTtsEnabled = localStorage.getItem('ttsEnabled') === 'true';

        if (!storedUserId || !storedSessionId || !storedUsername) {
            handleLogout(true);
        } else {
            setSessionId(storedSessionId);
            setUserId(storedUserId);
            setUsername(storedUsername);
            setIsTtsEnabled(storedTtsEnabled);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const checkUserFiles = async () => {
            const currentUserId = localStorage.getItem('userId');
            if (!currentUserId) {
                setHasFiles(false); setIsRagEnabled(false);
                return;
            }
            try {
                const response = await getUserFiles();
                const filesExist = response.data && response.data.length > 0;
                setHasFiles(filesExist);
                // Only default RAG to true if files exist AND it wasn't manually turned off
                // Let's simplify: default to true if files exist, user can toggle.
                setIsRagEnabled(filesExist);
            } catch (err) {
                if (err.response?.status === 401 && !window.location.pathname.includes('/login')) handleLogout(true);
                else setError("Could not check user files.");
                setHasFiles(false); setIsRagEnabled(false);
            }
        };
        if (userId) checkUserFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, fileRefreshTrigger]);

    const triggerFileRefresh = useCallback(() => setFileRefreshTrigger(prev => prev + 1), []);
    const handlePromptSelectChange = useCallback((newId) => {
        setCurrentSystemPromptId(newId); setEditableSystemPromptText(getPromptTextById(newId));
        setError(prev => prev && (prev.includes("Session invalid") || prev.includes("Critical Error")) ? prev : `Assistant mode changed.`);
        setTimeout(() => { setError(prev => prev === `Assistant mode changed.` ? '' : prev); }, 3000);
    }, []);
    const handlePromptTextChange = useCallback((newText) => {
        setEditableSystemPromptText(newText);
        const matchingPreset = availablePrompts.find(p => p.id !== 'custom' && p.prompt === newText);
        setCurrentSystemPromptId(matchingPreset ? matchingPreset.id : 'custom');
    }, []);
    const handleHistory = useCallback(() => setIsHistoryModalOpen(true), []);
    const closeHistoryModal = useCallback(() => setIsHistoryModalOpen(false), []);

    const handleSelectedFilesChange = useCallback((newSelectedOriginalNames) => {
        setSelectedOriginalNamesForRag(newSelectedOriginalNames);
    }, []);

    const speakText = useCallback((text) => {
        if (!speechSynthesis || !isTtsEnabled || !text) return;
        try {
            speechSynthesis.cancel(); // Stop any ongoing speech
            const utterance = new SpeechSynthesisUtterance(text);
            // Optional: Configure voice, rate, pitch
            // const voices = speechSynthesis.getVoices();
            // utterance.voice = voices.find(v => v.lang.startsWith('en')); // Find an English voice
            // utterance.rate = 0.9;
            speechSynthesis.speak(utterance);
        } catch (e) {
            console.error("Speech synthesis error:", e);
            setError("Could not play audio response.");
        }
    }, [isTtsEnabled]);

    const saveAndReset = useCallback(async (isLoggingOut = false, onCompleteCallback = null) => {
        // ... (saveAndReset logic from your provided ChatPage.js, no major changes needed here for these features) ...
        // Ensure speakText is cancelled if a new chat starts or on logout
        if (speechSynthesis) speechSynthesis.cancel();
        const currentSessionId = localStorage.getItem('sessionId');
        const currentUserId = localStorage.getItem('userId');
        const messagesToSave = [...messages];

        if (!currentSessionId || !currentUserId) {
             setError("Critical Error: Session info missing.");
             if (onCompleteCallback) onCompleteCallback(); return;
        }
        if (isLoading || isRagLoading || messagesToSave.length === 0 && !isLoggingOut) { // Allow save on logout even if no messages
             if (onCompleteCallback) onCompleteCallback(); return;
        }

        let newSessionId = null; setIsLoading(true); setError('');
        try {
            const response = await saveChatHistory({ sessionId: currentSessionId, messages: messagesToSave });
            newSessionId = response.data.newSessionId;
            if (!newSessionId) throw new Error("Backend failed to provide new session ID.");
            localStorage.setItem('sessionId', newSessionId); setSessionId(newSessionId);
            setMessages([]);
            if (!isLoggingOut) handlePromptSelectChange('friendly');
        } catch (err) {
            setError(`Session Error: ${err.response?.data?.message || err.message}`);
            if (err.response?.status === 401 && !isLoggingOut) handleLogout(true);
            else if (!newSessionId && !isLoggingOut) {
                 newSessionId = uuidv4(); localStorage.setItem('sessionId', newSessionId); setSessionId(newSessionId);
                 setMessages([]); handlePromptSelectChange('friendly');
            }
        } finally {
            setIsLoading(false); if (onCompleteCallback) onCompleteCallback();
        }
    }, [messages, isLoading, isRagLoading, handlePromptSelectChange]);


    const handleLogout = useCallback((skipSave = false) => {
        // ... (handleLogout logic from your provided ChatPage.js) ...
        if (speechSynthesis) speechSynthesis.cancel();
        const performCleanup = () => {
            localStorage.clear(); setIsAuthenticated(false);
            setMessages([]); setSessionId(''); setUserId(''); setUsername('');
            setCurrentSystemPromptId('friendly'); setEditableSystemPromptText(getPromptTextById('friendly'));
            setError(''); setHasFiles(false); setIsRagEnabled(false); setSelectedOriginalNamesForRag([]);
            setIsRecording(false); if (recognitionRef.current) recognitionRef.current.abort();
            setIsTtsEnabled(false);
            requestAnimationFrame(() => { if (window.location.pathname !== '/login') navigate('/login', { replace: true }); });
        };
        if (!skipSave && messages.length > 0) saveAndReset(true, performCleanup);
        else performCleanup();
    }, [navigate, setIsAuthenticated, saveAndReset, messages.length]);

    const handleNewChat = useCallback(() => { if (!isLoading && !isRagLoading) saveAndReset(false); }, [isLoading, isRagLoading, saveAndReset]);

    const handleSendMessage = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (speechSynthesis) speechSynthesis.cancel(); // Stop TTS if user sends new message

        const textToSend = inputText.trim();
        const currentSessionId = localStorage.getItem('sessionId');
        const currentUserId = localStorage.getItem('userId');

        if (!textToSend || isLoading || isRagLoading || !currentSessionId || !currentUserId) {
            if (!currentSessionId || !currentUserId) {
                setError("Session invalid. Please refresh or log in again.");
                if (!currentUserId) handleLogout(true);
            }
            return;
        }

        const newUserMessage = { role: 'user', parts: [{ text: textToSend }], timestamp: new Date() };
        const previousMessages = messages;
        setMessages(prev => [...prev, newUserMessage]);
        setInputText(''); setError('');

        let ragDocsForPayload = [];
        let ragError = null;

        if (isRagEnabled) {
            setIsRagLoading(true);
            try {
                const payload = { message: textToSend };
                if (selectedOriginalNamesForRag.length > 0) {
                    payload.targetOriginalNames = selectedOriginalNamesForRag;
                }
                const ragResponse = await queryRagService(payload);
                ragDocsForPayload = ragResponse.data.relevantDocs || [];
            } catch (err) {
                ragError = err.response?.data?.message || "Failed to retrieve documents for RAG.";
                if (err.response?.status === 401) { handleLogout(true); setIsRagLoading(false); return; }
            } finally {
                setIsRagLoading(false);
            }
        }

        setIsLoading(true);
        try {
            if (ragError) setError(prev => prev ? `${prev} | RAG Error: ${ragError}` : `RAG Error: ${ragError}`);
            const sendMessageResponse = await sendMessage({
                message: textToSend, history: previousMessages, sessionId: currentSessionId,
                systemPrompt: editableSystemPromptText, isRagEnabled: isRagEnabled,
                relevantDocs: ragDocsForPayload // Use the docs fetched (or empty if RAG off/failed/no selection meant all)
            });
            const modelReply = sendMessageResponse.data.reply;
            if (modelReply?.role && modelReply?.parts?.length > 0) {
                setMessages(prev => [...prev, modelReply]);
                speakText(modelReply.parts[0].text); // TTS for model reply
            } else throw new Error("Invalid reply structure received.");
            setError(prev => prev && (prev.includes("Session invalid") || prev.includes("Critical Error")) ? prev : '');
        } catch (err) {
            setError(prev => prev ? `${prev} | Chat Error: ${err.response?.data?.message || err.message}` : `Chat Error: ${err.response?.data?.message || err.message}`);
            setMessages(previousMessages);
            if (err.response?.status === 401 && !window.location.pathname.includes('/login')) handleLogout(true);
        } finally {
            setIsLoading(false);
        }
    }, [inputText, isLoading, isRagLoading, messages, editableSystemPromptText, isRagEnabled, selectedOriginalNamesForRag, handleLogout, speakText]);

    const handleEnterKey = useCallback((e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }, [handleSendMessage]);
    const handleRagToggle = (event) => setIsRagEnabled(event.target.checked);

    // --- STT Logic ---
    const handleToggleRecording = () => {
        if (!SpeechRecognition) {
            setSttError("Speech recognition is not supported by your browser.");
            return;
        }
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
        } else {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true; // Keep listening
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            let finalTranscript = inputText; // Start with current input text

            recognitionRef.current.onstart = () => setIsRecording(true);
            recognitionRef.current.onend = () => setIsRecording(false);
            recognitionRef.current.onerror = (event) => {
                setSttError(`Speech recognition error: ${event.error}`);
                setIsRecording(false);
            };
            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript.trim() + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                setInputText(finalTranscript + interimTranscript);
            };
            try {
                recognitionRef.current.start();
                setSttError('');
            } catch (e) {
                setSttError("Failed to start speech recognition. Check microphone permissions.");
                setIsRecording(false);
            }
        }
    };

    // --- TTS Logic ---
    const toggleTts = () => {
        const newTtsState = !isTtsEnabled;
        setIsTtsEnabled(newTtsState);
        localStorage.setItem('ttsEnabled', newTtsState.toString());
        if (!newTtsState && speechSynthesis) {
            speechSynthesis.cancel(); // Stop speech if TTS is turned off
        }
    };

    // --- RAG Status Display ---
    const getRagStatusMessage = () => {
        if (!isRagEnabled) return "RAG Disabled";
        if (selectedOriginalNamesForRag.length > 0) {
            return `RAG (Files: ${selectedOriginalNamesForRag.slice(0, 2).join(', ')}${selectedOriginalNamesForRag.length > 2 ? '...' : ''})`;
        }
        return hasFiles ? "RAG (All user files)" : "RAG (No user files)";
    };


    const isProcessing = isLoading || isRagLoading;
    if (!userId) return <div className="loading-indicator"><span>Initializing Chat...</span></div>;

    return (
        <div className="chat-page-container">
            <div className="sidebar-area">
                 <SystemPromptWidget selectedPromptId={currentSystemPromptId} promptText={editableSystemPromptText} onSelectChange={handlePromptSelectChange} onTextChange={handlePromptTextChange} />
                <FileUploadWidget onUploadSuccess={triggerFileRefresh} />
                <FileManagerWidget refreshTrigger={fileRefreshTrigger} onSelectedFilesChange={handleSelectedFilesChange} isRagEnabled={isRagEnabled} />
            </div>

            <div className="chat-container">
                 <header className="chat-header">
                    <h1>Engineering Tutor</h1>
                    <div className="header-controls">
                        <span className="username-display">Hi, {username}!</span>
                        <button onClick={toggleTts} className={`header-button tts-toggle-button ${isTtsEnabled ? 'tts-enabled' : ''}`} title={isTtsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}>
                            {isTtsEnabled ? '🔊' : '🔈'} {/* Speaker Icons */}
                        </button>
                        <button onClick={handleHistory} className="header-button history-button" disabled={isProcessing}>History</button>
                        <button onClick={handleNewChat} className="header-button newchat-button" disabled={isProcessing}>New Chat</button>
                        <button onClick={() => handleLogout(false)} className="header-button logout-button" disabled={isProcessing}>Logout</button>
                    </div>
                </header>

                 <div className="messages-area">
                    {messages.map((msg, index) => {
                         if (!msg?.role || !msg?.parts?.length || !msg.timestamp) return <div key={`error-${index}`} className="message-error">Msg Error</div>;
                         const messageText = msg.parts[0]?.text || '';
                         return (
                            <div key={`${sessionId}-${index}`} className={`message ${msg.role}`}>
                                <div className="message-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText}</ReactMarkdown>
                                </div>
                                <span className="message-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                         );
                    })}
                    <div ref={messagesEndRef} />
                 </div>

                {isProcessing && <div className="loading-indicator"><span>{isRagLoading ? 'Searching documents...' : 'Thinking...'}</span></div>}
                {(!isProcessing && error) && <div className="error-indicator">{error}</div>}
                {(!isProcessing && sttError) && <div className="error-indicator stt-error-indicator">{sttError}</div>}
                <div className="rag-status-display">{getRagStatusMessage()}</div>


                <footer className="input-area">
                    <button
                        type="button"
                        onClick={handleToggleRecording}
                        className={`mic-button ${isRecording ? 'recording' : ''}`}
                        disabled={isProcessing || !SpeechRecognition}
                        title={isRecording ? "Stop Recording" : "Start Voice Input"}
                        aria-label={isRecording ? "Stop Recording" : "Start Voice Input"}
                    >
                        🎤
                    </button>
                    <textarea
                        value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleEnterKey}
                        placeholder="Ask your tutor..." rows="1" disabled={isProcessing} aria-label="Chat input"
                    />
                    <div className="rag-toggle-container" title={!hasFiles ? "Upload files to enable RAG" : (isRagEnabled ? "Disable RAG" : "Enable RAG")}>
                        <input type="checkbox" id="rag-toggle" checked={isRagEnabled} onChange={handleRagToggle} disabled={!hasFiles || isProcessing} aria-label="Enable RAG" />
                        <label htmlFor="rag-toggle">RAG</label>
                    </div>
                    <button onClick={handleSendMessage} disabled={isProcessing || !inputText.trim()} title="Send Message" aria-label="Send message">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                        </svg>
                    </button>
                </footer>
            </div>
            <HistoryModal isOpen={isHistoryModalOpen} onClose={closeHistoryModal} />
        </div>
    );
};

export default ChatPage;