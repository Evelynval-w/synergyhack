// client/src/components/MatchCard.jsx
//
// One candidate card in the matches list.
// Shows: rank, avatar, name, role, bio, skill chips, and gap coverage bar.

import SkillChip from './SkillChip';

export default function MatchCard({ match, rank, onExplain }) {
  const profile = match.profile;
  const initial = match.username[0].toUpperCase();
  const barWidth = Math.min(100, match.gapCoverage * 25);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-xs font-semibold text-slate-400 mt-1">#{rank}</div>
        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 text-lg flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 capitalize">{match.username}</h3>
          {profile?.role && (
            <p className="text-sm text-slate-500">{profile.role}</p>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile?.bio && (
        <p className="text-sm text-slate-600 mb-3 leading-relaxed">{profile.bio}</p>
      )}

      {/* Skills */}
      {profile?.skills && profile.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {profile.skills.map(s => (
            <SkillChip key={s.name} name={s.name} variant="candidate" />
          ))}
        </div>
      )}

      {/* Gap coverage bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Gap coverage</span>
          <span className="text-xs font-semibold text-slate-700">
            {match.gapCoverage.toFixed(2)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* Explain button */}
      <button
        onClick={() => onExplain(match)}
        className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
      >
        Why this match? →
      </button>
    </div>
  );
}
