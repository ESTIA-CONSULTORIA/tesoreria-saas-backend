# ESTIA Tesorería — Lista de Tareas

## 🔴 CRÍTICO (hacer ahora)
- [x] TreasuryPage — formularios sin handlers (transferencias y alertas)
- [x] TransfersPage — reemplazar prompt() con modal
- [x] POS — verificar flujo completo (NIP, turno, venta, corte)
- [x] Seed — distribuir fechas de movimientos para que filtros Hoy/Semana funcionen

## 🟡 IMPORTANTE (próxima iteración)
- [x] OCR de documentos con validación humana
- [x] Chat interno para aprobación de cortes POS
- [x] Flujo de aprobación de movimientos
- [x] RH con expedientes básico
- [x] Wizard de onboarding

## 🟢 FACTURACIÓN (fase 2)
- [ ] Investigar y seleccionar PAC (Finkok, SW Sapien, Edicom)
- [ ] Implementar CFDI 4.0 — generación de XML
- [ ] Timbrado via PAC
- [ ] PDF del CFDI
- [ ] Cancelaciones de CFDI
- [ ] Complemento de pago (REP)

## ⚪ MEJORAS (fase 3 — antes de integraciones)
- [x] Quitar console.logs del backend
- [ ] White Label completo (logo, colores, dominio)
- [ ] Refactor estilos inline a Tailwind
- [ ] Memoización para performance
- [ ] Debouncing en filtros

## 🔵 INTEGRACIONES (fase 4)
- [ ] APIs bancarias (BBVA, Banorte, HSBC, Banamex)
- [ ] Conciliación automática bancaria
- [ ] Transferencias SPEI
- [ ] ContPAQ Nóminas
- [ ] ContPAQ Contabilidad
- [ ] ContPAQ Comercial
- [ ] SAP
- [ ] Oracle
- [ ] SoftRestaurant
- [ ] Parrot
- [ ] IDSE — Movimientos IMSS
- [ ] INFONAVIT — Aportaciones
- [ ] SUA — Cuotas IMSS

## ✅ REVISIÓN EXHAUSTIVA COMPLETADA — 12/Jun/2026
- 11 bugs críticos corregidos
- Tenant isolation en todos los módulos
- JWT expone companyId y branchId
- Roles protegidos en endpoints sensibles
- 17 módulos operativos sin advertencias
