import { useState } from 'react';
import { MapPin, Phone, Mail, Navigation, Copy, ExternalLink } from 'lucide-react';
import { getMagasins } from '../constants/magasins';
import { TENANT } from '../config/tenant';

interface MagasinGeo {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
  telephone: string;
  email?: string;
  latitude: number;
  longitude: number;
}

// Coordonnées GPS connues des magasins
const COORDS_GPS: Record<string, { lat: number; lng: number; ville: string }> = {
  abobo: { lat: 5.4145, lng: -4.0156, ville: 'Abidjan' },
  faya: { lat: 5.3364, lng: -4.0267, ville: 'Abidjan' },
  koumassi: { lat: 5.2892, lng: -3.9469, ville: 'Abidjan' },
  palmeraie: { lat: 5.3515, lng: -3.9870, ville: 'Abidjan' },
  yopougon: { lat: 5.3364, lng: -4.0821, ville: 'Abidjan' },
  bingerville: { lat: 5.3575, lng: -3.9100, ville: 'Bingerville' },
  man: { lat: 7.4042, lng: -7.5544, ville: 'Man' },
};

// Créer la liste des magasins avec coordonnées
const allMagasins = getMagasins();
const MAGASINS: MagasinGeo[] = allMagasins.map(magasin => {
  const coords = COORDS_GPS[magasin.id] || { lat: 5.3600, lng: -4.0083, ville: 'Abidjan' };
  return {
    id: magasin.id,
    nom: magasin.label,
    adresse: magasin.adresse || `${magasin.label}`,
    ville: coords.ville,
    telephone: magasin.telephone || '07 15 15 25 25',
    email: magasin.email || '',
    latitude: magasin.latitude || coords.lat,
    longitude: magasin.longitude || coords.lng,
  };
});

export function GeolocalisationPage() {
  const [selectedMagasin, setSelectedMagasin] = useState<MagasinGeo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCoordinates = (magasin: MagasinGeo) => {
    const coords = `${magasin.latitude}, ${magasin.longitude}`;
    navigator.clipboard.writeText(coords);
    setCopiedId(magasin.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenMaps = (magasin: MagasinGeo) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${magasin.latitude},${magasin.longitude}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Géolocalisation</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
          Localisez tous les magasins {TENANT.nom}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Liste des magasins */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            Liste des Magasins ({MAGASINS.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {MAGASINS.map((magasin) => (
              <div
                key={magasin.id}
                onClick={() => setSelectedMagasin(magasin)}
                style={{
                  backgroundColor: selectedMagasin?.id === magasin.id ? '#eff6ff' : '#fff',
                  padding: '20px',
                  borderRadius: '8px',
                  border: selectedMagasin?.id === magasin.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MapPin size={24} color="#3b82f6" />
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{magasin.nom}</h3>
                  </div>
                </div>

                <div style={{ marginLeft: '36px' }}>
                  <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0' }}>
                    📍 {magasin.adresse}, {magasin.ville}
                  </p>
                  <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} /> {magasin.telephone}
                  </p>
                  {magasin.email && (
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Mail size={14} /> {magasin.email}
                    </p>
                  )}
                  <p style={{ fontSize: '14px', color: '#3b82f6', margin: '8px 0 0 0', fontWeight: '600' }}>
                    Coordonnées: {magasin.latitude}, {magasin.longitude}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Détails et actions */}
        <div>
          {selectedMagasin ? (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
                Détails du Magasin
              </h2>

              {/* Carte info */}
              <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <MapPin size={28} color="#fff" />
                  </div>
                  <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{selectedMagasin.nom}</h3>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>ADRESSE</p>
                  <p style={{ fontSize: '14px', margin: 0 }}>{selectedMagasin.adresse}</p>
                  <p style={{ fontSize: '14px', margin: 0 }}>{selectedMagasin.ville}</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>TÉLÉPHONE</p>
                  <p style={{ fontSize: '14px', margin: 0 }}>{selectedMagasin.telephone}</p>
                </div>

                {selectedMagasin.email && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>EMAIL</p>
                    <p style={{ fontSize: '14px', margin: 0 }}>{selectedMagasin.email}</p>
                  </div>
                )}

                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>COORDONNÉES GPS</p>
                  <p style={{ fontSize: '14px', margin: 0, fontFamily: 'monospace', color: '#3b82f6', fontWeight: '600' }}>
                    {selectedMagasin.latitude}, {selectedMagasin.longitude}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => handleOpenMaps(selectedMagasin)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px 20px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  <ExternalLink size={18} />
                  Ouvrir dans Google Maps
                </button>

                <button
                  onClick={() => handleCopyCoordinates(selectedMagasin)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px 20px',
                    backgroundColor: copiedId === selectedMagasin.id ? '#10b981' : '#fff',
                    color: copiedId === selectedMagasin.id ? '#fff' : '#374151',
                    border: copiedId === selectedMagasin.id ? 'none' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  <Copy size={18} />
                  {copiedId === selectedMagasin.id ? 'Coordonnées copiées !' : 'Copier les coordonnées'}
                </button>

                <button
                  onClick={() => {
                    const message = `📍 ${selectedMagasin.nom}\n${selectedMagasin.adresse}, ${selectedMagasin.ville}\n📞 ${selectedMagasin.telephone}\n🗺️ https://www.google.com/maps/search/?api=1&query=${selectedMagasin.latitude},${selectedMagasin.longitude}`;
                    navigator.clipboard.writeText(message);
                    alert('Informations copiées !');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px 20px',
                    backgroundColor: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  <Navigation size={18} />
                  Partager les informations
                </button>
              </div>

              {/* Carte visuelle */}
              <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>APERÇU CARTE</p>
                <div style={{
                  width: '100%',
                  height: '300px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${selectedMagasin.latitude},${selectedMagasin.longitude}&zoom=15`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#fff',
              padding: '60px 40px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
            }}>
              <MapPin size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
              <p style={{ fontSize: '16px', color: '#6b7280', margin: 0 }}>
                Sélectionnez un magasin pour voir les détails
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
