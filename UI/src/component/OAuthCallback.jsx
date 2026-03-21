import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectMcpServer } from '../api';

const OAuthCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            // Get authorization code and state from URL
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const state = params.get('state');
            const error = params.get('error');

            // Retrieve stored OAuth data
            const storedState = sessionStorage.getItem('oauth_state');
            const serverName = sessionStorage.getItem('oauth_server_name');
            const serverUrl = sessionStorage.getItem('oauth_server_url');

            if (error) {
                console.error('OAuth error:', error);
                alert(`OAuth authentication failed: ${error}`);
                navigate('/');
                return;
            }

            // Verify state to prevent CSRF
            if (state !== storedState) {
                console.error('State mismatch - possible CSRF attack');
                alert('Authentication failed: Security check failed');
                navigate('/');
                return;
            }

            if (!code) {
                console.error('No authorization code received');
                alert('Authentication failed: No authorization code');
                navigate('/');
                return;
            }

            try {
                // Exchange code for tokens (this should be done via backend)
                // For now, we'll store the code and let the backend handle it
                const config = {
                    name: serverName,
                    command: 'npx',
                    args: ['-y', 'mcp-remote', serverUrl],
                    env: {
                        'OAUTH_CODE': code,
                        'OAUTH_SERVER_URL': serverUrl
                    }
                };

                const result = await connectMcpServer(config);

                if (result.success) {
                    alert('MCP server connected successfully!');
                } else {
                    alert(`Failed to connect: ${result.message}`);
                }
            } catch (error) {
                console.error('Failed to complete OAuth flow:', error);
                alert('Failed to complete authentication');
            } finally {
                // Clean up session storage
                sessionStorage.removeItem('oauth_state');
                sessionStorage.removeItem('oauth_server_name');
                sessionStorage.removeItem('oauth_server_url');

                // Redirect back to home
                navigate('/');
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div className="flex items-center justify-center h-screen bg-workspace-bg dark:bg-workspace-dark">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-text-main dark:text-text-dark font-medium">Completing authentication...</p>
            </div>
        </div>
    );
};

export default OAuthCallback;
