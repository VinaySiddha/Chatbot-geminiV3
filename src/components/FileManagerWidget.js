// client/src/components/FileManagerWidget.js
import React, { useState, useEffect, useCallback } from 'react';
import { getUserFiles, renameUserFile, deleteUserFile } from '../services/api';

const getFileIcon = (type) => {
  switch (type) {
    case 'docs': return '📄';
    case 'images': return '🖼️';
    case 'code': return '💻';
    default: return '📁';
  }
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (typeof bytes !== 'number' || bytes < 0) return 'N/A';
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.max(0, Math.min(i, sizes.length - 1));
  return parseFloat((bytes / Math.pow(k, index)).toFixed(1)) + ' ' + sizes[index];
};


const FileManagerWidget = ({ refreshTrigger, onSelectedFilesChange, isRagEnabled }) => { // Added onSelectedFilesChange, isRagEnabled
  const [userFiles, setUserFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [renamingFile, setRenamingFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // Use a Set for efficient add/delete

  const fetchUserFiles = useCallback(async () => {
    const currentUserId = localStorage.getItem('userId');
    if (!currentUserId) {
        setUserFiles([]);
        setSelectedFiles(new Set()); // Clear selections
        if (onSelectedFilesChange) onSelectedFilesChange([]);
        return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await getUserFiles();
      setUserFiles(response.data || []);
    } catch (err) {
      console.error("Error fetching user files:", err);
      setError(err.response?.data?.message || 'Failed to load files.');
      setUserFiles([]);
      if (err.response?.status === 401) console.warn("FileManager: Received 401, potential logout needed.");
    } finally {
      setIsLoading(false);
    }
  }, [onSelectedFilesChange]); // Added onSelectedFilesChange

  useEffect(() => {
    fetchUserFiles();
  }, [refreshTrigger, fetchUserFiles]);

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectedFilesChange) {
      onSelectedFilesChange(Array.from(selectedFiles));
    }
  }, [selectedFiles, onSelectedFilesChange]);

  const handleFileSelectToggle = (originalName) => {
    setSelectedFiles(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(originalName)) {
        newSelected.delete(originalName);
      } else {
        newSelected.add(originalName);
      }
      return newSelected;
    });
  };


  const handleRenameClick = (file) => {
    setRenamingFile(file.serverFilename);
    setNewName(file.originalName);
    setError('');
  };

  const handleRenameCancel = () => {
    setRenamingFile(null);
    setNewName('');
    setError('');
  };

  const handleRenameSave = async () => {
    if (!renamingFile || !newName.trim()) {
         setError('New name cannot be empty.');
         return;
    }
    if (newName.includes('/') || newName.includes('\\')) {
        setError('New name cannot contain slashes.');
        return;
    }

    setIsLoading(true);
    setError('');
    try {
      const oldOriginalName = userFiles.find(f => f.serverFilename === renamingFile)?.originalName;
      await renameUserFile(renamingFile, newName.trim());
      setRenamingFile(null);
      setNewName('');
      // If the renamed file was selected, update its name in the selection
      if (oldOriginalName && selectedFiles.has(oldOriginalName)) {
          setSelectedFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(oldOriginalName);
              newSet.add(newName.trim());
              return newSet;
          });
      }
      fetchUserFiles(); // Refresh list
    } catch (err) {
      console.error("Error renaming file:", err);
      setError(err.response?.data?.message || 'Failed to rename file.');
       if (err.response?.status === 401) console.warn("FileManager: Received 401 during rename.");
    } finally {
       setIsLoading(false);
    }
  };

  const handleRenameInputKeyDown = (e) => {
      if (e.key === 'Enter') handleRenameSave();
      else if (e.key === 'Escape') handleRenameCancel();
  };

  const handleDeleteFile = async (serverFilename, originalName) => {
    if (!window.confirm(`Are you sure you want to delete "${originalName}"? This cannot be undone.`)) return;

    setIsLoading(true);
    setError('');
    try {
      await deleteUserFile(serverFilename);
      setSelectedFiles(prev => { // Remove from selection if deleted
          const newSet = new Set(prev);
          newSet.delete(originalName);
          return newSet;
      });
      fetchUserFiles(); // Refresh list
    } catch (err) {
      console.error("Error deleting file:", err);
      setError(err.response?.data?.message || 'Failed to delete file.');
       if (err.response?.status === 401) console.warn("FileManager: Received 401 during delete.");
    } finally {
       setIsLoading(false);
    }
  };

  return (
    <div className="file-manager-widget">
      <div className="fm-header">
        <h4>Your Uploaded Files {isRagEnabled ? "(RAG Active)" : ""}</h4>
        <button onClick={fetchUserFiles} disabled={isLoading} className="fm-refresh-btn" title="Refresh File List">🔄</button>
      </div>

      {error && <div className="fm-error">{error}</div>}

      <div className="fm-file-list-container">
        {isLoading && userFiles.length === 0 ? (
          <p className="fm-loading">Loading files...</p>
        ) : userFiles.length === 0 && !isLoading ? (
          <p className="fm-empty">No files uploaded yet.</p>
        ) : (
          <ul className="fm-file-list">
            {userFiles.map((file) => (
              <li key={file.serverFilename} className={`fm-file-item ${selectedFiles.has(file.originalName) && isRagEnabled ? 'fm-file-item-selected' : ''}`}>
                {isRagEnabled && (
                  <input
                    type="checkbox"
                    className="fm-file-checkbox"
                    checked={selectedFiles.has(file.originalName)}
                    onChange={() => handleFileSelectToggle(file.originalName)}
                    disabled={isLoading || !!renamingFile}
                    title={`Select ${file.originalName} for RAG query`}
                  />
                )}
                <span className="fm-file-icon">{getFileIcon(file.type)}</span>
                <div className="fm-file-details">
                  {renamingFile === file.serverFilename ? (
                    <div className="fm-rename-section">
                      <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={handleRenameInputKeyDown} autoFocus className="fm-rename-input" aria-label={`New name for ${file.originalName}`} />
                      <button onClick={handleRenameSave} disabled={isLoading || !newName.trim()} className="fm-action-btn fm-save-btn" title="Save Name">✔️</button>
                      <button onClick={handleRenameCancel} disabled={isLoading} className="fm-action-btn fm-cancel-btn" title="Cancel Rename">❌</button>
                    </div>
                  ) : (
                    <>
                      <span className="fm-file-name" title={file.originalName}>{file.originalName}</span>
                      <span className="fm-file-size">{formatFileSize(file.size)}</span>
                    </>
                  )}
                </div>
                {renamingFile !== file.serverFilename && (
                  <div className="fm-file-actions">
                    <button onClick={() => handleRenameClick(file)} disabled={isLoading || !!renamingFile} className="fm-action-btn fm-rename-btn" title="Rename">✏️</button>
                    <button onClick={() => handleDeleteFile(file.serverFilename, file.originalName)} disabled={isLoading || !!renamingFile} className="fm-action-btn fm-delete-btn" title="Delete">🗑️</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
         {isLoading && userFiles.length > 0 && <p className="fm-loading fm-loading-bottom">Processing...</p>}
      </div>
    </div>
  );
};

// --- CSS for FileManagerWidget ---
// Append to existing CSS for FileManagerWidget.js (or replace if this is the only one)
const styleTagFileManagerId = 'file-manager-widget-styles';
let existingStyleTag = document.getElementById(styleTagFileManagerId);
if (!existingStyleTag) {
    existingStyleTag = document.createElement("style");
    existingStyleTag.id = styleTagFileManagerId;
    existingStyleTag.type = "text/css";
    document.head.appendChild(existingStyleTag);
}

const FileManagerWidgetCSSUpdates = `
.fm-file-item { position: relative; /* For checkbox positioning if needed */ }
.fm-file-checkbox { margin-right: 8px; cursor: pointer; width: 15px; height: 15px; accent-color: var(--accent-blue); vertical-align: middle;}
.fm-file-item-selected { background-color: #405260 !important; border-left: 3px solid var(--accent-blue); }
.fm-file-checkbox:disabled { cursor: not-allowed; opacity: 0.7; }
.fm-header h4 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 30px); }
`;

existingStyleTag.innerText += FileManagerWidgetCSSUpdates; // Append new styles

export default FileManagerWidget;