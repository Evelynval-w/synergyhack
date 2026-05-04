// client/src/components/LandingScreen.jsx
//
// Pre-login landing page. Hero on the left, login/register card on
// the right. Card uses a tab control (Sign in / Create account) so
// both flows share one visual home — no separate /register screen.
//
// Copy hits the emotional core of the product: building alone is
// the hardest part of any hackathon, and gap-coverage matching is
// the differentiator (find what's MISSING, not what's similar).

import { useState } from 'react';
import api from '../api/client';

const ROLES = [
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

export default function LandingScreen() {
  const [tab, setTab] = useState('signin'); // 'signin' | 'register'

  return (
    <div className="min-h-screen bg-stone-50 relative overflow-hidden">
      {/* Soft gradient orbs */}
      <div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #34d399 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)' }}
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

          {/* RIGHT — auth card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 lg:sticky lg:top-8">
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <TabButton active={tab === 'signin'} onClick={() => setTab('signin')}>
                  Sign in
                </TabButton>
                <TabButton active={tab === 'register'} onClick={() => setTab('register')}>
                  Create account
                </TabButton>
              </div>

              <div className="p-7">
                {tab === 'signin' ? <SignInForm /> : <RegisterForm />}
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

        <div className="mt-24 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            Built with MongoDB, Neo4j, and Redis. One database isn't enough.
          </p>
          <p className="text-xs text-slate-400">EPITA L2 · 2026</p>
        </div>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-5 py-4 text-sm font-medium transition border-b-2 ${
        active
          ? 'text-emerald-700 border-emerald-500'
          : 'text-slate-500 border-transparent hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function SignInForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await api.login(username.trim(), password);
      window.dispatchEvent(new Event('synergy:auth-changed'));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Welcome back</h2>
      <p className="text-sm text-slate-500 mb-5">
        Sign in to continue.
      </p>

      <Field label="Username">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
          placeholder="e.g. makuo"
          autoFocus
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
          placeholder="••••••••"
        />
      </Field>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <button
        onClick={handleSubmit}
        disabled={loading || !username.trim() || !password}
        className="mt-2 w-full bg-emerald-500 text-white font-medium py-2.5 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="text-xs text-slate-400 mt-5 leading-relaxed">
        Demo accounts: <span className="font-mono text-slate-600">makuo</span>,{' '}
        <span className="font-mono text-slate-600">aadithya</span>,{' '}
        <span className="font-mono text-slate-600">noah</span>,{' '}
        <span className="font-mono text-slate-600">lina_dev</span>{' '}
        — password{' '}
        <span className="font-mono text-slate-600">password123</span>.
      </p>
    </>
  );
}

function RegisterForm() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password) return;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.register(form);
      window.dispatchEvent(new Event('synergy:auth-changed'));
    } catch (err) {
      if (err.fields) {
        setFieldErrors(err.fields);
      }
      if (err.field) {
        setFieldErrors({ [err.field]: err.message });
      }
      setError(err.fields || err.field ? null : err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Create your account</h2>
      <p className="text-sm text-slate-500 mb-5">
        Takes about 30 seconds.
      </p>

      <Field label="Username" error={fieldErrors.username}>
        <input
          type="text"
          value={form.username}
          onChange={e => update('username', e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
          placeholder="3-30 chars, letters/digits/_"
        />
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

      <Field label="Password" error={fieldErrors.password}>
        <input
          type="password"
          value={form.password}
          onChange={e => update('password', e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
          placeholder="At least 8 characters"
        />
      </Field>

      <Field label="Role (optional)">
        <select
          value={form.role}
          onChange={e => update('role', e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition bg-white"
        >
          <option value="">Pick later</option>
          {ROLES.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </Field>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <button
        onClick={handleSubmit}
        disabled={loading || !form.username.trim() || !form.email.trim() || !form.password}
        className="mt-2 w-full bg-emerald-500 text-white font-medium py-2.5 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Creating account...' : 'Create account'}
      </button>

      <p className="text-xs text-slate-400 mt-5 leading-relaxed">
        You can add your bio, skills, and past projects from your profile after signing in.
      </p>
    </>
  );
}

function Field({ label, children, error }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}

function ErrorBanner({ children }) {
  return (
    <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-200 rounded-md px-3 py-2">
      {children}
    </p>
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
      <p className={`text-xs font-mono font-medium ${accentClass} mb-4`}>/ {number}</p>
      <h3 className="text-lg font-semibold text-slate-900 mb-3">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
