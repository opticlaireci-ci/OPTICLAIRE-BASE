import { logger } from '../../utils/logger';
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
} from '@mui/material';
import { Store } from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { getMagasins, saveMagasins, type Magasin } from '../../constants/magasins';
import { loadFromSupabase, subscribeToChanges } from '../../services/supabaseRealtime';
const GridAny = Grid as any;

export function SelectMagasinPage() {
  const navigate = useNavigate();
  const [magasins, setMagasins] = useState<Magasin[]>(() => getMagasins());
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const appliquerMagasins = (liste: Magasin[]) => {
      // Une seule source logique : le registre local enrichi par le cloud.
      // Toujours fusionner avec les magasins par défaut : un snapshot cloud
      // ancien/incomplet ne doit jamais faire disparaître des magasins.
      const local = getMagasins();
      const sources = [local, Array.isArray(liste) ? liste : []];
      const uniques = Array.from(
        new Map(
          sources.flat()
            .filter(m => m && m.id)
            .map(m => {
              let id = String(m.id).trim().toLowerCase();
              if (id === 'cocody') id = 'bouake';
              if (id === 'marcory') id = 'yopougon-gandi';
              return [id, { ...m, id }];
            }),
        ).values(),
      );
      if (mounted) setMagasins(uniques);
      if (uniques.length > 0) {
        try { saveMagasins(uniques); } catch { /* cache local non bloquant */ }
      }
    };

    const chargerDepuisCloud = async () => {
      try {
        // IMPORTANT : ne plus lire la collection `magasins`, qui était différente
        // du registre utilisé par GestionMagasinsPage. Cette double source causait
        // l'affichage intermittent de 7 ou 9 magasins selon le navigateur.
        const cloud = await loadFromSupabase<Magasin>('leclaire_magasins', []);
        const local = getMagasins();
        const parId = new Map<string, Magasin>();
        for (const m of local) if (m?.id) parId.set(String(m.id).trim().toLowerCase(), m);
        for (const m of cloud) if (m?.id) {
          let id = String(m.id).trim().toLowerCase();
          if (id === 'cocody') id = 'bouake';
          if (id === 'marcory') id = 'yopougon-gandi';
          if (!parId.has(id)) parId.set(id, { ...m, id });
        }
        appliquerMagasins(Array.from(parId.values()));
      } catch (error) {
        logger.error('Erreur chargement magasins cloud:', error);
        if (mounted) appliquerMagasins(getMagasins());
      }
    };

    chargerDepuisCloud();
    const unsub = subscribeToChanges('leclaire_magasins', (value) => {
      if (Array.isArray(value)) appliquerMagasins(value);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'leclaire_magasins') appliquerMagasins(getMagasins());
    };
    const onSync = () => appliquerMagasins(getMagasins());
    window.addEventListener('storage', onStorage);
    window.addEventListener('supabase-realtime-update', onSync as EventListener);
    window.addEventListener('leclaire-sync-update', onSync as EventListener);

    return () => {
      mounted = false;
      unsub();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('supabase-realtime-update', onSync as EventListener);
      window.removeEventListener('leclaire-sync-update', onSync as EventListener);
    };
  }, []);

  const handleSelectMagasin = (magasinId: string) => {
    navigate(`/magasin/${magasinId}/dashboard`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Sélectionnez un Magasin
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
        Choisissez le magasin à gérer
      </Typography>

      <GridAny container spacing={3}>
        {magasins.map((magasin) => (
          <GridAny item xs={12} sm={6} md={4} key={magasin.id}>
            <Card>
              <CardActionArea onClick={() => handleSelectMagasin(magasin.id)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Store sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                    <Box>
                      <Typography variant="h6">{magasin.nom}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {magasin.ville}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {magasin.adresse}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    📞 {magasin.telephone}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </GridAny>
        ))}
      </GridAny>
    </Box>
  );
}
