// client/src/components/SkillChip.jsx
//
// Reusable skill pill. Used on team detail, match cards, and the future skill picker.

export default function SkillChip({ name, variant = 'default' }) {
  const styles = {
    default: 'bg-slate-100 text-slate-700',
    team: 'bg-emerald-100 text-emerald-800',
    candidate: 'bg-blue-50 text-blue-700',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${styles[variant]}`}>
      {name}
    </span>
  );
}
