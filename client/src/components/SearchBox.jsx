// client/src/components/SearchBox.jsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Find people by skill or bio..."
        className="px-3 py-1.5 border rounded text-sm w-64"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white border rounded shadow-lg z-10">
          {results.slice(0, 8).map(u => (
            <Link
              key={u._id}
              to={`/users/${u._id}`}
              className="block px-3 py-2 hover:bg-gray-100 text-sm"
            >
              <div className="font-medium">{u.username}</div>
              <div className="text-xs text-gray-600 truncate">{u.bio}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}