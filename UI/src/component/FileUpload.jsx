import React, { useState, useRef } from "react";
import { FaFileUpload, FaFilePdf, FaFileWord, FaFileCode, FaTimes, FaCheckCircle } from "react-icons/fa";
import { IoCloudUploadOutline } from "react-icons/io5";
import { API_URL } from "../api";

const FileUpload = ({ isOpen, onClose, onFileUploaded }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const [currentFile, setCurrentFile] = useState(null);

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    };

    const handleFileInput = (e) => {
        const files = Array.from(e.target.files || []);
        handleFiles(files);
    };

    const handleFiles = async (files) => {
        const allowedExtensions = ['.pdf', '.docx', '.html'];
        const validFiles = files.filter(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            return allowedExtensions.includes(ext);
        });

        if (validFiles.length === 0) {
            alert("Please upload only PDF, DOCX, or HTML files.");
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

                    // Notify parent component
                    if (onFileUploaded) {
                        onFileUploaded(uploadedFile);
                    }
                } else {
                    setUploadedFiles(prev => [...prev, {
                        name: file.name,
                        size: file.size,
                        status: 'error',
                        message: result.error || 'Upload failed'
                    }]);
                }
            } catch (error) {
                setUploadedFiles(prev => [...prev, {
                    name: file.name,
                    size: file.size,
                    status: 'error',
                    message: 'Network error'
                }]);
            }
        }
        setCurrentFile(null);
        setUploading(false);
    };

    const getFileIcon = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'pdf') return <FaFilePdf className="text-red-500" />;
        if (ext === 'docx' || ext === 'doc') return <FaFileWord className="text-blue-500" />;
        if (ext === 'html') return <FaFileCode className="text-orange-500" />;
        return <FaFileUpload className="text-slate-500" />;
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col scale-100 transition-transform">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Upload Documents</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Support for PDF, DOCX, and HTML files
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <FaTimes className="text-xl text-slate-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Upload Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragging
                            ? "border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20"
                            : "border-slate-300 dark:border-slate-700 hover:border-secondary-400 dark:hover:border-secondary-600"
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.html"
                            onChange={handleFileInput}
                            className="hidden"
                        />

                        <IoCloudUploadOutline className="mx-auto text-6xl text-slate-400 dark:text-slate-600 mb-4" />

                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            {isDragging ? "Drop files here" : "Drop files or click to browse"}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            PDF, DOCX, HTML files accepted
                        </p>
                    </div>

                    {/* Progress Indicator */}
                    {uploading && currentFile && (
                        <div className="mt-6 p-4 bg-secondary-50 dark:bg-secondary-900/20 rounded-xl border border-secondary-200 dark:border-secondary-800 flex items-center gap-3 animate-pulse">
                            <div className="w-5 h-5 border-2 border-secondary-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                                Uploading {currentFile}...
                            </span>
                        </div>
                    )}

                    {/* Uploaded Files List */}
                    {uploadedFiles.length > 0 && (
                        <div className="mt-6 space-y-3">
                            <h3 className="font-semibold text-slate-700 dark:text-slate-300">
                                {uploading ? "Upload Queue" : "Upload Results"}
                            </h3>
                            {uploadedFiles.map((file, index) => (
                                <div
                                    key={index}
                                    className={`flex items-center gap-3 p-4 rounded-lg border ${file.status === 'success'
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                        }`}
                                >
                                    <div className="text-2xl">{getFileIcon(file.name)}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-800 dark:text-white truncate">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {formatFileSize(file.size)} • {file.message}
                                        </p>
                                    </div>
                                    {file.status === 'success' && (
                                        <FaCheckCircle className="text-green-500 text-xl flex-shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                    <button
                        onClick={() => setUploadedFiles([])}
                        disabled={uploadedFiles.length === 0}
                        className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Clear
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-secondary-600 hover:bg-secondary-500 text-slate-600 dark:text-slate-400 rounded-lg transition-colors font-medium shadow-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FileUpload;
