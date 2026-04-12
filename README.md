# RECO-TRADING v4 - Broker Automation (OANDA + Weltrade MT5 Bridge)

Plataforma de trading automatizado multi-broker para **Forex, Metales, Energía e Índices**.

## 1) Requisitos
- Node.js 20+
- npm 10+
- Base de datos SQLite (se crea automáticamente vía Prisma)
- Para Weltrade: terminal MT5 + bridge local activo

## 2) Instalación
```bash
npm install
npm run db:generate
npm run db:push
```

## 3) Variables de entorno mínimas
Copia `.env.example` a `.env` y completa:
- `BROKER_ACTIVE` (`oanda` o `weltrade_mt5`)
- `TRADING_SYMBOL` (ej. `XAU_USD`)
- Si usas OANDA:
  - `OANDA_ACCOUNT_ID`
  - `OANDA_API_TOKEN`
  - `OANDA_IS_DEMO`
- Si usas Weltrade MT5:
  - `WELTRADE_MT5_LOGIN`
  - `WELTRADE_MT5_PASSWORD`
  - `WELTRADE_MT5_SERVER`
  - `WELTRADE_MT5_IS_DEMO`
  - `WELTRADE_MT5_BRIDGE_URL`

## 4) Cómo obtener credenciales OANDA
1. Crea cuenta demo/live en [OANDA](https://www.oanda.com/).
2. En tu panel, abre la sección de API.
3. Genera token con permisos de trading.
4. Guarda:
  - `Account ID`
  - `API Token`
5. Carga esos datos en:
  - UI: **Settings > Broker Credentials > OANDA**, o
  - `.env`: `OANDA_ACCOUNT_ID`, `OANDA_API_TOKEN`, `OANDA_IS_DEMO=true|false`

## 5) Cómo obtener credenciales Weltrade (MT5 Bridge)
Importante: esta integración es por **MT5 Bridge** (no REST directo del broker).

1. Crea cuenta Weltrade MT5 (demo o real).
2. Obtén en tu cuenta:
  - `Login` (número de cuenta)
  - `Password` MT5
  - `Server` MT5 exacto
3. Configura e inicia tu servicio bridge local MT5.
4. Verifica endpoint de salud del bridge:
```bash
curl http://127.0.0.1:5001/health
```
5. Carga los datos en:
  - UI: **Settings > Broker Credentials > Weltrade MT5**, o
  - `.env`: `WELTRADE_MT5_LOGIN`, `WELTRADE_MT5_PASSWORD`, `WELTRADE_MT5_SERVER`, `WELTRADE_MT5_BRIDGE_URL`

## 6) Inicio del sistema
```bash
npm run dev
```
Luego abre:
- `http://localhost:3000`

## 7) Configuración recomendada en UI
1. Ir a **Settings**.
2. Elegir broker activo (`OANDA` o `Weltrade MT5`).
3. Guardar y validar credenciales.
4. Seleccionar modo demo/live.
5. Confirmar símbolo (ej. `XAU_USD`).
6. Arrancar engine desde panel o API.

## 8) Endpoints clave
- `GET/PUT /api/config`
- `GET/POST /api/config/mode`
- `GET/PUT/POST /api/config/credentials`
- `GET /api/snapshot`
- `POST /api/engine`
- `POST /api/execute`

## 9) Troubleshooting
- `Broker not initialized`:
  - valida credenciales en `/api/config/credentials` (POST)
  - revisa `BROKER_ACTIVE`
- `No candle data returned`:
  - símbolo no soportado o mercado cerrado
- `MT5 bridge is offline`:
  - verifica `WELTRADE_MT5_BRIDGE_URL`
  - valida `/health` del bridge
- errores Prisma:
```bash
npm run db:generate
npm run db:push
```

## 10) Seguridad operativa
- No subas `.env` a repositorio.
- Usa demo antes de live.
- Limita riesgo por trade y drawdown en settings.
- Revisa logs y auditoría antes de activar cuenta real.
