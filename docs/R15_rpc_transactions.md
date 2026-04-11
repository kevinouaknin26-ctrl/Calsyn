# R15 — Postgres RPC : transactions atomiques

## Principe
PostgREST wrappe chaque appel `rpc()` dans une transaction automatiquement.
Si une etape echoue, tout est rollback. Pas de donnees corrompues.

## Use cases Callio

### 1. check_and_lock_credit (avant chaque dial)
```sql
CREATE OR REPLACE FUNCTION public.check_and_lock_credit(
  p_org_id uuid,
  p_num_calls int,
  p_max_cost_per_call numeric DEFAULT 1.00  -- pessimiste : 1€/appel max
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric;
  v_required numeric;
BEGIN
  -- Lock la ligne org pour eviter les race conditions
  SELECT credit_balance INTO v_balance
  FROM organisations
  WHERE id = p_org_id
  FOR UPDATE;  -- row-level lock

  v_required := p_num_calls * p_max_cost_per_call;

  IF v_balance < v_required THEN
    RETURN false;  -- pas assez de credit
  END IF;

  -- Deduire le montant reserve
  UPDATE organisations
  SET credit_balance = credit_balance - v_required,
      credit_reserved = credit_reserved + v_required
  WHERE id = p_org_id;

  RETURN true;
END;
$$;
```

### 2. release_credit (apres l'appel, ajuster le cout reel)
```sql
CREATE OR REPLACE FUNCTION public.release_credit(
  p_org_id uuid,
  p_reserved numeric,
  p_actual_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE organisations
  SET credit_reserved = credit_reserved - p_reserved,
      credit_balance = credit_balance + (p_reserved - p_actual_cost)
  WHERE id = p_org_id;
END;
$$;
```

### 3. save_call_and_update_prospect (atomique)
```sql
CREATE OR REPLACE FUNCTION public.save_call_and_update_prospect(
  p_call_data jsonb,
  p_prospect_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call_id uuid;
BEGIN
  -- Insert le call
  INSERT INTO calls (...) VALUES (...) RETURNING id INTO v_call_id;

  -- Update le prospect
  UPDATE prospects
  SET call_count = call_count + 1,
      last_call_at = now(),
      status = (p_call_data->>'prospect_status')
  WHERE id = p_prospect_id;

  RETURN v_call_id;
END;
$$;
```

## Appel depuis le frontend
```typescript
const { data, error } = await supabase.rpc('check_and_lock_credit', {
  p_org_id: orgId,
  p_num_calls: 1,
  p_max_cost_per_call: 1.00,
})
if (!data) { /* pas assez de credit, bloquer l'appel */ }
```

## Decision
- Toute operation multi-table = RPC atomique
- `FOR UPDATE` pour le credit lock (row-level pessimistic locking)
- Credit reserve avant l'appel, ajuste apres
- save_call + update_prospect = une seule transaction
