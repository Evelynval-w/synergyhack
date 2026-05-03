// client/src/components/UserCard.jsx
//
// Clickable user card. Used in the People grid and search results.
// Optionally shows a match score badge when rendered from search.

import { Link } from 'react-router-dom';
import SkillChip from './SkillChip';

export default function UserCard({ user, score }) {
  const initial = user.username[0].toUpperCase();
  const topSkills = (user.skill_names || []).slice(0, 3);

  return (
    <Link
      to={`/users/${user._id}`}
      className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-emerald-400 hover:shadow-sm transition"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-slate-900 capitalize truncate">
              {user.username}
            </h3>
            {typeof score === 'number' && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded shrink-0">
                {score.toFixed(1)} match
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{user.role}</p>
          {user.bio && (
            <p className="text-sm text-slate-600 mt-2 line-clamp-2">
              {user.bio}
            </p>
          )}
          {topSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {topSkills.map(s => (
                <SkillChip key={s} name={s} variant="candidate" />
              ))}
              {user.skill_names && user.skill_names.length > 3 && (
                <span className="text-xs text-slate-400 self-center">
                  +{user.skill_names.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
