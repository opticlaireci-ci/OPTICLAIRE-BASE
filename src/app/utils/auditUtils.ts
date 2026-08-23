import { logger } from './logger';
// Utilitaire pour gérer l'audit (créé par, modifié par)

export interface AuditInfo {
  [key: string]: any;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('leclaire_current_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return `${user.prenom} ${user.nom}`;
    }
  } catch (e) {
    logger.error('Erreur lecture utilisateur:', e);
  }
  return 'Système';
}

/**
 * Résout un nom d'utilisateur lisible à partir d'une valeur d'audit.
 * Certaines pages stockaient par erreur le JSON brut de `leclaire_current_user`
 * (ex: `{"id":"...","prenom":"Awa","nom":"Koné",...}`) au lieu du nom. On accepte
 * donc les deux formats : si la valeur ressemble à un objet utilisateur JSON, on
 * en extrait « Prénom Nom » ; sinon on renvoie la chaîne telle quelle.
 */
export function resolveUserName(value: any): string {
  if (!value) return '-';
  if (typeof value === 'object') {
    const n = `${value.prenom || ''} ${value.nom || ''}`.trim();
    return n || value.name || value.email || '-';
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('{') && s.includes('"')) {
      try {
        const u = JSON.parse(s);
        const n = `${u.prenom || ''} ${u.nom || ''}`.trim();
        return n || u.name || u.email || s;
      } catch { return s; }
    }
    return s || '-';
  }
  return String(value);
}

export function addCreateAudit<T extends AuditInfo>(data: T): T {
  const userName = getCurrentUser();
  const now = new Date().toISOString();

  return {
    ...data,
    createdBy: userName,
    createdAt: now,
    updatedBy: userName,
    updatedAt: now,
  };
}

export function addUpdateAudit<T extends AuditInfo>(data: T): T {
  const userName = getCurrentUser();
  const now = new Date().toISOString();

  return {
    ...data,
    updatedBy: userName,
    updatedAt: now,
  };
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function formatAuditInfo(auditInfo: AuditInfo): {
  created: string;
  updated: string;
} {
  const created = auditInfo.createdBy && auditInfo.createdAt
    ? `${auditInfo.createdBy} le ${formatDate(auditInfo.createdAt)}`
    : '-';

  const updated = auditInfo.updatedBy && auditInfo.updatedAt
    ? `${auditInfo.updatedBy} le ${formatDate(auditInfo.updatedAt)}`
    : '-';

  return { created, updated };
}

// Interface pour le log de suppression
export interface DeleteLog {
  id: string;
  entityType: string;
  entityId: string;
  entityData: any;
  deletedBy: string;
  deletedAt: string;
}

// Fonction pour logger une suppression
export function logDeletion(entityType: string, entityId: string, entityData: any): void {
  const userName = getCurrentUser();
  const now = new Date().toISOString();

  const deleteLog: DeleteLog = {
    id: `${Date.now()}_${Math.random()}`,
    entityType,
    entityId,
    entityData,
    deletedBy: userName,
    deletedAt: now,
  };

  try {
    const existingLogs = JSON.parse(localStorage.getItem('leclaire_deletion_logs') || '[]');
    existingLogs.push(deleteLog);
    localStorage.setItem('leclaire_deletion_logs', JSON.stringify(existingLogs));

    // Notification console pour debugging
    logger.log(`✅ Suppression tracée: ${entityType} #${entityId} par ${userName}`);
  } catch (error) {
    logger.error('Erreur lors du log de suppression:', error);
  }
}

// Fonction pour afficher une notification visuelle
export function showAuditNotification(action: 'create' | 'update' | 'delete', entityType: string): void {
  const userName = getCurrentUser();
  const messages = {
    create: `✅ Création enregistrée par ${userName}`,
    update: `✏️ Modification enregistrée par ${userName}`,
    delete: `🗑️ Suppression enregistrée par ${userName}`,
  };

  const message = messages[action];

  // Créer une notification temporaire
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: ${action === 'delete' ? '#ef4444' : action === 'update' ? '#f59e0b' : '#10b981'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-weight: 600;
    font-size: 14px;
    animation: slideInRight 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  // Retirer après 3 secondes
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Ajouter les animations CSS si elles n'existent pas
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
