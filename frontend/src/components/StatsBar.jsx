const STAT_CARDS = [
  { key: 'total',       label: 'Total',       color: 'text-ink-300',   bg: 'bg-ink-800',       icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'pending',     label: 'Pending',     color: 'text-ink-300',   bg: 'bg-ink-800/50',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'in_progress', label: 'In Progress', color: 'text-accent',    bg: 'bg-accent/10',     icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'completed',   label: 'Completed',   color: 'text-success',   bg: 'bg-success/10',    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
];

export default function StatsBar({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {STAT_CARDS.map(({ key, label, color, bg, icon }) => (
        <div key={key} className="card p-4 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
            <svg className={`w-4.5 h-4.5 ${color} w-[18px] h-[18px]`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
          <div>
            <p className={`text-xl font-display font-bold ${color}`}>{stats[key] || 0}</p>
            <p className="text-xs text-ink-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
