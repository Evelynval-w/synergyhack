// client/src/components/SkillEditor.jsx
//
// Skill picker + level/years editor. Typeahead pulls from GET /skills
// (the 69-skill catalogue from Neo4j). User can:
//   - Add a skill by typing → click suggestion → fills in name
//   - Set level (1-5) and years (0+) per skill
//   - Remove a skill via the X button
//
// Skills not in the catalogue can still be added (typed and pressed
// Enter) but won't get a HAS_SKILL edge in Neo4j — the server's
// graph-sync silently skips unknown skill names. The UI surfaces
// a small "(not in catalogue)" hint to make this transparent.

import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function SkillEditor({ value, onChange }) {
  const [catalogue, setCatalogue] = useState([]);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/skills')
      .then(setCatalogue)
      .catch(() => setCatalogue([]));
  }, []);

  const catalogueNames = new Set(catalogue.map(s => s.name));
  const currentNames = new Set((value || []).map(s => s.name.toLowerCase()));

  // Filter catalogue by query, exclude already-added skills
  const suggestions = query.trim()
    ? catalogue
        .filter(s =>
          s.name.toLowerCase().includes(query.trim().toLowerCase()) &&
          !currentNames.has(s.name.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const addSkill = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (currentNames.has(trimmed.toLowerCase())) return;
    onChange([...(value || []), { name: trimmed, level: 3, years: 0 }]);
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeSkill = (name) => {
    onChange((value || []).filter(s => s.name !== name));
  };

  const updateSkill = (name, patch) => {
    onChange((value || []).map(s =>
      s.name === name ? { ...s, ...patch } : s
    ));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        addSkill(suggestions[0].name);
      } else if (query.trim()) {
        addSkill(query.trim());
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search/add input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Type a skill (e.g. React)…"
          className="w-full px-3 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
        />
        {showDropdown && query.trim() && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.length > 0 ? (
              suggestions.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addSkill(s.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition flex items-center justify-between"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-slate-400">{s.category}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">
                No catalogue match.{' '}
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addSkill(query)}
                  className="text-emerald-600 hover:underline"
                >
                  Add "{query.trim()}" anyway
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected skills with level/years */}
      {(!value || value.length === 0) ? (
        <p className="text-sm text-slate-400 italic px-1">
          No skills yet. Add ones that reflect what you can contribute.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((s) => {
            const inCatalogue = catalogueNames.has(s.name);
            return (
              <div
                key={s.name}
                className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-900 truncate">
                    {s.name}
                  </div>
                  {!inCatalogue && (
                    <div className="text-xs text-amber-600">
                      Not in catalogue — won't surface in matching
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Level
                  <select
                    value={s.level}
                    onChange={e => updateSkill(s.name, { level: Number(e.target.value) })}
                    className="ml-1 border border-slate-300 rounded px-1.5 py-0.5 text-sm bg-white"
                  >
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Years
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={s.years}
                    onChange={e => updateSkill(s.name, { years: Number(e.target.value) })}
                    className="ml-1 w-14 border border-slate-300 rounded px-1.5 py-0.5 text-sm"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeSkill(s.name)}
                  className="text-slate-400 hover:text-red-600 transition text-lg leading-none"
                  aria-label={`Remove ${s.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
