// client/src/components/LandingScreen.jsx
//
// Pre-login landing page. Hero on the left, login card on the right.
// On mobile, login card stacks below the hero.
//
// Copy hits the emotional core of the product: building alone is the
// hardest part of any hackathon, and gap-coverage matching is the
// differentiator (find what's MISSING, not what's similar). Three
// product-proof cards below the hero quietly map to the three
// databases doing real work — Neo4j for matching, Mongo for search,
// Redis for live chat — without using the phrase "polyglot persistence."

import { useState } from 'react';
import api from '../api/client';

export default function LandingScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.login(username.trim());
      window.dispatchEvent(new Event('synergy:auth-changed'));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 relative overflow-hidden">
      {/* Soft gradient orb — subtle warmth behind the hero */}
      <div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #34d399 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)',
        }}
      />

      {/* Top bar */}
      <header className="relative max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="text-xl font-bold text-slate-900">SynergyHack</div>
        <a
          href="https://github.com/Evelynval-w/synergyhack"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-slate-500 hover:text-slate-900 transition"
        >
          GitHub →
        </a>
      </header>

      {/* Hero */}
      <main className="relative max-w-7xl mx-auto px-6 pt-12 pb-20">
        <div className="grid lg:grid-cols-5 gap-12 items-start">
          {/* LEFT — copy */}
          <div className="lg:col-span-3 space-y-6">
            <p className="inline-block text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wide">
              Built at EPITA · Database Systems
            </p>

            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 leading-[1.05] tracking-tight">
              You shouldn't have to{' '}
              <span className="relative inline-block">
                <span className="relative z-10">build alone.</span>
                <span className="absolute bottom-1 left-0 w-full h-3 bg-emerald-200 -z-0" />
              </span>
            </h1>

            <p className="text-xl text-slate-600 leading-relaxed max-w-xl">
              SynergyHack finds the teammates whose skills{' '}
              <span className="text-slate-900 font-medium">complete yours</span>
              {' '}— by what's missing on your team, not what's already there.
            </p>

            <p className="text-base text-slate-500 max-w-xl pt-2">
              Most matchmaking tools cluster you with people just like you. We do the opposite. Tell us your team. We'll show you who fills the gaps.
            </p>
          </div>

          {/* RIGHT — login card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 lg:sticky lg:top-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Welcome back
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Sign in with a seed username to explore.
              </p>

              <label className="block text-sm font-medium text-slate-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
                placeholder="e.g. makuo"
                autoFocus
              />

              {error && (
                <p className="text-sm text-red-600 mt-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !username.trim()}
                className="mt-4 w-full bg-emerald-500 text-white font-medium py-2.5 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Signing in...' : 'Continue'}
              </button>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Demo accounts:{' '}
                  <span className="font-mono text-slate-600">makuo</span>,{' '}
                  <span className="font-mono text-slate-600">aadithya</span>,{' '}
                  <span className="font-mono text-slate-600">noah</span>,{' '}
                  <span className="font-mono text-slate-600">lina_dev</span>,{' '}
                  or any seed username.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Three product-proof cards */}
        <div className="mt-24 grid md:grid-cols-3 gap-6">
          <ProofCard
            number="01"
            title="See who fits the gaps"
            body="Our matching algorithm walks the skill graph from your team's existing skills to the candidates who fill what's missing — not who duplicates what you already have."
            accent="emerald"
          />
          <ProofCard
            number="02"
            title="Search by what you actually need"
            body='Type "machine learning python" and rank candidates by skill weight, role, and bio. Stemming and tokenization mean "designer" finds "design" finds "designs."'
            accent="amber"
          />
          <ProofCard
            number="03"
            title="Talk before you commit"
            body="Team chat and 1:1 DMs run on a real-time message log. See if you click before either of you formally commits to the team."
            accent="sky"
          />
        </div>

        {/* Footer note */}
        <div className="mt-24 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            Built with MongoDB, Neo4j, and Redis. One database isn't enough.
          </p>
          <p className="text-xs text-slate-400">
            EPITA L2 · 2026
          </p>
        </div>
      </main>
    </div>
  );
}

function ProofCard({ number, title, body, accent }) {
  const accentClass = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
  }[accent];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-7 hover:border-slate-300 hover:shadow-sm transition">
      <p className={`text-xs font-mono font-medium ${accentClass} mb-4`}>
        / {number}
      </p>
      <h3 className="text-lg font-semibold text-slate-900 mb-3">
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        {body}
      </p>
    </div>
  );
}
