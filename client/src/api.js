async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const listDocuments = () => request('/api/documents');

export function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/api/documents', { method: 'POST', body: form });
}

export const deleteDocument = (id) => request(`/api/documents/${id}`, { method: 'DELETE' });

export const documentFileUrl = (id, page) => `/api/documents/${id}/file${page ? `#page=${page}` : ''}`;

/** Yields NDJSON events from the chat endpoint: sources, token, done, error. */
export async function* streamChat({ question, documentIds, history }, signal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, documentIds, history }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}
