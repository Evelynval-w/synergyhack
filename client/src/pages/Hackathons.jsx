// client/src/pages/Hackathons.jsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Hackathons() {
  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/hackathons').then(res => {
      setHackathons(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center mt-12">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto mt-12 p-4">
      <h1 className="text-2xl font-bold mb-6">Hackathons</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hackathons.map(h => (
          <Link
            key={h._id}
            to={`/hackathons/${h._id}`}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition"
          >
            <h2 className="font-semibold text-lg">{h.name}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(h.startDate).toLocaleDateString()} — {new Date(h.endDate).toLocaleDateString()}
            </p>
            <p className="text-sm mt-2">{h.description}</p>
            <div className="flex gap-2 mt-3">
              {h.tracks?.map(t => (
                <span key={t} className="text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded">{t}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}