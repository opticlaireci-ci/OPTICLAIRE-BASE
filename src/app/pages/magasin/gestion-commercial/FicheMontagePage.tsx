import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router';
import { Send, Plus, ArrowLeft } from 'lucide-react';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { getMagasins } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';

/**
 * Fiche de Montage (Gestion Commercial).
 *
 * Reproduit la fiche papier « FICHE DE MONTAGE » de LeClaire. Une fois remplie
 * et envoyée, elle crée un bon dans `leclaire_bons_commande_verres` SANS date
 * d'entrée à l'atelier : il atterrit donc automatiquement dans
 * Atelier ▸ Montage ▸ Mes Montages ▸ « Montages Reçus ».
 */

const BONS_KEY = 'leclaire_bons_commande_verres';

// Styles inline conformes à la maquette (cadre noir, cellules bordées).
const cell: React.CSSProperties = { border: '1px solid #111', padding: '8px 10px', verticalAlign: 'middle' };
const labelCell: React.CSSProperties = { ...cell, fontWeight: 600, whiteSpace: 'nowrap', backgroundColor: '#fff' };
const inp: React.CSSProperties = { width: '100%', border: 'none', outline: 'none', fontSize: '15px', padding: '4px', backgroundColor: 'transparent' };
const lineInp: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: '15px', padding: '4px', backgroundColor: 'transparent' };

export function FicheMontagePage() {
  const { magasinId } = useParams();
  const [bons, saveBons] = useLiveData<any>(BONS_KEY, []);

  const magasins = getMagasins();
  const magasinCourant = magasins.find(m => m.id === magasinId);

  const [officine, setOfficine] = useState(magasinCourant?.label || '');
  const [client, setClient] = useState('');
  const [couleurMonture, setCouleurMonture] = useState('');
  const [typeVerre, setTypeVerre] = useState('');
  const [odLigne, setOdLigne] = useState('');
  const [ogLigne, setOgLigne] = useState('');
  const [odAdd, setOdAdd] = useState('');
  const [ogAdd, setOgAdd] = useState('');
  const [hauteurOD, setHauteurOD] = useState('');
  const [hauteurOG, setHauteurOG] = useState('');
  const [epOD, setEpOD] = useState('');
  const [epOG, setEpOG] = useState('');
  const [message, setMessage] = useState('');
  // Vue : liste des fiches envoyées (défaut) ou formulaire de saisie.
  const [vue, setVue] = useState<'liste' | 'form'>('liste');

  // La fiche appartient au magasin dont c'est l'officine. Chaque magasin ne voit
  // donc QUE ses propres fiches (comparaison robuste : id, label complet ou court).
  const appartientAuMagasin = (b: any) => {
    const mid = (magasinId || '').toUpperCase();
    const label = (magasinCourant?.label || '').toUpperCase();
    const court = label.replace(`${TENANT.nom} `, '');
    const off = (b.officine || '').toUpperCase();
    const mag = (b.magasin || '').toUpperCase();
    return (b.magasinId && b.magasinId.toUpperCase() === mid)
      || (label && off === label)
      || (court && mag === court)
      || (mid && (off.includes(mid) || mag === mid));
  };

  // Fiches déjà envoyées depuis CE magasin (les plus récentes d'abord).
  const fiches = useMemo(() => {
    const arr = Array.isArray(bons) ? bons : [];
    return arr
      .filter((b: any) => b.source === 'fiche-montage' && appartientAuMagasin(b))
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bons, magasinId, magasinCourant?.label]);

  const nbValides = useMemo(() => fiches.filter((f: any) => f.valide).length, [fiches]);

  // Quand l'opticien consulte la LISTE, on marque tous les montages validés
  // comme « vus » (accusé local) : le badge clignotant se remet alors à zéro.
  useEffect(() => {
    if (vue !== 'liste') return;
    const valides = fiches.filter((f: any) => f.valide).map((f: any) => f.id);
    if (!valides.length) return;
    const key = `montage_vus_${magasinId}`;
    let existing: string[] = [];
    try { existing = JSON.parse(localStorage.getItem(key) || '[]'); } catch { existing = []; }
    const merged = Array.from(new Set([...existing, ...valides]));
    if (merged.length !== existing.length) {
      localStorage.setItem(key, JSON.stringify(merged));
    }
    // Notifie la barre de raccourcis pour remettre le compteur à zéro tout de suite.
    window.dispatchEvent(new CustomEvent('montage-vus-update'));
  }, [vue, fiches, magasinId]);

  const reset = () => {
    setClient(''); setCouleurMonture(''); setTypeVerre('');
    setOdLigne(''); setOgLigne(''); setOdAdd(''); setOgAdd('');
    setHauteurOD(''); setHauteurOG(''); setEpOD(''); setEpOG('');
  };

  const envoyer = () => {
    if (!client.trim()) { setMessage('⚠️ Veuillez saisir le nom du client.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const numBC = `FM-${Date.now().toString().slice(-8)}`;
    const bon = {
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
      numBC,
      numRef: numBC,
      numFacture: '',
      fournisseur: 'Fiche de montage',
      client: client.trim(),
      officine,
      magasinId: magasinId || '',
      magasin: magasinCourant?.label?.replace(`${TENANT.nom} `, '') || '',
      date: today,
      statut: 'En attente',
      statutMontage: 'En attente',
      typeVerre,
      // Détails de la fiche de montage
      ficheMontage: {
        couleurMonture, typeVerre,
        od: { ligne: odLigne, add: odAdd },
        og: { ligne: ogLigne, add: ogAdd },
        hauteurProgressif: { od: hauteurOD, og: hauteurOG },
        ecartPupillaire: { od: epOD, og: epOG },
      },
      source: 'fiche-montage',
    };
    saveBons([...(Array.isArray(bons) ? bons : []), bon]);
    reset();
    setMessage(`✅ Fiche envoyée à l'atelier (Montages Reçus) — N° ${numBC}`);
    setVue('liste'); // retour automatique à la liste des fiches envoyées
  };

  const formatDate = (s?: string) => { if (!s) return '-'; try { return new Date(s).toLocaleDateString('fr-FR'); } catch { return s; } };

  // ── Vue LISTE : le formulaire est masqué derrière le bouton « Nouvelle fiche » ─
  if (vue === 'liste') {
    return (
      <div style={{ padding: '20px', backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2c3e50' }}>Fiches de montage envoyées ({fiches.length})</h2>
            <AddButton
              onClick={() => { setMessage(''); setVue('form'); }}
              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} /> Nouvelle fiche de montage
            </AddButton>
          </div>

          {message && (
            <div style={{ marginBottom: '16px', fontSize: '14px', color: message.startsWith('✅') ? '#16a34a' : '#e74c3c', fontWeight: 600 }}>{message}</div>
          )}

          {nbValides > 0 && (
            <div style={{ marginBottom: '16px', backgroundColor: '#dcfce7', border: '1px solid #16a34a', borderRadius: '6px', padding: '10px 14px', color: '#166534', fontWeight: 600, fontSize: '14px' }}>
              ✅ {nbValides} fiche{nbValides > 1 ? 's' : ''} de montage validée{nbValides > 1 ? 's' : ''} par l'atelier — voir les lignes en vert ci-dessous.
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '720px' }}>
              <thead>
                <tr style={{ backgroundColor: '#8ba9bd' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50', width: '50px' }}>N°</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>N° BC</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>Client</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>Type de verre</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>Officine</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>Date</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {fiches.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucune fiche de montage envoyée pour le moment.</td></tr>
                ) : (
                  fiches.map((f: any, idx: number) => {
                    // Montage validé à l'atelier → la ligne passe au vert (l'officine
                    // voit d'un coup d'œil que sa fiche est validée).
                    const estValide = !!f.valide;
                    const statutLabel = estValide ? 'Validé ✓' : (f.dateEntreeAtelier ? 'Pris en charge' : (f.statutMontage || 'En attente'));
                    const statutColor = estValide ? '#16a34a' : (f.dateEntreeAtelier ? '#2563eb' : '#f39c12');
                    return (
                      <tr key={f.id} style={{ backgroundColor: estValide ? '#dcfce7' : '#dbe6ee', borderBottom: '2px solid #fff' }}>
                        <td style={{ padding: '10px 8px' }}><span style={{ backgroundColor: estValide ? '#bbf7d0' : '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>{f.numBC || f.numRef || '-'}</td>
                        <td style={{ padding: '10px 8px' }}>{f.client || '-'}</td>
                        <td style={{ padding: '10px 8px' }}>{f.typeVerre || f.ficheMontage?.typeVerre || '-'}</td>
                        <td style={{ padding: '10px 8px' }}>{f.officine || f.magasin || '-'}</td>
                        <td style={{ padding: '10px 8px' }}>{formatDate(f.date)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ backgroundColor: statutColor, color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
                            {statutLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Vue FORMULAIRE ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto 12px' }}>
        <button
          onClick={() => setVue('liste')}
          style={{ backgroundColor: '#fff', color: '#2c3e50', border: '1px solid #b7c6d3', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={16} /> Retour à la liste
        </button>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#fff', border: '3px solid #111', borderRadius: '6px', padding: '18px' }}>
        {/* En-tête : titre + logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ backgroundColor: '#111', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '22px', fontWeight: 800, letterSpacing: '1px' }}>
            FICHE DE MONTAGE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '22px', fontWeight: 700 }}>
            <span>👓</span> LeClaire
          </div>
        </div>

        {/* Corps de la fiche (divs pour un contrôle exact des proportions) */}
        <div style={{ borderTop: '1px solid #111', borderRight: '1px solid #111', borderLeft: '1px solid #111' }}>
          {/* OFICINE */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '34%', borderRight: '1px solid #111', padding: '12px', fontSize: '26px', fontWeight: 800 }}>OFICINE</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <select value={officine} onChange={e => setOfficine(e.target.value)} style={{ ...inp, fontSize: '16px', fontWeight: 600 }}>
                <option value="">— Choisir l'officine —</option>
                {magasins.map(m => <option key={m.id} value={m.label}>{m.label}</option>)}
              </select>
            </div>
          </div>
          {/* Nom du Client */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '34%', borderRight: '1px solid #111', padding: '12px', fontSize: '18px' }}>Nom du Client</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <input style={inp} value={client} onChange={e => setClient(e.target.value)} />
            </div>
          </div>
          {/* Couleur de monture */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '34%', borderRight: '1px solid #111', padding: '12px', fontSize: '18px' }}>Couleur de monture</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <input style={inp} value={couleurMonture} onChange={e => setCouleurMonture(e.target.value)} />
            </div>
          </div>
          {/* Type de Verre */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '34%', borderRight: '1px solid #111', padding: '12px', fontSize: '18px' }}>Type de Verre</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <input style={inp} value={typeVerre} onChange={e => setTypeVerre(e.target.value)} placeholder="Progressif, Unifocal…" />
            </div>
          </div>
          {/* OD / OG + ADD */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '34%', borderRight: '1px solid #111', padding: '12px', display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '18px' }}>
              <span>OD</span>
              <span>OG</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '10px', gap: '12px' }}>
              <input style={inp} value={odLigne} onChange={e => setOdLigne(e.target.value)} />
              <input style={inp} value={ogLigne} onChange={e => setOgLigne(e.target.value)} />
            </div>
            <div style={{ width: '24%', borderLeft: '1px solid #111', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>ADD</span>
              <input style={inp} value={odAdd} onChange={e => setOdAdd(e.target.value)} />
              <input style={inp} value={ogAdd} onChange={e => setOgAdd(e.target.value)} />
            </div>
          </div>
          {/* Hauteur du Progressif | Ecart Pupillaire (50/50) */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            <div style={{ width: '50%', borderRight: '1px solid #111', padding: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '17px', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Hauteur du Progressif :</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '16px', whiteSpace: 'nowrap' }}>OD :</span><input style={inp} value={hauteurOD} onChange={e => setHauteurOD(e.target.value)} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '16px', whiteSpace: 'nowrap' }}>OG :</span><input style={inp} value={hauteurOG} onChange={e => setHauteurOG(e.target.value)} /></div>
              </div>
            </div>
            <div style={{ width: '50%', padding: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '17px', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Ecart Pupillaire</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '16px', whiteSpace: 'nowrap' }}>OD :</span><input style={inp} value={epOD} onChange={e => setEpOD(e.target.value)} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '16px', whiteSpace: 'nowrap' }}>OG :</span><input style={inp} value={epOG} onChange={e => setEpOG(e.target.value)} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Envoi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '18px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '14px', color: message.startsWith('✅') ? '#16a34a' : '#e74c3c', fontWeight: 600 }}>{message}</div>
          <button
            onClick={envoyer}
            style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '12px 24px', cursor: 'pointer', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Send size={18} /> Envoyer à l'atelier
          </button>
        </div>
      </div>
    </div>
  );
}

export default FicheMontagePage;
