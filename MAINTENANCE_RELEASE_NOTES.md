# Version maintenance — 2026-09-11

## Incident corrigé
L'alerte « La vente est enregistrée, mais la sortie de stock n'a pas été confirmée » provenait d'un flux où la vente et le mouvement de stock étaient deux écritures séparées. Le mouvement pouvait être rejeté après l'enregistrement de la vente.

## Correctifs inclus
- IDs des mouvements de stock remplacés par des UUID déterministes compatibles avec les colonnes PostgreSQL UUID/TEXT.
- Idempotence conservée pour éviter les doublons lors des retries.
- Confirmation serveur par relecture après chaque mouvement.
- 4 tentatives avec backoff au lieu de 3.
- Session Supabase résolue avant toute écriture stock.
- Même durcissement appliqué aux distributions, transferts, ventes et retours.
- Liste des 9 magasins de référence protégée contre une ancienne configuration locale/cloud limitée à 7.
- SQL de maintenance non destructif ajouté pour le schéma, les index et la RLS de `mouvements_stock`.
- Les correctifs existants de déconnexion 10 minutes et de PDF/Excel (Règlement / N° Reçu) sont conservés.
