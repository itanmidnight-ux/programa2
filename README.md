# RECO-TRADING v4 (Automático)

Objetivo operativo: el usuario solo ejecuta **2 comandos**.

## Flujo único (obligatorio)
1. `./install.sh`
2. `./run.sh`

Luego abrir `http://localhost:3000` y configurar credenciales en **Settings**.

## Qué hace `install.sh` automáticamente
- Detecta entorno Linux/Termux (Debian, Ubuntu, Termux y compatibles).
- Instala prerequisitos del sistema.
- Instala Bun y dependencias del proyecto.
- Prepara base de datos (Prisma generate + db push).
- Compila el dashboard en modo producción.
- Crea/normaliza `.env` con defaults seguros y broker activo `weltrade_mt5`.

## Qué hace `run.sh` automáticamente
- Verifica que la instalación esté completa.
- Inicia el dashboard en puerto `3000`.
- Espera readiness real del frontend y APIs críticas.
- Si detecta credenciales Weltrade válidas, intenta iniciar engine automáticamente.
- Si no hay credenciales, mantiene dashboard activo para configurarlas en Settings.

## Configuración de credenciales (solo Dashboard)
Ruta: **Settings > Broker Credentials**

Configurar broker `Weltrade MT5`:
- `MT5 Login`
- `MT5 Password`
- `MT5 Server`
- `Cuenta Demo / Live`
- `Bridge URL` (por defecto `http://127.0.0.1:5001`)

Secuencia recomendada:
1. Completar campos.
2. Click en **Validar**.
3. Click en **Guardar**.
4. Confirmar estado `Conectado`.

## Resolución del error de dashboard
Si aparecía:
`Application error: a client-side exception has occurred...`

Ahora el sistema incluye:
- Boundary de errores de página (`src/app/error.tsx`).
- Boundary global (`src/app/global-error.tsx`).
- Preflight de APIs en `run.sh` para evitar arrances en estado roto.

## Operación diaria
- Instalar una sola vez: `./install.sh`
- Ejecutar sistema: `./run.sh`
- Detener: `./stop.sh`
- Ver logs: `tail -f logs/web.log`
