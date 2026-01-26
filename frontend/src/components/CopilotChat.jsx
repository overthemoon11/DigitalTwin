import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTwinStore } from '../hooks/useTwinStore';

// Simple Markdown-like renderer for chat messages
function renderMarkdown(text) {
  if (!text) return null;
  
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;
  let listItems = [];
  
  lines.forEach((line, idx) => {
    // Headers
    if (line.startsWith('## ')) {
      if (currentList) {
        elements.push(<ul key={`list-${elements.length}`} className="chat-list">{listItems}</ul>);
        listItems = [];
        currentList = null;
      }
      elements.push(<h3 key={idx} className="chat-header">{line.slice(3)}</h3>);
      return;
    }
    if (line.startsWith('### ')) {
      if (currentList) {
        elements.push(<ul key={`list-${elements.length}`} className="chat-list">{listItems}</ul>);
        listItems = [];
        currentList = null;
      }
      elements.push(<h4 key={idx} className="chat-subheader">{line.slice(4)}</h4>);
      return;
    }
    
    // List items
    if (line.startsWith('- ')) {
      currentList = true;
      const content = processInlineFormatting(line.slice(2));
      listItems.push(<li key={idx}>{content}</li>);
      return;
    }
    
    // Close list if not in a list item anymore
    if (currentList && !line.startsWith('- ')) {
      elements.push(<ul key={`list-${elements.length}`} className="chat-list">{listItems}</ul>);
      listItems = [];
      currentList = null;
    }
    
    // Empty lines
    if (line.trim() === '') {
      elements.push(<br key={idx} />);
      return;
    }
    
    // Regular text
    const content = processInlineFormatting(line);
    elements.push(<p key={idx} className="chat-paragraph">{content}</p>);
  });
  
  if (currentList && listItems.length > 0) {
    elements.push(<ul key={`list-${elements.length}`} className="chat-list">{listItems}</ul>);
  }
  
  return elements;
}

function processInlineFormatting(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// Icons
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const CopilotIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
    <path d="M5 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
  </svg>
);

function CopilotChat() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const { 
    conversationHistory, 
    sendCopilotMessage, 
    clearConversation,
    loadTwinState 
  } = useTwinStore();
  
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  
  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory, scrollToBottom]);
  
  // Fetch context-aware suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await fetch('/api/copilot/suggestions');
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  }, []);
  
  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 30000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);
  
  useEffect(() => {
    if (conversationHistory.length > 0) {
      fetchSuggestions();
    }
  }, [conversationHistory.length, fetchSuggestions]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input.trim();
    setInput('');
    setIsLoading(true);
    setShowSuggestions(false);
    
    try {
      const result = await sendCopilotMessage(message);
      if (result?.actionExecuted) {
        loadTwinState();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSuggestionClick = (prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  };
  
  const handleQuickPromptClick = async (prompt) => {
    setInput('');
    setIsLoading(true);
    setShowSuggestions(false);
    
    try {
      const result = await sendCopilotMessage(prompt);
      if (result?.actionExecuted) {
        loadTwinState();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const defaultPrompts = [
    { label: 'Building Status', prompt: 'Give me a summary of building status', icon: '📊' },
    { label: 'Energy Analysis', prompt: 'How is energy usage?', icon: '⚡' },
    { label: 'Air Quality', prompt: 'Check air quality', icon: '🌬️' },
    { label: 'Active Alerts', prompt: 'Are there any alerts?', icon: '🔔' },
    { label: 'Optimize', prompt: 'What should I optimize?', icon: '🎯' },
  ];
  
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'var(--danger)';
      case 'medium': return 'var(--warning)';
      default: return 'var(--text-muted)';
    }
  };
  
  return (
    <div className="copilot-container">
      {/* Header */}
      <div className="copilot-header">
        <div className="copilot-title">
          <CopilotIcon />
          <span>HVAC Operations Copilot</span>
        </div>
        {conversationHistory.length > 0 && (
          <button
            onClick={() => {
              clearConversation();
              setShowSuggestions(true);
            }}
            className="copilot-clear-btn"
            title="Clear conversation"
          >
            <ClearIcon />
          </button>
        )}
      </div>
      
      {/* Messages area */}
      <div className="chat-messages">
        {/* Empty state with suggestions */}
        {conversationHistory.length === 0 && showSuggestions && (
          <div className="copilot-empty">
            <div className="copilot-intro">
              <SparkleIcon />
              <p>Ask me about building performance, energy optimization, or operational issues. I can also execute actions like changing setpoints or running simulations.</p>
            </div>
            
            {/* Context-aware suggestions */}
            {suggestions.length > 0 && (
              <div className="copilot-suggestions">
                <div className="suggestions-label">Suggested for you:</div>
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => handleQuickPromptClick(suggestion.prompt)}
                    className="suggestion-btn"
                    style={{ borderLeftColor: getPriorityColor(suggestion.priority) }}
                  >
                    <span className="suggestion-label">{suggestion.label}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Default quick prompts */}
            <div className="copilot-quick-prompts">
              <div className="prompts-label">Quick actions:</div>
              <div className="prompts-grid">
                {defaultPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(item.prompt)}
                    className="quick-prompt-btn"
                  >
                    <span className="prompt-icon">{item.icon}</span>
                    <span className="prompt-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Conversation messages */}
        {conversationHistory.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="message-header">
              {msg.role === 'user' ? <UserIcon /> : <CopilotIcon />}
              <span className="role-label">
                {msg.role === 'user' ? 'You' : 'Copilot'}
              </span>
            </div>
            <div className="message-content">
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="message-header">
              <CopilotIcon />
              <span className="role-label">Copilot</span>
            </div>
            <div className="message-content loading">
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
              Analyzing building data...
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about performance, or type a command..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()} title="Send message">
          <SendIcon />
        </button>
      </form>
      
      {/* Command hints */}
      <div className="copilot-hints">
        Try: "Set lobby temp to 72" · "Run simulation 30 min" · "Inject stuck damper fault"
      </div>
      
      <style>{`
        .copilot-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-card);
        }
        
        .copilot-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text);
        }
        
        .copilot-title svg { stroke: var(--primary); }
        
        .copilot-clear-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        
        .copilot-clear-btn:hover {
          background: var(--bg-hover);
          color: var(--danger);
        }
        
        .copilot-empty { padding: 0.5rem; }
        
        .copilot-intro {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05));
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        
        .copilot-intro svg {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .copilot-intro p {
          color: var(--text-muted);
          font-size: 0.85rem;
          line-height: 1.5;
          margin: 0;
        }
        
        .copilot-suggestions { margin-bottom: 1rem; }
        
        .suggestions-label,
        .prompts-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
          letter-spacing: 0.05em;
        }
        
        .suggestion-btn {
          display: block;
          width: 100%;
          text-align: left;
          padding: 0.6rem 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-left-width: 3px;
          border-radius: 6px;
          color: var(--text);
          cursor: pointer;
          font-size: 0.8rem;
          margin-bottom: 0.5rem;
          transition: all 0.2s;
        }
        
        .suggestion-btn:hover {
          background: var(--bg-hover);
          transform: translateX(2px);
        }
        
        .suggestion-label { font-weight: 500; }
        
        .copilot-quick-prompts { margin-top: 1rem; }
        
        .prompts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }
        
        .quick-prompt-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.2s;
        }
        
        .quick-prompt-btn:hover {
          background: var(--bg-hover);
          border-color: var(--primary);
        }
        
        .prompt-icon { font-size: 1rem; }
        .prompt-label { white-space: nowrap; }
        
        .chat-message { margin-bottom: 1rem; }
        
        .chat-message.user {
          background: var(--bg-card);
          border-radius: 8px;
          padding: 0.75rem;
        }
        
        .chat-message.assistant {
          background: linear-gradient(135deg, var(--bg-card), var(--bg-secondary));
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem;
        }
        
        .message-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .message-header svg {
          width: 16px;
          height: 16px;
          stroke: var(--text-muted);
        }
        
        .chat-message.assistant .message-header svg { stroke: var(--primary); }
        
        .role-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-muted);
        }
        
        .message-content {
          font-size: 0.85rem;
          line-height: 1.6;
          color: var(--text);
        }
        
        .message-content.loading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-muted);
        }
        
        .typing-indicator {
          display: flex;
          gap: 3px;
        }
        
        .typing-indicator span {
          width: 6px;
          height: 6px;
          background: var(--primary);
          border-radius: 50%;
          animation: typing 1.4s infinite ease-in-out both;
        }
        
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes typing {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        
        .chat-header {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
          margin: 0.75rem 0 0.5rem 0;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid var(--border);
        }
        
        .chat-subheader {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text);
          margin: 0.5rem 0 0.25rem 0;
        }
        
        .chat-list {
          margin: 0.25rem 0;
          padding-left: 1.25rem;
        }
        
        .chat-list li {
          margin: 0.25rem 0;
          color: var(--text);
        }
        
        .chat-paragraph { margin: 0.25rem 0; }
        
        .copilot-hints {
          padding: 0.5rem 1rem;
          background: var(--bg-card);
          font-size: 0.7rem;
          color: var(--text-muted);
          text-align: center;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </div>
  );
}

export default CopilotChat;
