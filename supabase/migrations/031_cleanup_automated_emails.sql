-- ════════════════════════════════════════════════════════════════
-- Cleanup one-shot : purge les prospects auto-créés depuis Gmail qui
-- correspondent à des emails automatisés (newsletters, notifications,
-- mailer-daemon, Notion, LinkedIn jobs, etc.) + fonction merge par nom.
--
-- À exécuter manuellement après l'ajout du filter isAutomatedEmail.
-- ════════════════════════════════════════════════════════════════

-- 1. Soft-delete des prospects automatisés dans la liste "Mails"
WITH mail_lists AS (
  SELECT id FROM prospect_lists WHERE name = 'Mails' AND deleted_at IS NULL
)
UPDATE prospects SET deleted_at = now()
WHERE list_id IN (SELECT id FROM mail_lists)
  AND deleted_at IS NULL
  AND (
    email ~* '(noreply|no-reply|donotreply|postmaster|mailer-daemon|notification|notify|alert|bot@|automated|newsletter|webmaster|do-not-reply)'
    OR email ~* '@(notion\.so|mail\.notion\.so|slack\.com|github\.com|gitlab\.com|asana\.com|trello\.com|mailchimp|sendgrid|sendinblue|mailgun|amazonses|substack|calendar-notification|mail-noreply|twitter\.com|facebookmail|linkedin\.com|instagram\.com|youtube\.com|medium\.com|meetup\.com|eventbrite|stripe\.com|paypal\.com|figma\.com|zoom\.us|hubspot\.com|pipedrive|spotify|amazon\.|apple\.com|icloud\.com|monday\.com|clickup\.com|intercom\.io)$'
  );

-- 2. Fonction de fusion par nom normalisé (à appeler par org)
CREATE OR REPLACE FUNCTION merge_duplicate_prospects_by_name(p_org_id UUID)
RETURNS TABLE(canonical_id UUID, merged_count INT, names TEXT[]) AS $$
DECLARE
  cluster RECORD;
  canonical_row RECORD;
  dup_row RECORD;
  merged INT;
  cluster_names TEXT[];
  unique_emails TEXT[];
  e1 TEXT; e2 TEXT; e3 TEXT;
BEGIN
  FOR cluster IN
    SELECT lower(translate(trim(regexp_replace(name, '\s+', ' ', 'g')),
      'àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ',
      'aaaeeeeiioouuuycaaaeeeeiioouuuyc')) AS norm
    FROM prospects
    WHERE organisation_id = p_org_id AND deleted_at IS NULL
      AND name IS NOT NULL AND length(trim(name)) > 2
    GROUP BY 1
    HAVING count(*) > 1 AND position(' ' in lower(translate(trim(regexp_replace(name, '\s+', ' ', 'g')),
      'àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ',
      'aaaeeeeiioouuuycaaaeeeeiioouuuyc'))) > 0
  LOOP
    SELECT * INTO canonical_row FROM prospects
    WHERE organisation_id = p_org_id AND deleted_at IS NULL
      AND lower(translate(trim(regexp_replace(name, '\s+', ' ', 'g')),
        'àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ',
        'aaaeeeeiioouuuycaaaeeeeiioouuuyc')) = cluster.norm
    ORDER BY created_at ASC LIMIT 1;
    merged := 0;
    cluster_names := ARRAY[canonical_row.name];
    unique_emails := ARRAY[]::TEXT[];
    IF canonical_row.email IS NOT NULL THEN unique_emails := array_append(unique_emails, canonical_row.email); END IF;
    IF canonical_row.email2 IS NOT NULL AND canonical_row.email2 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, canonical_row.email2); END IF;
    IF canonical_row.email3 IS NOT NULL AND canonical_row.email3 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, canonical_row.email3); END IF;
    FOR dup_row IN
      SELECT * FROM prospects
      WHERE organisation_id = p_org_id AND deleted_at IS NULL
        AND lower(translate(trim(regexp_replace(name, '\s+', ' ', 'g')),
          'àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ',
          'aaaeeeeiioouuuycaaaeeeeiioouuuyc')) = cluster.norm
        AND id <> canonical_row.id
    LOOP
      cluster_names := array_append(cluster_names, dup_row.name);
      IF dup_row.email IS NOT NULL AND dup_row.email <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email); END IF;
      IF dup_row.email2 IS NOT NULL AND dup_row.email2 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email2); END IF;
      IF dup_row.email3 IS NOT NULL AND dup_row.email3 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email3); END IF;
      UPDATE messages SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
      INSERT INTO prospect_list_memberships (prospect_id, list_id, organisation_id, added_at)
      SELECT canonical_row.id, list_id, organisation_id, COALESCE(added_at, now())
      FROM prospect_list_memberships WHERE prospect_id = dup_row.id
      ON CONFLICT (prospect_id, list_id) DO NOTHING;
      UPDATE prospects SET deleted_at = now() WHERE id = dup_row.id;
      merged := merged + 1;
    END LOOP;
    e1 := unique_emails[1]; e2 := unique_emails[2]; e3 := unique_emails[3];
    UPDATE prospects SET email = e1, email2 = e2, email3 = e3 WHERE id = canonical_row.id;
    canonical_id := canonical_row.id;
    merged_count := merged;
    names := cluster_names;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
