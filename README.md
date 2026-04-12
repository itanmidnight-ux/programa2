# RECO-TRADING v3.0 — Plataforma de Trading Multi-Mercado

> Software profesional de trading automatizado para **Forex, Metales, Energía e Índices** a través de **OANDA**.

---

## 📋 Tabla de Contenidos

1. [¿Qué es este programa?](#qué-es-este-programa)
2. [Mercados disponibles](#mercados-disponibles)
3. [Requisitos](#requisitos)
4. [🔑 CÓMO CREAR TU CUENTA EN OANDA (Guía para principiantantes)](#-cómo-crear-tu-cuenta-en-oanda-guía-para-principiantantes)
5. [Instalación](#instalación)
6. [Ejecución](#ejecución)
7. [Configurar credenciales en el programa](#configurar-credenciales-en-el-programa)
8. [Solución de problemas](#solución-de-problemas)

---

## ¿Qué es este programa?

Es un **robot de trading** que opera automáticamente en mercados financieros como:
- **Oro** (XAU/USD)
- **Euro vs Dólar** (EUR/USD)
- **Petróleo** (WTI)
- **Índices** (Dow Jones, NASDAQ)

Se conecta a **OANDA**, que es un bróker regulado y confiable.

---

## Mercados disponibles

| Qué quieres operar | Símbolo en el programa | Qué es |
|-------------------|----------------------|--------|
| **Oro** | `XAU_USD` | Precio del oro en dólares |
| **Plata** | `XAG_USD` | Precio de la plata en dólares |
| **Euro vs Dólar** | `EUR_USD` | Cuántos dólares cuesta 1 euro |
| **Libra vs Dólar** | `GBP_USD` | Cuántos dólares cuesta 1 libra |
| **Dólar vs Yen** | `USD_JPY` | Cuántos yenes cuesta 1 dólar |
| **Petróleo** | `WTI_USD` | Precio del petróleo en dólares |
| **Dow Jones** | `US30_USD` | Índice de las 30 empresas más grandes de EE.UU. |
| **NASDAQ** | `NAS100_USD` | Índice de 100 empresas tecnológicas de EE.UU. |

---

## Requisitos

| Qué necesitas | Cómo verificarlo |
|---------------|-----------------|
| **Bun instalado** | Escribe `bun --version` en la terminal. Si ves un número, lo tienes |
| **Internet** | Abre cualquier página web |
| **Terminal** | Ya la estás usando |

**Si NO tienes Bun:**
```bash
curl -fsSL https://bun.sh/install | bash
```
Luego cierra y abre la terminal de nuevo.

---

## 🔑 CÓMO CREAR TU CUENTA EN OANDA (Guía para principiantantes)

> **⏱️ Tiempo estimado:** 5-10 minutos
> **💰 Costo:** GRATIS (cuenta demo con dinero ficticio)

---

### PASO 1: Abrir la página de registro

1. Abre tu navegador (Chrome, Firefox, etc.)

2. Escribe esta URL exacta y presiona Enter:
   ```
   https://www.oanda.com
   ```

3. Verás la página principal de OANDA. Busca un botón que dice algo como:
   - **"Open an Account"** o
   - **"Create Demo Account"** o
   - **"Try Free Demo"**

4. Haz clic en ese botón.

---

### PASO 2: Llenar el formulario de registro

Verás un formulario con varios campos. Llena **TODOS** los que tengan un asterisco (*) o que estén marcados como obligatorios:

| Campo | Qué poner | Ejemplo |
|-------|-----------|---------|
| **First Name** | Tu nombre | Juan |
| **Last Name** | Tu apellido | Pérez |
| **Email** | Tu email REAL (necesitas confirmarlo) | tucorreo@gmail.com |
| **Country** | Tu país | Selecciona de la lista |
| **Phone** | Tu teléfono | +52 123 456 7890 |
| **Date of Birth** | Tu fecha de nacimiento | Selecciona del calendario |

5. **Acepta los términos:** Busca un checkbox que diga algo como "I agree to the Terms" o "Accept" y márcalo.

6. **Haz clic en el botón grande** que dice:
   - **"Create Account"** o
   - **"Submit"** o
   - **"Register"**

---

### PASO 3: Verificar tu email

1. Abre tu correo electrónico (Gmail, Outlook, etc.)

2. Busca un email de **OANDA** en tu bandeja de entrada. Puede tardar 1-5 minutos.

3. **Si no lo ves:** Revisa la carpeta de **SPAM** o **Correo no deseado**.

4. Abre el email de OANDA y busca un botón o enlace que dice:
   - **"Verify Email"** o
   - **"Confirm Account"** o
   - **"Activate Account"**

5. Haz clic en ese enlace. Te llevará a una página de confirmación.

---

### PASO 4: Iniciar sesión por primera vez

1. Vuelve a la página de OANDA:
   ```
   https://www.oanda.com
   ```

2. Busca un botón que dice **"Login"** o **"Sign In"** (generalmente arriba a la derecha) y haz clic.

3. En la página de login, ingresa:
   - **Username o Email:** El email que usaste para registrarte
   - **Password:** La contraseña que creaste (o la que te enviaron por email)

4. Haz clic en **"Login"** o **"Sign In"**

---

### PASO 5: Ir al Dashboard (Panel de Control)

1. **Después de iniciar sesión**, deberías ver tu **panel de control**. Si no estás ahí, busca esta URL:
   ```
   https://www.oanda.com/dashboard/
   ```

   > **⚠️ Si te da error 404:**
   > - Intenta con: `https://www.oanda.com/client/`
   > - O busca un enlace que diga "Dashboard" o "My Account" en la página principal después de hacer login

2. En el dashboard, deberías ver algo como:
   - Tu **número de cuenta** (algo como `12345678`)
   - Tu **balance** (será dinero ficticio, ej: $10,000 USD)
   - Opciones como "Trade", "History", "Settings"

3. **IMPORTANTE:** Anota tu **número de cuenta**. Es un número de 7-8 dígitos. Lo necesitarás.

---

### PASO 6: Generar tu API Token (La "llave" del programa)

1. En el dashboard, busca una sección que diga algo como:
   - **"API Management"** o
   - **"Manage API Access"** o
   - **"Developer"** o
   - **"Settings" → "API"**

   **Si no la encuentras:**
   - Busca un ícono de ⚙️ (engranaje) o "Settings"
   - Dentro de Settings busca "API" o "Developer"
   - O ve directamente a: `https://www.oanda.com/client/api/`

2. En la página de API Management, verás un botón que dice:
   - **"Generate Token"** o
   - **"Create Token"** o
   - **"Create API Key"**

3. Haz clic en ese botón.

4. Te pedirá configurar el token:
   - **Name:** Escribe algo como "RECO-Trading" (puede ser cualquier nombre)
   - **Access:** Selecciona **"Full Access"** o **"Read and Write"** o **"Trade"**
   - **IP Restrictions:** Déjalo en blanco o selecciona "No restrictions"

5. Haz clic en **"Create"** o **"Generate"**

6. **¡IMPORTANTE!** Te mostrará tu **API Token** (una cadena larga de letras y números). **CÓPIALO AHORA** porque puede que no te lo muestre de nuevo.

   Se verá algo así:
   ```
   1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```

7. **Guarda el token en un lugar seguro** (un archivo de texto, notas, etc.)

---

### PASO 7: Ya tienes todo lo que necesitas

Ahora deberías tener **DOS cosas**:

| Lo que necesitas | Dónde encontrarlo | Ejemplo |
|-----------------|-------------------|---------|
| **Account ID** | En tu dashboard, es tu número de cuenta | `12345678` |
| **API Token** | El token que acabas de generar | `1234567890abcdef...` (cadena larga) |

**¡Felicidades!** Ya tienes tus credenciales. Ahora necesitas ponerlas en el programa.

---

## Instalación

### Paso 1: Ir al directorio del proyecto
```bash
cd /home/kali/Downloads/real
```

### Paso 2: Ejecutar el instalador
```bash
./install.sh
```

Esto tomará 2-5 minutos. Instalará todo lo necesario.

### Paso 3: Verificar que todo está bien
```bash
./health-check.sh
```

Si todo dice ✅ (verde), estás listo.

---

## Ejecución

### Para iniciar el programa:
```bash
./run.sh
```

### Para abrir el dashboard web:
Abre tu navegador y ve a:
```
http://localhost:3000
```

### Para detener el programa:
```bash
./stop.sh
```

### Para ver los logs en tiempo real:
```bash
tail -f server.log | grep -E "(ENGINE|Trade|💰)"
```

---

## Configurar credenciales en el programa

### Método 1: Desde el Dashboard Web (Recomendado)

1. **Abre el dashboard:** http://localhost:3000

2. **Busca el panel de Settings:** En el menú lateral izquierdo, haz clic en **"Settings"** o **"Configuración"**

3. **Busca la sección "OANDA Credentials":** Verás un formulario con:
   - Campo: **Account ID**
   - Campo: **API Token**
   - Toggle: **Cuenta Demo** (activado = demo, desactivado = real)

4. **Llena los campos:**
   - **Account ID:** Pega el número de cuenta que anotaste (ej: `12345678`)
   - **API Token:** Pega el token largo que copiaste (ej: `1234567890abcdef...`)
   - **Cuenta Demo:** Déjalo ACTIVADO si estás usando cuenta demo

5. **Haz clic en "Validar":**
   - ✅ Si funciona: Verás "Conexión exitosa" + tu balance
   - ❌ Si falla: Verifica que copiaste bien los datos

6. **Haz clic en "Guardar":** Las credenciales se guardarán de forma segura.

### Método 2: Desde el archivo .env

1. Abre el archivo de configuración:
   ```bash
   nano /home/kali/Downloads/real/.env
   ```

2. Busca estas líneas y cámbialas por tus datos:
   ```env
   OANDA_ACCOUNT_ID=tu_numero_de_cuenta_aqui
   OANDA_API_TOKEN=tu_token_largo_aqui
   OANDA_IS_DEMO=true
   ```

   **Ejemplo real:**
   ```env
   OANDA_ACCOUNT_ID=12345678
   OANDA_API_TOKEN=1234567890abcdef1234567890abcdef1234567890abcdef
   OANDA_IS_DEMO=true
   ```

3. **Guarda el archivo:**
   - Presiona `Ctrl + X`
   - Presiona `Y` (Yes)
   - Presiona `Enter`

4. **Reinicia el programa:**
   ```bash
   ./stop.sh && ./run.sh
   ```

---

## Solución de problemas

### ❌ "Me sale error 404 en oanda.com/dashboard/"

**Solución:**
- Después de hacer login, busca un enlace que diga "Dashboard", "My Account" o "Client Area" en la página principal
- Prueba con: `https://www.oanda.com/client/`
- O simplemente busca el ícono de tu perfil (arriba a la derecha) y haz clic

---

### ❌ "No encuentro la sección de API Management"

**Solución:**
1. En tu dashboard, busca **Settings** (⚙️ engranaje)
2. Dentro de Settings busca **"API"**, **"Developer"**, o **"Manage API Access"**
3. Si no lo encuentras, ve directamente a: `https://www.oanda.com/client/api/`

---

### ❌ "No me llegó el email de confirmación"

**Solución:**
1. Espera 5-10 minutos
2. Revisa la carpeta de **SPAM** o **Correo no deseado**
3. Si no llega, regresa a oanda.com y busca "Resend verification email"
4. Si nada funciona, regístrate de nuevo con otro email

---

### ❌ "El programa dice 'Broker not connected'"

**Causa:** Las credenciales no están configuradas o son incorrectas.

**Solución:**
1. Ve a Settings en el dashboard del programa
2. Verifica que Account ID y API Token estén bien escritos (sin espacios extra)
3. Haz clic en "Validar" — debe mostrar "Conexión exitosa"
4. Si falla, vuelve a copiar las credenciales desde OANDA

---

### ❌ "El programa no ejecuta trades"

**Posibles causas:**
1. **Mercado cerrado:** Forex y metales operan de lunes a viernes. Cierran viernes 22:00 UTC y abren domingo 22:00 UTC
2. **Sin credenciales:** El programa necesita que configures las credenciales primero
3. **Balance bajo:** Necesitas al menos ~$100 en tu cuenta demo

**Solución:**
- Configura las credenciales como se explica arriba
- Verifica que el mercado esté abierto (lunes a viernes)
- Verifica que tienes balance suficiente en tu cuenta OANDA

---

### ❌ "¿Puedo usar este programa con dinero real?"

**Respuesta:** Sí, pero:
1. Primero prueba exhaustivamente en **cuenta demo**
2. Cuando estés seguro de que funciona, cambia a cuenta real:
   - Registra una cuenta real en oanda.com
   - Genera un nuevo API Token para tu cuenta live
   - En el programa, desactiva el toggle "Cuenta Demo"
   - Ingresa las credenciales de tu cuenta real

> **⚠️ ADVERTENCIA:** El trading con dinero real conlleva riesgo de pérdida. Nunca inviertas dinero que no puedas permitirte perder.

---

## Estructura del proyecto

```
real/
├── install.sh              # Instala todo automáticamente
├── run.sh                  # Inicia el programa
├── stop.sh                 # Detiene el programa
├── health-check.sh         # Verifica que todo funcione
├── .env                    # Tu configuración (¡NO compartir!)
├── README.md               # Este archivo
├── src/
│   ├── lib/                # Motor de trading
│   ├── app/api/            # APIs del sistema
│   └── components/         # Dashboard web
└── data/                   # Base de datos
```

---

**¿Necesitas ayuda?** Revisa los logs:
```bash
tail -100 server.log
```
