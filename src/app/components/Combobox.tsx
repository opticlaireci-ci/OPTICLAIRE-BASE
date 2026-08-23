import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  title?: string;
  /** Largeur du champ (px). */
  width?: number;
  /** Autorise l'effacement (repasse à '' ). */
  clearable?: boolean;
}

/**
 * Champ « combobox » : on peut y écrire pour filtrer les propositions, puis
 * choisir dans la liste. Remplace un <select> classique tout en gardant une
 * saisie libre pour retrouver rapidement une option.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Rechercher…',
  title,
  width = 200,
  clearable = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(
    () => options.find(o => o.value === value)?.label ?? '',
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const openList = () => {
    setOpen(true);
    setQuery('');
    setHighlight(0);
  };

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const opt = filtered[highlight]; if (opt) select(opt.value); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={wrapRef} className="relative" style={{ width }}>
      <div
        className="flex items-center border border-gray-300 rounded bg-white overflow-hidden"
        title={title}>
        <input
          ref={inputRef}
          className="px-2 py-1.5 text-sm outline-none bg-transparent flex-1 min-w-0"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          onFocus={openList}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />
        {clearable && value && !open && (
          <button
            type="button"
            className="px-1 text-gray-400 hover:text-gray-600"
            onClick={() => onChange('')}
            title="Effacer">
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className="px-1.5 text-gray-400"
          onClick={() => (open ? setOpen(false) : openList())}
          tabIndex={-1}>
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Aucun résultat</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(o.value)}
                className={`block w-full text-left px-3 py-1.5 text-sm ${
                  i === highlight ? 'bg-gray-100' : ''
                } ${o.value === value ? 'font-semibold' : ''}`}>
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
