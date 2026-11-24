# BT-Time Neo — Cliente Web PWA y Proxy Seguro

Aplicación web responsive e instalable (PWA) para gestión de jornada, cronómetro de tareas y hoja de horas BT-Time, con backend proxy en Node.js + Express + TypeScript servido desde el mismo origen.

## Ejecución local

1. Copia `.env.example` a `.env` y define `NEO_API_BASE_URL` (solo en el servidor; nunca en variables `VITE_`).
2. Instala dependencias y ejecuta en modo desarrollo:

```bash
npm install
npm run dev
```

La aplicación y el proxy `/api/*` quedan disponibles en `http://localhost:3000`.

### Verificación

```bash
npm run lint
npm test
npm run build
```

## Despliegue en Render.io

El repositorio incluye `render.yaml` listo para Blueprint en Render:

1. Sube este proyecto a un repositorio Git y créalo en Render como **Web Service** (o **Blueprint** usando `render.yaml`).
2. Comandos ya configurados:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. Variables de entorno requeridas en Render:
   - `NODE_ENV=production`
   - `NEO_API_BASE_URL`: URL **HTTPS** del gateway/API BT-Time autorizado.
   - `SESSION_SECRET`: generada automáticamente por Render (o clave aleatoria de 32+ bytes).
   - `SESSION_STORE_PATH=/var/data/sessions.enc.json` (con **Render Persistent Disk** montado en `/var/data` para conservar sesiones cifradas entre reinicios).

### Requisito obligatorio de TLS (HTTPS) en producción

En producción (`NODE_ENV=production`), el servidor bloquea el envío de credenciales hacia un upstream `http://` en texto claro por Internet. Debes colocar un gateway HTTPS privado/autorizado delante del API BT-Time y configurar su URL `https://...` en `NEO_API_BASE_URL`. (Solo en una red privada VPC/túnel aislado puede habilitarse `ALLOW_PRIVATE_HTTP_UPSTREAM=true`).

### Sesiones y persistencia

- Las cookies upstream del API BT-Time se mantienen aisladas en el servidor (cifradas con AES-256-GCM en `SESSION_STORE_PATH`) y nunca se exponen al navegador.
- El navegador recibe únicamente una cookie de sesión propia `HttpOnly` + token CSRF en memoria.
- En el plan gratuito de Render sin disco persistente, un reinicio o suspensión del contenedor limpia la memoria efímera; en ese caso el backend responde `401` y la app solicita reautenticarse de forma segura.

## Limitaciones conocidas del API BT-Time

1. **Fecha manual / Backdating no soportado**:
   - El API observado no acepta fecha en `/tasks/{type}/{id}/start` ni en `/tasks/{type}/{id}/end`.
   - `/tasks/timesheet` actualiza `timeRealInSeconds` de entradas existentes sin permitir crear entradas nuevas ni cambiar `createdDate`/`startDate`.
   - `/timesheet_month/{year}/{month}` es únicamente de consulta (`GET`).
   - Por seguridad y fidelidad al contrato, la opción de registro con fecha manual permanece deshabilitada hasta que el responsable del API publique el contrato oficial.
2. **Notificaciones con pestaña cerrada (Web Push)**:
   - Los recordatorios configurados en **Ajustes** funcionan con precisión horaria IANA mientras la app/pestaña está abierta.
   - Para recibir notificaciones con la pestaña completamente cerrada en móvil o desktop, se requiere agregar suscripción Web Push (VAPID) persistida por usuario y un **Background Worker / Web Service sin reposo** en Render (plan Starter o superior).
