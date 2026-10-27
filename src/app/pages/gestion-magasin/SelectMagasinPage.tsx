import { logger } from '../../utils/logger';
import { useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
} from '@mui/material';
import { Store } from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { synchroniserMagasins } from '../../services/supabaseRealtime';
import { useMagasins } from '../../hooks/useMagasins';
const GridAny = Grid as any;

export function SelectMagasinPage() {
  const navigate = useNavigate();
  // Une seule source : le registre des magasins (copie locale fusionnée avec le
  // serveur, sans jamais perdre un magasin), tenu à jour par useMagasins.
  const magasins = useMagasins();

  useEffect(() => {
    synchroniserMagasins().catch(error => logger.warn('Synchronisation des magasins impossible:', error));
  }, []);

  const handleSelectMagasin = (magasinId: string) => {
    navigate(`/magasin/${magasinId}/dashboard`);
  };

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
                      {/* Le magasin porte son nom dans `label` (`nom`/`ville` n'existent pas). */}
                      <Typography variant="h6">{magasin.label || magasin.id}</Typography>
                      {magasin.telephone && (
                        <Typography variant="body2" color="text.secondary">
                          {magasin.telephone}
                        </Typography>
                      )}
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
