
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCommunityMessages, sendCommunityMessage } from '../../lib/api';

export default function CommunityChat({ token, cohortId }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getCommunityMessages(token, cohortId);
      setMessages(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [token, cohortId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    try {
      setSending(true);
      await sendCommunityMessage(token, cohortId, message.trim());
      setMessage('');
      await fetchMessages();
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tn-card" style={{ padding: '20px' }}>
      <h2>Community Chat</h2>
      <p className="tn-muted">
        Discuss doubts and help others in your cohort.
      </p>

      <div style={{
        height: '400px',
        overflowY: 'auto',
        padding: '12px',
        border: '1px solid #ddd',
        borderRadius: '10px',
        marginBottom: '16px'
      }}>
        {loading ? (
          <p>Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="tn-muted">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg._id} style={{
              padding: '10px',
              marginBottom: '10px',
              background: '#f5f5f5',
              borderRadius: '8px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <strong>{msg.senderName}</strong>
                <small className="tn-muted">
                  {new Date(msg.createdAt).toLocaleString()}
                </small>
              </div>
              <small className="tn-muted">{msg.senderRole}</small>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                {msg.message}
              </p>
            </div>
          ))
        )}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px' }}>
        <input
          className="tn-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          maxLength={2000}
          style={{ flex: 1 }}
        />
        <button
          className="tn-btn"
          type="submit"
          disabled={!message.trim() || sending}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
