
import { useEffect, useState } from 'react';
import {
  getDiscussions,
  addDiscussion,
  addDiscussionReply,
  toggleDiscussionLike
} from '../../lib/api';

export default function DiscussionSection({ token, resourceId }) {
  const [discussions, setDiscussions] = useState([]);
  const [comment, setComment] = useState('');
  const [replyTexts, setReplyTexts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDiscussions = async () => {
    try {
      setLoading(true);
      const data = await getDiscussions(token, resourceId);
      setDiscussions(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load discussions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscussions();
  }, [resourceId, token]);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      const newDiscussion = await addDiscussion(token, resourceId, comment);
      setDiscussions(prev => [newDiscussion, ...prev]);
      setComment('');
    } catch (err) {
      setError(err.message || 'Could not post comment');
    }
  };

  const handleReply = async (discussionId) => {
    const text = replyTexts[discussionId]?.trim();
    if (!text) return;

    try {
      const updated = await addDiscussionReply(token, discussionId, text);
      setDiscussions(prev =>
        prev.map(d => d._id === updated._id ? updated : d)
      );
      setReplyTexts(prev => ({ ...prev, [discussionId]: '' }));
    } catch (err) {
      setError(err.message || 'Could not post reply');
    }
  };

  const handleLike = async (discussionId) => {
  try {
    await toggleDiscussionLike(token, discussionId);
    await loadDiscussions();
  } catch (err) {
    setError(err.message || 'Could not update like');
  }
};

  if (loading) return <p>Loading discussion...</p>;

  return (
    <section style={{ marginTop: 24, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
      <h3>Discussion</h3>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleComment}>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Share your thoughts..."
          maxLength={2000}
          required
          style={{ width: '100%', minHeight: 75, padding: 10 }}
        />
        <button type="submit" disabled={!comment.trim()}>
          Post Comment
        </button>
      </form>

      {discussions.length === 0 && <p>No comments yet. Start the discussion!</p>}

      {discussions.map(d => (
        <article key={d._id} style={{ borderTop: '1px solid #ddd', padding: '14px 0' }}>
          <strong>{d.author?.name || 'Mentee'}</strong>
          <p>{d.text}</p>

          <button type="button" onClick={() => handleLike(d._id)}>
            ❤️ {d.likes?.length || 0}
          </button>

          <div style={{ marginLeft: 20 }}>
            {d.replies?.map((reply, index) => (
              <div key={reply._id || index}>
                <strong>{reply.author?.name || 'Mentee'}</strong>
                <p>{reply.text}</p>
              </div>
            ))}

            <input
              value={replyTexts[d._id] || ''}
              onChange={e =>
                setReplyTexts(prev => ({
                  ...prev,
                  [d._id]: e.target.value
                }))
              }
              placeholder="Write a reply..."
              maxLength={2000}
            />
            <button type="button" onClick={() => handleReply(d._id)}>
              Reply
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
