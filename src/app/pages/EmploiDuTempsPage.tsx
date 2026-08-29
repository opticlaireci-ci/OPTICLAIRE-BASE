import { useState } from 'react';
import { getMagasins } from '../constants/magasins';
import { useLiveData } from '../hooks/useLiveData';
import { AddButton } from '../components/AddButton';
import { TENANT } from '../config/tenant';

const MAGASINS = getMagasins();

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const JOURS_COURT = ['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'];
// calendar week starts Sunday
const CAL_DAYS = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];

const LS_KEY = 'leclaire_emplois_du_temps';

interface Horaire { actif: boolean; debut: string; fin: string; }
interface EmploiDuTemps {
  id: string;
  magasinId: string;
  annee: number;
  mois: number; // 0-based
  horaires: Record<string, Horaire>;
  joursExceptionnels: number[];
  createdAt: string;
}

function defaultHoraires(): Record<string, Horaire> {
  const h: Record<string, Horaire> = {};
  JOURS.forEach(j => { h[j] = { actif: false, debut: '', fin: '' }; });
  return h;
}

// ── Calendar helpers ──────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  // 0=Sun,1=Mon...6=Sat
  return new Date(year, month, 1).getDay();
}

// ── Calendar View (Image 1) ───────────────────────────────────────────────────
function CalendarView({ onAjouter, onEdit }: { onAjouter: () => void; onEdit: (magasinId: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [calMode, setCalMode] = useState<'Mois' | 'Semaine' | 'Jour' | 'Agenda'>('Mois');
  const [emplois] = useLiveData<EmploiDuTemps>(LS_KEY, []);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth); // 0=Sun

  // Build calendar cells (6 rows × 7 cols)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Events per day: collect emplois for this month
  const eventsByDay: Record<number, string[]> = {};
  emplois.filter(e => e.annee === viewYear && e.mois === viewMonth).forEach(e => {
    const foundMagasin = MAGASINS.find(magasinItem => magasinItem.id === e.magasinId);
    const label = foundMagasin ? foundMagasin.label.replace(`${TENANT.nom} `, '') : e.magasinId;
    // show on days with active horaires
    Object.entries(e.horaires).forEach(([jour, h]) => {
      if (h.actif) {
        // find day-of-week index for this jour
        const dowIdx = JOURS.indexOf(jour); // 0=Lundi
        // find all days in month matching this dow
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(viewYear, viewMonth, d).getDay(); // 0=Sun
          const mappedDow = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
          if (mappedDow === dowIdx && !e.joursExceptionnels.includes(d)) {
            if (!eventsByDay[d]) eventsByDay[d] = [];
            eventsByDay[d].push(`${label} ${h.debut}-${h.fin}`);
          }
        }
      }
    });
  });

  const rows = [];
  for (let r = 0; r < cells.length / 7; r++) {
    rows.push(cells.slice(r * 7, r * 7 + 7));
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontWeight: 600, fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Emploi du Temps: {TENANT.nom}</span>
        </div>
        <AddButton
          onClick={onAjouter}
          style={{ backgroundColor: '#0d9488', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          Ajouter Emploi du Temps
        </AddButton>
      </div>

      {/* Desktop layout: sidebar + calendar */}
      <div className="hidden md:flex" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Left panel: magasins */}
        <div style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: '12px 0', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, padding: '0 12px 8px', borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>MAGASIN</div>
          {MAGASINS.map(magasinItem => {
            const hasEmploi = emplois.some(emploi => emploi.magasinId === magasinItem.id);
            return (
              <div key={magasinItem.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{magasinItem.label}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    title="Voir"
                    style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    👁
                  </button>
                  <button
                    title="Modifier"
                    onClick={() => onEdit(magasinItem.id)}
                    style={{ background: '#0d9488', border: 'none', borderRadius: 3, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                  >
                    ✏️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right panel: calendar */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {/* Calendar toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={prevMonth} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 3, width: 28, height: 28, cursor: 'pointer', fontWeight: 700 }}>‹</button>
              <button onClick={nextMonth} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 3, width: 28, height: 28, cursor: 'pointer', fontWeight: 700 }}>›</button>
              <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>Aujourd'hui</button>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18 }}>{MOIS_LABELS[viewMonth]} {viewYear}</span>
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden' }}>
              {(['Mois', 'Semaine', 'Jour', 'Agenda'] as const).map(modeLabel => (
                <button key={modeLabel} onClick={() => setCalMode(modeLabel)} style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: calMode === modeLabel ? 700 : 400, background: calMode === modeLabel ? '#1e293b' : '#fff', color: calMode === modeLabel ? '#fff' : '#374151' }}>{modeLabel}</button>
              ))}
            </div>
          </div>

          {/* Calendar grid */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {CAL_DAYS.map(d => (
                  <th key={d} style={{ border: '1px solid #e5e7eb', padding: '6px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, backgroundColor: '#f9fafb', color: '#6b7280' }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const isToday = cell === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                    const events = cell ? (eventsByDay[cell] || []) : [];
                    return (
                      <td key={ci} style={{ border: '1px solid #e5e7eb', verticalAlign: 'top', height: 80, padding: '4px 4px', backgroundColor: cell ? '#fff' : '#f9fafb' }}>
                        {cell && (
                          <>
                            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#fff' : '#374151', backgroundColor: isToday ? '#1d4ed8' : 'transparent', borderRadius: isToday ? '50%' : 0, width: isToday ? 20 : 'auto', height: isToday ? 20 : 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', float: 'right' }}>{cell}</div>
                            <div style={{ clear: 'both' }}>
                              {events.slice(0, 2).map((ev, ei) => (
                                <div key={ei} style={{ fontSize: 10, backgroundColor: '#0d9488', color: '#fff', borderRadius: 2, padding: '1px 3px', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev}</div>
                              ))}
                              {events.length > 2 && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>+{events.length - 2}</div>}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile layout: calendar month nav + magasin cards */}
      <div className="md:hidden" style={{ padding: '12px', overflowY: 'auto' }}>
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={prevMonth} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, width: 34, height: 34, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>‹</button>
            <button onClick={nextMonth} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, width: 34, height: 34, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>›</button>
            <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Aujourd'hui</button>
          </div>
          <span style={{ fontWeight: 700, fontSize: 'clamp(14px, 4vw, 18px)' }}>{MOIS_LABELS[viewMonth]} {viewYear}</span>
        </div>
        {/* Magasin schedule cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MAGASINS.map(magasinItem => {
            const emploiMag = emplois.find(e => e.magasinId === magasinItem.id && e.annee === viewYear && e.mois === viewMonth);
            const joursActifs = emploiMag ? JOURS.filter(j => emploiMag.horaires[j]?.actif) : [];
            return (
              <div key={magasinItem.id} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)', color: '#1f2937' }}>{magasinItem.label}</span>
                  <button
                    onClick={() => onEdit(magasinItem.id)}
                    style={{ background: '#0d9488', border: 'none', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600 }}
                  >
                    ✏️ Modifier
                  </button>
                </div>
                {joursActifs.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Aucun horaire défini pour ce mois</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {joursActifs.map(jour => (
                      <div key={jour} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151' }}>
                        <span style={{ fontWeight: 600, minWidth: 90 }}>{jour}</span>
                        <span style={{ backgroundColor: '#0d9488', color: '#fff', borderRadius: 4, padding: '1px 8px', fontWeight: 600 }}>
                          {emploiMag!.horaires[jour].debut} – {emploiMag!.horaires[jour].fin}
                        </span>
                      </div>
                    ))}
                    {emploiMag && emploiMag.joursExceptionnels.length > 0 && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        Jours fériés/exceptionnels: {emploiMag.joursExceptionnels.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Ajouter / Modifier View (Image 2) ─────────────────────────────────────────
function AjouterView({ editMagasinId, onBack }: { editMagasinId?: string; onBack: () => void }) {
  const today = new Date();
  const [emplois, setEmplois] = useLiveData<EmploiDuTemps>(LS_KEY, []);
  const existing = editMagasinId ? emplois.find(e => e.magasinId === editMagasinId) : undefined;

  const [annee, setAnnee] = useState<number>(existing?.annee ?? today.getFullYear());
  const [mois, setMois] = useState<number>(existing?.mois ?? today.getMonth());
  const [magasinId, setMagasinId] = useState(existing?.magasinId ?? editMagasinId ?? '');
  const [horaires, setHoraires] = useState<Record<string, Horaire>>(existing?.horaires ?? defaultHoraires());
  const [joursExcep, setJoursExcep] = useState<number[]>(existing?.joursExceptionnels ?? []);
  const [saved, setSaved] = useState(false);

  const toggleJourExcep = (day: number) => {
    setJoursExcep(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const updateHoraire = (jour: string, field: keyof Horaire, value: string | boolean) => {
    setHoraires(prev => ({ ...prev, [jour]: { ...prev[jour], [field]: value } }));
  };

  const handleSave = () => {
    if (!magasinId) { alert('Veuillez choisir un magasin'); return; }
    const newEntry: EmploiDuTemps = {
      id: existing?.id ?? `${magasinId}_${Date.now()}`,
      magasinId, annee, mois, horaires,
      joursExceptionnels: joursExcep,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const next = [...emplois];
    const idx = next.findIndex(e => e.id === newEntry.id || (e.magasinId === magasinId && e.annee === annee && e.mois === mois));
    if (idx >= 0) next[idx] = newEntry; else next.push(newEntry);
    setEmplois(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Calendar for exceptional days
  const daysInMonth = getDaysInMonth(annee, mois);
  const firstDow = getFirstDayOfWeek(annee, mois);
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calRows = [];
  for (let r = 0; r < calCells.length / 7; r++) calRows.push(calCells.slice(r * 7, r * 7 + 7));

  const inputStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 3, padding: '4px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontWeight: 600, fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Emploi du Temps: {TENANT.nom}</span>
        </div>
        <button onClick={onBack} style={{ backgroundColor: '#0d9488', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Emploi du Temps
        </button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
        {/* Filters row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 140 }}>
            <label style={labelStyle}>Année</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 3, overflow: 'hidden', background: '#fff' }}>
                <span style={{ padding: '4px 8px', fontSize: 20, color: '#6b7280' }}>📅</span>
                <input type="number" value={annee} onChange={e => setAnnee(Number(e.target.value))} style={{ border: 'none', outline: 'none', padding: '4px 8px', fontSize: 13, width: 70 }} />
                <button onClick={() => setAnnee(today.getFullYear())} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px', color: '#9ca3af', fontSize: 14 }}>×</button>
              </div>
            </div>
          </div>

          <div style={{ minWidth: 160 }}>
            <label style={labelStyle}>Mois</label>
            <select value={mois} onChange={e => setMois(Number(e.target.value))} style={inputStyle}>
              {MOIS_LABELS.map((moisLabel, index) => <option key={index} value={index}>{moisLabel}</option>)}
            </select>
          </div>

          <div style={{ minWidth: 240 }}>
            <label style={labelStyle}>Magasin</label>
            <select value={magasinId} onChange={e => setMagasinId(e.target.value)} style={inputStyle} disabled={!!editMagasinId}>
              <option value="">Choisir Magasin</option>
              {MAGASINS.map(magasinItem => <option key={magasinItem.id} value={magasinItem.id}>{magasinItem.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* HORAIRES */}
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>HORAIRES</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {JOURS.map(jour => (
                  <tr key={jour}>
                    <td style={{ padding: '5px 8px 5px 0' }}>
                      <input
                        type="checkbox"
                        checked={horaires[jour]?.actif ?? false}
                        onChange={e => updateHoraire(jour, 'actif', e.target.checked)}
                        style={{ marginRight: 6 }}
                      />
                      <span style={{ fontSize: 13 }}>{jour}</span>
                    </td>
                    <td style={{ padding: '5px 4px' }}>
                      <input
                        type="time"
                        value={horaires[jour]?.debut ?? ''}
                        onChange={e => updateHoraire(jour, 'debut', e.target.value)}
                        disabled={!horaires[jour]?.actif}
                        style={{ ...inputStyle, width: 110, opacity: horaires[jour]?.actif ? 1 : 0.4 }}
                      />
                    </td>
                    <td style={{ padding: '5px 4px' }}>
                      <input
                        type="time"
                        value={horaires[jour]?.fin ?? ''}
                        onChange={e => updateHoraire(jour, 'fin', e.target.value)}
                        disabled={!horaires[jour]?.actif}
                        style={{ ...inputStyle, width: 110, opacity: horaires[jour]?.actif ? 1 : 0.4 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FERIÉ OU JOUR EXCEPTIONNELLE */}
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
              FÉRIÉ OU JOUR EXCEPTIONNELLE
              <input
                type="checkbox"
                checked={joursExcep.length > 0}
                onChange={e => { if (!e.target.checked) setJoursExcep([]); }}
                title="Décocher pour effacer tous les jours"
              />
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(d => (
                    <th key={d} style={{ border: '1px solid #d1d5db', padding: '4px 2px', textAlign: 'center', fontWeight: 600, backgroundColor: '#f9fafb', fontSize: 11 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      // cell is a day number; calendar starts Sunday but we display Mon-Sun
                      // reorder: our calRows are Sun=0 based, remap to Mon-Sun display
                      // Actually let's display Mon-Sun: shift so Monday first
                      // Our calCells use getFirstDayOfWeek which is 0=Sun. We need to convert.
                      // Actually let's rebuild with Monday-first logic for display
                      return (
                        <td key={ci} style={{ border: '1px solid #d1d5db', textAlign: 'center', padding: '3px 2px', backgroundColor: '#fff', verticalAlign: 'top', minWidth: 36 }}>
                          {cell && (
                            <>
                              <div style={{ fontSize: 11, color: '#374151' }}>{cell}</div>
                              <input
                                type="checkbox"
                                checked={joursExcep.includes(cell)}
                                onChange={() => toggleJourExcep(cell)}
                                style={{ marginTop: 2 }}
                              />
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Personnel section */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Personnel: Absences ou Indisponibilités
            <input type="checkbox" title="Activer" />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {MAGASINS.filter(magasinFilter => !magasinId || magasinFilter.id === magasinId).map(magasinItem => (
              <div key={magasinItem.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: '#374151' }}>{magasinItem.label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Aucun personnel enregistré</div>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Enregistrer
          </button>
          <button
            onClick={onBack}
            style={{ backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Annuler
          </button>
          {saved && <span style={{ color: '#10b981', fontWeight: 600, fontSize: 13 }}>✓ Enregistré avec succès</span>}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function EmploiDuTempsPage() {
  const [view, setView] = useState<'calendar' | 'ajouter'>('calendar');
  const [editMagasinId, setEditMagasinId] = useState<string | undefined>();

  const handleAjouter = () => { setEditMagasinId(undefined); setView('ajouter'); };
  const handleEdit = (id: string) => { setEditMagasinId(id); setView('ajouter'); };
  const handleBack = () => { setView('calendar'); setEditMagasinId(undefined); };

  return (
    <div style={{ backgroundColor: '#fff', minHeight: '100vh' }}>
      {view === 'calendar'
        ? <CalendarView onAjouter={handleAjouter} onEdit={handleEdit} />
        : <AjouterView editMagasinId={editMagasinId} onBack={handleBack} />}
    </div>
  );
}
