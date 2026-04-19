import React, { useState, useEffect, useRef } from 'react';
import './App.css'; // We'll create this next

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [map, setMap] = useState('Mirage');
  const [side, setSide] = useState('CT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('checking');
  const messagesEndRef = useRef(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check server health on mount
  useEffect(() => {
    checkServerHealth();
    const healthInterval = setInterval(checkServerHealth, 30000); // Check every 30s
    return () => clearInterval(healthInterval);
  }, []);

  const checkServerHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (response.ok) {
        setServerStatus('online');
        setError('');
      } else {
        setServerStatus('error');
      }
    } catch (err) {
      setServerStatus('offline');
      console.error('Health check failed:', err);
    }
  };

  const handleStream = async () => {
    if (!input.trim()) return;
    if (serverStatus === 'offline') {
      setError('⚠️ Server is offline. Make sure the backend is running on port 8000.');
      return;
    }

    setLoading(true);
    setError('');

    // Prepare history for API
    const historyForAPI = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [m.content]
    })).slice(-4); // Keep last 4 exchanges

    // Add user message to UI immediately
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    const userMessage = input;
    setInput('');

    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: historyForAPI,
          map_name: map,
          side: side
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let hasError = false;

      // Add placeholder for model response
      setMessages(prev => [...prev, { role: 'model', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.substring(6));

              if (parsed.type === 'text') {
                accumulatedText += parsed.content;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = accumulatedText;
                  return newMsgs;
                });
              } else if (parsed.type === 'error') {
                setError(parsed.content);
                hasError = true;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = `❌ ${parsed.content}`;
                  return newMsgs;
                });
              } else if (parsed.type === 'done') {
                if (!hasError && accumulatedText.length === 0) {
                  setError('No response received from the AI.');
                }
              }
            } catch (parseErr) {
              console.error('Parse error:', parseErr);
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = err.message || 'Connection failed';
      console.error('Fetch error:', errorMsg);
      setError(
        errorMsg.includes('offline') || errorMsg.includes('Failed to fetch')
          ? '🔴 Cannot connect to server. Is it running on port 8000?'
          : `⚠️ ${errorMsg}`
      );
      
      // Remove placeholder on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStream();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎮 CS2 Tactical Strategist</h1>
        <div className="server-status" style={{
          backgroundColor: serverStatus === 'online' ? '#4CAF50' : serverStatus === 'offline' ? '#f44336' : '#ff9800'
        }}>
          {serverStatus === 'online' ? '🟢 Server Online' : serverStatus === 'offline' ? '🔴 Server Offline' : '🟡 Checking...'}
        </div>
      </header>

      <div className="controls">
        <div className="control-group">
          <label>Map:</label>
          <select value={map} onChange={e => setMap(e.target.value)} disabled={loading}>
            <option value="Mirage">Mirage</option>
            <option value="Ancient">Ancient</option>
            <option value="Inferno">Inferno</option>
            <option value="Nuke">Nuke</option>
            <option value="Vertigo">Vertigo</option>
            <option value="Train">Train</option>
          </select>
        </div>

        <div className="control-group">
          <label>Side:</label>
          <div className="button-group">
            <button
              onClick={() => setSide('CT')}
              disabled={loading}
              className={side === 'CT' ? 'active' : ''}
            >
              CT
            </button>
            <button
              onClick={() => setSide('T')}
              disabled={loading}
              className={side === 'T' ? 'active' : ''}
            >
              Terrorist
            </button>
          </div>
        </div>

        <button onClick={clearChat} disabled={loading} className="clear-btn">
          Clear Chat
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')} className="close-error">✕</button>
        </div>
      )}

      <div className="chat-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>👋 Welcome to CS2 Tactical Strategist</p>
            <p>Select a map and side, then ask for tactical advice!</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`message message-${m.role}`}>
              <div className="message-header">
                {m.role === 'user' ? '👤 You' : '🤖 IGL'}
              </div>
              <div className="message-content">
                {m.content || (loading && i === messages.length - 1 ? '⏳ Thinking...' : '')}
              </div>
            </div>
          ))
        )}
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="loading-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask for tactical advice... (Shift+Enter for new line)"
          disabled={loading || serverStatus === 'offline'}
          rows="3"
        />
        <button onClick={handleStream} disabled={loading || !input.trim() || serverStatus === 'offline'} className="send-btn">
          {loading ? '⏳ Sending...' : '📤 Ask IGL'}
        </button>
      </div>
    </div>
  );
}

export default App;
