import { useSync } from '../contexts/SyncContext';
import { Cloud, CloudOff, RefreshCw, CheckCircle } from 'lucide-react';

export function SyncIndicator() {
  const { status, lastSync, forcerSync } = useSync();

  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const configs = {
    idle:    { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: <Cloud size={12} />,           text: 'En attente' },
    syncing: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: <RefreshCw size={12} className="animate-spin" />, text: 'Sync...' },
    synced:  { color: '#10b981', bg: 'rgba(16,185,129,0.15)',  icon: <CheckCircle size={12} />,      text: lastSync ? formatTime(lastSync) : 'Synchronisé' },
    error:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: <CloudOff size={12} />,         text: 'Hors ligne' },
  };

  const cfg = configs[status];

  return (
    <div
      onClick={status !== 'syncing' ? forcerSync : undefined}
      title={status === 'synced' ? `Dernière sync: ${formatTime(lastSync)}` : 'Cliquer pour synchroniser'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 5,
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.color}`,
        color: cfg.color,
        fontSize: 10,
        fontWeight: 600,
        cursor: status !== 'syncing' ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => { if (status !== 'syncing') e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      {cfg.icon}
      <span>{cfg.text}</span>
    </div>
  );
}
