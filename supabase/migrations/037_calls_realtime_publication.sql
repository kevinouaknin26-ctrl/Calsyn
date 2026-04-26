-- ════════════════════════════════════════════════════════════════
-- Ajoute calls à la publication supabase_realtime pour permettre
-- le toast notification en temps réel sur les missed calls
-- (no_answer / voicemail / missed_incoming).
-- ════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE calls;
