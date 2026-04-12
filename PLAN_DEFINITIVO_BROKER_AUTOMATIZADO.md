# 🏆 PLAN DEFINITIVO: Broker Automatizado Forex Tipo MetaTrader 5

## 📌 OBJETIVO ÚNICO Y CONCRETO
Crear un software automatizado de trading **Forex/CFDs** que funcione como MetaTrader 5 pero sea programable, ejecutando **múltiples trades automáticos** para generar **ganancias acumulativas consistentes**.

---

# 📊 ANÁLISIS DE BROKERS - COMPARATIVA TÉCNICA REAL

## ❌ OANDA (Actual) - POR QUÉ CAMBIAR

| Problema | Impacto en tu objetivo |
|----------|----------------------|
| Setup complejo (horas para obtener API Token + Account ID) | Pierdes tiempo valioso |
| Límite 500 requests/min + 1000 órdenes/día en demo | **IMPOSIBLE hacer 100+ trades/día** |
| Latencia 1-3 segundos por orden | **No sirve para scalping** |
| Sin WebSockets (solo polling) | Datos desactualizados |
| Spread alto en XAU/USD (2-3 pips) | **Come tus ganancias** |
| Difícil de entender | No sabes qué está pasando |

**Veredicto: OANDA bloquea tu objetivo principal**

---

## ✅ MEJOR OPCIÓN: cTrader Open API + IC Markets

### ¿Qué es cTrader?
Es una **plataforma de trading profesional** (como MetaTrader 5) pero con **API abierta oficial** para programadores. Es usada por brokers regulados como IC Markets, Pepperstone, FP Markets.

### ¿Por qué cTrader Open API?

| Ventaja | Dato concreto |
|---------|--------------|
| **API Oficial en Python** | `pip install ctrader-open-api` (mantenida por Spotware) |
| **Setup en 20 minutos** | Crear cuenta → obtener cTrader ID → conectar |
| **Límites generosos** | **50 requests/segundo** = 4.3 millones/día |
| **WebSockets nativos** | Streaming de precios en tiempo real (<100ms) |
| **Lotes desde 0.01** | Exactamente como MetaTrader 5 |
| **Forex real** | EUR/USD, GBP/USD, USD/JPY, XAU/USD, índices, commodities |
| **Sin costo de API** | Solo pagas spread + comisión por trade |
| **Linux compatible** | 100% Python async, sin Windows |
| **Demo instantáneo** | Cuenta demo gratuita y permanente |
| **Spread EUR/USD** | **0.02 pips** (IC Markets Raw) vs 2-3 pips de OANDA |

### Broker recomendado: IC Markets

| Característica | Valor |
|----------------|-------|
| Spread EUR/USD | **0.02 pips** (casi cero) |
| Spread XAU/USD | **0.10 pips** |
| Comisión | $7/lot ida y vuelta |
| Leverage | Hasta 1:500 (demo: 1:100) |
| Ejecución | <40ms promedio |
| Regulación | ASIC (Australia), CySEC (Europa) |
| Demo | Gratis, instantáneo, sin expiración |

### Alternativa: Pepperstone

Misma API (cTrader), spread EUR/USD **0.0 pips**, comisión $7/lot. Igual de bueno.

---

## 📊 COMPARATIVA FINAL DE BROKERS

| Característica | OANDA | cTrader + IC Markets | MetaTrader 5 (python-mt5) | MetaApi (cloud MT5) |
|---|---|---|---|---|
| **Setup time** | 🔴 2-4 horas | 🟢 20 minutos | 🟡 10 min (Windows) | 🟢 30 min |
| **Límites API** | 🔴 500/min, 1000/día | 🟢 50/seg (4.3M/día) | 🟢 Sin límites | 🟡 Según plan |
| **Latencia** | 🔴 1-3 seg | 🟢 <100ms | 🟢 <50ms | 🟡 200-500ms |
| **Spread EUR/USD** | 🔴 1-2 pips | 🟢 0.02 pips | 🟢 0.0-0.1 pips | 🟢 0.0-0.1 pips |
| **Lote mínimo** | 🟡 1,000 unidades | 🟢 0.01 lots | 🟢 0.01 lots | 🟢 0.01 lots |
| **WebSockets** | 🔴 No | 🟢 Sí | 🟡 Parcial | 🟢 Sí |
| **Linux** | 🟢 Sí | 🟢 Sí | 🔴 NO (solo Windows) | 🟢 Sí |
| **Costo API** | 🟢 Gratis | 🟢 Gratis | 🟢 Gratis | 🔴 $30-100/mes |
| **HFT (100+/día)** | 🔴 IMPOSIBLE | 🟢 SÍ | 🟢 SÍ | 🟡 Plan pago |
| **Forex real** | 🟢 Sí | 🟢 Sí | 🟢 Sí | 🟢 Sí |
| **TU OBJETIVO** | 🔴 2/10 | 🟢 **9/10** | 🟡 7/10 | 🟡 6/10 |

---

# 🎯 ARQUITECTURA FINAL DEL SISTEMA

## ¿Cómo funcionará?

```
┌────────────────────────────────────────────────────────────┐
│              TU COMPUTADORA (Linux)                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         RECO-TRADING (Tu Software)                    │  │
│  │                                                       │  │
│  │  ┌─────────────┐    ┌──────────────┐                 │  │
│  │  │  Motor de   │    │  Gestión de  │                 │  │
│  │  │  Trading    │◄──►│  Capital     │                 │  │
│  │  │  (Burst)    │    │  (Tipo MT5)  │                 │  │
│  │  └──────┬──────┘    └──────────────┘                 │  │
│  │         │                                              │  │
│  │  ┌──────▼────────────────────────────────────────┐   │  │
│  │  │     cTrader Adapter (Tu Puente al Broker)      │   │  │
│  │  │  - placeMarketOrder()                          │   │  │
│  │  │  - getKlines()                                 │   │  │
│  │  │  - getTickerPrice()                            │   │  │
│  │  │  - getAccountBalance()                         │   │  │
│  │  │  - WebSockets (streaming)                      │   │  │
│  │  └────────────────────┬──────────────────────────┘   │  │
│  └───────────────────────┼──────────────────────────────┘  │
│                          │ WebSocket (50 req/seg)          │
└──────────────────────────┼─────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  cTrader     │
                    │  Cloud API   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  IC Markets  │
                    │  (Broker)    │
                    │  Execution   │
                    └─────────────┘
```

### Flujo de operación

1. **Tu software analiza el mercado** (30+ indicadores, 6 estrategias, ML)
2. **Detecta señal fuerte** → evalúa fuerza (0-100)
3. **Calcula tamaño de lote** (según modo elegido: fijo, %, Kelly)
4. **Ejecuta ráfaga** (N trades simultáneos con 100ms delay)
5. **Gestiona cada posición** (trailing SL, take profit, time stop)
6. **Registra todo** (base de datos + métricas)
7. **Muestra en dashboard** (panel tipo MT5)

---

# 💰 SISTEMA DE GESTIÓN DE CAPITAL (TIPO METATRADER 5)

## Los 3 Modos de Inversión

### MODO 1: Lote Fijo (Simple)
```
El usuario elige: 0.01, 0.05, 0.1, 0.5, 1.0 lotes

Ejemplo: 0.01 lotes EUR/USD
- Tamaño: 1,000 unidades
- Valor por pip: $0.10
- Si gana 10 pips: +$1.00
- Si pierde 5 pips: -$0.50

Ideal para: Principiantes, control total
```

### MODO 2: % de Balance (Recomendado)
```
El usuario elige: 0.5%, 1%, 2%, 3% del balance

Ejemplo: Balance $1,000, riesgo 1%
- Monto por trade: $10
- Si SL = 10 pips → lote = 0.10
- Si SL = 5 pips → lote = 0.20
- Auto-ajusta según balance actual

Ideal para: Gestión de riesgo automática
```

### MODO 3: Kelly Criterion (Avanzado)
```
Calcula óptimo basado en historial:
- Win Rate: 65%
- Ratio Win/Pérdida: 1.5
- Kelly completo = 20% → usas 25% = 5% por trade

Ideal para: Maximizar crecimiento a largo plazo
```

## Tabla de Lotes (Como MT5)

```
┌─────────────────────────────────────────────────────┐
│  TAMAÑO DE LOTES - FOREX (EUR/USD ejemplo)          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Lote      │ Unidades │ Valor/Pip │ Ejemplo $1K    │
│  ──────────┼──────────┼───────────┼────────────────│
│  0.01      │ 1,000    │ $0.10     │ Muy bajo       │
│  0.05      │ 5,000    │ $0.50     │ Bajo           │
│  0.10      │ 10,000   │ $1.00     │ Moderado       │
│  0.25      │ 25,000   │ $2.50     │ Medio          │
│  0.50      │ 50,000   │ $5.00     │ Alto           │
│  1.00      │ 100,000  │ $10.00    │ Muy alto       │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Para XAU/USD (Oro):                                │
│  0.01 lotes = $0.01/pip (1 onza)                   │
│  0.10 lotes = $0.10/pip (10 onzas)                 │
│  1.00 lotes = $1.00/pip (100 onzas)                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

# 📋 PLAN DE IMPLEMENTACIÓN CONCRETO

## FASE 1: ADAPTADOR CTRADER (Semana 1 - Días 1-3)

### 1.1. Instalar SDK de cTrader
```bash
pip install ctrader-open-api
# o en package.json si usamos wrapper en TypeScript
npm install ctrader-open-api-wrapper
```

### 1.2. Crear `src/lib/ctrader-adapter.ts`
Implementar la interfaz `IBroker` existente pero usando cTrader:

```typescript
// Métodos necesarios:
- placeMarketOrder(symbol, side, lotSize)
- getKlines(symbol, timeframe, limit)
- getTickerPrice(symbol)
- getAccountBalance()
- closePosition(positionId, lotSize)
- getOpenPositions()
- getOrderBook(symbol)  // via WebSocket
```

### 1.3. Crear `src/lib/ctrader-websocket.ts`
Streaming de precios en tiempo real:

```typescript
// Conectar a WebSocket de cTrader
// Suscribirse a:
//   - Prices (EUR/USD, GBP/USD, XAU/USD, etc.)
//   - Candles (5m, 15m, 1h, 4h)
//   - Order updates (tus órdenes)
//   - Balance updates
```

### 1.4. Actualizar `src/lib/broker-manager.ts`
Registrar cTrader como broker por defecto:

```typescript
// Mantener OANDA como fallback
// Auto-detectar: si hay CTRADER_APP_ID → usar cTrader
// Si hay OANDA_TOKEN → usar OANDA
```

### 1.5. UI de Configuración Simple
```
┌────────────────────────────────────────┐
│  CONEXIÓN A BROKER                     │
├────────────────────────────────────────┤
│                                        │
│  Broker: [cTrader (IC Markets) ▼]     │
│                                        │
│  cTrader ID: [____________]           │
│  Application ID: [____________]       │
│  Application Secret: [____________]   │
│                                        │
│  Modo: [▢ Demo] [▢ Real]             │
│                                        │
│  [Conectar y Validar]                  │
│                                        │
│  Estado: ✅ Conectado                  │
│  Balance: $1,000.00                   │
│  Equity: $1,050.00                    │
│                                        │
└────────────────────────────────────────┘
```

**Resultado Fase 1:** Tu software se conecta a cTrader, puede obtener precios, balances y ejecutar órdenes.

---

## FASE 2: GESTIÓN DE CAPITAL TIPO MT5 (Semana 1 - Días 4-5)

### 2.1. Crear `src/lib/lot-manager.ts`

```typescript
export type LotMode = 'FIXED' | 'PERCENTAGE' | 'KELLY';

export interface LotConfig {
  mode: LotMode;
  // Modo fijo
  fixedLotSize: number;       // 0.01, 0.05, 0.1, etc.
  // Modo porcentaje
  riskPerTradePct: number;    // 0.5%, 1%, 2%, etc.
  // Modo Kelly
  kellyFraction: number;      // 0.25, 0.50, 1.0
  
  // Límites de seguridad
  minLotSize: number;         // 0.01 mínimo
  maxLotSize: number;         // máximo por trade
  maxTotalExposurePct: number;// máximo exposición total
  
  // Información del símbolo
  symbolLotSize: number;     // tamaño de 1 lote para este par
  symbolPipValue: number;     // valor de 1 pip para este par
}

export class LotManager {
  // Calcula el lote para el trade actual
  calculateLotSize(balance: number, stopLossPips: number, 
                   winRate?: number, avgWin?: number): number;
  
  // Convierte lote a unidades
  lotToUnits(lotSize: number, symbolInfo: SymbolInfo): number;
  
  // Calcula valor del pip para este lote
  calculatePipValue(lotSize: number, symbolInfo: SymbolInfo): number;
  
  // Calcula ganancia/pérdida estimada
  estimatePnL(entryPrice: number, exitPrice: number, 
              lotSize: number, symbolInfo: SymbolInfo): number;
}
```

### 2.2. Integrar en Execution Engine

Reemplazar `calculatePositionSize()` actual con:

```typescript
calculatePositionSize(analysis: FullAnalysis): number {
  const balance = this.getActualBalance();
  const slPips = this.calculateStopLossPips(analysis);
  
  // Usar LotManager en lugar de cálculo manual
  const lotSize = this.lotManager.calculateLotSize(
    balance, 
    slPips,
    this.riskManager.winRate,
    this.riskManager.avgWin
  );
  
  // Convertir lote a unidades para el broker
  return this.lotManager.lotToUnits(lotSize, this.symbolInfo);
}
```

### 2.3. UI de Configuración de Lotes

```
┌────────────────────────────────────────────────┐
│  GESTIÓN DE CAPITAL                            │
├────────────────────────────────────────────────┤
│                                                │
│  Modo de inversión:                            │
│  [●] Lote Fijo    [ ] % Balance   [ ] Kelly   │
│                                                │
│  Tamaño de lote: [0.10 ▼]                     │
│  ────────────────────────────────────         │
│  0.01 │ 0.05 │ 0.10 │ 0.25 │ 0.50 │ 1.00     │
│                                                │
│  ────────────────────────────────────         │
│  INFORMACIÓN POR TRADE:                        │
│  Tamaño: 0.10 lotes = 10,000 unidades         │
│  Valor/pip: $1.00                             │
│  Riesgo (SL 10 pips): $10.00                  │
│  Ganancia (TP 15 pips): $15.00                │
│                                                │
│  ────────────────────────────────────         │
│  MODO RÁFAGA (señales fuertes):               │
│  STRONG (65+): 5 trades × 0.10 = 0.50 total  │
│  VERY_STRONG (78+): 10 trades × 0.10 = 1.00  │
│  EXTREME (90+): 15 trades × 0.10 = 1.50      │
│                                                │
│  [Guardar Configuración]                       │
│                                                │
└────────────────────────────────────────────────┘
```

**Resultado Fase 2:** Puedes elegir cuánto invertir por trade, exactamente como MT5.

---

## FASE 3: BURST MODE ADAPTADO A FOREX (Semana 2 - Días 6-8)

### 3.1. Actualizar `burst-engine.ts`

Adaptar para usar lotes en lugar de cantidades fijas:

```typescript
// Antes: executeBurst(symbol, side, signalStrength, analysis, ...)
// Ahora: executeBurst(symbol, side, lotSize, signalStrength, analysis, ...)

// Ejemplo con balance $1,000 y lote 0.10:
// Señal STRONG → 5 trades × 0.10 lotes = 0.50 lotes total
// Exposición: $50,000 (con leverage 1:100 → $500 margen)
// Si cada trade gana 10 pips: 5 × $10 = $50 ganancia
```

### 3.2. Rate Limiter para cTrader

```typescript
// cTrader permite 50 req/seg → más que suficiente
// Implementar cola de órdenes con 100ms delay entre trades
// Burst de 15 trades = 1.5 segundos total
```

### 3.3. Estrategia de Scalping Forex

```typescript
// Optimizada para Forex:
// - EUR/USD: TP 5-10 pips, SL 3-5 pips
// - XAU/USD: TP 20-30 pips, SL 10-15 pips
// - GBP/USD: TP 8-12 pips, SL 5-8 pips

// Time-based:
// - Máximo holding: 5 minutos
// - Break-even: a los 3 pips a favor
// - Trail: cada 2 pips a favor
```

### 3.4. Perfil de Trading "Ganancias Acumulativas"

```
┌─────────────────────────────────────────────────┐
│  PERFIL: SCALPER FOREX AUTOMÁTICO               │
├─────────────────────────────────────────────────┤
│                                                  │
│  PAR: EUR/USD                                   │
│  LOTE: 0.10 (ajustable)                        │
│  LEVERAGE: 1:100                                │
│                                                  │
│  ESTRATEGIA: Scalping                           │
│  TAKE PROFIT: 8 pips ($8 por trade)            │
│  STOP LOSS: 5 pips ($5 por trade)              │
│  TRAILING: Activo (3 pips)                     │
│  TIME STOP: 5 minutos                          │
│                                                  │
│  BURST MODE: Activo                            │
│  MIN SEÑAL: 65                                  │
│  MAX TRADES/RÁFAGA: 10                         │
│  DELAY ENTRE TRADES: 100ms                     │
│                                                  │
│  PROYECCIÓN DIARIA:                             │
│  → Win Rate esperado: 65%                       │
│  → Trades/día: ~50 (5 ráfagas × 10 trades)     │
│  → Ganancia promedio: 6 pips ($6)              │
│  → Pérdida promedio: 4 pips ($4)               │
│  → Ganancia neta: (32×$6) - (18×$4) = $120    │
│  → Comisiones: 50 × $0.70 = $35                │
│  → NETO DIARIO: ~$85 (8.5%)                    │
│  → NETO MENSUAL: ~$1,700 (170%)               │
│                                                  │
│  ⚠️ ESTO ES PROYECCIÓN, NO GARANTÍA            │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Resultado Fase 3:** El burst mode funciona con lotes Forex reales, ejecutando múltiples trades por señal fuerte.

---

## FASE 4: UI TIPO METATRADER 5 (Semana 2 - Días 9-10)

### 4.1. Panel de Trading Rápido

```
┌───────────────────────────────────────────────────────┐
│  EJECUTAR ORDEN                                       │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Símbolo: [EUR/USD ▼]  Bid: 1.08542  Ask: 1.08544   │
│                                                       │
│  Tipo: [Ejecución a Mercado ▼]                       │
│                                                       │
│  Volumen: [0.10] lotes                               │
│  ┌────┬────┬────┬────┬────┬────┐                     │
│  │0.01│0.05│0.10│0.25│0.50│1.00│                     │
│  └────┴────┴────┴────┴────┴────┘                     │
│                                                       │
│  Stop Loss: [1.08500] (4.2 pips) [en gráfico]       │
│  Take Profit: [1.08600] (5.6 pips) [en gráfico]     │
│                                                       │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │   COMPRAR        │  │   VENDER         │          │
│  │   1.08544        │  │   1.08542        │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                       │
│  [▢] Activar trading automático                      │
│  [▢] Usar lotes dinámicos (1% balance)               │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 4.2. Terminal de Posiciones (como MT5)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  POSICIONES ABIERTAS                                          [Refrescar] │
├──────────────────────────────────────────────────────────────────────────┤
│  #    │ Símbolo  │ Tipo │ Lote  │ Precio   │ SL      │ TP      │ PnL    │
│  ─────┼──────────┼──────┼───────┼──────────┼─────────┼─────────┼────────│
│  1245 │ EUR/USD  │ BUY  │ 0.10  │ 1.08542  │ 1.08500 │ 1.08600 │ +$3.20 │
│  1246 │ EUR/USD  │ BUY  │ 0.10  │ 1.08545  │ 1.08500 │ 1.08600 │ +$2.90 │
│  1247 │ EUR/USD  │ BUY  │ 0.10  │ 1.08548  │ 1.08500 │ 1.08600 │ +$2.60 │
│  1248 │ EUR/USD  │ BUY  │ 0.10  │ 1.08550  │ 1.08500 │ 1.08600 │ +$2.40 │
│  1249 │ EUR/USD  │ BUY  │ 0.10  │ 1.08552  │ 1.08500 │ 1.08600 │ +$2.20 │
│       │          │      │       │          │         │         │        │
│       │          │      │       │ TOTAL:   │         │         │+$13.30 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3. Panel de Historial

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HISTORIAL DE TRADES                                       [Exportar CSV] │
├──────────────────────────────────────────────────────────────────────────┤
│  Fecha      │ Símbolo  │ Tipo │ Lote  │ Entry    │ Exit     │ PnL      │
│  ───────────┼──────────┼──────┼───────┼──────────┼──────────┼──────────│
│  14:32:15   │ EUR/USD  │ BUY  │ 0.10  │ 1.08542  │ 1.08592  │ +$5.00   │
│  14:32:15   │ EUR/USD  │ BUY  │ 0.10  │ 1.08545  │ 1.08595  │ +$5.00   │
│  14:32:16   │ EUR/USD  │ BUY  │ 0.10  │ 1.08548  │ 1.08538  │ -$1.00   │
│  14:32:16   │ EUR/USD  │ BUY  │ 0.10  │ 1.08550  │ 1.08600  │ +$5.00   │
│  14:32:16   │ EUR/USD  │ BUY  │ 0.10  │ 1.08552  │ 1.08602  │ +$5.00   │
│             │          │      │       │          │          │          │
│  RÁFAGA #45 │ 5 trades │ 4/5    │ 0.50  │          │          │ +$19.00│
└──────────────────────────────────────────────────────────────────────────┘
```

**Resultado Fase 4:** Interfaz profesional tipo MT5, fácil de usar.

---

## FASE 5: GESTIÓN DE RIESGO Y SEGURIDAD (Semana 3 - Días 11-12)

### 5.1. Protectores Automáticos

```typescript
// Daily Profit Target
// Si ganas X% hoy → detener trading (proteger ganancias)
dailyProfitTarget: 5.0  // 5% diario objetivo

// Max Drawdown
// Si pierdes X% → detener TODO y notificar
maxDrawdown: 10.0  // 10% máximo

// Max Trades por día
// Limita sobre-exposición
maxTradesPerDay: 200

// Cooldown después de pérdida
// Esperar X minutos después de una pérdida
lossCooldownMinutes: 5
```

### 5.2. Gestión de Ráfagas con Límites

```typescript
// Si una ráfaga pierde X trades consecutivos → detener
burstStopLoss: 3  // 3 trades perdedores en ráfaga = cerrar todo

// Si una ráfaga gana X% → tomar ganancias
burstTakeProfit: 2.0  // 2% ganancia en ráfaga = cerrar todo

// Exposición máxima por ráfaga
maxBurstExposurePct: 15  // máximo 15% del balance en una ráfaga
```

### 5.3. Alertas y Notificaciones

```typescript
// Notificar al usuario cuando:
// - Se activa una ráfaga
// - Una ráfaga cierra (ganancia o pérdida)
// - Se alcanza el límite diario
// - Hay un error de conexión
// - Balance cambia drásticamente
```

**Resultado Fase 5:** Sistema protegido contra pérdidas catastróficas.

---

# 📅 CRONOGRAMA TOTAL

| Semana | Días | Fase | Resultado |
|--------|------|------|-----------|
| **Semana 1** | 1-3 | Adaptador cTrader | Software conectado a broker |
| | 4-5 | Gestión de Capital (lotes MT5) | Control de inversión por trade |
| **Semana 2** | 6-8 | Burst Mode Forex | Múltiples trades por señal |
| | 9-10 | UI tipo MT5 | Interfaz profesional |
| **Semana 3** | 11-12 | Risk Management | Protección automática |
| | 13-14 | Testing + Optimización | Todo funcionando y probado |

**Total: 14 días (2 semanas) para versión funcional completa**

---

# 🚀 PASOS PARA EMPEZAR HOY

## 1. Crear cuenta en cTrader (5 minutos)
- Ir a `https://icmarkets.com` o `https://pepperstone.com`
- Abrir cuenta DEMO con cTrader
- Obtener cTrader ID

## 2. Obtener credenciales de API (10 minutos)
- Ir a `https://id.ctrader.com/`
- Crear aplicación → obtener App ID y Secret
- Guardar credenciales

## 3. Instalar SDK (1 minuto)
```bash
pip install ctrader-open-api
# o usar wrapper en TypeScript
```

## 4. Probar conexión (5 minutos)
```python
from ctrader_open_api import Client
client = Client(app_id, app_secret, ctrader_id)
balance = await client.get_balance()
print(f"Balance: ${balance}")
```

## 5. Implementar en tu software (14 días)
- Seguir el plan de arriba fase por fase

---

# ⚠️ ADVERTENCIAS REALES

1. **NINGÚN sistema garantiza ganancias** - Esto es trading, hay riesgo real
2. **EMPIEZA SIEMPRE EN DEMO** - Mínimo 1000 trades antes de usar dinero real
3. **Nunca arriesgues más del 1-2%** por trade
4. **Los fees importan** - Con 50 trades/día × $0.70 = $35/día en comisiones
5. **Backtestear antes de usar** - Probar con datos históricos primero
6. **Monitorear constantemente** - Revisar logs y métricas cada día
7. **Las proyecciones NO son garantías** - El mercado real es impredecible

---

# 💡 CONCLUSIÓN

**La mejor opción para tu objetivo es:**
- **Broker**: IC Markets o Pepperstone
- **Plataforma**: cTrader (vía cTrader Open API)
- **Por qué**: Setup rápido (20 min), API potente (50 req/seg), lotes desde 0.01, spread bajísimo (0.02 pips), gratis, Linux compatible

**OANDA debe ser reemplazado** porque sus límites (1000 órdenes/día) y latencia (1-3 seg) imposibilitan tu objetivo de muchos trades rápidos.

**El plan concreto** está arriba: 14 días de implementación en 5 fases para tener un software profesional tipo MT5 pero automatizado.
