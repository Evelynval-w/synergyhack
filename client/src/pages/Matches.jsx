// client/src/pages/Matches.jsx
//
// Ranked candidates for a team. Each card shows the candidate's profile,
// gap-coverage score, and a "why this match?" link that opens an explanation modal
// powered by the /explain endpoint (Cypher path traversal).

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import MatchCard from '../components/MatchCard';

export default function Matches() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Explain modal state
  const [explaining, setExplaining] = useState(null); // the candidate being explained
  const [explanation, setExplanation] = useState([]);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [invitingId, setInvitingId] = useState(null);
  const [invitedIds, setInvitedIds] = useState(() => new Set());
  const [inviteMsg, setInviteMsg] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get(`/teams/${id}`),
      api.get(`/teams/${id}/matches`),
    ])
      .then(([teamData, matchData]) => {
        setTeam(teamData);
        setMatches(Array.isArray(matchData) ? matchData : []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleExplain(candidate) {
    setExplaining(candidate);
    setExplanationLoading(true);
    setExplanation([]);
    try {
      const data = await api.get(`/teams/${id}/matches/${candidate.userId}/explain`);
      setExplanation(Array.isArray(data) ? data : []);
    } catch (err) {
      setExplanation([{ error: err.message }]);
    } finally {
      setExplanationLoading(false);
    }
  }

  async function handleInvite(candidate) {
    setInvitingId(candidate.userId);
    setInviteMsg(null);
    try {
      await api.post(`/teams/${id}/invites`, { userId: candidate.userId });
      setInvitedIds(prev => new Set([...prev, candidate.userId]));
      setInviteMsg(`Invited ${candidate.username} to the team.`);
    } catch (err) {
      setInviteMsg(err.message);
    } finally {
      setInvitingId(null);
    }
  }

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Finding teammates...</div>;
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <Link to={`/teams/${id}`} className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">
        ← Back to {team?.name || 'team'}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Recommended teammates {team && `for ${team.name}`}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ranked by how much each candidate's skills complement the team's existing strengths.
          Invite anyone to join your team directly.
        </p>
      </div>

      {inviteMsg && (
        <div className="mb-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          {inviteMsg}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="text-center text-slate-500 py-12">No matches found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m, i) => (
            <MatchCard
              key={m.userId}
              match={m}
              rank={i + 1}
              onExplain={handleExplain}
              onInvite={handleInvite}
              inviting={invitingId === m.userId}
              inviteDone={invitedIds.has(m.userId)}
            />
          ))}
        </div>
      )}

      {/* Explain modal */}
      {explaining && (
        <div
          className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50"
          onClick={() => setExplaining(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900 capitalize">
                  Why {explaining.username}?
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Skill pairs that drove the gap-coverage score.
                </p>
              </div>
              <button
                onClick={() => setExplaining(null)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {explanationLoading ? (
              <p className="text-sm text-slate-500">Loading explanation...</p>
            ) : explanation.length === 0 ? (
              <p className="text-sm text-slate-500">No explanation data.</p>
            ) : explanation[0]?.error ? (
              <p className="text-sm text-red-600">Error: {explanation[0].error}</p>
            ) : (
              <div className="space-y-2">
                {explanation.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                      {e.candidateSkill}
                    </span>
                    <span className="text-slate-400">complements</span>
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs">
                      {e.teamSkill}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-slate-600">
                      +{e.strength.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
