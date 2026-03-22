import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "../api";

const FileUpload = ({ isOpen, onClose, onFileUploaded }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [currentFile, setCurrentFile] = useState(null);

    const handleFiles = async (files) => {
        const allowedExtensions = ['.pdf', '.docx', '.html'];
        const validFiles = files.filter(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            return allowedExtensions.includes(ext);
        });

        if (validFiles.length === 0) {
            return;
        }

        setUploading(true);
        for (const file of validFiles) {
            setCurrentFile(file.name);
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`${API_URL}/upload-doc`, {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();

                if (response.ok) {
                    const uploadedFile = {
                        name: file.name,
                        size: file.size,
                        status: 'success',
                        message: result.message,
                        fileId: result.file_id
                    };
                    setUploadedFiles(prev => [...prev, uploadedFile]);
                    if (onFileUploaded) onFileUploaded(uploadedFile);
                } else {
                    setUploadedFiles(prev => [...prev, {
                        name: file.name,
                        status: 'error',
                        message: result.error || 'Upload failed'
                    }]);
                }
            } catch (error) {
                setUploadedFiles(prev => [...prev, {
                    name: file.name,
                    status: 'error',
                    message: 'Network error'
                }]);
            }
        }
        setCurrentFile(null);
        setUploading(false);
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm"
            />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-xl glass border border-[var(--border-subtle)] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col bg-[var(--bg-glass)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-8 border-b border-[var(--border-subtle)]">
                    <div>
                        <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] tracking-tight">Financial Documents</h2>
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500 mt-1">
                            Secure Ingestion Protocol
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-10 rounded-xl bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                    >
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div className="p-8 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    {/* Upload Zone */}
                    <div
                        onDragEnter={() => setIsDragging(true)}
                        onDragLeave={() => setIsDragging(false)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            handleFiles(Array.from(e.dataTransfer.files));
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`group relative border-2 border-dashed rounded-[1.5rem] p-12 text-center cursor-pointer transition-all duration-500 ${
                            isDragging 
                            ? "border-amber-500 bg-amber-500/10" 
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] hover:border-amber-500/30 hover:bg-[var(--bg-glass)]"
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.html"
                            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
                            className="hidden"
                        />

                        <div className="size-20 rounded-2xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-6 text-amber-500 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-rounded !text-4xl">cloud_upload</span>
                        </div>

                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                            {isDragging ? "Protocol detected: Release to upload" : "Select Financial Assets"}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">
                            PDF • DOCX • HTML • MAX 20MB
                        </p>
                    </div>

                    {/* Progress */}
                    <AnimatePresence>
                        {uploading && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-8 p-6 glass border-amber-500/20 rounded-2xl flex items-center gap-4 bg-amber-500/5"
                            >
                                <div className="size-10 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Uploading Assets...</span>
                                    <span className="text-[10px] text-amber-500/60 font-medium truncate max-w-[200px]">{currentFile}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Results */}
                    {uploadedFiles.length > 0 && (
                        <div className="mt-8 space-y-4">
                            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Transaction Log</h3>
                            {uploadedFiles.map((file, idx) => (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    key={idx}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                        file.status === 'success'
                                        ? 'bg-emerald-500/5 border-emerald-500/20'
                                        : 'bg-red-500/5 border-red-500/20'
                                    }`}
                                >
                                    <div className={`size-10 rounded-xl flex items-center justify-center ${file.status === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                        <span className="material-symbols-rounded !text-xl">
                                            {file.status === 'success' ? 'verified' : 'error'}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{file.name}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
                                            {formatFileSize(file.size)} • {file.message}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-[var(--border-subtle)] bg-[var(--bg-glass)] flex justify-end gap-3">
                    <button
                        onClick={() => setUploadedFiles([])}
                        className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all disabled:opacity-20"
                        disabled={uploadedFiles.length === 0}
                    >
                        Clear History
                    </button>
                    <button
                        onClick={onClose}
                        className="px-8 py-2.5 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-lg active:scale-95"
                    >
                        Complete Session
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default FileUpload;
