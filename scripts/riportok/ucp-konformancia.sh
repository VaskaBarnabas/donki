#!/bin/sh
# 21. fázis: a hivatalos UCP-konformanciateszt futtatása a saját átjárónk ellen, konformancia-tesztmódban.
# A tesztcsomag és a Python-környezete a repón kívül van (UCP_KONF_MAPPA, alapból a munkamenet scratchpad-je):
#   git clone https://github.com/Universal-Commerce-Protocol/conformance <mappa>/conformance
#   python3 -m venv <mappa>/venv && <mappa>/venv/bin/pip install 'ucp-sdk==0.4.6' absl-py httpx pydantic fastapi uvicorn pytest pyyaml
# Futtatás: sh scripts/riportok/ucp-konformancia.sh  →  riportok/05-osszehasonlitasok/adatok/ucp-konformancia.txt
set -e
cd "$(dirname "$0")/../.."
M=${UCP_KONF_MAPPA:?Add meg a UCP_KONF_MAPPA-t (a conformance és a venv mappa szülője)}
PORT=4193
KI=riportok/05-osszehasonlitasok/adatok/ucp-konformancia.txt
SQL_BE="insert into crm.contacts (partner_id, name, email, role) select id, 'John Doe (UCP-konformanciateszt)', 'john.doe@example.com', 'teszt' from crm.partners where name like 'Bakony%' limit 1;"
SQL_KI="delete from crm.contacts where email = 'john.doe@example.com';"
docker exec donki-crm-db-1 psql -U postgres -qc "$SQL_KI" >/dev/null
docker exec donki-crm-db-1 psql -U postgres -qc "$SQL_BE" >/dev/null
# a konténeres átjáró ugyanazt a webhook-sort olvasná (éles beállítással a teszt http-s címét elutasítaná): a futás idejére leáll
docker stop donki-ucp-gateway-1 >/dev/null 2>&1 || true
UCP_PORT=$PORT UCP_ALAP_URL=http://localhost:$PORT UCP_KONFORMANCIA=1 npx tsx ucp/szerver.ts 2>/tmp/ucp-konf-atjaro.log &
KAPU=$!
trap 'kill $KAPU 2>/dev/null; docker exec donki-crm-db-1 psql -U postgres -qc "$SQL_KI" >/dev/null; docker start donki-ucp-gateway-1 >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do curl -sf http://localhost:$PORT/health >/dev/null && break; sleep 1; done
ABS=$(pwd)
( cd "$M/conformance" && "$M/venv/bin/python" runner.py --server_url "http://localhost:$PORT" --suite all \
    --conformance_input "$ABS/ucp/konformancia/conformance_input.json" --fixture_config "$ABS/ucp/konformancia/test_fixtures.json" ) > "$KI" 2>&1 || true
tail -n 15 "$KI"
