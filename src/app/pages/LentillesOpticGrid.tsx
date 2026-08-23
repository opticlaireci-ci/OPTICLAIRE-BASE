import { useState, useMemo } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import { AddButton } from '../components/AddButton';
import { OPTIC_TABLES, OPTIC_STORAGE_KEY } from './lentillesOpticData';
import type { Cell } from './lentillesOpticData';

/**
 * Grille éditable des stocks « LENTILLES OPTIC » (Option B).
 *
 * 4 tableaux (Progressif / SPH+CYL- / SPH-CYL+ / SPH-CYL-), matrice SPH × colonnes.
 * Chaque case : Initial + Monté saisissables, Restant = Initial − Monté (calculé,
 * code couleur). Les valeurs par défaut viennent des PDF (seed dans le code) ;
 * les saisies sont enregistrées dans Supabase (clé partagée) par-dessus le seed.
 */

// Overrides persistés : { [tableId]: { [row]: { [col]: [initial, monte] } } }
type Overrides = Record<string, Record<string, Record<string, Cell>>>;

const th: React.CSSProperties = { padding: '6px 4px', fontWeight: 700, color: '#fff', fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' };
const cellInput: React.CSSProperties = { width: '32px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', textAlign: 'center', backgroundColor: '#fff' };

export function LentillesOpticGrid() {
  const [tableId, setTableId] = useState(OPTIC_TABLES[0].id);
  const [overrides, setOverrides] = useLiveData<Overrides>(OPTIC_STORAGE_KEY, {});
  const [qRow, setQRow] = useState('');
  const [qCol, setQCol] = useState('');
  const [seulementDispo, setSeulementDispo] = useState(false);
  // Formulaire « Ajouter des lentilles » (approvisionnement d'une case).
  const [showAdd, setShowAdd] = useState(false);
  const [addRow, setAddRow] = useState('');
  const [addCol, setAddCol] = useState('');
  const [addQty, setAddQty] = useState('');

  const table = OPTIC_TABLES.find(t => t.id === tableId)!;

  const getCell = (row: string, col: string): Cell => {
    const o = overrides[tableId]?.[row]?.[col];
    if (o) return o;
    return table.seed[row]?.[col] ?? [0, 0];
  };

  const setCell = (row: string, col: string, patch: Partial<{ initial: number; monte: number }>) => {
    const cur = getCell(row, col);
    const next: Cell = [
      patch.initial != null ? patch.initial : cur[0],
      patch.monte != null ? patch.monte : cur[1],
    ];
    setOverrides(prev => ({
      ...prev,
      [tableId]: {
        ...(prev[tableId] || {}),
        [row]: { ...(prev[tableId]?.[row] || {}), [col]: next },
      },
    }));
  };

  // Approvisionnement : ajoute `qty` lentilles au stock Initial d'une case.
  const ajouterLentilles = () => {
    const qty = Math.max(0, parseInt(addQty) || 0);
    if (!addRow || !addCol || qty <= 0) return;
    const [initial] = getCell(addRow, addCol);
    setCell(addRow, addCol, { initial: initial + qty });
    setAddQty('');
  };

  // Totaux du tableau courant
  const totaux = useMemo(() => {
    let initial = 0, monte = 0, restant = 0, ruptures = 0, faibles = 0;
    for (const row of table.rows) {
      for (const col of table.cols) {
        const [i, m] = getCell(row, col);
        const r = i - m;
        initial += i; monte += m; restant += Math.max(0, r);
        if (i > 0) {
          if (r <= 0) ruptures++;
          else if (r <= 2) faibles++;
        }
      }
    }
    return { initial, monte, restant, ruptures, faibles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, overrides, table]);

  // Filtres de recherche : par SPH (ligne) et par colonne (Add/CYL), + « en stock ».
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const visibleCols = useMemo(() => {
    const q = norm(qCol);
    return q ? table.cols.filter(c => norm(c).includes(q)) : table.cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCol, table]);
  const visibleRows = useMemo(() => {
    const q = norm(qRow);
    let rows = q ? table.rows.filter(r => norm(r).includes(q)) : table.rows;
    if (seulementDispo) {
      rows = rows.filter(r => visibleCols.some(c => {
        const [i, m] = getCell(r, c);
        return i > 0 && i - m > 0;
      }));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qRow, table, seulementDispo, visibleCols, overrides]);

  const searchInput = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
      <span style={{ padding: '0 6px', color: '#9ca3af', fontSize: '13px' }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: '6px 8px', border: 'none', outline: 'none', fontSize: '13px', width: '150px', backgroundColor: 'transparent' }}
      />
      {value && (
        <button onClick={() => onChange('')} style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
      )}
    </div>
  );

  void totaux; // les totaux sont désormais affichés dans le panneau latéral (LentillesOpticKpis)

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Stock Lentilles OPTIC</h2>

      {/* Sélecteur de tableau */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {OPTIC_TABLES.map(t => (
          <button
            key={t.id}
            onClick={() => setTableId(t.id)}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
              backgroundColor: tableId === t.id ? '#2563eb' : '#eef2f7',
              color: tableId === t.id ? '#fff' : '#2c3e50',
              fontWeight: tableId === t.id ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
        {searchInput(qRow, setQRow, `${table.rowLabel}… (ex. -0,25)`)}
        {searchInput(qCol, setQCol, `${table.colLabel}… (ex. +1,25)`)}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#2c3e50', cursor: 'pointer' }}>
          <input type="checkbox" checked={seulementDispo} onChange={e => setSeulementDispo(e.target.checked)} />
          En stock uniquement
        </label>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{visibleRows.length} lignes × {visibleCols.length} colonnes</span>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{ marginLeft: 'auto', padding: '7px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: showAdd ? '#e74c3c' : '#16a34a', color: '#fff' }}
        >
          {showAdd ? '✕ Fermer' : '➕ Ajouter des lentilles'}
        </button>
      </div>

      {/* Formulaire d'approvisionnement */}
      {showAdd && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px', marginBottom: '14px', backgroundColor: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Tableau</label>
            <select value={tableId} onChange={e => { setTableId(e.target.value); setAddRow(''); setAddCol(''); }} style={{ padding: '7px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}>
              {OPTIC_TABLES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{table.rowLabel}</label>
            <input
              list="add-row-options"
              value={addRow}
              onChange={e => setAddRow(e.target.value)}
              placeholder="Taper une valeur…"
              style={{ padding: '7px', border: `1px solid ${addRow && !table.rows.includes(addRow) ? '#e74c3c' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff', minWidth: '130px' }}
            />
            <datalist id="add-row-options">
              {table.rows.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{table.colLabel}</label>
            <input
              list="add-col-options"
              value={addCol}
              onChange={e => setAddCol(e.target.value)}
              placeholder="Taper une valeur…"
              style={{ padding: '7px', border: `1px solid ${addCol && !table.cols.includes(addCol) ? '#e74c3c' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff', minWidth: '130px' }}
            />
            <datalist id="add-col-options">
              {table.cols.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Quantité à ajouter</label>
            <input type="number" min={1} value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Ex. 10" style={{ padding: '7px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '110px' }} />
          </div>
          {addRow && addCol && (
            <span style={{ fontSize: '12px', color: '#166534' }}>
              Restant actuel : <b>{getCell(addRow, addCol)[0] - getCell(addRow, addCol)[1]}</b>
            </span>
          )}
          {(() => {
            const rowOk = table.rows.includes(addRow);
            const colOk = table.cols.includes(addCol);
            const disabled = !rowOk || !colOk || !(parseInt(addQty) > 0);
            return (
              <AddButton
                onClick={ajouterLentilles}
                disabled={disabled}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, backgroundColor: disabled ? '#9ca3af' : '#16a34a', color: '#fff' }}
              >
                Ajouter au stock
              </AddButton>
            );
          })()}
        </div>
      )}

      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>
        {table.rowLabel} en lignes × {table.colLabel} en colonnes. Chaque case : <b>I</b> = Initial (dotation),
        <b> M</b> = Monté (saisir), <b>R</b> = Restant (calculé). Les modifications sont enregistrées automatiquement.
      </div>

      {/* Grille */}
      <div style={{ overflow: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px', maxHeight: '70vh' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, top: 0, zIndex: 3, backgroundColor: '#1a5a72', minWidth: '78px' }}>
                {table.rowLabel} \ {table.colLabel}
              </th>
              {visibleCols.map(col => (
                <th key={col} style={{ ...th, position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#8ba9bd', minWidth: '110px' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr key={row}>
                <th style={{ padding: '4px 8px', fontWeight: 700, color: '#2c3e50', fontSize: '12px', position: 'sticky', left: 0, zIndex: 1, backgroundColor: ri % 2 ? '#eef2f7' : '#dbe6ee', whiteSpace: 'nowrap', textAlign: 'left' }}>
                  {row}
                </th>
                {visibleCols.map(col => {
                  const [initial, monte] = getCell(row, col);
                  const restant = initial - monte;
                  const rupture = initial > 0 && restant <= 0;
                  const faible = !rupture && initial > 0 && restant <= 2;
                  const rColor = initial === 0 ? '#9ca3af' : rupture ? '#e74c3c' : faible ? '#f39c12' : '#16a34a';
                  return (
                    <td key={col} style={{ padding: '3px', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #eef2f7', backgroundColor: initial === 0 ? '#f8fafc' : '#fff', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <input
                          type="number"
                          value={initial}
                          onChange={e => setCell(row, col, { initial: Math.max(0, parseInt(e.target.value) || 0) })}
                          title="Initial"
                          style={{ ...cellInput, color: '#2563eb' }}
                        />
                        <input
                          type="number"
                          value={monte}
                          onChange={e => setCell(row, col, { monte: Math.max(0, parseInt(e.target.value) || 0) })}
                          title="Monté"
                          style={{ ...cellInput, color: '#8e44ad' }}
                        />
                        <span title="Restant" style={{ minWidth: '20px', fontWeight: 700, color: rColor }}>{restant}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Panneau latéral : totaux « lentilles disponibles » (à gauche du Montage) ──
export function LentillesOpticKpis() {
  const [overrides] = useLiveData<Overrides>(OPTIC_STORAGE_KEY, {});

  const totaux = useMemo(() => {
    let initial = 0, monte = 0, restant = 0, faibles = 0, ruptures = 0;
    for (const table of OPTIC_TABLES) {
      for (const row of table.rows) {
        for (const col of table.cols) {
          const cell: Cell = overrides[table.id]?.[row]?.[col] ?? table.seed[row]?.[col] ?? [0, 0];
          const [i, m] = cell;
          const r = i - m;
          initial += i; monte += m; restant += Math.max(0, r);
          if (i > 0) {
            if (r <= 0) ruptures++;
            else if (r <= 2) faibles++;
          }
        }
      }
    }
    return { initial, monte, restant, faibles, ruptures };
  }, [overrides]);

  const card = (label: string, value: number, color: string, hint?: string) => (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${color}33`, borderLeft: `5px solid ${color}`, borderRadius: '8px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: '13px', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>{value.toLocaleString('fr-FR')}</div>
      {hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#2c3e50' }}>Lentilles OPTIC — total</div>
      {card('Lentilles disponibles', totaux.restant, '#16a34a', 'Restant sur les 4 tableaux')}
      {card('Stock initial (dotation)', totaux.initial, '#2563eb')}
      {card('Montées', totaux.monte, '#8e44ad')}
      {card('Cases faibles (≤2)', totaux.faibles, '#f39c12')}
      {card('Cases en rupture', totaux.ruptures, '#e74c3c')}
    </div>
  );
}
