import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneCall, LayoutDashboard, Phone, CheckCircle2, RotateCcw, ArrowRight } from 'lucide-react';
import { doc, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { useAuth } from '../contexts/AuthContext';
import { getActiveMagasins, type Magasin } from '../constants/magasins';
import { LOG_KEY, type CallLog } from './magasin/gestion-clientele/CallCenterPage';

const TEAL = '#1a7a96';

const isAnswered = (statut: string) => (statut || '').toLowerCase().includes('décroch') && !(statut || '').toLowerCase().includes('pas');

/**
 * Page d'accueil dédiée au/à la responsable du Call Center.
 * Message de bienvenue, indicateurs du jour et accès rapides.
 */
export function CallCenterAccueilPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const prenom = user?.prenom || user?.name || 'Responsable';

  const [magasins] = useState<Magasin[]>(() => getActiveMagasins());
  const [logsByMag, setLogsByMag] = useState<Record<string, CallLog[]>>({});

  useEffect(() => {
    const unsubs = magasins.map(m =>
      onSnapshot(
        doc(db, 'app_data', LOG_KEY(m.id)),
        snap => {
          const value = (snap.exists() ? (snap.data()?.value ?? []) : []) as CallLog[];
          setLogsByMag(prev => ({ ...prev, [m.id]: value }));
        },
        () => {},
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [magasins]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    let total = 0, decroches = 0, aRappeler = 0;
    for (const logs of Object.values(logsByMag)) {
      for (const l of logs) {
        if (new Date(l.debut).toDateString() !== today) continue;
        total++;
        if (isAnswered(l.statut)) decroches++;
        if (l.resultat === 'À rappeler' || !isAnswered(l.statut)) aRappeler++;
      }
    }
    return { total, decroches, aRappeler };
  }, [logsByMag]);

  return (
    <div className="p-4 lg:p-6 flex flex-col gap-6">
      {/* Bandeau de bienvenue */}
      <div className="rounded-xl p-6 text-white flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${TEAL}, #0e5c73)` }}>
        <div className="p-3 rounded-lg bg-white/15"><PhoneCall size={28} /></div>
        <div>
          <h1 className="text-xl font-bold">Bonjour {prenom} 👋</h1>
          <p className="text-white/85 text-sm mt-1">Bienvenue dans votre espace de pilotage du Call Center.</p>
        </div>
      </div>

      {/* Indicateurs du jour */}
      <div>
        <h2 className="font-bold text-gray-800 mb-3">Aujourd'hui</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={<Phone size={20} />} value={stats.total} label="Appels passés" color={TEAL} />
          <StatCard icon={<CheckCircle2 size={20} />} value={stats.decroches} label="Décrochés" color="#16a34a" />
          <StatCard icon={<RotateCcw size={20} />} value={stats.aRappeler} label="À rappeler" color="#d97706" />
        </div>
      </div>

      {/* Accès rapides */}
      <div>
        <h2 className="font-bold text-gray-800 mb-3">Accès rapides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickLink
            icon={<LayoutDashboard size={22} />}
            title="Tableau de bord Call Center"
            desc="Évolution des appels, taux de décroché et performance par magasin."
            onClick={() => navigate('/call-center/dashboard')}
          />
          <QuickLink
            icon={<PhoneCall size={22} />}
            title="Gérer les appels"
            desc="Liste des clients à appeler et historique des appels."
            onClick={() => navigate('/call-center')}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg text-white" style={{ backgroundColor: color }}>{icon}</div>
      <div>
        <div className="text-xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function QuickLink({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-[color:var(--teal)] hover:shadow-sm transition group"
      style={{ ['--teal' as any]: TEAL }}>
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg text-white shrink-0" style={{ backgroundColor: TEAL }}>{icon}</div>
        <div className="flex-1">
          <div className="font-semibold text-gray-800 flex items-center gap-1">{title}<ArrowRight size={15} className="opacity-0 group-hover:opacity-100 transition" /></div>
          <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  );
}
