// client/src/components/ChatPage.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendMessage, saveChatHistory, getUserFiles, queryRagService, uploadFile } from '../services/api'; // Removed transcribeAudio
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { v4 as uuidv4 } from 'uuid';

import SystemPromptWidget, { availablePrompts, getPromptTextById } from './SystemPromptWidget';
import HistoryModal from './HistoryModal';
// import FileUploadWidget from './FileUploadWidget'; // Will be replaced by inline button
import FileManagerWidget from './FileManagerWidget';

import './ChatPage.css';

// --- SVG Icons ---
const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
);
const MicIcon = ({ isRecording }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isRecording ? "#f44336" : "currentColor"} width="20" height="20">
        <path d="M12 14a2 2 0 002-2V6a2 2 0 00-4 0v6a2 2 0 002 2z" />
        <path d="M12 17c-2.21 0-4-1.79-4-4V6h2v7a2 2 0 004 0V6h2v7c0 2.21-1.79 4-4 4z" />
        <path d="M19 12h-2a5.006 5.006 0 00-5-5V5a7.008 7.008 0 017 7zM5 12H3a7.008 7.008 0 017-7V7a5.006 5.006 0 00-5 5z" />
    </svg>
);
const AttachFileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243L15.75 8.5a1.5 1.5 0 012.122 2.121l-7.126 7.126a.75.75 0 01-1.06-1.06l7.125-7.126a.1.1 0 00-.141-.142l-7.126 7.126a1.5 1.5 0 002.121 2.121l7.126-7.126a3 3 0 00-4.243-4.243z" clipRule="evenodd" />
        <path d="M10.5 6a4.5 4.5 0 00-6.364 6.364l7.004 7.003a4.5 4.5 0 006.363-6.363l-6.904-6.903a3 3 0 10-4.243 4.242l6.903 6.903a1.5 1.5 0 102.12-2.121L9.32 11.67a.75.75 0 011.06-1.06l3.486 3.485a.75.75 0 001.061-1.06l-3.486-3.485a1.502 1.502 0 01-1.19-.597l-.07-.103a1.495 1.495 0 01-.11-1.576 1.5 1.5 0 012.389-.776l6.904 6.903a3 3 0 01-4.243 4.243l-7.004-7.003a3 3 0 010-4.243L10.5 6z" />
    </svg>
);
// --- End SVG Icons ---

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

    // --- SST State ---
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const triggerFileRefresh = useCallback(() => {
        setFileRefreshTrigger(prev => prev + 1);
    }, []);


    const fileInputRef = useRef(null); // For hidden file input
    const navigate = useNavigate();

    // --- TTS State ---
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState(null);

    // --- Edit Message State ---
    const [editingMessageIndex, setEditingMessageIndex] = useState(null);

    const handlePromptSelectChange = useCallback((newId) => {
        setCurrentSystemPromptId(newId); setEditableSystemPromptText(getPromptTextById(newId));
        setError(prev => (prev?.includes("Session invalid") || prev?.includes("Critical Error")) ? prev : `Assistant mode changed.`);
        setTimeout(() => { setError(prev => prev === `Assistant mode changed.` ? '' : prev); }, 3000);
    }, []);
    const handlePromptTextChange = useCallback((newText) => {
        setEditableSystemPromptText(newText);
        const matchingPreset = availablePrompts.find(p => p.id !== 'custom' && p.prompt === newText);
        setCurrentSystemPromptId(matchingPreset ? matchingPreset.id : 'custom');
    }, []);

    const saveAndReset = useCallback(async (isLoggingOut = false, onCompleteCallback = null) => {
        const currentSessionId = localStorage.getItem('sessionId');
        const currentUserId = localStorage.getItem('userId');
        const messagesToSave = [...messages];
        if (!currentSessionId || !currentUserId) {
            setError("Critical Error: Session info missing.");
            if (onCompleteCallback) onCompleteCallback(); return;
        }
        if (isLoading || isRagLoading || messagesToSave.length === 0) {
            if (onCompleteCallback) onCompleteCallback(); return;
        }
        let newSessionId = null; setIsLoading(true);
        setError(prev => (prev?.includes("Session invalid") || prev?.includes("Critical Error")) ? prev : '');
        try {
            const response = await saveChatHistory({ sessionId: currentSessionId, messages: messagesToSave });
            newSessionId = response.data.newSessionId;
            if (!newSessionId) throw new Error("Backend failed to provide new session ID.");
            localStorage.setItem('sessionId', newSessionId); setSessionId(newSessionId); setMessages([]);
            if (!isLoggingOut) { handlePromptSelectChange('friendly'); setError(''); }
        } catch (err) {
            setError(`Session Error: ${err.response?.data?.message || err.message || 'Failed to save/reset.'}`);
            if (err.response?.status === 401 && !isLoggingOut) handleLogout(true);
            else if (!newSessionId && !isLoggingOut) {
                newSessionId = uuidv4(); localStorage.setItem('sessionId', newSessionId); setSessionId(newSessionId);
                setMessages([]); handlePromptSelectChange('friendly');
            }
        } finally {
            setIsLoading(false); if (onCompleteCallback) onCompleteCallback();
        }
    }, [messages, isLoading, isRagLoading, handlePromptSelectChange]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLogout = useCallback((skipSave = false) => {
        const performCleanup = () => {
            localStorage.clear(); setIsAuthenticated(false);
            setMessages([]); setSessionId(''); setUserId(''); setUsername('');
            setCurrentSystemPromptId('friendly'); setEditableSystemPromptText(getPromptTextById('friendly'));
            setError(''); setHasFiles(false); setIsRagEnabled(false);
            requestAnimationFrame(() => { if (window.location.pathname !== '/login') navigate('/login', { replace: true }); });
        };
        if (!skipSave && messages.length > 0) saveAndReset(true, performCleanup);
        else performCleanup();
    }, [navigate, setIsAuthenticated, saveAndReset, messages.length]);

    const handleNewChat = useCallback(() => {
        if (!isLoading && !isRagLoading) saveAndReset(false);
     }, [isLoading, isRagLoading, saveAndReset]);

    const handleEditMessage = useCallback((index) => {
        const messageToEdit = messages[index];
        if (messageToEdit && messageToEdit.role === 'user') {
            setEditingMessageIndex(index);
            setInputText(messageToEdit.parts[0]?.text || '');
            // Optional: Scroll to input area
            // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

// --- File Upload Logic ---
    const handleFileSelectedForUpload = useCallback(async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsLoading(true);
        setError('');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', userId); // Assuming userId is available in state

        try {
            const response = await uploadFile(formData);
            console.log('File upload successful:', response.data);
            setError(`File "${file.name}" uploaded successfully.`);
            triggerFileRefresh(); // Refresh file list after upload
        } catch (err) {
            console.error('File upload failed:', err);
            setError(`File upload failed: ${err.response?.data?.message || err.message}`);
            if (err.response?.status === 401) handleLogout(true);
        } finally {
            setIsLoading(false);
            // Clear the file input value so the same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [userId, triggerFileRefresh, handleLogout]);

    const triggerFileInput = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleSendMessage = useCallback(async (e) => {
        if (e) e.preventDefault();
        const textToSend = inputText.trim();
        const currentSessionId = localStorage.getItem('sessionId');
        const currentUserId = localStorage.getItem('userId');
        if (!textToSend || isLoading || isRagLoading || !currentSessionId || !currentUserId) {
            if (!currentSessionId || !currentUserId) { setError("Session invalid. Please refresh or log in again."); if (!currentUserId) handleLogout(true); }
            return;
        }

        setIsLoading(true);
        setError(''); // Clear previous errors

        let currentMessages = [...messages];
        let userMessage;
        let historyToSend;

        if (editingMessageIndex !== null) {
            // Editing existing message
            userMessage = { ...currentMessages[editingMessageIndex], parts: [{ text: textToSend }], timestamp: new Date() };
            currentMessages[editingMessageIndex] = userMessage;
            historyToSend = currentMessages.slice(0, editingMessageIndex); // History up to the edited message
            setEditingMessageIndex(null); // Exit editing mode
        } else {
            // Sending new message
            userMessage = { role: 'user', parts: [{ text: textToSend }], timestamp: new Date() };
            currentMessages = [...currentMessages, userMessage];
            historyToSend = currentMessages.slice(0, -1); // History before the new message
        }

        setMessages(currentMessages); // Optimistically update UI
        setInputText(''); // Clear input field

        let relevantDocs = [];
        let ragError = null;

        if (isRagEnabled) {
            setIsRagLoading(true);
            try {
                // For RAG query, always use the latest user message text
                const ragResponse = await queryRagService({ message: textToSend });
                relevantDocs = ragResponse.data.relevantDocs || [];
            } catch (err) {
                ragError = err.response?.data?.message || "Failed to retrieve RAG documents.";
                if (err.response?.status === 401) { handleLogout(true); setIsRagLoading(false); return; }
            } finally { setIsRagLoading(false); }
        }

        try {
            if (ragError) setError(prev => prev ? `${prev} | RAG Error: ${ragError}` : `RAG Error: ${ragError}`);

            // Send the relevant history and the latest user message to the backend
            const sendMessageResponse = await sendMessage({
                message: textToSend, // Send the latest user message text
                history: historyToSend, // Send the appropriate history slice
                sessionId: currentSessionId,
                systemPrompt: editableSystemPromptText,
                isRagEnabled: isRagEnabled,
                relevantDocs: relevantDocs // Pass relevant docs based on the latest query
            });

            if (sendMessageResponse.data.reply?.role && sendMessageResponse.data.reply?.parts?.length > 0) {
                 // Append the new model reply to the messages
                setMessages(prev => [...prev, sendMessageResponse.data.reply]);
            } else {
                 // If no reply, revert the optimistic update for the last user message
                 // This is a simplified rollback; a more robust approach might be needed
                 setMessages(currentMessages.slice(0, editingMessageIndex !== null ? editingMessageIndex : -1)); // Revert based on whether it was an edit or new message
                 throw new Error("Invalid reply structure from AI.");
            }
            setError(prev => (prev?.includes("Session invalid") || prev?.includes("Critical Error")) ? prev : '');

        } catch (err) {
            setError(prev => prev ? `${prev} | Chat Error: ${err.response?.data?.message || err.message}` : `Chat Error: ${err.response?.data?.message || err.message}`);
            // Revert the optimistic update on error
            setMessages(currentMessages.slice(0, editingMessageIndex !== null ? editingMessageIndex : -1)); // Revert based on whether it was an edit or new message
            if (err.response?.status === 401) handleLogout(true);
        } finally {
            setIsLoading(false);
        }
    }, [inputText, isLoading, isRagLoading, messages, editableSystemPromptText, isRagEnabled, handleLogout, editingMessageIndex]); // Add editingMessageIndex to dependencies

    // --- Input Handling ---
    const handleEnterKey = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }, [handleSendMessage]);

    // --- RAG Toggle Handling ---
    const handleRagToggle = useCallback(() => {
        setIsRagEnabled(prev => !prev);
        setError(prev => (prev?.includes("Session invalid") || prev?.includes("Critical Error")) ? prev : `RAG mode ${isRagEnabled ? 'disabled' : 'enabled'}.`);
        setTimeout(() => { setError(prev => prev?.includes("RAG mode") ? '' : prev); }, 3000);
    }, [isRagEnabled]);

    const messagesEndRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    useEffect(() => {
        const storedSessionId = localStorage.getItem('sessionId');
        const storedUserId = localStorage.getItem('userId');
        const storedUsername = localStorage.getItem('username');
        if (!storedUserId || !storedSessionId || !storedUsername) {
            handleLogout(true);
        } else {
            setSessionId(storedSessionId); setUserId(storedUserId); setUsername(storedUsername);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const checkUserFiles = async () => {
            const currentUserId = localStorage.getItem('userId');
            if (!currentUserId) { setHasFiles(false); setIsRagEnabled(false); return; }
            try {
                const response = await getUserFiles();
                const filesExist = response.data && response.data.length > 0;
                setHasFiles(filesExist); setIsRagEnabled(filesExist);
            } catch (err) {
                if (err.response?.status === 401) handleLogout(true);
                else { setError("Could not check files."); setHasFiles(false); setIsRagEnabled(false); }
            }
        };
        if (userId) checkUserFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, fileRefreshTrigger]);


    const handleHistory = useCallback(() => setIsHistoryModalOpen(true), []);
    const closeHistoryModal = useCallback(() => setIsHistoryModalOpen(false), []);



    // --- TTS Logic ---
    const handleSpeak = useCallback((messageId, text) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => {
                setIsSpeaking(true);
                setSpeakingMessageId(messageId);
            };
            utterance.onend = () => {
                setIsSpeaking(false);
                setSpeakingMessageId(null);
            };
            utterance.onerror = (event) => {
                console.error('SpeechSynthesisUtterance error:', event);
                setIsSpeaking(false);
                setSpeakingMessageId(null);
                setError("Text-to-speech failed.");
            };
            window.speechSynthesis.speak(utterance);
        } else {
            setError("Text-to-speech not supported in this browser.");
        }
    }, []);

    const handleStopSpeaking = useCallback(() => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setSpeakingMessageId(null);
        }
    }, []);


    // --- SST Logic (Web Speech API) ---
    const recognitionRef = useRef(null);
    const finalTranscriptRef = useRef(''); // Use useRef for final transcript

    const startRecording = useCallback(() => {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            setError("Speech recognition not supported in this browser.");
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true; // Set to true for continuous recognition
        recognitionRef.current.interimResults = true; // Get interim results
        recognitionRef.current.lang = 'en-US'; // Set language

        recognitionRef.current.onstart = () => {
            setIsRecording(true);
            setIsTranscribing(false); // Not transcribing yet, just recording
            setError("Recording... Speak now.");
            finalTranscriptRef.current = ''; // Reset final transcript on start
            setInputText(''); // Clear input on start
        };

        recognitionRef.current.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscriptRef.current += transcript + ' '; // Use ref and add space
                } else {
                    interimTranscript += transcript;
                }
            }
            // Update the input text: show final transcript + current interim transcript
            // This replaces the previous content to avoid duplication
            setInputText(() => finalTranscriptRef.current + interimTranscript); // Use ref
        };

        recognitionRef.current.onerror = (event) => {
            console.error('SpeechRecognition error:', event);
            setIsRecording(false);
            setIsTranscribing(false);
            setError(`Speech recognition error: ${event.error}`);
        };

        recognitionRef.current.onend = () => {
            setIsRecording(false);
            setIsTranscribing(false); // Finished recording/transcribing
            setError("Recording stopped.");
            setTimeout(() => setError(prev => prev === "Recording stopped." ? '' : prev), 3000);
        };

        try {
            recognitionRef.current.start();
        } catch (e) {
            console.error("Error starting speech recognition:", e);
            setError("Error starting speech recognition. Is the microphone available?");
            setIsRecording(false);
            setIsTranscribing(false);
        }
    }, []); // Dependencies might be needed if using state/props inside

    const stopRecording = useCallback(() => {
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop();
            // onend event will handle state updates
        }
    }, [isRecording]);

    const handleMicClick = useCallback(() => {
        if (isRecording) {
            handleStopSpeaking(); // Stop TTS if speaking
            stopRecording();
        } else {
            handleStopSpeaking(); // Stop TTS if speaking
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording, handleStopSpeaking]);

    const isProcessing = isLoading || isRagLoading || isTranscribing; // isTranscribing might be less relevant with Web Speech API STT

    if (!userId) return <div className="loading-indicator"><span>Initializing session...</span></div>;

    return (
        <div className="chat-page-container">
            {/* Hidden file input */}
            

            <div className="sidebar-area">
                 <SystemPromptWidget
                    selectedPromptId={currentSystemPromptId} promptText={editableSystemPromptText}
                    onSelectChange={handlePromptSelectChange} onTextChange={handlePromptTextChange}
                 />
                 {/* FileUploadWidget is now integrated into input bar */}
                <FileManagerWidget refreshTrigger={fileRefreshTrigger} />
            </div>

            <div className="chat-container">
                 <header className="chat-header">
                    <h1>Engineering Tutor</h1>
                    <div className="header-controls">
                        <span className="username-display">Hi, {username}!</span>
                        <button onClick={handleHistory} className="header-button history-button" disabled={isProcessing}>History</button>
                        <button onClick={handleNewChat} className="header-button newchat-button" disabled={isProcessing}>New Chat</button>
                        <button onClick={() => handleLogout(false)} className="header-button logout-button" disabled={isProcessing}>Logout</button>
                    </div>
                </header>

                 <div className="messages-area">
                    {messages.map((msg, index) => {
                         if (!msg?.role || !msg?.parts?.length || !msg.timestamp) {
                            return <div key={`error-${index}`} className="message-error">Msg Error</div>;
                         }
                         const messageText = msg.parts[0]?.text || '';
                         const messageId = `${sessionId}-${index}`; // Unique ID for each message

                         return (
                            <div key={messageId} className={`message ${msg.role}`}>
                                <div className="message-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText}</ReactMarkdown>
                                    {msg.role === 'model' && (
                                        <button
                                            className="tts-button"
                                            onClick={() => isSpeaking && speakingMessageId === messageId ? handleStopSpeaking() : handleSpeak(messageId, messageText)}
                                            disabled={isSpeaking && speakingMessageId !== messageId}
                                            title={isSpeaking && speakingMessageId === messageId ? "Stop Speaking" : "Speak Message"}
                                            aria-label={isSpeaking && speakingMessageId === messageId ? "Stop speaking" : "Speak message"}
                                        >
                                            {isSpeaking && speakingMessageId === messageId ? (
                                                // Stop Icon (example: square)
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                                    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75h9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-9a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                // Play Icon (example: triangle)
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.38 2.704-1.618L18.897 12l-11.693 7.965c-1.175.762-2.704-.174-2.704-1.618V5.653z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                    {msg.role === 'user' && (
                                        <button
                                            className="edit-button"
                                            onClick={() => handleEditMessage(index)}
                                            disabled={isProcessing}
                                            title="Edit Message"
                                            aria-label="Edit message"
                                        >
                                            {/* Edit Icon (example: pencil) */}
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                                <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.09l-.334 1.679a.75.75 0 00.933.933l1.679-.334a5.25 5.25 0 002.09-1.32l8.4-8.4z" />
                                                <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <span className="message-timestamp">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                         );
                    })}
                    <div ref={messagesEndRef} />
                 </div>

                {isProcessing && <div className="loading-indicator"><span>{isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : isRagLoading ? 'Searching documents...' : 'Thinking...'}</span></div>}
                {!isProcessing && error && <div className="error-indicator">{error}</div>}

                <footer className="input-area">
                    <textarea
                        value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleEnterKey}
                        placeholder={isRecording ? "Recording... Click mic to stop." : (editingMessageIndex !== null ? "Editing message..." : "Ask your tutor...")}
                        rows="1" disabled={isProcessing || isRecording} aria-label="Chat input"
                    />
                    <div className="input-controls-group">
                        <div className="rag-toggle-container" title={!hasFiles ? "Upload files to enable RAG" : (isRagEnabled ? "Disable RAG" : "Enable RAG")}>
                            <input type="checkbox" id="rag-toggle" checked={isRagEnabled} onChange={handleRagToggle}
                                   disabled={!hasFiles || isProcessing} aria-label="Enable RAG" />
                            <label htmlFor="rag-toggle">RAG</label>
                        </div>
                        <button onClick={triggerFileInput} disabled={isProcessing} className="icon-button" title="Attach File" aria-label="Attach file">
                            <AttachFileIcon />
                        </button>
                        <button onClick={handleMicClick} disabled={isTranscribing || isLoading || isRagLoading} className={`icon-button mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : "Start Recording"} aria-label={isRecording ? "Stop recording" : "Start recording"}>
                            <MicIcon isRecording={isRecording} />
                        </button>
                        <button onClick={handleSendMessage} disabled={isProcessing || !inputText.trim()} className="icon-button send-button" title={editingMessageIndex !== null ? "Resend Edited Message" : "Send Message"} aria-label={editingMessageIndex !== null ? "Resend edited message" : "Send message"}>
                            {editingMessageIndex !== null ? (
                                // Resend Icon (example: arrow circle up)
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <SendIcon />
                            )}
                        </button>
                    </div>
                </footer>
            </div>
            <HistoryModal isOpen={isHistoryModalOpen} onClose={closeHistoryModal} />
        </div>
    );
};

export default ChatPage;