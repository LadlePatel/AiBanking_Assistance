import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaPlus, FaServer, FaTrash } from 'react-icons/fa';
import { connectMcpServer, disconnectMcpServer, listMcpServers } from '../api';


const SettingsModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // Form State
    const [connectionType, setConnectionType] = useState('local'); // 'local' | 'remote'
    const [authMethod, setAuthMethod] = useState('none'); // 'none' | 'oauth2' | 'token'
    const [newServerName, setNewServerName] = useState('');
    const [newServerCommand, setNewServerCommand] = useState('');
    const [newServerArgs, setNewServerArgs] = useState(''); // Comma separated
    const [newServerUrl, setNewServerUrl] = useState(''); // Only for Remote
    const [envVars, setEnvVars] = useState([{ key: '', value: '' }]);
    const [headers, setHeaders] = useState([{ key: '', value: '' }]); // Only for Remote

    // Auth fields
    const [authToken, setAuthToken] = useState('');
    const [oauth2ClientId, setOauth2ClientId] = useState('');
    const [oauth2ClientSecret, setOauth2ClientSecret] = useState('');
    const [oauth2AuthUrl, setOauth2AuthUrl] = useState('');
    const [oauth2TokenUrl, setOauth2TokenUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchServers();
            // Reset form when modal opens
            setNewServerName('');
            setNewServerCommand('');
            setNewServerArgs('');
            setNewServerUrl('');
            setEnvVars([{ key: '', value: '' }]);
            setHeaders([{ key: '', value: '' }]);
            setAuthMethod('none');
            setAuthToken('');
            setOauth2ClientId('');
            setOauth2ClientSecret('');
            setOauth2AuthUrl('');
            setOauth2TokenUrl('');
            setMessage(null);
            setConnectionType('local');
        }
    }, [isOpen]);

    const fetchServers = async () => {
        setLoading(true);
        const data = await listMcpServers();
        setServers(data);
        setLoading(false);
    };

    const handleAddEnvVar = () => {
        setEnvVars([...envVars, { key: '', value: '' }]);
    };

    const handleEnvVarChange = (index, field, value) => {
        const newEnvVars = [...envVars];
        newEnvVars[index][field] = value;
        setEnvVars(newEnvVars);
    };

    const handleRemoveEnvVar = (index) => {
        const newEnvVars = envVars.filter((_, i) => i !== index);
        setEnvVars(newEnvVars);
    };

    // const handleAddHeader = () => {
    //     setHeaders([...headers, { key: '', value: '' }]);
    // };

    // const handleHeaderChange = (index, field, value) => {
    //     const newHeaders = [...headers];
    //     newHeaders[index][field] = value;
    //     setHeaders(newHeaders);
    // };

    // const handleRemoveHeader = (index) => {
    //     const newHeaders = headers.filter((_, i) => i !== index);
    //     setHeaders(newHeaders);
    // };

    const handleConnect = async () => {
        setLoading(true);
        setMessage(null);

        try {
            let command, args, env;

            if (connectionType === 'local') {
                // Local command - use user inputs directly
                command = newServerCommand;
                // Parse arguments like a shell: split by space, but respect quotes
                const regex = /[^\s"]+|"([^"]*)"/g;
                args = [];
                let match;
                while ((match = regex.exec(newServerArgs)) !== null) {
                    // If it matched a quoted string (group 1), use that. Otherwise use the whole match (unquoted).
                    // We also remove the quotes if they were matched by the regex implicit logic, 
                    // but simpler here: if match[1] exists, it's the content inside quotes.
                    // If not, it's the unquoted word.
                    args.push(match[1] !== undefined ? match[1] : match[0]);
                }

                // Process env vars
                env = {};
                envVars.forEach(v => {
                    if (v.key.trim()) env[v.key.trim()] = v.value;
                });

                // Add token auth if provided
                if (authMethod === 'token' && authToken) {
                    env['AUTHORIZATION'] = `Bearer ${authToken}`;
                }
            } else {
                // Remote server - use mcp-remote wrapper
                command = 'npx';
                args = ['-y', 'mcp-remote', newServerUrl];

                // Merge both env vars and headers into env (mcp-remote uses env for headers)
                env = {};
                envVars.forEach(v => {
                    if (v.key.trim()) env[v.key.trim()] = v.value;
                });
                headers.forEach(h => {
                    if (h.key.trim()) env[h.key.trim()] = h.value;
                });

                // Add token auth if provided
                if (authMethod === 'token' && authToken) {
                    env['Authorization'] = `Bearer ${authToken}`;
                }
            }

            const config = {
                name: newServerName,
                command,
                args,
                env
            };

            const result = await connectMcpServer(config);

            if (result.success) {
                setMessage({ type: 'success', text: result.message });
                fetchServers();
                // Reset form
                setNewServerName('');
                setNewServerCommand('');
                setNewServerArgs('');
                setNewServerUrl('');
                setEnvVars([{ key: '', value: '' }]);
                setHeaders([{ key: '', value: '' }]);
                setAuthMethod('none');
                setAuthToken('');
                setOauth2ClientId('');
                setOauth2ClientSecret('');
                setOauth2AuthUrl('');
                setOauth2TokenUrl('');
            } else {
                if (result.authRequired) {
                    setMessage({
                        type: 'info',
                        text: "Authorization required. A new tab has been opened. Please approve the request and click 'Connect' again."
                    });
                    if (result.authUrl) {
                        window.open(result.authUrl, '_blank');
                    }
                } else {
                    setMessage({ type: 'error', text: result.message });
                }
            }
        } catch (error) {
            console.error('Connection error:', error);
            setMessage({ type: 'error', text: `Failed to connect: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async (name) => {
        if (window.confirm(`Are you sure you want to disconnect ${name}?`)) {
            setLoading(true);
            await disconnectMcpServer(name);
            fetchServers();
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center px-4"
                        onClick={(e) => e.target === e.currentTarget && onClose()}
                    >
                        <div className="bg-[var(--bg-primary)] w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-[var(--border-medium)] relative">
                            {/* Gradient accent bar */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--accent-color)] via-[var(--accent-color-hover)] to-[var(--accent-color)]"></div>

                            {/* Header */}
                            <div className="p-6 border-b border-[var(--border-medium)] flex justify-between items-center bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center shadow-lg">
                                        <span className="material-symbols-rounded text-white text-[20px]">settings</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                                        Settings
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-[var(--bg-input)] rounded-xl transition-all duration-200 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:rotate-90"
                                >
                                    <span className="material-symbols-rounded">close</span>
                                </button>
                            </div>

                            <div className="flex h-[600px]">
                                {/* Tab Navigation */}
                                <div className="w-1/4 border-r border-[var(--border-medium)] bg-[var(--bg-secondary)] p-6">
                                    <div className="space-y-2">
                                        {[
                                            { id: 'general', icon: 'tune', label: 'General', iconType: 'material' },
                                            { id: 'mcp', icon: <FaPlus />, label: 'Add MCP Server', iconType: 'react' },
                                            { id: 'connected', icon: <FaServer />, label: 'Connected Servers', iconType: 'react' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 font-semibold transition-all duration-200 text-sm group relative overflow-hidden ${activeTab === tab.id
                                                    ? 'bg-gradient-to-r from-[var(--accent-color)]/20 to-[var(--accent-color)]/10 text-[var(--accent-color)] border-2 border-[var(--accent-color)]/40 shadow-md'
                                                    : 'hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-2 border-transparent hover:border-[var(--border-medium)]'
                                                    }`}
                                                onClick={() => setActiveTab(tab.id)}
                                            >
                                                {activeTab === tab.id && (
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-r-full"></div>
                                                )}
                                                <div className={`flex items-center justify-center transition-transform duration-200 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-105'
                                                    }`}>
                                                    {tab.iconType === 'material' ? (
                                                        <span className="material-symbols-rounded text-[20px]">{tab.icon}</span>
                                                    ) : (
                                                        <span className="text-[16px]">{tab.icon}</span>
                                                    )}
                                                </div>
                                                <span className="flex-1">{tab.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Content Area */}
                                <div className="w-3/4 p-6 overflow-y-auto bg-[var(--bg-primary)]">
                                    {/* General Tab */}
                                    {activeTab === 'general' && (
                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-6">
                                                    <div className="h-8 w-1 bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-full"></div>
                                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">About PersonalGPT</h3>
                                                </div>
                                                <div className="p-8 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)] rounded-2xl border border-[var(--border-medium)] shadow-lg relative overflow-hidden">
                                                    {/* Decorative gradient orb */}
                                                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--accent-color)]/10 rounded-full blur-3xl"></div>
                                                    <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[var(--accent-color-hover)]/10 rounded-full blur-3xl"></div>

                                                    <div className="flex items-center gap-6 mb-6 relative z-10">
                                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-color)] via-[var(--accent-color-hover)] to-[var(--accent-color)] flex items-center justify-center shadow-xl relative">
                                                            <div className="absolute inset-0 bg-white/20 rounded-2xl animate-pulse"></div>
                                                            <span className="material-symbols-rounded text-white text-4xl relative z-10">auto_awesome</span>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-[var(--text-primary)] text-2xl mb-1">PersonalGPT</h4>
                                                            <p className="text-[var(--text-secondary)] text-sm">Your intelligent AI assistant</p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="px-2 py-0.5 bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-xs font-semibold rounded-full">v1.0</span>
                                                                <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs font-semibold rounded-full flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                                                    Active
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6 relative z-10">
                                                        <p className="flex items-center gap-2">
                                                            Crafted with <span className="text-red-500 animate-pulse">♥</span> by
                                                            <a href="https://sayeedcodes.web.app" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-color)] hover:text-[var(--accent-color-hover)] font-semibold transition-colors hover:underline">
                                                                Sayeed Ajmal
                                                            </a>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* MCP Tab - Keeping existing implementation but with updated styles */}
                                    {activeTab === 'mcp' && (
                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="h-8 w-1 bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-full"></div>
                                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">Add New MCP Server</h3>
                                                </div>
                                                <p className="text-sm text-[var(--text-secondary)] mb-6 pl-3">Connect to a Model Context Protocol server to extend your assistant's capabilities with new tools and integrations.</p>

                                                <div className="space-y-4">
                                                    {/* Quick Presets */}
                                                    <div className="p-5 bg-gradient-to-br from-[var(--bg-input)] to-[var(--bg-secondary)] rounded-xl border border-[var(--border-medium)] shadow-sm">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center shadow-md">
                                                                <span className="material-symbols-rounded text-white text-[16px]">bolt</span>
                                                            </div>
                                                            <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">Quick Start Presets</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setNewServerName('OpenWeather');
                                                                    setConnectionType('local');
                                                                    setNewServerCommand('npx');
                                                                    setNewServerArgs('-y @tristau/openweathermap-mcp --apikey YOUR_API_KEY_HERE');
                                                                    setEnvVars([{ key: 'OPENWEATHER_API_KEY', value: '' }]);
                                                                    setMessage({ type: 'info', text: 'Preset loaded! Replace YOUR_API_KEY_HERE with your OpenWeather API key or set OPENWEATHER_API_KEY environment variable.' });
                                                                }}
                                                                className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded text-xs font-medium transition-colors flex items-center gap-1"
                                                            >
                                                                <span className="material-symbols-rounded text-[14px] text-orange-400">sunny</span>
                                                                OpenWeather Preset
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Server Name</label>
                                                        <input
                                                            type="text"
                                                            value={newServerName}
                                                            onChange={(e) => setNewServerName(e.target.value)}
                                                            placeholder="e.g., Filesystem"
                                                            className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                        />
                                                    </div>

                                                    <div className="mb-4">
                                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Connection Type</label>
                                                        <div className="flex bg-[var(--bg-secondary)] rounded-lg p-1 w-fit border border-[var(--border-subtle)]">
                                                            <button
                                                                onClick={() => setConnectionType('local')}
                                                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${connectionType === 'local' ? 'bg-[var(--bg-input)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                                                            >
                                                                Local Command
                                                            </button>
                                                            <button
                                                                onClick={() => setConnectionType('remote')}
                                                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${connectionType === 'remote' ? 'bg-[var(--bg-input)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                                                            >
                                                                Remote Server
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Authentication Method */}
                                                    <div className="mb-4">
                                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Authentication</label>
                                                        <select
                                                            value={authMethod}
                                                            onChange={(e) => setAuthMethod(e.target.value)}
                                                            className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                        >
                                                            <option value="none">None</option>
                                                            <option value="token">Bearer Token</option>
                                                            <option value="oauth2">OAuth 2.0</option>
                                                        </select>
                                                    </div>

                                                    {/* Auth-specific fields */}
                                                    {authMethod === 'token' && (
                                                        <div className="mb-4">
                                                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Bearer Token</label>
                                                            <input
                                                                type="password"
                                                                value={authToken}
                                                                onChange={(e) => setAuthToken(e.target.value)}
                                                                placeholder="Enter your authentication token"
                                                                className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                            />
                                                        </div>
                                                    )}

                                                    {authMethod === 'oauth2' && (
                                                        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                                            <div className="flex items-start gap-2">
                                                                <span className="material-symbols-rounded text-blue-600 dark:text-blue-400 text-lg">info</span>
                                                                <div className="text-sm text-blue-800 dark:text-blue-300">
                                                                    <p className="font-medium mb-1">OAuth Authentication</p>
                                                                    <p>For remote servers with OAuth, authentication will be handled automatically. A browser window will open for you to authorize when you first connect.</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {connectionType === 'local' ? (
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div className="col-span-1">
                                                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Command</label>
                                                                <input
                                                                    type="text"
                                                                    value={newServerCommand}
                                                                    onChange={(e) => setNewServerCommand(e.target.value)}
                                                                    placeholder="e.g., uvx"
                                                                    className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                                />
                                                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Executable (uvx, npx, python)</p>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Arguments</label>
                                                                <input
                                                                    type="text"
                                                                    value={newServerArgs}
                                                                    onChange={(e) => setNewServerArgs(e.target.value)}
                                                                    placeholder="mcp-server-name --arg value"
                                                                    className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                                />
                                                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Server package and arguments (Space separated)</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">MCP Server URL</label>
                                                                <input
                                                                    type="text"
                                                                    value={newServerUrl}
                                                                    onChange={(e) => setNewServerUrl(e.target.value)}
                                                                    placeholder="https://example.com/sse"
                                                                    className="w-full p-2.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="mt-4">
                                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                                                            Environment Variables
                                                        </label>
                                                        {envVars.map((env, index) => (
                                                            <div key={index} className="flex gap-2 mb-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="KEY (e.g. API_KEY)"
                                                                    value={env.key}
                                                                    onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                                                                    className="w-1/3 p-2 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                                                                />
                                                                <input
                                                                    type="password"
                                                                    placeholder="VALUE"
                                                                    value={env.value}
                                                                    onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                                                                    className="flex-1 p-2 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                                                                />
                                                                <button
                                                                    onClick={() => handleRemoveEnvVar(index)}
                                                                    className="text-[var(--text-muted)] hover:text-red-500 p-2"
                                                                >
                                                                    <span className="material-symbols-rounded text-[18px]">close</span>
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button
                                                            onClick={handleAddEnvVar}
                                                            className="text-sm text-[var(--accent-color)] hover:text-[var(--accent-color)] font-medium flex items-center gap-1"
                                                        >
                                                            <span className="material-symbols-rounded text-[14px]">add</span> Add Item
                                                        </button>
                                                    </div>

                                                    {message && (
                                                        <div className={`p-3 rounded-lg text-sm mb-4 ${message.type === 'success'
                                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                                            : message.type === 'info'
                                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                                                            }`}>
                                                            {message.text}
                                                        </div>
                                                    )}
                                                    <div className="pt-2">
                                                        <button
                                                            onClick={handleConnect}
                                                            disabled={loading || !newServerName || (connectionType === 'local' ? !newServerCommand : !newServerUrl)}
                                                            className="w-full py-3 rounded-xl text-white font-bold shadow-md hover:shadow-lg transition-all duration-300 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {loading ? 'Connecting...' : 'Connect Server'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Connected Servers Tab */}
                                    {activeTab === 'connected' && (
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Connected MCP Servers</h3>
                                                <p className="text-sm text-[var(--text-secondary)] mb-6">Manage your active Model Context Protocol server connections.</p>
                                            </div>

                                            {servers.length === 0 ? (
                                                <div className="p-12 text-center border-2 border-dashed border-[var(--border-medium)] rounded-xl bg-[var(--bg-secondary)]">
                                                    <span className="material-symbols-rounded text-5xl text-[var(--text-muted)] mb-3">cloud_off</span>
                                                    <p className="text-sm text-[var(--text-secondary)] font-medium mb-2">No servers connected</p>
                                                    <p className="text-xs text-[var(--text-muted)]">Add a new MCP server to get started</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {servers.map(server => (
                                                        <div
                                                            key={server.name}
                                                            className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-medium)] shadow-sm hover:shadow-md transition-all duration-300 group"
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <div className="size-10 rounded-full bg-[var(--bg-user-msg)] flex items-center justify-center">
                                                                            <FaServer className="text-[var(--accent-color)]" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-[var(--text-primary)]">{server.name}</div>
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full">
                                                                                    <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                                                    Connected
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="ml-12 mt-2">
                                                                        <div className="text-xs text-[var(--text-muted)] font-mono bg-[var(--bg-input)] px-3 py-2 rounded-lg border border-[var(--border-subtle)]">
                                                                            <div className="break-all">
                                                                                <span className="text-[var(--text-muted)]">$</span> {server.command} {(server.args || []).join(' ')}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleDisconnect(server.name)}
                                                                    className="ml-4 p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Disconnect"
                                                                >
                                                                    <FaTrash />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;