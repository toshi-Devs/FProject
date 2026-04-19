import React, { useState } from 'react';

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [map, setMap] = useState('Mirage');
  const [side, setSide] = useState('CT');

  const handleStream = async () => {
    if (!input.trim()) return;

    // 1. Update UI with user message and an empty model block
    const historyForAPI = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [m.content]
    })).slice(-4); // Keep tokens low

    setMessages(prev => [...prev, { role: 'user', content: input }, { role: 'model', content: '...' }]);
    const currentInput = input;
    setInput('');

    try {
      const response = await fetch('http://127.0.0.1:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          history: historyForAPI,
          map_name: map,
          side: side
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const parsed = JSON.parse(line.substring(6));
            if (parsed.type === 'text') {
              accumulatedText += parsed.content;
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = accumulatedText;
                return newMsgs;
              });
            } else if (parsed.type === 'error') {
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = "⚠️ ERROR: " + parsed.content;
                return newMsgs;
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>🎮 CS2 Tactical Strategist</h2>
      <select value={map} onChange={e => setMap(e.target.value)}>
        <option value="Mirage">Mirage</option>
        <option value="Ancient">Ancient</option>
      </select>
      <button onClick={() => setSide('CT')}>CT</button>
      <button onClick={() => setSide('T')}>T</button>

      <div style={{ border: '1px solid #ccc', height: '400px', overflowY: 'auto', margin: '20px 0', padding: '10px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '15px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <strong>{m.role.toUpperCase()}:</strong> {m.content}
          </div>
        ))}
      </div>

      <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleStream()} />
      <button onClick={handleStream}>Ask IGL</button>
    </div>
  );
}

export default App;