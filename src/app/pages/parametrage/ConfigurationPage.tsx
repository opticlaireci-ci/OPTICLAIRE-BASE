import { logger } from '../../utils/logger';
import { useState, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLiveData } from '../../hooks/useLiveData';
import { forcSync } from '../../services/syncService';
import { TENANT } from '../../config/tenant';

interface ConfigurationData {
  // Informations entreprise
  nomEntreprise: string;
  telephone1: string;
  telephone2: string;
  telephone3: string;
  email: string;
  ville: string;
  adresse: string;
  corps: string;
  menu: string;
  barreNotification: string;

  // Options d'affichage pour chaque type de document
  commandes: {
    enTete: boolean;
    barrePiedPage: boolean;
    piedPage: boolean;
  };
  factures: {
    enTete: boolean;
    barrePiedPage: boolean;
    piedPage: boolean;
  };
  releves: {
    enTete: boolean;
    barrePiedPage: boolean;
    piedPage: boolean;
  };
  autres: {
    enTete: boolean;
    barrePiedPage: boolean;
    piedPage: boolean;
  };

  // Contenus personnalisés
  enTeteContent: string;
  barrePiedPageContent: string;
  piedPageContent: string;
  piedPageFooter: string;
}

const LS_KEY = 'leclaire_configuration';

export function ConfigurationPage() {
  const navigate = useNavigate();
  const [diagEnCours, setDiagEnCours] = useState(false);

  // Diagnostic de synchronisation : force un push + pull cloud et rapporte le
  // résultat. Remplace l'ancien lien vers une page inexistante (/diagnostic-supabase).
  async function lancerDiagnostic() {
    setDiagEnCours(true);
    try {
      await forcSync();
      alert('✅ Synchronisation forcée réussie. Vos données sont à jour sur tous les appareils.');
    } catch (err) {
      alert(`❌ Échec de la synchronisation : ${(err as Error)?.message || err}`);
    } finally {
      setDiagEnCours(false);
    }
  }
  // Objet unique stocké comme tableau à un élément (source de vérité Firestore).
  const [rows, setRows] = useLiveData<ConfigurationData>(LS_KEY, []);
  const [config, setConfig] = useState<ConfigurationData>({
    nomEntreprise: TENANT.nom,
    telephone1: '+225 07 15 15 25 25',
    telephone2: '',
    telephone3: '',
    email: TENANT.siege.email,
    ville: 'Abidjan',
    adresse: '8 Pool, Rond-point de la Rivera Palmeraie',
    corps: '',
    menu: '',
    barreNotification: '',
    commandes: { enTete: true, barrePiedPage: true, piedPage: true },
    factures: { enTete: true, barrePiedPage: true, piedPage: true },
    releves: { enTete: true, barrePiedPage: true, piedPage: true },
    autres: { enTete: true, barrePiedPage: true, piedPage: true },
    enTeteContent: '',
    barrePiedPageContent: '',
    piedPageContent: '',
    piedPageFooter: `${TENANT.siege.telephone} | ${TENANT.siege.email} | ${TENANT.siege.adresse}`,
  });

  // Synchronise l'état d'édition local avec la donnée Firestore temps réel.
  useEffect(() => {
    if (rows[0]) setConfig(rows[0]);
  }, [rows]);

  const handleSave = () => {
    try {
      setRows([config]);
      alert('Configuration enregistrée avec succès');
    } catch (error) {
      logger.error('Erreur enregistrement:', error);
      alert('Erreur lors de l\'enregistrement');
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* BOUTONS D'ACCÈS RAPIDE SMS */}
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginBottom: '24px',
        border: '3px solid #2563eb'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
          📱 Configuration SMS Automatique
        </h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/parametrage/configuration-sms')}
            style={{
              padding: '16px 32px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            <span style={{ fontSize: '24px' }}>⚙️</span>
            <span>CONFIGURATION SMS AUTOMATIQUE</span>
          </button>

          <button
            onClick={() => navigate('/parametrage/message-sms')}
            style={{
              padding: '16px 32px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            <span style={{ fontSize: '24px' }}>💬</span>
            <span>RAPPORT SMS</span>
          </button>
        </div>
        <p style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
          ℹ️ Cliquez sur "CONFIGURATION SMS AUTOMATIQUE" pour activer/désactiver l'envoi automatique de SMS aux nouveaux clients
        </p>
      </div>

      {/* DIAGNOSTIC SUPABASE */}
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginBottom: '24px',
        border: '3px solid #ef4444'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
          🔧 Diagnostic Synchronisation Multi-Appareils
        </h2>
        <button
          onClick={lancerDiagnostic}
          disabled={diagEnCours}
          style={{
            padding: '16px 32px',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
        >
          <span style={{ fontSize: '24px' }}>🧪</span>
          <span>{diagEnCours ? 'DIAGNOSTIC EN COURS…' : 'DIAGNOSTIC SUPABASE'}</span>
        </button>
        <p style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
          ⚠️ Si vos données ne se synchronisent pas entre vos appareils, cliquez ici pour diagnostiquer le problème
        </p>
      </div>

      <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#6b7280' }}>
          Paramétrage: {TENANT.nom}
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '32px' }}>
          {/* Left Column - Logo and Save Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Logo */}
            <div style={{
              width: '120px',
              height: '120px',
              backgroundColor: '#000',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>
              LeClaire
            </div>

            {/* Upload Button */}
            <button
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '14px',
              }}
            >
              <Upload size={16} />
            </button>

            {/* Save Button */}
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

          {/* Right Column - Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Nom de l'entreprise */}
            <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' }}>
              <input
                type="text"
                value={config.nomEntreprise}
                onChange={(e) => setConfig({ ...config, nomEntreprise: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '600',
                  outline: 'none',
                }}
              />
            </div>

            {/* Téléphones */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', alignItems: 'center' }}>
              <label style={{ fontSize: '14px' }}>Téléphone I</label>
              <input
                type="text"
                value={config.telephone1}
                onChange={(e) => setConfig({ ...config, telephone1: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />

              <label style={{ fontSize: '14px' }}>Téléphone II</label>
              <input
                type="text"
                value={config.telephone2}
                onChange={(e) => setConfig({ ...config, telephone2: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />

              <label style={{ fontSize: '14px' }}>Téléphone III</label>
              <input
                type="text"
                value={config.telephone3}
                onChange={(e) => setConfig({ ...config, telephone3: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />

              <label style={{ fontSize: '14px' }}>Email</label>
              <input
                type="email"
                value={config.email}
                onChange={(e) => setConfig({ ...config, email: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />

              <label style={{ fontSize: '14px' }}>Ville</label>
              <input
                type="text"
                value={config.ville}
                onChange={(e) => setConfig({ ...config, ville: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />

              <label style={{ fontSize: '14px' }}>Adresse</label>
              <input
                type="text"
                value={config.adresse}
                onChange={(e) => setConfig({ ...config, adresse: e.target.value })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Corps, Menu, Barre notification */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                  Corps <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={config.corps}
                  onChange={(e) => setConfig({ ...config, corps: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                  Menu <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={config.menu}
                  onChange={(e) => setConfig({ ...config, menu: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                  Barre de notification <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={config.barreNotification}
                  onChange={(e) => setConfig({ ...config, barreNotification: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: '#06b6d4',
                    color: '#fff',
                  }}
                />
              </div>
            </div>

            {/* Document Options */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
              {/* Commandes */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px' }}>Commandes</label>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.commandes.enTete}
                      onChange={(e) => setConfig({ ...config, commandes: { ...config.commandes, enTete: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>En-tête</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.commandes.barrePiedPage}
                      onChange={(e) => setConfig({ ...config, commandes: { ...config.commandes, barrePiedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Barre Pied de Page</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.commandes.piedPage}
                      onChange={(e) => setConfig({ ...config, commandes: { ...config.commandes, piedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Pied de Page</span>
                  </label>
                </div>
              </div>

              {/* Factures */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px' }}>Factures</label>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.factures.enTete}
                      onChange={(e) => setConfig({ ...config, factures: { ...config.factures, enTete: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>En-tête</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.factures.barrePiedPage}
                      onChange={(e) => setConfig({ ...config, factures: { ...config.factures, barrePiedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Barre Pied de Page</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.factures.piedPage}
                      onChange={(e) => setConfig({ ...config, factures: { ...config.factures, piedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Pied de Page</span>
                  </label>
                </div>
              </div>

              {/* Relevés */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px' }}>Relevés</label>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.releves.enTete}
                      onChange={(e) => setConfig({ ...config, releves: { ...config.releves, enTete: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>En-tête</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.releves.barrePiedPage}
                      onChange={(e) => setConfig({ ...config, releves: { ...config.releves, barrePiedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Barre Pied de Page</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.releves.piedPage}
                      onChange={(e) => setConfig({ ...config, releves: { ...config.releves, piedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Pied de Page</span>
                  </label>
                </div>
              </div>

              {/* Autres */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
                <label style={{ fontSize: '14px' }}>Autres</label>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.autres.enTete}
                      onChange={(e) => setConfig({ ...config, autres: { ...config.autres, enTete: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>En-tête</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.autres.barrePiedPage}
                      onChange={(e) => setConfig({ ...config, autres: { ...config.autres, barrePiedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Barre Pied de Page</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.autres.piedPage}
                      onChange={(e) => setConfig({ ...config, autres: { ...config.autres, piedPage: e.target.checked } })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px' }}>Pied de Page</span>
                  </label>
                </div>
              </div>

              {/* Content Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                    En-tête <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={config.enTeteContent}
                    onChange={(e) => setConfig({ ...config, enTeteContent: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                    Barre Pied de Page <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={config.barrePiedPageContent}
                    onChange={(e) => setConfig({ ...config, barrePiedPageContent: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: '#000',
                      color: '#fff',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                    Pied de Page <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={config.piedPageContent}
                    onChange={(e) => setConfig({ ...config, piedPageContent: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Footer Text */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                  Pied de Page
                </label>
                <textarea
                  value={config.piedPageFooter}
                  onChange={(e) => setConfig({ ...config, piedPageFooter: e.target.value })}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
