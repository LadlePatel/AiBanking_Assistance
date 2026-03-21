import React, { useState, useEffect } from "react";
// import Chatbar from "./component/Chatbar"; // We will refactor/replace this
import Chatbar from "./component/Chatbar"; // Temporarily keeping for logic, but will wrap it
import Sidebar from "./component/Sidebar";
import FileUpload from "./component/FileUpload";
import SettingsModal from "./component/SettingsModal";
import { listDocuments, deleteDocument } from "./api";
import "./index.css";

function App() {
  // Global State
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile toggle
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Desktop collapse
  const [selectedSession, setSelectedSession] = useState(null);
  const [isNewChat, setIsNewChat] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Document State
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [selectedDocsForContext, setSelectedDocsForContext] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // History State (Lifted from Chatbar for Sidebar access)
  const [historySessions, setHistorySessions] = useState([]);

  const loadSessions = () => {
    const savedSessions = JSON.parse(localStorage.getItem("chatSessions") || "[]");
    setHistorySessions(savedSessions.sort((a, b) => b.timestamp - a.timestamp));
  };

  useEffect(() => {
    loadSessions();
    window.addEventListener("sessionsUpdated", loadSessions);
    return () => window.removeEventListener("sessionsUpdated", loadSessions);
  }, []);

  const handleDeleteSession = (sId) => {
    const updatedSessions = historySessions.filter(s => s.id !== sId);
    setHistorySessions(updatedSessions);
    localStorage.setItem("chatSessions", JSON.stringify(updatedSessions));
    localStorage.removeItem(`messages_${sId}`);

    // If deleting the currently active session, navigate to new chat
    if (selectedSession === sId) {
      setSelectedSession(null); // Clear selected session first
      setIsNewChat(true); // Trigger new chat mode
    }
    window.dispatchEvent(new Event("sessionsUpdated"));
  };

  // Fetch documents
  const fetchDocs = async () => {
    try {
      const docs = await listDocuments();
      const mappedDocs = Array.isArray(docs) ? docs.map(d => ({
        ...d,
        name: d.filename,
        fileId: d.id
      })) : [];

      setAttachedFiles(mappedDocs);

      setSelectedDocsForContext(prev => {
        // prev is now an array of document objects, not IDs
        const existingDocIds = mappedDocs.map(d => d.id || d.fileId);
        return prev.filter(doc => existingDocIds.includes(doc.id || doc.fileId));
      });

      if (mappedDocs.length > 0) {
        if (!activeDocument) {
          setActiveDocument(mappedDocs[0]);
        } else {
          const exists = mappedDocs.find(d => d.id === activeDocument.id || d.fileId === activeDocument.fileId);
          if (!exists) setActiveDocument(mappedDocs[0]);
        }
      } else {
        setActiveDocument(null);
      }
    } catch (error) {
      console.error("Failed to load documents:", error);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleNewChat = () => {
    setIsNewChat(true);
    setSelectedSession(null);
  };

  const handleSessionSelect = (sessionId) => {
    setSelectedSession(sessionId);
    setIsNewChat(false); // Ensure we aren't in "new chat" mode
  };

  const handleRemoveFile = async (fileId) => {
    if (fileId) {
      await deleteDocument(fileId);
      // Filter out the removed document object by comparing IDs
      setSelectedDocsForContext(prev => prev.filter(doc => (doc.id || doc.fileId) !== fileId));
      fetchDocs();
    }
  };

  // Handle PDF viewing (eye icon) - separate from context selection
  const handleViewDocument = (doc) => {
    if (!doc) {
      // Close PDF viewer
      setActiveDocument(null);
    } else if (activeDocument?.id === doc.id || activeDocument?.fileId === doc.fileId) {
      // Toggle off if same document
      setActiveDocument(null);
    } else {
      // Open this document in PDF viewer
      setActiveDocument(doc);
    }
  };

  // Handle context selection (card click) - separate from viewing
  const handleSelectDocument = (doc) => {
    if (!doc) return;

    const docId = doc.id || doc.fileId;
    const isSelected = selectedDocsForContext.some(
      d => (d.id || d.fileId) === docId
    );

    if (isSelected) {
      // Remove from context
      setSelectedDocsForContext(prev =>
        prev.filter(d => (d.id || d.fileId) !== docId)
      );
    } else {
      // Add to context
      setSelectedDocsForContext(prev => [...prev, doc]);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden">
      {/* Sidebar (Left) */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
        historySessions={historySessions}
        selectedSession={selectedSession}
        onSessionSelect={handleSessionSelect}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Main Content (Right) */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-medium)] text-[var(--text-primary)]">
          <button onClick={() => setSidebarOpen(true)} className="mr-4">
            <span className="material-symbols-rounded">menu</span>
          </button>
          <span className="font-medium">New chat</span>
        </div>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col h-full w-full bg-[var(--bg-chat)] relative">
          <Chatbar
            key={selectedSession || 'new'} // Force re-render on session switch
            selectedSession={selectedSession}
            isNewChat={isNewChat}
            resetNewChat={() => setIsNewChat(false)}
            onSessionSelect={handleSessionSelect}
            // Document Props
            attachedFiles={attachedFiles}
            activeDocument={activeDocument}
            selectedDocsForContext={selectedDocsForContext}
            onAddDocument={() => setShowUploadModal(true)}
            onSelectDocument={handleSelectDocument} // For context selection
            onViewDocument={handleViewDocument} // For PDF viewing
            onDeleteDocument={handleRemoveFile} // For deleting documents
            // Pass layout flag
            isSidebarLayout={true}
          />
        </main>
      </div>

      {/* Modals */}
      <FileUpload
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onFileUploaded={fetchDocs}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
}

export default App;

