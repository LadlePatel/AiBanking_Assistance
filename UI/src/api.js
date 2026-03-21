export const API_URL = "http://localhost:8000";



// Old JSON method (kept for fallback)
export const getApiResponse = async (user_input, sId, history, sourceDocuments, selectedServers = []) => {
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: user_input,
                session_id: sId,
                history: history,
                source_documents: sourceDocuments,
                selected_servers: selectedServers
            }),
        });

        if (response.ok) return await response.json();
        return null;
    } catch (error) {
        console.error(`An error occurred: ${error}`);
        return null;
    }
}

// New Streaming Method
export const streamChat = async ({
    message,
    sessionId,
    history,
    sourceDocuments,
    selectedServers,
    onToken,
    onToolUsed,
    onApprovalRequired,
    onError,
    onComplete,
    signal // Accept AbortSignal
}) => {
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                session_id: sessionId,
                history,
                source_documents: sourceDocuments,
                selected_servers: selectedServers
            }),
            signal, // Pass signal to fetch
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let finalResult = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines ("data: ... \n\n")
            const lines = buffer.split("\n\n");

            // Keep the last partial line in the buffer
            buffer = lines.pop(); // The last element is the partial chunk (or empty)

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    try {
                        const event = JSON.parse(jsonStr);

                        if (event.type === "token") {
                            onToken?.(event.content);
                        } else if (event.type === "tool_used") {
                            onToolUsed?.(event);
                        } else if (event.type === "approval_required") {
                            onApprovalRequired?.(event.approval_request);
                        } else if (event.type === "error") {
                            onError?.(event.error);
                        } else if (event.type === "result") {
                            finalResult = event;
                        }
                    } catch (e) {
                        console.warn("Failed to parse SSE event:", jsonStr, e);
                    }
                }
            }
        }

        // Stream finished
        onComplete?.(finalResult);

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Stream aborted');
            // Optionally trigger onComplete with whatever we have so far?
            // Or just do nothing, as the loop broke.
            onComplete?.(null); // Or pass partial result if we had it tracked outside
        } else {
            onError?.(err.message);
        }
    }
};


async function suggest() {
    const url = `${API_URL}/suggest`;

    try {
        const response = await fetch(url);

        if (response.ok) {
            return await response.json();
        } else {
            console.error(`Failed to fetch document list. Error: ${response.status} - ${await response.text()}`);
            return [];
        }
    } catch (error) {
        console.error(`An error occurred while fetching the document list: ${error}`);
        return [];
    }
}


export const fetchTopics = async () => {
    try {
        const response = await fetch(`${API_URL}/topics`);

        if (!response.ok) {
            throw new Error("Failed to fetch topics");
        }

        const result = await response.json();
        return result.topics || [];
    } catch (err) {
        console.error("Error fetching topics:", err);
        throw err;
    }
};


export const fetchQuestions = async (topic) => {
    try {
        const formData = new FormData();
        formData.append("topic", topic);

        const response = await fetch(`${API_URL}/questions`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error("Failed to fetch questions");
        }

        const result = await response.json();
        return result.questions || [];
    } catch (err) {
        console.error("Error fetching questions:", err);
        throw err;
    }
};

/* ... existing exports ... */

export async function uploadDocument(file) {
    const url = `${API_URL}/upload-doc`;
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            return await response.json();
        } else {
            console.error(`Failed to upload file. Error: ${response.status} - ${await response.text()}`);
            return null;
        }
    } catch (error) {
        console.error(`An error occurred while uploading the file: ${error}`);
        return null;
    }
}


export async function listDocuments() {
    const url = `${API_URL}/list-docs`;

    try {
        const response = await fetch(url);

        if (response.ok) {
            return await response.json();
        } else {
            console.error(`Failed to fetch document list. Error: ${response.status} - ${await response.text()}`);
            return [];
        }
    } catch (error) {
        console.error(`An error occurred while fetching the document list: ${error}`);
        return [];
    }
}


export async function deleteDocument(file_id) {
    const url = `${API_URL}/delete-doc`;
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };

    const data = {
        file_id: file_id
    };

    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (response.ok) {
            return await response.json();
        } else {
            console.error(`Failed to delete document. Error: ${response.status} - ${await response.text()}`);
            return null;
        }
    } catch (error) {
        console.error(`An error occurred while deleting the document: ${error}`);
        return null;
    }
}

/* ... sessions ... */

export async function listMcpServers() {
    try {
        const response = await fetch(`${API_URL}/mcp/servers`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error("Error fetching MCP servers:", error);
        return [];
    }
}

export async function connectMcpServer(config) {
    try {
        const response = await fetch(`${API_URL}/mcp/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await response.json();

        // Handle Success
        if (response.ok) {
            return { success: true, message: data.message };
        }

        // Handle Auth Required (401)
        if (response.status === 401 && data.auth_url) {
            return {
                success: false,
                authRequired: true,
                authUrl: data.auth_url,
                message: data.message
            };
        }

        return { success: false, message: data.message || data.error };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
export const listMcpTools = async () => {
    try {
        const response = await fetch(`${API_URL}/mcp/tools`);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Error fetching MCP tools:", error);
        return [];
    }
};
export async function disconnectMcpServer(name) {
    try {
        const response = await fetch(`${API_URL}/mcp/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        return { success: response.ok, message: data.message || data.error };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export { suggest };

// Tool Approval Functions
export async function approveTool(approvalId) {
    try {
        const response = await fetch(`${API_URL}/tool/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_id: approvalId })
        });

        // Handle 204 No Content
        if (response.status === 204) {
            return { success: true, status: 204, message: 'Approved' };
        }

        // Check Content-Type before parsing JSON
        const contentType = response.headers.get('Content-Type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { message: text || 'No response content' };
        }

        return {
            success: response.ok,
            status: response.status,
            message: data.message || data.error || 'Unknown error',
            data
        };
    } catch (error) {
        return { success: false, status: 0, message: error.message };
    }
}

export async function denyTool(approvalId) {
    try {
        const response = await fetch(`${API_URL}/tool/deny`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_id: approvalId })
        });

        // Handle 204 No Content
        if (response.status === 204) {
            return { success: true, status: 204, message: 'Denied' };
        }

        // Check Content-Type before parsing JSON
        const contentType = response.headers.get('Content-Type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { message: text || 'No response content' };
        }

        return {
            success: response.ok,
            status: response.status,
            message: data.message || data.error || 'Unknown error',
            data
        };
    } catch (error) {
        return { success: false, status: 0, message: error.message };
    }
}

export async function continueAfterApproval(approvalId) {
    try {
        const response = await fetch(`${API_URL}/tool/continue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_id: approvalId })
        });

        // Handle 204 No Content
        if (response.status === 204) {
            return { success: true, status: 204, data: {} };
        }

        // Check Content-Type before parsing JSON
        const contentType = response.headers.get('Content-Type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { message: text || 'No response content' };
        }

        return {
            success: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        return { success: false, status: 0, message: error.message };
    }
}



