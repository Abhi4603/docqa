import { useCallback, useEffect, useState } from 'react';
import { listDocuments } from './api.js';
import Chat from './components/Chat.jsx';
import Sidebar from './components/Sidebar.jsx';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      setSelectedIds((prev) => new Set([...prev].filter((id) => docs.some((d) => d.id === id))));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any document is still being ingested.
  const processing = documents.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="layout">
      <Sidebar
        documents={documents}
        selectedIds={selectedIds}
        onToggle={toggleSelected}
        onChange={refresh}
        error={error}
      />
      <Chat
        documentIds={[...selectedIds]}
        hasReadyDocs={documents.some((d) => d.status === 'ready')}
      />
    </div>
  );
}
