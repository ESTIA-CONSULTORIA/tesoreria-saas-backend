#!/usr/bin/env bash
# ============================================================================
# RONDA 4 — prueba definitiva vía curl DIRECTO contra producción (sin pasar
# por el navegador/frontend), para descartar caché/service-worker del lado
# del cliente como explicación. Credenciales y empleado por variables de entorno
# (SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_EMPLOYEE_ID); no se guardan en este archivo.
#
# Todo vía API pública (login, /companies, /branches, /payroll/runs,
# /payroll/runs/:id/generate-receipts, /hr/employees/:id/documents) — no
# toca SQL para nada, ni para verificar. Punto único no cubierto por API:
# no hay DELETE /payroll/runs/:id, así que esto SÍ deja datos desechables
# reales (período 1903-01-01/1903-01-15, marcados en notes) que hay que
# limpiar con SQL después — el script de limpieza queda al final de este
# archivo, comentado, listo para pegar en psql cuando alguien tenga acceso.
#
# Archivos temporales: carpeta local ./.payroll-smoke-tmp (relativa al
# directorio donde corras esto — no /tmp ni C:\tmp, que no existen tal cual
# en Windows/Git Bash). Se crea sola si no existe; no se sube a git.
#
# Uso: bash payroll-smoke-test-curl.sh
# ============================================================================
set -e

: "${SMOKE_EMAIL:?define SMOKE_EMAIL (usuario ADMIN de prueba)}"
: "${SMOKE_PASSWORD:?define SMOKE_PASSWORD}"
: "${SMOKE_EMPLOYEE_ID:?define SMOKE_EMPLOYEE_ID (empleado cuyos documentos se verifican en el paso 6)}"

API="https://api.estiaconsultoria.com/api/v1"
TMPDIR="./.payroll-smoke-tmp"
mkdir -p "$TMPDIR"
JAR="$TMPDIR/cookies.txt"

echo "=== 1) Login (SMOKE_EMAIL) ==="
curl -s -c "$JAR" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}" | tee "$TMPDIR/rp_login.json"
echo ""

TENANT_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/rp_login.json','utf8')).user.tenantId)")
echo "tenantId: $TENANT_ID"

echo "=== 2) Companies del tenant ==="
curl -s -b "$JAR" "$API/companies" | tee "$TMPDIR/rp_companies.json"
echo ""
COMPANY_ID=$(node -e "
const c = JSON.parse(require('fs').readFileSync('$TMPDIR/rp_companies.json','utf8'));
const arr = Array.isArray(c) ? c : (c.data || []);
const sazon = arr.find(x => (x.tradeName||'').toLowerCase().includes('saz')) || arr[0];
console.log(sazon.id);
")
echo "companyId (El Sazón): $COMPANY_ID"

echo "=== 3) Branches de esa company ==="
curl -s -b "$JAR" "$API/branches?companyId=$COMPANY_ID" | tee "$TMPDIR/rp_branches.json"
echo ""
BRANCH_ID=$(node -e "
const b = JSON.parse(require('fs').readFileSync('$TMPDIR/rp_branches.json','utf8'));
const arr = Array.isArray(b) ? b : (b.data || []);
console.log(arr[0].id);
")
echo "branchId: $BRANCH_ID"

echo "=== 4) Crear PayrollRun desechable (período 1903, genera entries para TODOS los activos de la sucursal) ==="
curl -s -b "$JAR" -X POST "$API/payroll/runs" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-company-id: $COMPANY_ID" \
  -d "{\"periodStart\":\"1903-01-01\",\"periodEnd\":\"1903-01-15\",\"periodType\":\"quincenal\",\"branchId\":\"$BRANCH_ID\",\"notes\":\"[SMOKE TEST DESECHABLE - RONDA 4 via curl directo]\"}" \
  | tee "$TMPDIR/rp_run.json"
echo ""
RUN_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/rp_run.json','utf8')).run.id)")
echo "run_id: $RUN_ID   <-- guarda este ID para la limpieza SQL de abajo"

echo "=== 5) Disparar generate-receipts (LA PRUEBA REAL) ==="
HTTP_CODE=$(curl -s -b "$JAR" -o "$TMPDIR/rp_receipts.json" -w "%{http_code}" -X POST "$API/payroll/runs/$RUN_ID/generate-receipts" \
  -H "x-tenant-id: $TENANT_ID")
echo "HTTP status: $HTTP_CODE"
cat "$TMPDIR/rp_receipts.json"
echo ""

if [ "$HTTP_CODE" = "500" ]; then
  echo ">>> 500 explícito — la instrumentación SÍ disparó. El bug es real y reproducible por curl directo (descarta caché/navegador)."
elif [ "$HTTP_CODE" = "200" ]; then
  echo "=== 6) Verificar en hr_document vía API (sin SQL) — documentos del empleado SMOKE_EMPLOYEE_ID ==="
  curl -s -b "$JAR" "$API/hr/employees/$SMOKE_EMPLOYEE_ID/documents" \
    | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        const docs = JSON.parse(d);
        const match = docs.filter(x => x.nombre === 'Recibo de nómina 1903-01-01 al 1903-01-15');
        console.log('Documentos que matchean el período sintético:', JSON.stringify(match, null, 2));
        console.log(match.length > 0 ? '>>> SÍ aparece en hr_document — el 200 fue honesto.' : '>>> NO aparece pese al 200 — bug confirmado también por curl directo, descarta navegador/caché.');
      });
    "
else
  echo ">>> Código inesperado ($HTTP_CODE) — revisar $TMPDIR/rp_receipts.json a mano."
fi

echo ""
echo "=============================================================="
echo "LIMPIEZA PENDIENTE (no hay DELETE /payroll/runs/:id en la API):"
echo "  run_id creado: $RUN_ID"
echo "  Corre esto en psql cuando tengas acceso a la BD:"
echo ""
echo "  DELETE FROM hr_document WHERE nombre = 'Recibo de nómina 1903-01-01 al 1903-01-15';"
echo "  DELETE FROM payroll_entry WHERE \"payrollRunId\" = '$RUN_ID';"
echo "  DELETE FROM payroll_run WHERE id = '$RUN_ID';"
echo "=============================================================="
