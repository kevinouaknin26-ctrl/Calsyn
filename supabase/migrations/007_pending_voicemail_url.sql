-- Migration 007 — voicemail drop sans latence
-- Kevin peut "armer" un drop pendant l'appel (avant AMD). amd-callback pose
-- automatiquement le TwiML <Play>+<Hangup/> pile quand machine_end_beep est
-- reçu, sans round-trip frontend. Latence = 0 entre bip et Play.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS pending_voicemail_url text;
COMMENT ON COLUMN calls.pending_voicemail_url IS
  'URL audio armée par le SDR via le bouton voicemail drop. amd-callback pose'
  ' ce voicemail sur le leg prospect dès machine_end_beep.';
