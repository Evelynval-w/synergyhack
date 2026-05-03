// client/src/pages/UserProfile.jsx
//
// Single user view: header card (avatar, role, bio, Message button),
// skills card (full skill list with levels), and past projects card
// (sorted by rating desc, with the role this user played on each).
//
// Backed by GET /users/:id, which Mongo-aggregates the user doc with
// past_projects via a $lookup so the entire page hydrates in one
// round trip.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import useAuth from '../hooks/useAuth';
import SkillChip from '../components/SkillChip';

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId: myUserId } = useAuth();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/users/${id}`)
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Loading profile...</div>;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isMe = user._id === myUserId;
  const initial = user.username[0].toUpperCase();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link
        to="/people"
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
      >
        ← All people
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-xl shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 capitalize">
                  {user.username}
                </h1>
                <p className="text-sm text-slate-500 mt-1">{user.role}</p>
              </div>
              {!isMe && (
                <button
                  onClick={() => navigate(`/dms/${user._id}`)}
                  className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition shrink-0"
                >
                  Message
                </button>
              )}
            </div>
            {user.bio && (
              <p className="text-sm text-slate-700 mt-3 leading-relaxed">
                {user.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Skills card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Skills</h2>
        {!user.skills || user.skills.length === 0 ? (
          <p className="text-sm text-slate-400">No skills listed.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {user.skills.map(s => (
              <div
                key={s.name}
                className="border border-slate-200 rounded-md p-3"
              >
                <div className="font-medium text-sm text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Level {s.level} · {s.years} {s.years === 1 ? 'year' : 'years'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past projects card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Past projects</h2>
        {!user.pastProjects || user.pastProjects.length === 0 ? (
          <p className="text-sm text-slate-400">
            No past hackathon projects yet.
          </p>
        ) : (
          <div className="space-y-3">
            {user.pastProjects.map(p => (
              <div
                key={p._id}
                className="border border-slate-200 rounded-md p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900">{p.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Role on team: <span className="text-slate-700 font-medium">{p.roleOnTeam || '—'}</span>
                    </p>
                  </div>
                  <span className="text-sm text-amber-500 shrink-0" title={`${p.rating} / 5`}>
                    {'★'.repeat(p.rating)}{'☆'.repeat(5 - p.rating)}
                  </span>
                </div>
                {p.skills_used && p.skills_used.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {p.skills_used.slice(0, 8).map(s => (
                      <SkillChip key={s} name={s} variant="default" />
                    ))}
                    {p.skills_used.length > 8 && (
                      <span className="text-xs text-slate-400 self-center">
                        +{p.skills_used.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
