import { logger } from '../../utils/logger';
import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

interface ConditionsCommerciales {
  devisProforma: string;
  venteFacture: string;
  reglements: string;
}

const LS_KEY = 'leclaire_conditions_commerciales';

const DEFAULT_CONDITIONS: ConditionsCommerciales = {
  devisProforma: '',
  venteFacture: '',
  reglements: '',
};

export function ConditionCommercialePage() {
  // Objet unique stocké comme tableau à un élément (source de vérité Firestore).
  const [rows, setRows] = useLiveData<ConditionsCommerciales>(LS_KEY, []);
  const [conditions, setConditions] = useState<ConditionsCommerciales>(DEFAULT_CONDITIONS);

  // Synchronise l'état d'édition local avec la donnée Firestore temps réel.
  useEffect(() => {
    if (rows[0]) setConditions(rows[0]);
  }, [rows]);

  const loadConditions = () => {
    if (rows[0]) setConditions(rows[0]);
  };

  const handleSave = () => {
    try {
      setRows([conditions]);
      alert('Conditions commerciales enregistrées avec succès');
    } catch (error) {
      logger.error('Erreur enregistrement:', error);
      alert('Erreur lors de l\'enregistrement');
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '32px' }}>{TENANT.nom}</h1>

        {/* Conditions Devis | Proforma */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Conditions Devis | Proforma
          </h3>
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
            <textarea
              value={conditions.devisProforma}
              onChange={(e) => setConditions({ ...conditions, devisProforma: e.target.value })}
              style={{
                flex: 1,
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical',
                outline: 'none',
              }}
              placeholder="Entrez les conditions pour les devis et proforma..."
            />
            <button
              onClick={() => setConditions({ ...conditions, devisProforma: conditions.devisProforma + '\n' })}
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Conditions Vente | Facture */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Conditions Vente | Facture
          </h3>
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
            <textarea
              value={conditions.venteFacture}
              onChange={(e) => setConditions({ ...conditions, venteFacture: e.target.value })}
              style={{
                flex: 1,
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical',
                outline: 'none',
              }}
              placeholder="Entrez les conditions pour les ventes et factures..."
            />
            <button
              onClick={() => setConditions({ ...conditions, venteFacture: conditions.venteFacture + '\n' })}
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Conditions Règlements */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Conditions Règlements
          </h3>
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
            <textarea
              value={conditions.reglements}
              onChange={(e) => setConditions({ ...conditions, reglements: e.target.value })}
              style={{
                flex: 1,
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical',
                outline: 'none',
              }}
              placeholder="Entrez les conditions de règlement..."
            />
            <button
              onClick={() => setConditions({ ...conditions, reglements: conditions.reglements + '\n' })}
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => loadConditions()}
            style={{
              padding: '10px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Fermer
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
