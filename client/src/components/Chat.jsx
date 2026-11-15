import { useEffect, useRef, useState } from 'react';
import { documentFileUrl, streamChat } from '../api.js';

/** Renders answer text, turning [n] citation markers into clickable badges. */
function AnswerText({ text, onCite }) {
  return (
    <div className="answer">
      {text.split(/(\[\d+\])/g).map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        return match ? (
          <button key={i} className="cite" onClick={() => onCite(Number(match[1]))}>
            {match[1]}
          </button>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </div>
  );
}

function Sources({ sources, openId, onToggle }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      {sources.map((s) => (
        <div key={s.id} className={`source ${openId === s.id ? 'is-open' : ''}`}>
          <button className="source-head" onClick={() => onToggle(s.id)}>
            <span className="cite">{s.id}</span>
            <span className="source-title">
              {s.filename}
              {s.page ? ` · p.${s.page}` : ''}
            </span>
          </button>
          {openId === s.id && (
            <div className="source-body">
              <p>{s.content}</p>
              <a href={documentFileUrl(s.document_id, s.page)} target="_blank" rel="noreferrer">
                Open document ↗
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Chat({ documentIds, hasReadyDocs }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateLast = (patch) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) };
      return next;
    });

  async function send(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    const history = messages
      .filter((m) => m.content && !m.error)
      .map(({ role, content }) => ({ role, content }));

    setInput('');
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', sources: [], pending: true, openSource: null },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for await (const event of streamChat({ question, documentIds, history }, controller.signal)) {
        if (event.type === 'sources') updateLast({ sources: event.sources });
        else if (event.type === 'token') updateLast((m) => ({ content: m.content + event.content }));
        else if (event.type === 'error') updateLast({ error: event.message });
        else if (event.type === 'done') updateLast({ latencyMs: event.latency_ms });
      }
    } catch (err) {
      if (err.name !== 'AbortError') updateLast({ error: err.message });
    } finally {
      updateLast({ pending: false });
      setBusy(false);
      abortRef.current = null;
    }
  }

  const toggleSource = (index, id) =>
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, openSource: m.openSource === id ? null : id } : m)),
    );

  return (
    <main className="chat">
      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h2>Ask your documents anything</h2>
            <p>
              {hasReadyDocs
                ? 'Answers are grounded in your uploaded documents, with citations.'
                : 'Upload a document on the left to get started.'}
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg msg-user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="msg msg-assistant">
              {m.pending && !m.content && !m.error && <span className="typing">Searching documents…</span>}
              {m.content && <AnswerText text={m.content} onCite={(id) => toggleSource(i, id)} />}
              {m.error && <p className="msg-error">⚠ {m.error}</p>}
              {!m.pending && (
                <Sources sources={m.sources} openId={m.openSource} onToggle={(id) => toggleSource(i, id)} />
              )}
              {m.latencyMs != null && <small className="meta">{(m.latencyMs / 1000).toFixed(1)}s</small>}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          placeholder={hasReadyDocs ? 'Ask a question… (Enter to send)' : 'Upload a document first'}
          disabled={!hasReadyDocs}
          rows={1}
          maxLength={2000}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!input.trim() || !hasReadyDocs}>
            Ask
          </button>
        )}
      </form>
    </main>
  );
}
