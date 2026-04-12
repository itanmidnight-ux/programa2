# 🚀 PLAN MAESTO: Software Automatizado de Ganancias con Trading

## 📌 OBJETIVO FINAL
Convertir RECO-TRADING en un **software automatizado tipo MetaTrader 5** que genere ganancias consistentes mediante:
- **Ganancias mínimas con muchos trades** (scalping automatizado)
- **Gestión de capital tipo MT5** (lotes desde 0.01 hasta lo que el usuario quiera)
- **Brokers simples de usar** (fáciles de configurar y entender)

---

# 📊 PARTE 1: ANÁLISIS DE BROKERS - OANDA vs ALTERNATIVAS

## 🔴 OANDA (Actual)

### Ventajas
- ✅ API REST completa y bien documentada
- ✅ Sin comisiones por trade (solo spread)
- ✅ Testnet gratuito para pruebas
- ✅ Soporta Forex, Metales, Energía, Índices
- ✅ Regulación sólida (EEUU, UK, Japón)
- ✅ Sin depósito mínimo para cuenta demo

### Desventajas
- ❌ **Complejo**: Requiere Account ID + API Token (difícil de obtener)
- ❌ **Verificación KYC obligatoria** para cuenta real
- ❌ **Límites estrictos**: 500 requests/minuto, 1000 órdenes/día en demo
- ❌ **No soporta crypto** (solo Forex/CFDs)
- ❌ **Spread alto** en algunos pares (XAU/USD puede ser 2-3 pips)
- ❌ **No tiene WebSockets** públicos (solo polling)
- ❌ **Lento**: Confirmación de órdenes tarda 1-3 segundos

### Veredicto para tu caso
**OANDA NO es ideal para tu objetivo** porque:
- Es complejo de configurar
- Los límites de API restringen el burst mode (máx 1000 órdenes/día)
- La latencia alta impide scalping efectivo
- No permite la flexibilidad de lotes tipo MT5

---

## 🟢 ALTERNATIVA 1: Binance (Crypto)

### Ventajas
- ✅ **API extremadamente simple**: Solo API Key + Secret
- ✅ **Sin KYC para trading con cantidades pequeñas** (<$10K)
- ✅ **Lotes flexibles**: Desde 0.00001 BTC hasta lo que quieras
- ✅ **WebSockets gratuitos** (streaming en tiempo real, latencia <100ms)
- ✅ **Sin límites de órdenes** razonables (1200 requests/minuto)
- ✅ **Testnet gratuito** instantáneo
- ✅ **Comisiones bajísimas**: 0.1% spot, 0.02% futures
- ✅ **Mercado 24/7** (no cierra nunca)
- ✅ **Leverage hasta 125x** en futures
- ✅ **Cualquier persona puede crear cuenta en 5 minutos**

### Desventajas
- ❌ **Solo crypto** (no Forex, no índices tradicionales)
- ❌ **Volatilidad alta** (puede ser ventaja o riesgo)
- ❌ **Regulación variable** por país

### Pares Disponibles
- **BTC/USDT, ETH/USDT, BNB/USDT** (top crypto)
- **XRP/USDT, SOL/USDT, ADA/USDT** (mid cap)
- **DOGE/USDT, SHIB/USDT** (memecoins, alta volatilidad = más oportunidades)

### Veredicto
**⭐ MEJOR OPCIÓN PARA TU CASO** porque:
- Setup en 5 minutos vs horas/días de OANDA
- API rápida y sin límites restrictivos
- Perfecto para burst mode (muchos trades rápidos)
- Costos de transacción muy bajos
- Ya tienes código de Binance en programa2

---

## 🟡 ALTERNATIVA 2: Bybit (Crypto)

### Ventajas
- ✅ API simple como Binance
- ✅ Comisiones similares
- ✅ Buenos WebSockets
- ✅ Más amigable con bots que Binance

### Desventajas
- ❌ Menos liquidez que Binance
- ❌ Menos pares disponibles
- ❌ Regulación más débil

### Veredicto
**Buena segunda opción** si Binance tiene problemas en tu país.

---

## 🟡 ALTERNATIVA 3: Interactive Brokers

### Ventajas
- ✅ Acceso a TODO: Forex, Stocks, Options, Futures, Crypto
- ✅ API profesional (TWS API)
- ✅ Regulación máxima

### Desventajas
- ❌ **Muy complejo** (peor que OANDA)
- ❌ Requiere cuenta real ($0 mínimo pero KYC obligatorio)
- ❌ API antigua y complicada
- ❌ Comisiones por trade ($0.005-0.01 por acción)

### Veredicto
**No recomendado** - Demasiado complejo para tu objetivo.

---

## 📊 TABLA COMPARATIVA FINAL

| Característica | OANDA | Binance | Bybit | IB |
|---|---|---|---|---|
| **Facilidad de setup** | 🔴 Difícil (horas) | 🟢 5 minutos | 🟢 5 minutos | 🔴 Muy difícil |
| **Límites API** | 🔴 500/min, 1000/día | 🟢 1200/min | 🟢 600/min | 🟡 Variable |
| **Latencia** | 🔴 1-3 segundos | 🟢 <100ms | 🟢 <100ms | 🔴 2-5 segundos |
| **Costo por trade** | 🟡 Spread (2-3 pips) | 🟢 0.1% | 🟢 0.1% | 🟡 $0.01+ |
| **Lotes flexibles** | 🔴 Lotes estándar | 🟢 Desde 0.00001 | 🟢 Desde 0.00001 | 🟡 1 acción |
| **Testnet** | 🟡 Sí pero complejo | 🟢 Instantáneo | 🟢 Instantáneo | 🔴 No |
| **WebSockets** | 🔴 No | 🟢 Sí | 🟢 Sí | 🟡 Parcial |
| **Mercado** | 🔴 Forex/CFDs solo | 🟢 Crypto 24/7 | 🟢 Crypto 24/7 | 🟢 Todo |
| **Ideal para burst** | 🔴 No (límites) | 🟢 Sí | 🟢 Sí | 🔴 No |
| **Tu caso de uso** | 🔴 3/10 | 🟢 9/10 | 🟢 8/10 | 🔴 2/10 |

---

# 🎯 RECOMENDACIÓN DE BROKER

## **Opción Principal: Binance (Futures)**

**Por qué:**
1. Setup en 5 minutos (crear cuenta → API Keys → listo)
2. Permite cientos de trades por minuto sin problema
3. Lotes ultra flexibles (0.00001 BTC = ~$0.60 al precio actual)
4. Fees de 0.02% en futures (casi nada)
5. Leverage configurable (1x a 125x)
6. WebSockets para datos en tiempo real
7. Testnet instantáneo (https://testnet.binancefuture.com)

**Configuración sugerida:**
- **Modo**: Futures USDT-M (perpetual)
- **Leverage**: 5x-10x (balance entre riesgo y ganancia)
- **Margen**: Cross (para burst mode) o Isolated (para control individual)
- **Pares**: BTC/USDT, ETH/USDT, BNB/USDT (alta liquidez, bajo spread)

---

# 💰 PARTE 2: SISTEMA DE GESTIÓN DE CAPITAL TIPO METATRADER 5

## 📋 Cómo Funciona MetaTrader 5

### Concepto de Lotes en MT5
- **1 Lote Estándar** = 100,000 unidades de la moneda base
- **1 Mini Lote** = 10,000 unidades (0.1 lotes)
- **1 Micro Lote** = 1,000 unidades (0.01 lotes)
- **1 Nano Lote** = 100 unidades (0.001 lotes) - algunos brokers

### En MT5 el usuario configura:
1. **Lot Size fijo**: 0.01, 0.05, 0.1, 0.5, 1.0, etc.
2. **% de riesgo por trade**: 1%, 2%, 3% del balance
3. **Lotes dinámicos**: Auto-calcular basado en balance
4. **Stop Loss en pips**: Fijo o basado en ATR
5. **Take Profit en pips**: Fijo o basado en ATR

### Fórmula de MT5 para calcular ganancia/pérdida:
```
Profit = (Precio Salida - Precio Entrada) × Tamaño Lote × Valor del Pip
```

Para EUR/USD:
- 1 pip = 0.0001
- 1 lote estándar = $10/pip
- 0.01 lotes = $0.10/pip
- 0.1 lotes = $1/pip
- 1.0 lotes = $10/pip

---

## 🔧 SISTEMA PROPUESTO PARA RECO-TRADING

### Modo de Operación: "Lotes Flexibles"

El usuario elige entre 3 modos:

#### MODO 1: Lote Fijo (Simple)
```
Tamaño por trade: [0.01 | 0.05 | 0.1 | 0.25 | 0.5 | 1.0 | personalizado]
```
- Cada trade usa exactamente ese tamaño
- Ideal para principiantes
- Ejemplo: 0.01 BTC = ~$600 a precio actual de $60K

#### MODO 2: % de Balance (Semi-Auto)
```
Riesgo por trade: [0.5% | 1% | 2% | 3% | personalizado]%
```
- Calcula automáticamente: `tamaño = balance × riesgo%`
- Ajusta dinámicamente según el balance actual
- Ejemplo: Balance $1000, riesgo 1% = $10 por trade

#### MODO 3: Kelly Criterion (Auto Total)
```
Modo Kelly: [25% | 50% | 100%] del Kelly óptimo
```
- Basado en tasa de aciertos histórica
- Maximiza crecimiento a largo plazo
- Requiere mínimo 20 trades cerrados

---

### Configuración Sugerida para tu Objetivo (muchas ganancias pequeñas)

```
┌─────────────────────────────────────────────┐
│  MODO DE INVERSIÓN AUTOMÁTICO                │
├─────────────────────────────────────────────┤
│                                              │
│  Modo: [📊 % de Balance]                    │
│  Riesgo por trade: [1.0]%                   │
│  Balance actual: $1,000.00                  │
│  → Tamaño por trade: $10.00                 │
│                                              │
│  🚀 MODO RÁFAGA ACTIVO                       │
│  Señal STRONG: 5 trades simultáneos         │
│  → Exposición total: $50.00 (5%)            │
│                                              │
│  📈 Proyección:                              │
│  5 trades × 0.3% ganancia = 1.5% diario     │
│  1.5% × 20 días = 30% mensual               │
│  → $1,000 → $1,300/mes                      │
│                                              │
│  ⚙️ Configuración avanzada                   │
│  [ ] Lote mínimo: 0.01 BTC                  │
│  [ ] Lote máximo: 1.0 BTC                   │
│  [ ] Leverage: 10x                          │
│  [ ] Stop Loss: ATR × 2                     │
│  [ ] Take Profit: ATR × 3                   │
│                                              │
└─────────────────────────────────────────────┘
```

---

# 📊 PARTE 3: PLAN DE IMPLEMENTACIÓN COMPLETO

## FASE A: MIGRACIÓN A BINANCE (Prioridad MÁXIMA)

### A.1. Crear Adaptador Binance (`src/lib/binance-adapter.ts`)
```typescript
// Implementar IBroker interface con Binance Futures
// - placeMarketOrder(symbol, side, quantity)
// - getKlines(symbol, timeframe, limit)
// - getTickerPrice(symbol)
// - getAccountBalance()
// - getOrderBook(symbol)
// - closePosition(symbol, quantity)
// - WebSockets para streaming de precios
```

**Tiempo estimado**: 1 día

### A.2. Implementar Binance WebSocket (`src/lib/binance-ws.ts`)
```typescript
// Conectar a wss://fstream.binance.com/ws
// Suscribir a múltiples streams:
// - kline (velas en tiempo real)
// - ticker (precio actual)
// - depth (order book)
// - user data (órdenes propias)
```

**Tiempo estimado**: 1 día

### A.3. Actualizar Broker Manager
```typescript
// Registrar Binance como broker por defecto
// Mantener OANDA como alternativa (por si acaso)
// Auto-detectar configuración basada en .env
```

**Tiempo estimado**: 2 horas

### A.4. Crear Configurador de Binance
```typescript
// UI simple en Settings:
// - API Key
// - API Secret  
// - Testnet checkbox
// - Botón "Conectar y validar"
// - Mostrar balance disponible
```

**Tiempo estimado**: 4 horas

---

## FASE B: SISTEMA DE LOTES FLEXIBLES (Tipo MT5)

### B.1. Crear Módulo de Gestión de Capital (`src/lib/lot-manager.ts`)
```typescript
export type LotMode = 'FIXED' | 'PERCENTAGE' | 'KELLY';

export interface LotConfig {
  mode: LotMode;
  // Modo Fijo
  fixedLotSize: number;        // 0.01, 0.1, 1.0, etc.
  // Modo Porcentaje
  riskPerTradePct: number;     // 0.5%, 1%, 2%, etc.
  // Modo Kelly
  kellyFraction: number;       // 0.25 (25% Kelly), 0.50, 1.0
  
  // Límites
  minLotSize: number;          // 0.00001 BTC mínimo
  maxLotSize: number;          // Máximo por trade
  maxTotalExposure: number;    // Máximo exposición total
  
  // Leverage
  leverage: number;            // 1x a 125x
  marginType: 'CROSS' | 'ISOLATED';
}

export class LotManager {
  // Calcula el tamaño del lote para cada trade
  calculateLotSize(balance: number, winRate: number, avgWin: number): number;
  
  // Convierte lot size a cantidad real
  lotSizeToQuantity(lotSize: number, symbolPrice: number): number;
  
  // Calcula ganancia/pérdida estimada
  estimatePnL(entryPrice: number, exitPrice: number, lotSize: number): number;
}
```

**Tiempo estimado**: 1 día

### B.2. Integrar LotManager en Execution Engine
```typescript
// Reemplazar calculatePositionSize() actual
// con LotManager.calculateLotSize()
// Respetar el modo elegido por el usuario
```

**Tiempo estimado**: 3 horas

### B.3. UI de Configuración de Lotes
```tsx
// Componente: src/components/dashboard/lot-config-panel.tsx
// Selector de modo (Fijo / % / Kelly)
// Slider para ajustar tamaño
// Preview de cuánto será por trade
// Proyección de ganancias mensuales
```

**Tiempo estimado**: 1 día

---

## FASE C: OPTIMIZACIÓN PARA MUCHOS TRADES

### C.1. Rate Limiter Inteligente
```typescript
// src/lib/rate-limiter.ts
// Binance: 1200 requests/minuto
// Permitir hasta 20 requests/segundo
// Cola de órdenes si se excede
// Backoff exponencial si el API rechaza
```

**Tiempo estimado**: 4 horas

### C.2. Orden Management Mejorado
```typescript
// src/lib/order-queue.ts
// Cola de órdenes para burst mode
// Ejecución paralela con Promise.all
// Manejo de fallos individual
// Reintento automático si una orden falla
```

**Tiempo estimado**: 6 horas

### C.3. Actualizar Burst Engine
```typescript
// Adaptar para lot sizes flexibles
// Ejemplo: Señal EXTREME con balance $1000
// - Modo 1% riesgo = $10/trade
// - 15 trades = $150 exposición total
// - Cada trade = 0.00016 BTC (a $60K)
// - Leverage 10x = posición de $100/trade
```

**Tiempo estimado**: 4 horas

---

## FASE D: SCALPING AUTOMATIZADO

### D.1. Estrategia de Scalping Optimizada
```typescript
// Ajustar ScalpingStrategy para:
// - Entradas rápidas (basadas en order flow)
// - SL muy ajustado (0.1-0.3%)
// - TP rápido (0.2-0.5%)
// - Duración máxima: 30-60 segundos
// - Ideal para alta frecuencia
```

**Tiempo estimado**: 1 día

### D.2. Modo "Ganancias Mínimas Acumulativas"
```typescript
// Estrategia conservadora:
// - Buscar ganancias de 0.1% - 0.3% por trade
// - 50-100 trades por día
// - Win rate objetivo: 60-70%
// - Ganancia diaria: 5-10%
// - Ganancia mensual: 150-300%
```

**Tiempo estimado**: 2 días

### D.3. Sistema de "Trailing Scalp"
```typescript
// Si el trade va a favor:
// - A los 0.1% profit → mover SL a break-even
// - A los 0.2% profit → cerrar 50% de posición
// - A los 0.3% profit → cerrar todo
// Esto asegura ganancias aunque sean mínimas
```

**Tiempo estimado**: 1 día

---

## FASE E: UI TIPO METATRADER 5

### E.1. Panel de Trading Rápido
```tsx
// src/components/dashboard/quick-trade.tsx
// Similar al panel de "Nueva Orden" de MT5:
// - Símbolo: [BTC/USDT ▼]
// - Tipo: [Market Execution]
// - Volumen: [0.01] [0.05] [0.1] [0.5] [custom]
// - Stop Loss: [0.00]
// - Take Profit: [0.00]
// - [BUY] [SELL]
// - [ ] Activar trading automático
// - [ ] Configurar lotes dinámicos
```

**Tiempo estimado**: 1 día

### E.2. Terminal de Trades (como MT5)
```tsx
// src/components/dashboard/trade-terminal.tsx
// Tabs: Trade | Exposición | Historial | Alertas
// Tab Trade: Tabla de posiciones abiertas
// Tab Exposición: Resumen de riesgo
// Tab Historial: Todos los trades cerrados
// Tab Alertas: Notificaciones de señales
```

**Tiempo estimado**: 2 días

### E.3. Chart con Trading Integrado
```tsx
// Mejorar charts-panel.tsx
// - Mostrar líneas de SL/TP directamente en el gráfico
// - Botones de BUY/SELL sobre el gráfico
// - Click en gráfico para colocar órdenes
// - Similar a TradingView
```

**Tiempo estimado**: 2 días

---

## FASE F: GESTIÓN DE RIESGO AVANZADA

### F.1. Daily Profit Target
```typescript
// Meta diaria: cuando alcanza X% de ganancia, detener trading
// Ejemplo: Si ganaste 5% hoy → pausar hasta mañana
// Protege ganancias del día
```

**Tiempo estimado**: 3 horas

### F.2. Max Drawdown Protector
```typescript
// Si pierdes X% del balance → detener todo
// Notificar al usuario
// Requiere confirmación para reanudar
```

**Tiempo estimado**: 3 horas

### F.3. Correlation Management
```typescript
// No abrir trades en pares correlacionados simultáneamente
// Ejemplo: Si BTC/USDT y ETH/USDT están 85% correlacionados
// → Solo operar uno a la vez
```

**Tiempo estimado**: 1 día

---

# 📅 ORDEN DE EJECUCIÓN RECOMENDADO

## SEMANA 1: Migración a Binance + Lotes
- **Día 1-2**: Binance Adapter + WebSocket
- **Día 3**: Broker Manager + Configurador UI
- **Día 4**: Lot Manager + integración
- **Día 5**: UI de lotes flexibles + testing

## SEMANA 2: Optimización Burst + Scalping
- **Día 6**: Rate Limiter + Order Queue
- **Día 7**: Burst Engine adaptado a Binance
- **Día 8**: Scalping Strategy optimizada
- **Día 9**: Trailing Scalp + Profit Target
- **Día 10**: Testing completo

## SEMANA 3: UI tipo MT5 + Refinamiento
- **Día 11**: Quick Trade Panel
- **Día 12**: Trade Terminal
- **Día 13**: Charts mejorados
- **Día 14**: Risk Management avanzado
- **Día 15**: Testing final + documentación

---

# 💡 CONFIGURACIÓN SUGERIDA PARA TU CASO

## Perfil: "Ganancias Mínimas Acumulativas"

```
┌─────────────────────────────────────────────┐
│ PERFIL: SCALPER AUTOMÁTICO                  │
├─────────────────────────────────────────────┤
│                                              │
│  BROKER: Binance Futures                    │
│  PAR: BTC/USDT (o ETH/USDT)                 │
│  LEVERAGE: 10x                              │
│  MARGEN: Isolated                           │
│                                              │
│  MODO DE INVERSIÓN: % de Balance            │
│  RIESGO POR TRADE: 1%                       │
│  LOTE MÍNIMO: 0.00001 BTC                   │
│  LOTE MÁXIMO: 0.1 BTC                       │
│                                              │
│  BURST MODE: ACTIVO                         │
│  MIN SIGNAL STRENGTH: 65                    │
│  MAX TRADES POR RÁFAGA: 10                  │
│  DELAY ENTRE TRADES: 100ms                  │
│                                              │
│  ESTRATEGIA: Scalping                       │
│  TAKE PROFIT: 0.3%                          │
│  STOP LOSS: 0.15%                           │
│  TRAILING: ACTIVO (0.1%)                    │
│  TIME STOP: 60 segundos                     │
│                                              │
│  DAILY PROFIT TARGET: 5%                    │
│  MAX DRAWDOWN: 10%                          │
│  MAX TRADES POR DÍA: 200                    │
│                                              │
│  PROYECCIÓN MENSUAL:                        │
│  → Win Rate: 65%                            │
│  → Trades/día: ~100                         │
│  → Profit/trade: 0.15%                      │
│  → Profit diario: ~10%                      │
│  → Profit mensual: ~300%                    │
│  → $1,000 → $4,000/mes                      │
│                                              │
└─────────────────────────────────────────────┘
```

---

# ⚠️ ADVERTENCIAS IMPORTANTES

1. **Ningún sistema garantiza ganancias** - El trading siempre implica riesgo
2. **Backtestear antes de usar dinero real** - Mínimo 1000 trades en demo
3. **Empezar con cantidades pequeñas** - No arriesgar más del 1-2% por trade
4. **Monitorear constantemente** - Revisar logs y métricas diariamente
5. **Tener plan de salida** - Saber cuándo detenerse si las cosas van mal
6. **Los fees impactan** - Con muchos trades, los 0.02% por trade se acumulan
7. **La volatilidad es arma de doble filo** - Puede generar ganancias O pérdidas grandes

---

# 🎯 PRÓXIMOS PASOS

1. **¿Aprobamos este plan?** - Decidir si Binance es el broker a usar
2. **¿Qué fase primero?** - Recomendar empezar con Fase A (Binance) + Fase B (Lotes)
3. **¿Presupuesto de tiempo?** - 3 semanas de implementación
4. **¿Presupuesto de capital?** - Recomendar empezar con $100-500 en testnet, luego $100-1000 en real
