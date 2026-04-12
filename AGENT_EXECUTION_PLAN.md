# Estructura de Agentes para Integración y Validación

Este plan divide el trabajo en agentes especializados para acelerar ejecución, reducir riesgos y cerrar fases con criterios medibles.

## Agente A1 — Runtime & Orquestación
- **Objetivo:** estabilizar `install.sh` / `run.sh` en Linux + Termux.
- **Responsabilidades:**
  - Validar `--dry-run`, `--self-check`, `--phase-test`.
  - Verificar fallback de `systemd` a `nohup` en Termux.
  - Confirmar reportes en `logs/self-check-report.json` y `logs/phase-quality.json`.
- **Criterio de salida:**
  - Flujos dry-run completos sin crash.
  - Mensajes claros de warning/acción correctiva.

## Agente A2 — Broker/OANDA & Configuración
- **Objetivo:** asegurar que la capa broker-manager/OANDA sea consistente.
- **Responsabilidades:**
  - Revisar defaults (`XAU_USD`, credenciales OANDA).
  - Validar rutas API críticas (`/api/engine`, `/api/pairs`, `/api/quality`).
  - Verificar que el modo demo/live se refleje correctamente en respuestas/estado.
- **Criterio de salida:**
  - Endpoints devuelven estado coherente y sin regresiones de formato.

## Agente A3 — Calidad por Fases (SRE/Performance)
- **Objetivo:** operar quality gates con score y umbrales por entorno.
- **Responsabilidades:**
  - Ajustar `PHASE_PROFILE` (`dev/staging/prod`) y thresholds.
  - Confirmar `overall_score`, `overall_status`, `ready_for_promotion`.
  - Definir límites de promoción por fase.
- **Criterio de salida:**
  - Política de promoción explícita y reportable por API.

## Agente A4 — ML/AI & Dependencias
- **Objetivo:** cerrar brechas de compilación de módulos IA.
- **Responsabilidades:**
  - Resolver dependencia `@tensorflow/tfjs` para build/typecheck global.
  - Verificar rutas `api/ai/*` sin romper compilación.
- **Criterio de salida:**
  - `bunx tsc --noEmit` global y `bun run build` sin errores por IA.

## Agente A5 — Validación Final de Release
- **Objetivo:** certificar integración end-to-end.
- **Responsabilidades:**
  - Ejecutar smoke tests en entorno objetivo.
  - Consolidar evidencia de pruebas y riesgos abiertos.
  - Entregar checklist go/no-go de despliegue.
- **Criterio de salida:**
  - Evidencia reproducible y trazabilidad de decisiones.

---

## Orden recomendado (pipeline ágil)
1. **A1** (runtime base)  
2. **A2** (broker/API consistency)  
3. **A3** (quality gates y promoción por score)  
4. **A4** (deuda ML/IA de compilación)  
5. **A5** (release sign-off)

## Comandos de validación sugeridos en entorno
- `./install.sh --dry-run`
- `./run.sh --dry-run --self-check --phase-test`
- `PREFIX=/data/data/com.termux/files/usr ./run.sh --dry-run --daemon=systemd --phase-test`
- `bunx tsc --noEmit`
- `bun run build`
