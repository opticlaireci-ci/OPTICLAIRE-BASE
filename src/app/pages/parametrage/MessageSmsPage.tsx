import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

const MAGASIN_IDS = ['abobo', 'faya', 'koumassi', 'palmeraie', 'yopougon'];

interface Client {
  id: string;
  nom: string;
  prenom: string;
  telephone?: string;
  dateNaissance?: string;
  dateDerniereVisite?: string;
  entreprise?: string;
  chiffreAffaires?: number;
  magasin?: string;
}

interface RapportSms {
  id: string;
  nature: string;
  client: string;
  resultat: string;
  date: string;
  message?: string;
}

function loadAllClients(): Client[] {
  const all: Client[] = [];
  MAGASIN_IDS.forEach(id => {
    ['leclaire_clients_' + id, 'leclaire_clients_magasin_' + id].forEach(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(data)) {
          data.forEach((c: any) => {
            all.push({
              id: c.id || c._id || Math.random().toString(),
              nom: c.nom || '',
              prenom: c.prenom || '',
              telephone: c.telephone || c.tel || '',
              dateNaissance: c.dateNaissance || c.date_naissance || '',
              dateDerniereVisite: c.dateDerniereVisite || c.derniere_visite || c.dateCreation || '',
              entreprise: c.entreprise || '',
              chiffreAffaires: c.chiffreAffaires || c.ca || 0,
              magasin: id,
            });
          });
        }
      } catch {}
    });
  });
  // deduplicate by id
  const seen = new Set<string>();
  return all.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
}


function isAnniversaireAujourdHui(dateNaissance?: string): boolean {
  if (!dateNaissance) return false;
  try {
    const d = new Date(dateNaissance);
    const today = new Date();
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  } catch { return false; }
}

function isRelanceVerre(dateDerniereVisite?: string): boolean {
  if (!dateDerniereVisite) return false;
  try {
    const d = new Date(dateDerniereVisite);
    const now = new Date();
    const diffYears = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return diffYears >= 2;
  } catch { return false; }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return iso; }
}

export function MessageSmsPage() {
  const navigate = useNavigate();
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [rapport, setRapport] = useLiveData<RapportSms>('leclaire_rapport_sms');

  // SMS Personnalisé
  const [selectedClientId, setSelectedClientId] = useState('');
  const [smsText, setSmsText] = useState('');
  const [filterEntreprise, setFilterEntreprise] = useState('');
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [filterCA, setFilterCA] = useState('');

  // Rapport
  const [searchRapport, setSearchRapport] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [rapportPage, setRapportPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Status messages
  const [annivSent, setAnnivSent] = useState(false);
  const [persoSent, setPersoSent] = useState(false);

  useEffect(() => {
    setAllClients(loadAllClients());
  }, []);

  const anniversaireClients = useMemo(() => allClients.filter(c => isAnniversaireAujourdHui(c.dateNaissance)), [allClients]);
  const relanceClients = useMemo(() => allClients.filter(c => isRelanceVerre(c.dateDerniereVisite)), [allClients]);

  const entreprises = useMemo(() => [...new Set(allClients.map(c => c.entreprise).filter(Boolean))], [allClients]);

  const filteredClients = useMemo(() => {
    return allClients.filter(c => {
      if (filterEntreprise && c.entreprise !== filterEntreprise) return false;
      if (filterCA && (c.chiffreAffaires ?? 0) < Number(filterCA)) return false;
      if (filterDateDebut && c.dateDerniereVisite) {
        if (new Date(c.dateDerniereVisite) < new Date(filterDateDebut)) return false;
      }
      if (filterDateFin && c.dateDerniereVisite) {
        if (new Date(c.dateDerniereVisite) > new Date(filterDateFin)) return false;
      }
      return true;
    });
  }, [allClients, filterEntreprise, filterCA, filterDateDebut, filterDateFin]);

  const handleEnvoyerAnniversaire = () => {
    if (anniversaireClients.length === 0) return;
    const newEntries: RapportSms[] = anniversaireClients.map(c => ({
      id: Date.now() + '_' + c.id,
      nature: 'Anniversaire',
      client: `${c.prenom} ${c.nom}`.trim(),
      resultat: 'Envoyé',
      date: new Date().toISOString(),
      message: `Bonjour, ${TENANT.nom} vous souhaite un heureux et joyeux anniversaire. Excellente journée, au plaisir de vous voir.`,
    }));
    const updated = [...newEntries, ...rapport];
    setRapport(updated);
    setAnnivSent(true);
    setTimeout(() => setAnnivSent(false), 3000);
  };

  const handleEnvoyerPerso = () => {
    const client = selectedClientId
      ? allClients.find(c => c.id === selectedClientId)
      : filteredClients.length > 0 ? null : null;
    const clientName = client ? `${client.prenom} ${client.nom}`.trim() : `${filteredClients.length} clients (filtre)`;
    if (!smsText.trim()) { alert('Veuillez saisir un message SMS'); return; }

    const newEntry: RapportSms = {
      id: Date.now().toString(),
      nature: 'SMS Personnalisé',
      client: clientName || 'N/A',
      resultat: 'Envoyé',
      date: new Date().toISOString(),
      message: smsText,
    };
    const updated = [newEntry, ...rapport];
    setRapport(updated);
    setPersoSent(true);
    setSmsText('');
    setTimeout(() => setPersoSent(false), 3000);
  };

  // Rapport filtering & pagination
  const filteredRapport = rapport.filter(r => {
    const q = searchRapport.toLowerCase();
    if (q && !r.nature.toLowerCase().includes(q) && !r.client.toLowerCase().includes(q) && !r.resultat.toLowerCase().includes(q)) return false;
    if (searchDate && !r.date.startsWith(searchDate)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRapport.length / ITEMS_PER_PAGE));
  const pageRapport = filteredRapport.slice((rapportPage - 1) * ITEMS_PER_PAGE, rapportPage * ITEMS_PER_PAGE);

  const inputStyle: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 10px',
    fontSize: 13, outline: 'none', backgroundColor: '#fff', color: '#374151',
  };
  const colStyle: React.CSSProperties = {
    flex: 1, border: '2px solid #93c5fd', borderRadius: 0, padding: 16, minWidth: 0,
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, backgroundColor: '#f9fafb', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>💬</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Rapport SMS: {TENANT.nom}</span>
        </div>
        <button
          onClick={() => navigate('/parametrage/configuration-sms')}
          style={{
            padding: '6px 16px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          ⚙️ Configuration SMS Automatique
        </button>
      </div>

      <div style={{ padding: 16 }}>

        {/* ── 3 colonnes ── */}
        <div style={{ display: 'flex', border: '2px solid #93c5fd', marginBottom: 24 }}>

          {/* Colonne 1 : Anniversaire */}
          <div style={{ ...colStyle, borderRight: '2px solid #93c5fd' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Anniversaire</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
              Souhaiter un joyeux anniversaire à vos clients en un clic.
            </div>
            {anniversaireClients.length > 0 ? (
              <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#1f2937', textAlign: 'center' }}>
                🎊 🎊 Nous avons {anniversaireClients.length} Anniversaire{anniversaireClients.length > 1 ? 's' : ''} Client 🎊 🎊
              </div>
            ) : (
              <div style={{ marginBottom: 12, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                Aucun anniversaire aujourd'hui
              </div>
            )}
            <button
              onClick={handleEnvoyerAnniversaire}
              disabled={anniversaireClients.length === 0}
              style={{
                width: '100%', padding: '10px', border: 'none', borderRadius: 4,
                backgroundColor: annivSent ? '#16a34a' : '#22c55e',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: anniversaireClients.length === 0 ? 'not-allowed' : 'pointer',
                opacity: anniversaireClients.length === 0 ? 0.6 : 1,
              }}
            >
              {annivSent ? '✓ Message envoyé !' : 'Votre message vient d\'être envoyer'}
            </button>
            {anniversaireClients.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {anniversaireClients.map(c => (
                  <div key={c.id} style={{ fontSize: 11, color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                    {c.prenom} {c.nom} — {c.magasin?.toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Colonne 2 : Relances Renouvellement Verre */}
          <div style={{ ...colStyle, borderRight: '2px solid #93c5fd' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Relances Renouvellement Verre</div>
            <div style={{ color: '#6b7280', fontSize: 12, fontStyle: 'italic', marginBottom: 12 }}>Relancer Client.</div>
            <div style={{ fontSize: 20, marginBottom: 14, letterSpacing: 4 }}>🕶 🕶 🕶</div>
            {relanceClients.length === 0 ? (
              <button
                style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 4, backgroundColor: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'default' }}
              >
                Aucune Relances Renouvellement Verre
              </button>
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#1f2937', textAlign: 'center' }}>
                  🕶 {relanceClients.length} client{relanceClients.length > 1 ? 's' : ''} à relancer
                </div>
                <button
                  onClick={() => {
                    const entries: RapportSms[] = relanceClients.map(c => ({
                      id: Date.now() + '_' + c.id,
                      nature: 'Relance Verre',
                      client: `${c.prenom} ${c.nom}`.trim(),
                      resultat: 'Envoyé',
                      date: new Date().toISOString(),
                    }));
                    const updated = [...entries, ...rapport];
                    setRapport(updated);
                                  }}
                  style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 4, backgroundColor: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Envoyer Relances ({relanceClients.length})
                </button>
                <div style={{ marginTop: 10 }}>
                  {relanceClients.slice(0, 5).map(c => (
                    <div key={c.id} style={{ fontSize: 11, color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      {c.prenom} {c.nom} — {c.magasin?.toUpperCase()}
                    </div>
                  ))}
                  {relanceClients.length > 5 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>+{relanceClients.length - 5} autres</div>}
                </div>
              </>
            )}
          </div>

          {/* Colonne 3 : SMS Personnalisé */}
          <div style={{ ...colStyle }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>SMS Personnalisé</div>
              <button
                onClick={handleEnvoyerPerso}
                style={{ padding: '6px 14px', border: 'none', borderRadius: 4, backgroundColor: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                💬 Envoyer SMS
              </button>
            </div>

            {persoSent && <div style={{ color: '#16a34a', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>✓ SMS envoyé avec succès</div>}

            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Client</label>
              <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Client...</option>
                {allClients.map(c => (
                  <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.magasin?.toUpperCase()})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <textarea
                value={smsText}
                onChange={e => setSmsText(e.target.value)}
                placeholder="SMS"
                rows={3}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: '#374151' }}>Générez votre liste de client depuis un filtrage</div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Entreprise</label>
                <select value={filterEntreprise} onChange={e => setFilterEntreprise(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Entreprise...</option>
                  {entreprises.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Fidélisation</label>
                <div style={{ fontWeight: 600, fontSize: 11, color: '#374151', paddingTop: 4 }}>Date Début</div>
                <input type="date" value={filterDateDebut} onChange={e => setFilterDateDebut(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Date Fin</label>
                <input type="date" value={filterDateFin} onChange={e => setFilterDateFin(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Chiffre d'Affaires &gt;=</label>
                <input type="number" value={filterCA} onChange={e => setFilterCA(e.target.value)} placeholder="0" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            {(filterEntreprise || filterDateDebut || filterDateFin || filterCA) && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                {filteredClients.length} client{filteredClients.length > 1 ? 's' : ''} correspondant au filtre
              </div>
            )}
          </div>
        </div>

        {/* ── Rapport SMS ── */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Rapport SMS</div>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', flex: '1 1 180px' }}>
              <input
                type="text"
                placeholder="Recherche SMS..."
                value={searchRapport}
                onChange={e => { setSearchRapport(e.target.value); setRapportPage(1); }}
                style={{ border: 'none', outline: 'none', padding: '6px 10px', fontSize: 13, flex: 1, color: '#374151' }}
              />
              {searchRapport && <button onClick={() => setSearchRapport('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 8px', color: '#9ca3af', fontSize: 14 }}>×</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', flex: '1 1 160px' }}>
              <input
                type="date"
                value={searchDate}
                onChange={e => { setSearchDate(e.target.value); setRapportPage(1); }}
                style={{ border: 'none', outline: 'none', padding: '6px 10px', fontSize: 13, flex: 1, color: '#374151' }}
              />
              {searchDate && <button onClick={() => setSearchDate('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 8px', color: '#9ca3af', fontSize: 14 }}>×</button>}
            </div>
            <button style={{ padding: '6px 14px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>🔍</button>

            {/* Pagination right */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
              {['<<', '<', ...Array.from({ length: totalPages }, (_, i) => i + 1), '>', '>>'].map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (p === '<<') setRapportPage(1);
                    else if (p === '<') setRapportPage(Math.max(1, rapportPage - 1));
                    else if (p === '>') setRapportPage(Math.min(totalPages, rapportPage + 1));
                    else if (p === '>>') setRapportPage(totalPages);
                    else setRapportPage(Number(p));
                  }}
                  style={{
                    padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', fontSize: 12,
                    backgroundColor: p === rapportPage ? '#1d4ed8' : '#fff',
                    color: p === rapportPage ? '#fff' : '#374151',
                    fontWeight: p === rapportPage ? 700 : 400,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {['#', 'Nature', 'Message', 'Date', 'Résultat', 'Client'].map(h => (
                  <th key={h} style={{ border: '1px solid #e5e7eb', padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRapport.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', border: '1px solid #e5e7eb' }}>Aucun SMS enregistré</td>
                </tr>
              ) : (
                pageRapport.map((r, idx) => (
                  <tr key={r.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px', color: '#6b7280' }}>{(rapportPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px', fontWeight: 600 }}>{r.nature}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message || '—'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px', color: '#6b7280' }}>{formatDate(r.date)}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, backgroundColor: r.resultat === 'Envoyé' ? '#dcfce7' : '#fef3c7', color: r.resultat === 'Envoyé' ? '#16a34a' : '#d97706' }}>
                        {r.resultat}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '7px 10px' }}>{r.client}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
