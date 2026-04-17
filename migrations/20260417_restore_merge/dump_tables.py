"""
Dump script — export toutes les tables d'un projet Supabase en JSON.
Utilisé pour backup prod + export restore avant merge.

Usage:
    export PGPASSWORD=<password>
    python3 dump_tables.py prod   # dump vers ./prod/
    python3 dump_tables.py restore  # dump vers ./restore/

Connection : direct Postgres (port 5432), user=postgres.
Le pooler (6543) n'est pas utilisé car peut avoir un délai de propagation
lors d'un reset du password.
"""
import psycopg2, json, os, sys, time
from pathlib import Path

PROJECTS = {
    "prod":    ("db.enrpuayypjnpfmdgpfhs.supabase.co", "Murmuse prod (callio-v2)"),
    "restore": ("db.wjqnrlhfwjeobnoxkpdi.supabase.co", "Snapshot 14 avril (calsyn-restore-20260414)"),
}

TABLES = [
    ("01_organisations", "SELECT row_to_json(o.*) FROM organisations o ORDER BY created_at"),
    ("02_profiles", "SELECT row_to_json(p.*) FROM profiles p ORDER BY created_at"),
    ("03_prospect_fields", "SELECT row_to_json(f.*) FROM prospect_fields f ORDER BY created_at"),
    ("04_prospect_lists", "SELECT row_to_json(l.*) FROM prospect_lists l ORDER BY created_at"),
    ("05_prospects", "SELECT row_to_json(p.*) FROM prospects p ORDER BY created_at"),
    ("06_calls", "SELECT row_to_json(c.*) FROM calls c ORDER BY created_at"),
    ("07_activity_logs", "SELECT row_to_json(a.*) FROM activity_logs a ORDER BY created_at"),
    ("08_prospect_socials", "SELECT row_to_json(s.*) FROM prospect_socials s ORDER BY created_at"),
    ("09_prospect_field_values", "SELECT row_to_json(v.*) FROM prospect_field_values v ORDER BY created_at"),
    ("10_dialing_sessions", "SELECT row_to_json(d.*) FROM dialing_sessions d ORDER BY created_at"),
    ("10b_dialing_session_calls", "SELECT row_to_json(d.*) FROM dialing_session_calls d ORDER BY created_at"),
    ("11_analysis_jobs", "SELECT row_to_json(a.*) FROM analysis_jobs a ORDER BY created_at"),
    ("11b_crm_statuses", "SELECT row_to_json(c.*) FROM crm_statuses c ORDER BY created_at"),
]

def dump(target: str):
    if target not in PROJECTS:
        sys.exit(f"Unknown target {target!r}. Options: {list(PROJECTS)}")
    host, label = PROJECTS[target]
    pwd = os.environ.get("PGPASSWORD")
    if not pwd:
        sys.exit("PGPASSWORD env var missing. Run: export PGPASSWORD=...")
    out = Path(__file__).parent / target
    out.mkdir(parents=True, exist_ok=True)

    print(f"Target: {label}\nHost: {host}\nOutput: {out}\n")
    conn = psycopg2.connect(host=host, port=5432, dbname="postgres", user="postgres", password=pwd, connect_timeout=10, sslmode="require")
    cur = conn.cursor()
    total_rows, total_bytes = 0, 0
    for name, sql in TABLES:
        t0 = time.time()
        cur.execute(sql)
        rows = [r[0] for r in cur.fetchall()]
        path = out / f"{name}.json"
        path.write_text(json.dumps(rows, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        sz = path.stat().st_size
        dt = time.time() - t0
        total_rows += len(rows)
        total_bytes += sz
        print(f"  {name:30s} {len(rows):>5} rows  {sz:>8} bytes  {dt:.2f}s")
    conn.close()
    print(f"\n  TOTAL: {total_rows} rows, {total_bytes/1024:.1f} KB")

if __name__ == "__main__":
    dump(sys.argv[1] if len(sys.argv) > 1 else "prod")
