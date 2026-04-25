-- Ajoute next_action_type pour distinguer le type d'action programmée
-- (rappel | rdv | rdv_2 | rdv_3 | retour_demande)
-- Utilisé par UpcomingRdvBar et le widget "Programmer une action".
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS next_action_type TEXT;
