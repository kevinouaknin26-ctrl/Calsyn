-- ════════════════════════════════════════════════════════════════
-- RPC merge_prospects(canonical_id, dup_ids[]) — fusion manuelle
-- depuis le CRM. Réattache toutes les FKs, agrège emails/phones,
-- soft-delete les dups. Appelable via supabase.rpc().
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION merge_prospects(p_canonical_id UUID, p_dup_ids UUID[])
RETURNS TABLE(canonical_id UUID, merged_count INT) AS $$
DECLARE
  canonical_row RECORD;
  dup_row RECORD;
  unique_emails TEXT[];
  unique_phones TEXT[];
  e1 TEXT; e2 TEXT; e3 TEXT;
  ph1 TEXT; ph2 TEXT; ph3 TEXT; ph4 TEXT; ph5 TEXT;
  merged INT := 0;
BEGIN
  SELECT * INTO canonical_row FROM prospects WHERE id = p_canonical_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical prospect not found'; END IF;

  unique_emails := ARRAY[]::TEXT[];
  IF canonical_row.email IS NOT NULL THEN unique_emails := array_append(unique_emails, canonical_row.email); END IF;
  IF canonical_row.email2 IS NOT NULL AND canonical_row.email2 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, canonical_row.email2); END IF;
  IF canonical_row.email3 IS NOT NULL AND canonical_row.email3 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, canonical_row.email3); END IF;

  unique_phones := ARRAY[]::TEXT[];
  IF canonical_row.phone IS NOT NULL THEN unique_phones := array_append(unique_phones, canonical_row.phone); END IF;
  IF canonical_row.phone2 IS NOT NULL AND canonical_row.phone2 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, canonical_row.phone2); END IF;
  IF canonical_row.phone3 IS NOT NULL AND canonical_row.phone3 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, canonical_row.phone3); END IF;
  IF canonical_row.phone4 IS NOT NULL AND canonical_row.phone4 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, canonical_row.phone4); END IF;
  IF canonical_row.phone5 IS NOT NULL AND canonical_row.phone5 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, canonical_row.phone5); END IF;

  FOR dup_row IN SELECT * FROM prospects WHERE id = ANY(p_dup_ids) AND id <> p_canonical_id LOOP
    IF dup_row.email IS NOT NULL AND dup_row.email <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email); END IF;
    IF dup_row.email2 IS NOT NULL AND dup_row.email2 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email2); END IF;
    IF dup_row.email3 IS NOT NULL AND dup_row.email3 <> ALL(unique_emails) THEN unique_emails := array_append(unique_emails, dup_row.email3); END IF;
    IF dup_row.phone IS NOT NULL AND dup_row.phone <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, dup_row.phone); END IF;
    IF dup_row.phone2 IS NOT NULL AND dup_row.phone2 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, dup_row.phone2); END IF;
    IF dup_row.phone3 IS NOT NULL AND dup_row.phone3 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, dup_row.phone3); END IF;
    IF dup_row.phone4 IS NOT NULL AND dup_row.phone4 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, dup_row.phone4); END IF;
    IF dup_row.phone5 IS NOT NULL AND dup_row.phone5 <> ALL(unique_phones) THEN unique_phones := array_append(unique_phones, dup_row.phone5); END IF;

    UPDATE prospects SET
      company = COALESCE(NULLIF(company,''), dup_row.company),
      title = COALESCE(NULLIF(title,''), dup_row.title),
      sector = COALESCE(NULLIF(sector,''), dup_row.sector),
      address = COALESCE(NULLIF(address,''), dup_row.address),
      city = COALESCE(NULLIF(city,''), dup_row.city),
      postal_code = COALESCE(NULLIF(postal_code,''), dup_row.postal_code),
      country = COALESCE(NULLIF(country,''), dup_row.country),
      linkedin_url = COALESCE(NULLIF(linkedin_url,''), dup_row.linkedin_url),
      website_url = COALESCE(NULLIF(website_url,''), dup_row.website_url),
      notes = COALESCE(NULLIF(notes,''), dup_row.notes),
      call_count = coalesce(call_count,0) + coalesce(dup_row.call_count,0),
      last_call_at = GREATEST(last_call_at, dup_row.last_call_at),
      last_call_outcome = COALESCE(last_call_outcome, dup_row.last_call_outcome),
      rdv_date = COALESCE(rdv_date, dup_row.rdv_date),
      meeting_booked = COALESCE(meeting_booked, dup_row.meeting_booked),
      do_not_call = (do_not_call OR coalesce(dup_row.do_not_call, false)),
      snoozed_until = GREATEST(snoozed_until, dup_row.snoozed_until)
    WHERE id = canonical_row.id;

    UPDATE messages SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE calls SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE sms_messages SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE prospect_socials SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE activity_logs SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE dialing_session_calls SET prospect_id = canonical_row.id WHERE prospect_id = dup_row.id;
    UPDATE dialing_sessions SET connected_prospect_id = canonical_row.id WHERE connected_prospect_id = dup_row.id;
    INSERT INTO prospect_field_values (prospect_id, field_id, value)
    SELECT canonical_row.id, field_id, value FROM prospect_field_values WHERE prospect_id = dup_row.id
    ON CONFLICT (prospect_id, field_id) DO NOTHING;
    DELETE FROM prospect_field_values WHERE prospect_id = dup_row.id;

    INSERT INTO prospect_list_memberships (prospect_id, list_id, organisation_id, added_at)
    SELECT canonical_row.id, list_id, organisation_id, COALESCE(added_at, now())
    FROM prospect_list_memberships WHERE prospect_id = dup_row.id
    ON CONFLICT (prospect_id, list_id) DO NOTHING;
    IF dup_row.list_id IS NOT NULL THEN
      INSERT INTO prospect_list_memberships (prospect_id, list_id, organisation_id, added_at)
      VALUES (canonical_row.id, dup_row.list_id, dup_row.organisation_id, now())
      ON CONFLICT (prospect_id, list_id) DO NOTHING;
    END IF;

    UPDATE prospects SET deleted_at = now() WHERE id = dup_row.id;
    merged := merged + 1;
  END LOOP;

  e1 := unique_emails[1]; e2 := unique_emails[2]; e3 := unique_emails[3];
  ph1 := unique_phones[1]; ph2 := unique_phones[2]; ph3 := unique_phones[3]; ph4 := unique_phones[4]; ph5 := unique_phones[5];
  UPDATE prospects SET
    email = e1, email2 = e2, email3 = e3,
    phone = ph1, phone2 = ph2, phone3 = ph3, phone4 = ph4, phone5 = ph5
  WHERE id = canonical_row.id;

  canonical_id := canonical_row.id;
  merged_count := merged;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION merge_prospects(UUID, UUID[]) TO authenticated;
