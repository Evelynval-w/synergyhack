// client/src/pages/UserProfile.jsx
//
// Single user view with edit mode for the authenticated user's own
// profile. Same URL pattern (/users/:id) for everyone — the page
// detects isMe via useAuth and toggles edit affordances.
//
// Two API calls:
//   - GET /users/me   when viewing own profile (includes email)
//   - GET /users/:id  when viewing someone else (no email)
//
// Editable fields: bio, role, email, github_url, skills (via
// SkillEditor). Past projects are not editable from here — they're
// historical records.

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import useAuth from '../hooks/useAuth';
import SkillChip from '../components/SkillChip';
import SkillEditor from '../components/SkillEditor';

const ROLES = [
  '', // empty = not set
  'Backend',
  'Frontend',
  'Fullstack',
  'Designer',
  'Data',
  'Data Engineer',
  'AI/ML',
  'Mobile',
  'DevOps',
  'PM',
];

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId: myUserId } = useAuth();
  const isMe = id === myUserId;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  const fetchProfile = useMemo(() => () => {
    setLoading(true);
    setError(null);
    const path = isMe ? '/users/me' : `/users/${id}`;
    return api.get(path)
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isMe]);

  useEffect(() => {
    fetchProfile();
    setEditing(false);
  }, [fetchProfile]);

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link
        to="/people"
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
      >
        ← All people
      </Link>

      {editing ? (
        <ProfileEditor
          user={user}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setUser(updated);
            setEditing(false);
          }}
        />
      ) : (
        <ProfileView
          user={user}
          isMe={isMe}
          onEdit={() => setEditing(true)}
          onMessage={() => navigate(`/dms/${user._id}`)}
        />
      )}
    </div>
  );
}

// ============================================================
// VIEW MODE
// ============================================================

function ProfileView({ user, isMe, onEdit, onMessage }) {
  const initial = user.username[0].toUpperCase();

  return (
    <>
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
                {user.role ? (
                  <p className="text-sm text-slate-500 mt-1">{user.role}</p>
                ) : isMe ? (
                  <p className="text-sm text-amber-600 mt-1 italic">
                    Add a role so teams know what you do
                  </p>
                ) : null}
              </div>
              {isMe ? (
                <button
                  onClick={onEdit}
                  className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-700 transition shrink-0"
                >
                  Edit profile
                </button>
              ) : (
                <button
                  onClick={onMessage}
                  className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition shrink-0"
                >
                  Message
                </button>
              )}
            </div>

            {user.bio && (
              <p className="text-sm text-slate-700 mt-3 leading-relaxed whitespace-pre-wrap">
                {user.bio}
              </p>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm">
              {user.github_url && (
                <a
                  href={user.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:underline"
                >
                  GitHub →
                </a>
              )}
              {isMe && user.email && (
                <span className="text-slate-500">
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Skills</h2>
        {!user.skills || user.skills.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            {isMe
              ? 'No skills yet — add some via Edit profile.'
              : 'No skills listed.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {user.skills.map(s => (
              <div key={s.name} className="border border-slate-200 rounded-md p-3">
                <div className="font-medium text-sm text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Level {s.level} · {s.years} {s.years === 1 ? 'year' : 'years'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Past projects</h2>
        {!user.pastProjects || user.pastProjects.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            No past hackathon projects yet.
          </p>
        ) : (
          <div className="space-y-3">
            {user.pastProjects.map(p => (
              <div key={p._id} className="border border-slate-200 rounded-md p-4">
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
    </>
  );
}

// ============================================================
// EDIT MODE
// ============================================================

function ProfileEditor({ user, onCancel, onSaved }) {
  const [form, setForm] = useState({
    bio: user.bio || '',
    role: user.role || '',
    email: user.email || '',
    github_url: user.github_url || '',
    skills: user.skills ? [...user.skills] : [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const updated = await api.patch('/users/me', form);
      onSaved(updated);
    } catch (err) {
      if (err.fields) {
        setFieldErrors(err.fields);
      } else {
        setError(err.message);
      }
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit your profile</h1>
          <p className="text-sm text-slate-500 mt-1">
            Changes go live immediately and update both your profile and the matching graph.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-sm text-slate-600 px-4 py-2 rounded-md hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700 mb-5">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <Field label="Role" error={fieldErrors.role}>
          <select
            value={form.role}
            onChange={e => update('role', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition bg-white"
          >
            {ROLES.map(r => (
              <option key={r} value={r}>
                {r === '' ? '— No role —' : r}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Bio"
          hint="A short blurb. 500 chars max."
          error={fieldErrors.bio}
        >
          <textarea
            value={form.bio}
            onChange={e => update('bio', e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition resize-none"
            placeholder="What do you build? What are you into?"
          />
          <div className="text-xs text-slate-400 mt-1 text-right">
            {form.bio.length} / 500
          </div>
        </Field>

        <Field label="Email" error={fieldErrors.email}>
          <input
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="GitHub URL (optional)"
          error={fieldErrors.github_url}
        >
          <input
            type="url"
            value={form.github_url}
            onChange={e => update('github_url', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
            placeholder="https://github.com/your-handle"
          />
        </Field>

        <Field
          label="Skills"
          hint="Pick from the catalogue or add custom. Set level (1–5) and years per skill."
          error={fieldErrors.skills}
        >
          <SkillEditor
            value={form.skills}
            onChange={skills => update('skills', skills)}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, hint, children, error }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {hint && <span className="ml-2 text-xs text-slate-400 font-normal">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
