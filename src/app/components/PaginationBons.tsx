/**
 * Pagination des listes de bons : 20 bons par page, les plus récents d'abord.
 * (Les anciens boutons « 1 2 3 » étaient décoratifs : ils ne changeaient rien.)
 */
import type { CSSProperties } from 'react';

export const BONS_PAR_PAGE = 20;

export function paginer<T>(liste: T[], page: number, parPage = BONS_PAR_PAGE) {
  const pages = Math.max(1, Math.ceil(liste.length / parPage));
  const courante = Math.min(Math.max(1, page), pages);
  const debut = (courante - 1) * parPage;
  return { pages, page: courante, debut, elements: liste.slice(debut, debut + parPage) };
}

const bouton = (actif = false, inactif = false): CSSProperties => ({
  padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px',
  backgroundColor: actif ? '#3b82f6' : '#fff', color: actif ? '#fff' : inactif ? '#9ca3af' : '#111827',
  cursor: inactif ? 'default' : 'pointer', minWidth: '38px',
});

export function PaginationBons({ page, pages, total, onPage }: {
  page: number; pages: number; total: number; onPage: (p: number) => void;
}) {
  // Au plus 5 numéros autour de la page courante.
  const debut = Math.max(1, Math.min(page - 2, pages - 4));
  const numeros = Array.from({ length: Math.min(5, pages) }, (_, i) => debut + i);
  return (
    <div className="pagination-bons" data-testid="pagination-bons"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
      <span style={{ fontSize: '13px', color: '#6b7280' }}>
        {total} bon{total > 1 ? 's' : ''}{pages > 1 ? ` — page ${page} / ${pages}` : ''}
      </span>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button type="button" style={bouton(false, page === 1)} disabled={page === 1} onClick={() => onPage(1)}>{'<<'}</button>
          <button type="button" style={bouton(false, page === 1)} disabled={page === 1} onClick={() => onPage(page - 1)}>{'<'}</button>
          {numeros.map(n => (
            <button type="button" key={n} style={bouton(n === page)} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
          ))}
          <button type="button" style={bouton(false, page === pages)} disabled={page === pages} onClick={() => onPage(page + 1)}>{'>'}</button>
          <button type="button" style={bouton(false, page === pages)} disabled={page === pages} onClick={() => onPage(pages)}>{'>>'}</button>
        </div>
      )}
    </div>
  );
}
