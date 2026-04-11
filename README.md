# RECO-TRADING v3.0 — Plataforma de Trading Multi-Mercado

> Software profesional de trading automatizado para **Forex, Metales, Energía e Índices** a través de **OANDA**.

---

## 📋 Tabla de Contenidos

1. [Descripción](#descripción)
2. [Mercados Soportados](#mercados-soportados)
3. [Requisitos Previos](#requisitos-previos)
4. [Obtener Credenciales de OANDA](#obtener-credenciales-de-oanda)
5. [Instalación](#instalación)
6. [Ejecución](#ejecución)
7. [Configuración de Credenciales](#configuración-de-credenciales)
8. [Estructura del Proyecto](#estructura-del-proyecto)
9. [Solución de Problemas](#solución-de-problemas)

---

## Descripción

RECO-Trading es una plataforma automatizada de trading que se conecta a **OANDA** para operar en:

| Categoría | Instrumentos |
|-----------|-------------|
| **Metales** | Oro (XAU/USD), Plata (XAG/USD) |
| **Forex** | EUR/USD, GBP/USD, USD/JPY |
| **Energía** | Petróleo WTI (WTI/USD) |
| **Índices** | US30 (Dow Jones), NAS100 (NASDAQ) |

**Características principales:**
- ✅ Trading automático con análisis técnico de 30+ indicadores
- ✅ Gestión de riesgo inteligente con stop loss y take profit dinámicos
- ✅ Cierre rápido de ganancias (scalping automatizado)
- ✅ Dashboard web en tiempo real
- ✅ Conexión vía WebSocket REST optimizada

---

## Mercados Soportados

| Símbolo | Nombre | Pip Size | Horario |
|---------|--------|----------|---------|
| `XAU_USD` | Oro/USD | 0.01 | 24/5 (Lun 22:00 – Vie 22:00 UTC) |
| `XAG_USD` | Plata/USD | 0.001 | 24/5 |
| `EUR_USD` | Euro/Dólar | 0.0001 | 24/5 |
| `GBP_USD` | Libra/Dólar | 0.0001 | 24/5 |
| `USD_JPY` | Dólar/Yen | 0.01 | 24/5 |
| `WTI_USD` | Petróleo WTI | 0.01 | 24/5 |
| `US30_USD` | Dow Jones | 0.1 | Horario bolsa USA |
| `NAS100_USD` | NASDAQ | 0.1 | Horario bolsa USA |

---

## Requisitos Previos

| Requisito | Versión Mínima |
|-----------|---------------|
| **Node.js** | 18.0+ |
| **Bun** | 1.0+ |
| **RAM** | 2 GB mínimo |
| **Disco** | 1 GB libre |
| **Conexión a internet** | Sí (acceso a api-fxpractice.oanda.com) |

### Instalar Bun (si no lo tienes):
```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
```

---

## Obtener Credenciales de OANDA

### Opción A: Cuenta Demo (GRATIS — Recomendado para empezar)

**Paso 1:** Ve a https://www.oanda.com/demo-account/

**Paso 2:** Rellena el formulario:
- Nombre, email, teléfono
- País de residencia
- Selecciona "Demo Account"

**Paso 3:** Recibirás un email de confirmación. Activa tu cuenta.

**Paso 4:** Inicia sesión en el dashboard: https://www.oanda.com/dashboard/

**Paso 5:** Genera tu API Token:
1. Ve a **Account** → **Manage API Access**
2. Haz clic en **Generate Token**
3. Copia el **Account ID** (ejemplo: `12345678`)
4. Copia el **API Token** (cadena larga de caracteres)

> **⚠️ Importante:** Guarda ambos valores. Los necesitarás para configurar el programa.

---

### Opción B: Cuenta Real (Dinero real — Solo cuando estés listo)

**Paso 1:** Ve a https://www.oanda.com/

**Paso 2:** Registra una cuenta real:
- Proporciona documentación de identidad
- Deposita fondos mínimos (varía por región, típicamente $100-250)

**Paso 3:** Una vez aprobada, genera tu API Token:
1. Dashboard → **Account** → **Manage API Access**
2. Genera un token para tu cuenta live

> **⚠️ ADVERTENCIA:** La cuenta real opera con dinero real. Solo úsala cuando hayas probado exhaustivamente en demo.

---

## Instalación

### Paso 1: Navega al directorio del proyecto
```bash
cd /home/kali/Downloads/real
```

### Paso 2: Ejecuta el instalador
```bash
./install.sh
```

El instalador hará:
1. ✅ Verifica Bun runtime
2. ✅ Crea archivo `.env` con configuración
3. ✅ Instala dependencias
4. ✅ Configura la base de datos
5. ✅ Compila la aplicación

### Paso 3: Verifica la instalación
```bash
./health-check.sh
```

---

## Ejecución

### Inicio normal (todo automático):
```bash
./run.sh
```

El script:
1. ✅ Inicia el servidor web en `http://localhost:3000`
2. ✅ Inicia el motor de trading automáticamente
3. ✅ Muestra logs en tiempo real

### Para detener:
```bash
./stop.sh
```

### Para verificar estado:
```bash
./health-check.sh
```

### Para monitorear logs:
```bash
tail -f server.log | grep -E "(ENGINE|Trade|💰)"
```

---

## Configuración de Credenciales

### Método 1: Desde el Dashboard (Recomendado)

1. Abre http://localhost:3000
2. Ve a **Settings** (panel lateral)
3. Busca la sección **OANDA Credentials**
4. Ingresa:
   - **Account ID**: Tu ID de cuenta OANDA
   - **API Token**: Tu token de API
   - **Cuenta Demo**: Actívalo para demo, desactívalo para live
5. Click en **Validar** — Deberías ver "Conexión exitosa"
6. Click en **Guardar**

### Método 2: Desde el archivo .env

Edita `.env`:
```bash
nano .env
```

Busca y modifica estas líneas:
```env
OANDA_ACCOUNT_ID=tu_account_id_aqui
OANDA_API_TOKEN=tu_api_token_aqui
OANDA_IS_DEMO=true
```

Guarda y reinicia:
```bash
./stop.sh && ./run.sh
```

---

### Cambiar Mercado de Trading

**Desde el Dashboard:**
1. Settings → Trading Parameters → Trading Symbol
2. Selecciona el mercado deseado (XAU/USD, EUR/USD, etc.)
3. Guarda cambios

**Desde .env:**
```env
TRADING_SYMBOL=XAU_USD
```

---

## Estructura del Proyecto

```
real/
├── install.sh              # Instalador automático
├── run.sh                  # Inicia todo automáticamente
├── stop.sh                 # Detiene todos los servicios
├── health-check.sh         # Verifica estado del sistema
├── .env                    # Configuración y credenciales (NO commitear)
├── src/
│   ├── lib/
│   │   ├── broker-manager.ts       # Gestor central de brokers
│   │   ├── oanda-adapter.ts        # Adapter para OANDA
│   │   ├── oanda-credentials.ts    # Gestión de credenciales
│   │   ├── broker-interface.ts     # Interfaz universal de broker
│   │   ├── execution-engine.ts     # Motor de trading
│   │   ├── automation.ts           # Automatización de ticks
│   │   ├── analysis-engine.ts      # 30+ indicadores técnicos
│   │   ├── risk-manager.ts         # Gestión de riesgo
│   │   ├── smart-stop-loss.ts      # Stop loss inteligente
│   │   ├── scalping-engine.ts      # Motor de scalping
│   │   └── strategies/             # Estrategias de trading
│   ├── app/api/                    # APIs REST
│   │   ├── snapshot/route.ts       # Estado completo del sistema
│   │   ├── engine/route.ts         # Control del engine
│   │   └── config/credentials/     # Gestión de credenciales
│   └── components/dashboard/       # Interfaz web
│       ├── header.tsx              # Header con selector de mercado
│       ├── charts-panel.tsx        # Gráficos de velas
│       ├── overview-panel.tsx      # Resumen general
│       ├── trades-panel.tsx        # Historial de trades
│       └── settings-panel.tsx      # Configuración
├── prisma/schema.prisma            # Esquema de base de datos
└── data/reco_trading.db            # Base de datos SQLite
```

---

## Solución de Problemas

### ❌ "Market data fetch failed" o "400 error"

**Causa:** Las credenciales de OANDA no están configuradas o son incorrectas.

**Solución:**
1. Ve a Settings → OANDA Credentials
2. Verifica Account ID y API Token
3. Click en "Validar" — debe mostrar "Conexión exitosa"
4. Si falla, regresa a https://www.oanda.com/dashboard/ y verifica tus credenciales

---

### ❌ "Broker not connected"

**Causa:** El programa no pudo conectar con OANDA.

**Solución:**
1. Verifica que tienes internet
2. Verifica que las credenciales son correctas
3. Prueba acceder manualmente: `curl https://api-fxpractice.oanda.com/v3/accounts`
4. Si usas cuenta demo, asegúrate de que el toggle "Cuenta Demo" está activado

---

### ❌ El programa no ejecuta trades

**Causas posibles:**
1. **Mercado cerrado:** Forex/metales operan 24/5 (cierran viernes 22:00 UTC, abren domingo 22:00 UTC)
2. **Señal NEUTRAL:** El mercado no tiene dirección clara — es normal
3. **Balance insuficiente:** Necesitas al menos ~$100 en tu cuenta para operar

**Solución:**
- Verifica que el mercado esté abierto
- Espera a que la señal cambie de NEUTRAL a LONG/SHORT
- Asegúrate de tener balance suficiente

---

### ❌ "Filter failure: LOT_SIZE"

**Causa:** El tamaño de la posición no cumple los requisitos mínimos del mercado.

**Solución:** El sistema ya ajusta automáticamente al mínimo permitido. Si persiste, aumenta el balance de tu cuenta.

---

### ❌ El dashboard no carga

**Solución:**
```bash
./stop.sh
rm -rf .next
./run.sh
```

---

### ❌ Quiero cambiar de cuenta Demo a Real

1. Settings → OANDA Credentials
2. Ingresa las credenciales de tu cuenta **Live**
3. Desactiva el toggle "Cuenta Demo"
4. Click en **Validar** → debe mostrar balance real
5. Click en **Guardar**

> **⚠️ IMPORTANTE:** Una vez en modo real, todas las operaciones usan dinero real.

---

## Licencia

Este software es para uso educativo y de desarrollo. El trading conlleva riesgos financieros significativos.

## Soporte

Para problemas no cubiertos en esta guía, revisa los logs:
```bash
tail -100 server.log
```
