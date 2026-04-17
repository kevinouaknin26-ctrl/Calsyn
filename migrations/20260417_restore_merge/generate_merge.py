"""
generate_merge.py — Génère merge.sql à partir des JSON de prod + restore.

Règles :
- `organisation_id` est remappé : restore `43d695b7-b981-4cde-af4f-57eac2842287`
  → prod `8228401f-816b-4faf-8d55-0b62ae9fa2a7` (Murmuse).
- `prospect_fields` : UPSERT par (organisation_id, key). Si le field existe
  déjà en prod, on réutilise son ID, sinon on insère avec le nouvel ID.
  → build mapping `restore_field_id → prod_field_id` pour remap les values.
- Tables data : INSERT ... ON CONFLICT (id) DO NOTHING → zéro écrasement.
- Tout enveloppé dans UN bloc DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN
  RAISE; END $$ → rollback auto si une erreur.

Output : ./merge.sql (gitignoré, local seulement).
"""
import json
from pathlib import Path

SRC_ORG = "43d695b7-b981-4cde-af4f-57eac2842287"
DST_ORG = "8228401f-816b-4faf-8d55-0b62ae9fa2a7"

ROOT = Path(__file__).parent
PROD = ROOT / "prod"
RST  = ROOT / "restore"
OUT  = ROOT / "merge.sql"

def load(dir_, name):
    return json.loads((dir_ / f"{name}.json").read_text(encoding="utf-8"))

def sql_val(v):
    """Escape pour SQL inline (PostgreSQL)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False)
        return "'" + s.replace("'", "''") + "'::jsonb"
    # string
    s = str(v).replace("'", "''")
    return "'" + s + "'"

def remap_org(row):
    """Retourne une copie de row avec organisation_id remappé si = SRC_ORG."""
    r = dict(row)
    if r.get("organisation_id") == SRC_ORG:
        r["organisation_id"] = DST_ORG
    return r

def insert_stmt(table, cols, row, on_conflict_id=True):
    """Génère un INSERT single-row avec ON CONFLICT (id) DO NOTHING."""
    vals = [sql_val(row.get(c)) for c in cols]
    # ON CONFLICT DO NOTHING (sans colonne) couvre toutes les contraintes uniques
    # (id, call_sid, etc.) au lieu de seulement (id). Nécessaire car overlap
    # observé sur calls.call_sid entre restore et prod.
    conflict = " ON CONFLICT DO NOTHING" if on_conflict_id else ""
    return f"  INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(vals)}){conflict};"

# ── Chargement ────────────────────────────────────────────────────────
prod_fields = load(PROD, "03_prospect_fields")
rst_fields  = load(RST,  "03_prospect_fields")
rst_lists   = load(RST,  "04_prospect_lists")
rst_prospects = load(RST, "05_prospects")
rst_calls   = load(RST,  "06_calls")
rst_socials = load(RST,  "08_prospect_socials")
rst_values  = load(RST,  "09_prospect_field_values")
rst_logs    = load(RST,  "07_activity_logs")
rst_jobs    = load(RST,  "11_analysis_jobs")
rst_sessions = load(RST, "10_dialing_sessions")
rst_session_calls = load(RST, "10b_dialing_session_calls")

# ── Mapping field_id restore → prod ──────────────────────────────────
# Match sur key (unique par organisation). Si la key existe déjà en prod,
# on remappe vers l'ID prod. Sinon, on ajoute le field au UPSERT et on
# garde l'ID d'origine.
prod_by_key = {f["key"]: f["id"] for f in prod_fields}
new_fields = []  # fields absents en prod à insérer
field_map = {}   # restore_field_id → final_id (prod si existe, sinon restore)
for rf in rst_fields:
    if rf["key"] in prod_by_key:
        field_map[rf["id"]] = prod_by_key[rf["key"]]
    else:
        field_map[rf["id"]] = rf["id"]  # on gardera l'ID restore
        new_fields.append(rf)

# ── Vérif des prospects (ceux dont list_id pointe vers des listes qui
# existent bien après import). Ici simple : toutes les listes restore
# seront insérées donc pas de filtrage.
# ── Génération du SQL ─────────────────────────────────────────────────
lines = [
    "-- merge.sql — généré automatiquement par generate_merge.py",
    "-- Source : restore (43d695b7…) → Dest : prod (8228401f… = Murmuse)",
    "-- Transactionnel : ROLLBACK auto en cas d'erreur.",
    "",
    "DO $$",
    "DECLARE",
    "  v_inserted INT := 0;",
    "  v_total INT := 0;",
    "BEGIN",
    "  RAISE NOTICE '▶ Merge start at %', NOW();",
]

def section(title):
    lines.append("")
    lines.append(f"  -- ═══ {title} ═══")

# ── 1. prospect_fields (upsert les manquants seulement) ──
section(f"1. prospect_fields — {len(new_fields)} nouveaux à insérer")
COLS_FIELDS = ["id","organisation_id","name","key","field_type","is_system","created_at","deleted_at"]
for f in new_fields:
    f = remap_org(f)
    lines.append(insert_stmt("prospect_fields", COLS_FIELDS, f))

# ── 2. prospect_lists ──
section(f"2. prospect_lists — {len(rst_lists)} rows")
COLS_LISTS = ["id","organisation_id","name","assigned_to","created_by","created_at","deleted_at"]
for l in rst_lists:
    l = remap_org(l)
    # assigned_to est un array → représenter en PG array literal
    if isinstance(l.get("assigned_to"), list):
        arr = l["assigned_to"]
        l["assigned_to"] = "{" + ",".join(f'"{x}"' for x in arr) + "}"
    lines.append(insert_stmt("prospect_lists", COLS_LISTS, l))

# ── 3. prospects ──
section(f"3. prospects — {len(rst_prospects)} rows")
COLS_PROSPECTS = ["id","list_id","organisation_id","name","phone","phone2","phone3","phone4","phone5",
                  "email","company","title","sector","linkedin_url","website_url","status","crm_status",
                  "call_count","last_call_at","last_call_outcome","snoozed_until","rdv_date",
                  "do_not_call","meeting_booked","address","city","postal_code","country",
                  "created_at","deleted_at"]
for p in rst_prospects:
    p = remap_org(p)
    lines.append(insert_stmt("prospects", COLS_PROSPECTS, p))

# ── 4. calls ──
section(f"4. calls — {len(rst_calls)} rows")
COLS_CALLS = ["id","organisation_id","sdr_id","prospect_id","prospect_name","prospect_phone",
              "call_sid","conference_sid","call_outcome","call_duration","note","meeting_booked",
              "recording_url","recording_consent","provider","audio_quality_mos","from_number",
              "list_id","ai_analysis_status","ai_transcript","ai_summary","ai_score_global",
              "ai_score_accroche","ai_score_objection","ai_score_closing","ai_points_forts",
              "ai_points_amelioration","ai_intention_prospect","ai_prochaine_etape","ai_analyzed_at",
              "amd_result","amd_detected_at","created_at","updated_at"]
for c in rst_calls:
    c = remap_org(c)
    lines.append(insert_stmt("calls", COLS_CALLS, c))

# ── 5. prospect_socials ──
section(f"5. prospect_socials — {len(rst_socials)} rows")
COLS_SOCIALS = ["id","prospect_id","platform","url","created_at","deleted_at"]
for s in rst_socials:
    lines.append(insert_stmt("prospect_socials", COLS_SOCIALS, s))

# ── 6. prospect_field_values (REMAP field_id) ──
section(f"6. prospect_field_values — {len(rst_values)} rows (avec remap field_id)")
COLS_VALUES = ["id","prospect_id","field_id","value","created_at"]
skipped = 0
for v in rst_values:
    old = v.get("field_id")
    new = field_map.get(old)
    if new is None:
        skipped += 1
        continue
    v = dict(v)
    v["field_id"] = new
    lines.append(insert_stmt("prospect_field_values", COLS_VALUES, v))
lines.append(f"  -- (skipped {skipped} values dont le field_id est inconnu)")

# ── 7. activity_logs ──
section(f"7. activity_logs — {len(rst_logs)} rows")
COLS_LOGS = ["id","prospect_id","organisation_id","user_id","action","details","metadata","created_at"]
for a in rst_logs:
    a = remap_org(a)
    lines.append(insert_stmt("activity_logs", COLS_LOGS, a))

# ── 8. analysis_jobs (optionnel) ──
section(f"8. analysis_jobs — {len(rst_jobs)} rows")
COLS_JOBS = ["id","call_id","status","attempts","raw_output","error_message","created_at","completed_at"]
for j in rst_jobs:
    lines.append(insert_stmt("analysis_jobs", COLS_JOBS, j))

# ── 9. dialing_sessions (optionnel) ──
section(f"9. dialing_sessions — {len(rst_sessions)} rows")
COLS_SESS = ["id","organisation_id","sdr_id","status","prospects","connected_prospect_id","current_index","list_id","created_at","completed_at"]
for s in rst_sessions:
    s = remap_org(s)
    # prospects est array
    if isinstance(s.get("prospects"), list):
        arr = s["prospects"]
        s["prospects"] = "{" + ",".join(f'"{x}"' for x in arr) + "}"
    lines.append(insert_stmt("dialing_sessions", COLS_SESS, s))

# ── 10. dialing_session_calls ──
section(f"10. dialing_session_calls — {len(rst_session_calls)} rows")
COLS_SESS_CALLS = ["id","session_id","prospect_id","call_sid","status","answered_by","created_at"]
for sc in rst_session_calls:
    lines.append(insert_stmt("dialing_session_calls", COLS_SESS_CALLS, sc))

# ── Closing ──
lines.extend([
    "",
    "  RAISE NOTICE '✓ Merge done at %', NOW();",
    "EXCEPTION WHEN OTHERS THEN",
    "  RAISE NOTICE '✗ Merge failed: %', SQLERRM;",
    "  RAISE;",
    "END $$;",
])

sql = "\n".join(lines)
OUT.write_text(sql, encoding="utf-8")

print(f"✓ merge.sql written : {OUT}")
print(f"  Size : {OUT.stat().st_size/1024:.1f} KB")
print(f"  Lines : {len(lines)}")
print(f"  Inserts planifiés :")
print(f"    prospect_fields (new) : {len(new_fields)}")
print(f"    prospect_lists       : {len(rst_lists)}")
print(f"    prospects            : {len(rst_prospects)}")
print(f"    calls                : {len(rst_calls)}")
print(f"    prospect_socials     : {len(rst_socials)}")
print(f"    prospect_field_values: {len(rst_values)-skipped} (skip {skipped})")
print(f"    activity_logs        : {len(rst_logs)}")
print(f"    analysis_jobs        : {len(rst_jobs)}")
print(f"    dialing_sessions     : {len(rst_sessions)}")
print(f"    dialing_session_calls: {len(rst_session_calls)}")
print(f"  Total INSERTs : {len(new_fields)+len(rst_lists)+len(rst_prospects)+len(rst_calls)+len(rst_socials)+len(rst_values)-skipped+len(rst_logs)+len(rst_jobs)+len(rst_sessions)+len(rst_session_calls)}")
print(f"\nField mapping:")
for k, v in list(field_map.items())[:5]:
    print(f"  {k[:8]}... → {v[:8]}...")
print(f"  ({len(field_map)} mappings)")
