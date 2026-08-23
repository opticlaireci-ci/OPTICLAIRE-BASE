// Paramètres modifiables de la page de connexion (titre, sous-titre, etc.)
// Persistés via useLiveData sous la clé ci-dessous (stockés dans un tableau à
// un seul élément pour rester compatible avec le hook typé T[]).

export const LOGIN_SETTINGS_KEY = 'leclaire_login_settings';

export interface LoginSettings {
  titre: string;
  sousTitre: string;
  slogan: string;
  piedDePage: string;
  noelActif: boolean; // chapeau de Noël sur le logo + neige sur toute la page
}

export const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  titre: 'BIENVENUE SUR OPTICLAIRE',
  sousTitre: 'VERSION 1.0',
  slogan: "Souriez, la vue c'est la vie 😃",
  piedDePage: '© 2024 OPTICLAIRE — Tous droits réservés',
  noelActif: false,
};
