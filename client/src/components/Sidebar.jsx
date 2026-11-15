import { useRef, useState } from 'react';
import { deleteDocument, uploadDocument } from '../api.js';

const formatSize = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export default function Sidebar({ documents, selectedIds, onToggle, onChange, error }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleFiles(files) {
    if (!files.length) return;
    setUploading(true);
    setMessage(null);
    const problems = [];
    for (const file of files) {
      try {
        const doc = await uploadDocument(file);
        if (doc.duplicate) problems.push(`${file.name}: already uploaded`);
      } catch (err) {
        problems.push(`${file.name}: ${err.message}`);
      }
    }
    setUploading(false);
    setMessage(problems.length ? problems.join('\n') : null);
    if (inputRef.current) inputRef.current.value = '';
    onChange();
  }

  async function handleDelete(doc) {
    if (!confirm(`Delete "${doc.filename}"? This removes it from search.`)) return;
    try {
      await deleteDocument(doc.id);
    } catch (err) {
      setMessage(err.message);
    }
    onChange();
  }

  return (
    <aside className="sidebar">
      <h1 className="brand">DocQA</h1>

      <label className={`upload ${uploading ? 'is-busy' : ''}`}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          disabled={uploading}
          onChange={(e) => handleFiles([...e.target.files])}
        />
        <span>{uploading ? 'Uploading…' : '+ Upload documents'}</span>
        <small>PDF, DOCX, TXT, MD</small>
      </label>

      {(message || error) && <p className="notice">{message ?? error}</p>}

      <div className="doc-list-header">
        <span>Documents</span>
        <small>{selectedIds.size ? `${selectedIds.size} selected` : 'Searching all'}</small>
      </div>

      <ul className="doc-list">
        {documents.length === 0 && <li className="empty">No documents yet.</li>}
        {documents.map((doc) => (
          <li key={doc.id} className="doc">
            <input
              type="checkbox"
              checked={selectedIds.has(doc.id)}
              disabled={doc.status !== 'ready'}
              onChange={() => onToggle(doc.id)}
              aria-label={`Limit search to ${doc.filename}`}
            />
            <div className="doc-info">
              <span className="doc-name" title={doc.filename}>
                {doc.filename}
              </span>
              <small>
                <span className={`status status-${doc.status}`}>{doc.status}</span>
                {doc.status === 'ready' && ` · ${doc.num_chunks} chunks`} · {formatSize(doc.size_bytes)}
              </small>
              {doc.error && <small className="doc-error">{doc.error}</small>}
            </div>
            <button className="icon-btn" onClick={() => handleDelete(doc)} aria-label={`Delete ${doc.filename}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
