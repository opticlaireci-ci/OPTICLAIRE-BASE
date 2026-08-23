import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { AuditInfo, addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate } from '../utils/auditUtils';
import { useLiveData } from '../hooks/useLiveData';
import { AddButton } from '../components/AddButton';

interface ProfilUtilisateur extends AuditInfo {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  fonction: string;
  telephone: string;
  adresse: string;
  dateNaissance: string;
  dateEmbauche: string;
  chiffreAffaireObjectif: number;
  chiffreAffaireActuel: number;
  salaire: number;
  commission: number;
  statut: 'Actif' | 'Inactif';
  notes: string;
}

const LS_KEY = 'leclaire_profils_utilisateurs';

export function GestionProfilsPage() {
  const [profils, saveProfils] = useLiveData<ProfilUtilisateur>(LS_KEY, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfil, setEditingProfil] = useState<ProfilUtilisateur | null>(null);
  const [formData, setFormData] = useState<Partial<ProfilUtilisateur>>({
    nom: '',
    prenom: '',
    email: '',
    fonction: '',
    telephone: '',
    adresse: '',
    dateNaissance: '',
    dateEmbauche: '',
    chiffreAffaireObjectif: 0,
    chiffreAffaireActuel: 0,
    salaire: 0,
    commission: 0,
    statut: 'Actif',
    notes: '',
  });

  const handleOpenModal = (profil?: ProfilUtilisateur) => {
    if (profil) {
      setEditingProfil(profil);
      setFormData(profil);
    } else {
      setEditingProfil(null);
      setFormData({
        nom: '',
        prenom: '',
        email: '',
        fonction: '',
        telephone: '',
        adresse: '',
        dateNaissance: '',
        dateEmbauche: '',
        chiffreAffaireObjectif: 0,
        chiffreAffaireActuel: 0,
        salaire: 0,
        commission: 0,
        statut: 'Actif',
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProfil(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingProfil) {
      const updatedProfil = addUpdateAudit({
        ...editingProfil,
        ...formData,
      } as ProfilUtilisateur);
      const updated = profils.map(p =>
        p.id === editingProfil.id ? updatedProfil : p
      );
      saveProfils(updated);
      showAuditNotification('update', 'Profil Utilisateur');
    } else {
      const newProfil = addCreateAudit({
        id: Date.now().toString(),
        ...formData,
      } as ProfilUtilisateur);
      saveProfils([...profils, newProfil]);
      showAuditNotification('create', 'Profil Utilisateur');
    }

    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    const profilToDelete = profils.find(p => p.id === id);
    if (profilToDelete && confirm('Êtes-vous sûr de vouloir supprimer ce profil ?')) {
      logDeletion('ProfilUtilisateur', id, profilToDelete);
      saveProfils(profils.filter(p => p.id !== id));
      showAuditNotification('delete', 'Profil Utilisateur');
    }
  };

  const filteredProfils = profils.filter(p =>
    p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.fonction.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateProgression = (actuel: number, objectif: number) => {
    if (objectif === 0) return 0;
    return Math.min(100, (actuel / objectif) * 100);
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Gestion des Profils Utilisateurs</h1>
        <AddButton
          onClick={() => handleOpenModal()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#1a56db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          <Plus size={20} />
          Nouveau Profil
        </AddButton>
      </div>

      {/* Barre de recherche */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
        <input
          type="text"
          placeholder="Rechercher par nom, prénom, email ou fonction..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 10px 10px 40px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Liste des profils */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {filteredProfils.map(profil => {
          const progression = calculateProgression(profil.chiffreAffaireActuel, profil.chiffreAffaireObjectif);
          return (
            <div key={profil.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    {profil.prenom} {profil.nom}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>{profil.fonction}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleOpenModal(profil)}
                    style={{
                      padding: '6px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <Edit2 size={16} color="#6b7280" />
                  </button>
                  <button
                    onClick={() => handleDelete(profil.id)}
                    style={{
                      padding: '6px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
                <p style={{ margin: '4px 0' }}><strong>Email:</strong> {profil.email}</p>
                <p style={{ margin: '4px 0' }}><strong>Téléphone:</strong> {profil.telephone}</p>
                <p style={{ margin: '4px 0' }}><strong>Statut:</strong> <span style={{ color: profil.statut === 'Actif' ? '#10b981' : '#ef4444', fontWeight: '600' }}>{profil.statut}</span></p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Chiffre d'affaires</span>
                  <span style={{ fontWeight: '600' }}>{progression.toFixed(1)}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progression}%`, height: '100%', backgroundColor: progression >= 100 ? '#10b981' : '#3b82f6', transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  <span>Actuel: {profil.chiffreAffaireActuel.toLocaleString()} FCFA</span>
                  <span>Objectif: {profil.chiffreAffaireObjectif.toLocaleString()} FCFA</span>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: '#6b7280', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                <p style={{ margin: '2px 0' }}>Salaire: {profil.salaire.toLocaleString()} FCFA</p>
                <p style={{ margin: '2px 0' }}>Commission: {profil.commission}%</p>
              </div>

              {(profil.createdBy || profil.updatedBy) && (
                <div style={{ fontSize: '11px', color: '#9ca3af', paddingTop: '8px', marginTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                  {profil.createdBy && (
                    <p style={{ margin: '2px 0' }}>Créé par: {profil.createdBy} le {formatDate(profil.createdAt)}</p>
                  )}
                  {profil.updatedBy && (
                    <p style={{ margin: '2px 0' }}>Modifié par: {profil.updatedBy} le {formatDate(profil.updatedAt)}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                {editingProfil ? 'Modifier le Profil' : 'Nouveau Profil'}
              </h2>
              <button onClick={handleCloseModal} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Nom *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Prénom *</label>
                  <input
                    type="text"
                    required
                    value={formData.prenom}
                    onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Fonction *</label>
                  <input
                    type="text"
                    required
                    value={formData.fonction}
                    onChange={(e) => setFormData({ ...formData, fonction: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Téléphone</label>
                  <input
                    type="tel"
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Date de Naissance</label>
                  <input
                    type="date"
                    value={formData.dateNaissance}
                    onChange={(e) => setFormData({ ...formData, dateNaissance: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Adresse</label>
                <input
                  type="text"
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Date d'Embauche</label>
                  <input
                    type="date"
                    value={formData.dateEmbauche}
                    onChange={(e) => setFormData({ ...formData, dateEmbauche: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Statut</label>
                  <select
                    value={formData.statut}
                    onChange={(e) => setFormData({ ...formData, statut: e.target.value as 'Actif' | 'Inactif' })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  >
                    <option value="Actif">Actif</option>
                    <option value="Inactif">Inactif</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>CA Objectif (FCFA)</label>
                  <input
                    type="number"
                    value={formData.chiffreAffaireObjectif}
                    onChange={(e) => setFormData({ ...formData, chiffreAffaireObjectif: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>CA Actuel (FCFA)</label>
                  <input
                    type="number"
                    value={formData.chiffreAffaireActuel}
                    onChange={(e) => setFormData({ ...formData, chiffreAffaireActuel: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Salaire (FCFA)</label>
                  <input
                    type="number"
                    value={formData.salaire}
                    onChange={(e) => setFormData({ ...formData, salaire: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Commission (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.commission}
                    onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>

              {editingProfil && (editingProfil.createdBy || editingProfil.updatedBy) && (
                <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 8px 0' }}>Informations d'audit</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
                    {editingProfil.createdBy && (
                      <div>
                        <p style={{ margin: '0 0 2px 0', fontWeight: '600', color: '#374151' }}>Créé par</p>
                        <p style={{ margin: 0 }}>{editingProfil.createdBy}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>{formatDate(editingProfil.createdAt)}</p>
                      </div>
                    )}
                    {editingProfil.updatedBy && (
                      <div>
                        <p style={{ margin: '0 0 2px 0', fontWeight: '600', color: '#374151' }}>Modifié par</p>
                        <p style={{ margin: 0 }}>{editingProfil.updatedBy}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>{formatDate(editingProfil.updatedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    padding: '10px 20px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#1a56db',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  {editingProfil ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
