import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { chargerCatalogue } from '../services/catalogueService';

interface Product {
  id: string;
  type: 'Monture' | 'Accessoire';
  codeBarre?: string;
  reference?: string;
  designation: string;
  marque?: string;
  couleur?: string;
  stock: number;
  prixVente: number;
  magasin: string;
}

export function RecherchePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // Filtres
  const [codeBarre, setCodeBarre] = useState('');
  const [marque, setMarque] = useState('');
  const [montureAccessoire, setMontureAccessoire] = useState('');
  const [couleur, setCouleur] = useState('');

  // Liste des marques uniques
  const [marques, setMarques] = useState<string[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, codeBarre, marque, montureAccessoire, couleur]);

  const loadProducts = async () => {
    // Lecture DIRECTE Firestore (catalogue global partagé) → identique sur tous
    // les navigateurs, comme le stock.
    const allProducts: Product[] = [];
    try {
      const [montures, accessoires] = await Promise.all([
        chargerCatalogue('catalogue_montures'),
        chargerCatalogue('catalogue_accessoires'),
      ]);

      montures.forEach((monture: any) => {
        allProducts.push({
          id: `monture-${monture.id || Date.now()}`,
          type: 'Monture',
          codeBarre: monture.codeBarre || monture.code || '',
          reference: monture.reference || '',
          designation: monture.designation || monture.nom || monture.modele || 'Monture',
          marque: monture.marque || '',
          couleur: monture.couleur || '',
          stock: monture.quantite || monture.stock || 0,
          prixVente: monture.prixVente || monture.prix || 0,
          magasin: monture.magasin || 'Global',
        });
      });

      accessoires.forEach((accessoire: any) => {
        allProducts.push({
          id: `accessoire-${accessoire.id || Date.now()}`,
          type: 'Accessoire',
          codeBarre: accessoire.codeBarre || accessoire.code || '',
          reference: accessoire.reference || '',
          designation: accessoire.designation || accessoire.nom || 'Accessoire',
          marque: accessoire.marque || '',
          couleur: accessoire.couleur || '',
          stock: accessoire.quantite || accessoire.stock || 0,
          prixVente: accessoire.prixVente || accessoire.prix || 0,
          magasin: accessoire.magasin || 'Global',
        });
      });
    } catch (err) {
      logger.error('Erreur chargement produits (catalogue):', err);
    }

    setProducts(allProducts);

    // Extraire les marques uniques
    const uniqueMarques = Array.from(new Set(allProducts.map(product => product.marque).filter(marque => marque)));
    setMarques(uniqueMarques.sort());
  };

  const filterProducts = () => {
    let filtered = [...products];

    if (codeBarre.trim()) {
      filtered = filtered.filter(p =>
        (p.codeBarre || '').toLowerCase().includes(codeBarre.toLowerCase()) ||
        (p.reference || '').toLowerCase().includes(codeBarre.toLowerCase())
      );
    }

    if (marque) {
      filtered = filtered.filter(p => p.marque === marque);
    }

    if (montureAccessoire.trim()) {
      filtered = filtered.filter(p =>
        p.designation.toLowerCase().includes(montureAccessoire.toLowerCase())
      );
    }

    if (couleur.trim()) {
      filtered = filtered.filter(p =>
        (p.couleur || '').toLowerCase().includes(couleur.toLowerCase())
      );
    }

    setFilteredProducts(filtered);
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Title */}
      <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px', color: '#1f2937' }}>
        Rechercher Montures || Accessoires
      </h1>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
            Code Barre
          </label>
          <input
            type="text"
            value={codeBarre}
            onChange={(e) => setCodeBarre(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
            Marque
          </label>
          <select
            value={marque}
            onChange={(e) => setMarque(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">Marque...</option>
            {marques.map(marque => (
              <option key={marque} value={marque}>{marque}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
            Monture Accessoire
          </label>
          <input
            type="text"
            value={montureAccessoire}
            onChange={(e) => setMontureAccessoire(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
            Couleur
          </label>
          <input
            type="text"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151', width: '40%' }}>
                Monture || Accessoire
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151', width: '15%' }}>
                Stock
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151', width: '20%' }}>
                Prix de Vente
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151', width: '25%' }}>
                Emplacement
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  Aucun produit trouvé
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937' }}>
                    <div>
                      <span style={{ fontWeight: '500' }}>{product.designation}</span>
                      {product.marque && (
                        <span style={{ color: '#6b7280', marginLeft: '8px' }}>({product.marque})</span>
                      )}
                    </div>
                    {product.couleur && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        Couleur: {product.couleur}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937' }}>
                    {product.stock}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937' }}>
                    {product.prixVente.toLocaleString('fr-FR')} F CFA
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937' }}>
                    {product.magasin}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Results count */}
      {filteredProducts.length > 0 && (
        <div style={{ marginTop: '16px', fontSize: '14px', color: '#6b7280' }}>
          {filteredProducts.length} produit(s) trouvé(s)
        </div>
      )}
    </div>
  );
}
