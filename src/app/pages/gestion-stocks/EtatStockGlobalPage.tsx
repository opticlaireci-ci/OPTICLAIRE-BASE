import { useState, useMemo } from 'react';
import { Search, Printer, Download } from 'lucide-react';
import { excelHeaderRows, printHeaderHTML } from '../../utils/documentHeader';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

interface StockItem {
  id: string;
  type: 'monture' | 'accessoire';
  designation: string;
  marque: string;
  reference?: string;
  couleur: string;
  taille?: string;
  stock: number;
  seuil: number;
  prix: number;
}

export function EtatStockGlobalPage() {
  // Recensement DIRECT du stock enregistré dans les catalogues Monture / Accessoire.
  // On lit exactement les mêmes données que la page Monture (useLiveData) :
  // cache-first (affichage instantané) + temps réel (onSnapshot) → toujours à jour.
  const [monturesRaw] = useLiveData<any>('leclaire_global_montures');
  const [accessoiresRaw] = useLiveData<any>('leclaire_global_accessoires');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'tous' | 'monture' | 'accessoire'>('tous');
  const [filterStatut, setFilterStatut] = useState<'tous' | 'disponible' | 'rupture' | 'alerte'>('tous');

  const stocks = useMemo<StockItem[]>(() => {
    const items: StockItem[] = [];

    // Montures enregistrées dans le catalogue Monture
    (monturesRaw || []).forEach((m: any) => {
      items.push({
        id: m.id,
        type: 'monture',
        designation: `${m.marque} - ${m.reference} ${m.couleur ?? ''} ${m.taille ?? ''}`.trim(),
        marque: m.marque,
        reference: m.reference,
        couleur: m.couleur,
        taille: m.taille,
        stock: Number(m.stock) || 0,
        seuil: Number(m.seuil) || 0,
        prix: Number(m.prix) || 0,
      });
    });

    // Accessoires enregistrés dans le catalogue Accessoire
    (accessoiresRaw || []).forEach((a: any) => {
      items.push({
        id: a.id,
        type: 'accessoire',
        designation: `${a.marque} - ${a.designation}`,
        marque: a.marque,
        couleur: a.couleur,
        stock: Number(a.stock) || 0,
        seuil: Number(a.seuil) || 0,
        prix: Number(a.prix) || 0,
      });
    });

    return items;
  }, [monturesRaw, accessoiresRaw]);

  const getStatutStock = (stock: number, seuil: number) => {
    if (stock === 0) return 'rupture';
    if (stock <= seuil) return 'alerte';
    return 'disponible';
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'rupture': return '#ef4444';
      case 'alerte': return '#f59e0b';
      case 'disponible': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatutLabel = (statut: string) => {
    switch (statut) {
      case 'rupture': return 'Rupture';
      case 'alerte': return 'Alerte';
      case 'disponible': return 'Disponible';
      default: return '-';
    }
  };

  const filteredStocks = stocks.filter(item => {
    // Filtre de recherche
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!item.designation.toLowerCase().includes(q) &&
          !item.marque.toLowerCase().includes(q)) {
        return false;
      }
    }

    // Filtre par type
    if (filterType !== 'tous' && item.type !== filterType) {
      return false;
    }

    // Filtre par statut
    if (filterStatut !== 'tous') {
      const statut = getStatutStock(item.stock, item.seuil);
      if (statut !== filterStatut) {
        return false;
      }
    }

    return true;
  });

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>État de Stock - ${TENANT.nom}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 24px; margin-bottom: 20px; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            .rupture { color: #ef4444; font-weight: bold; }
            .alerte { color: #f59e0b; font-weight: bold; }
            .disponible { color: #10b981; font-weight: bold; }
            .date { text-align: right; margin-bottom: 10px; color: #6b7280; }
          </style>
        </head>
        <body>
          ${printHeaderHTML()}
          <div class="date">Imprimé le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</div>
          <h1>État de Stock - ${TENANT.nom}</h1>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Désignation</th>
                <th>Stock</th>
                <th>Seuil</th>
                <th>Prix Unitaire</th>
                <th>Valeur Stock</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStocks.map((item, index) => {
                const statut = getStatutStock(item.stock, item.seuil);
                const valeur = item.stock * item.prix;
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${item.type === 'monture' ? 'Monture' : 'Accessoire'}</td>
                    <td>${item.designation}</td>
                    <td>${item.stock}</td>
                    <td>${item.seuil}</td>
                    <td>${item.prix.toLocaleString('fr-FR')} F</td>
                    <td>${valeur.toLocaleString('fr-FR')} F</td>
                    <td class="${statut}">${getStatutLabel(statut)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 30px; text-align: right; color: #6b7280;">
            <strong>Total articles:</strong> ${filteredStocks.length}<br>
            <strong>Valeur totale:</strong> ${filteredStocks.reduce((sum, item) => sum + (item.stock * item.prix), 0).toLocaleString('fr-FR')} F CFA
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleExportExcel = async () => {
    // Import paresseux : xlsx n'est chargé qu'au moment de l'export (pas au 1er écran).
    const XLSX = await import('xlsx');
    const exportData = filteredStocks.map((item, index) => {
      const statut = getStatutStock(item.stock, item.seuil);
      const valeur = item.stock * item.prix;
      return {
        '#': index + 1,
        'Type': item.type === 'monture' ? 'Monture' : 'Accessoire',
        'Marque': item.marque,
        'Désignation': item.designation,
        'Stock': item.stock,
        'Seuil': item.seuil,
        'Prix Unitaire': item.prix,
        'Valeur Stock': valeur,
        'Statut': getStatutLabel(statut),
      };
    });

    const headers = ['#', 'Type', 'Marque', 'Désignation', 'Stock', 'Seuil', 'Prix Unitaire', 'Valeur Stock', 'Statut'];
    const aoa = [...excelHeaderRows(), headers, ...exportData.map((row: any) => headers.map(h => row[h]))];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'État de Stock');

    // Ajustement automatique des colonnes
    const maxWidth = exportData.reduce((w: any, r: any) => {
      Object.keys(r).forEach(k => {
        const val = r[k] ? String(r[k]).length : 10;
        w[k] = Math.max(w[k] || 10, val);
      });
      return w;
    }, {});

    worksheet['!cols'] = Object.keys(maxWidth).map(k => ({ wch: maxWidth[k] + 2 }));

    const fileName = `Etat_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const stats = {
    total: filteredStocks.length,
    disponible: filteredStocks.filter(i => getStatutStock(i.stock, i.seuil) === 'disponible').length,
    alerte: filteredStocks.filter(i => getStatutStock(i.stock, i.seuil) === 'alerte').length,
    rupture: filteredStocks.filter(i => getStatutStock(i.stock, i.seuil) === 'rupture').length,
    valeurTotale: filteredStocks.reduce((sum, item) => sum + (item.stock * item.prix), 0),
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>Gestion Stocks: {TENANT.nom}</p>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
            État de Stock
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handlePrint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            <Printer size={18} />
            Imprimer
          </button>
          <button
            onClick={handleExportExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            <Download size={18} />
            Exporter Excel
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Articles</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f2937' }}>{stats.total}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Disponible</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>{stats.disponible}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Alerte</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.alerte}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Rupture</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{stats.rupture}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Valeur Stock</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>
            {stats.valeurTotale.toLocaleString('fr-FR')} F
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px auto', gap: '12px', alignItems: 'end' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 40px 10px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <Search
              size={18}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            style={{
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="tous">Tous les types</option>
            <option value="monture">Montures</option>
            <option value="accessoire">Accessoires</option>
          </select>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as any)}
            style={{
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="tous">Tous les statuts</option>
            <option value="disponible">Disponible</option>
            <option value="alerte">Alerte</option>
            <option value="rupture">Rupture</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Type</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Désignation</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Stock</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Seuil</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Prix Unit.</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Valeur Stock</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun article trouvé
                </td>
              </tr>
            ) : (
              filteredStocks.map((item, index) => {
                const statut = getStatutStock(item.stock, item.seuil);
                const valeur = item.stock * item.prix;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280' }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: item.type === 'monture' ? '#dbeafe' : '#fce7f3',
                        color: item.type === 'monture' ? '#1e40af' : '#be185d',
                      }}>
                        {item.type === 'monture' ? 'Monture' : 'Accessoire'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#374151' }}>{item.designation}</td>
                    <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center', fontWeight: '600' }}>{item.stock}</td>
                    <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center', color: '#6b7280' }}>{item.seuil}</td>
                    <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right' }}>{item.prix.toLocaleString('fr-FR')} F</td>
                    <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: '600' }}>{valeur.toLocaleString('fr-FR')} F</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: `${getStatutColor(statut)}20`,
                        color: getStatutColor(statut),
                      }}>
                        {getStatutLabel(statut)}
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
  );
}
