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
import { api } from '../../services/api';
const GridAny = Grid as any;

export function SelectMagasinPage() {
  const navigate = useNavigate();
  const [magasins, setMagasins] = useState<any[]>(() => {
    try { const r = localStorage.getItem('leclaire_magasins'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem('leclaire_magasins'); } catch { return true; }
  });

  useEffect(() => {
    loadMagasins();
  }, []);

  const loadMagasins = async () => {
    try {
      const data = await api.getAll('magasins');
      setMagasins(data);
    } catch (error) {
      logger.error('Error loading magasins:', error);
    } finally {
      setLoading(false);
    }
  };

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
