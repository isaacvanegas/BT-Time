# Prompt para generar la aplicación web React

Pega el siguiente prompt en Google AI Studio junto con las capturas adjuntas.
El objetivo es una web responsive instalable tipo PWA y desplegable en Render.

---

## PROMPT

Actúa como ingeniero full-stack senior. Construye una aplicación web responsive
para BT-Time en este proyecto vacío. Implementa el código, no solo un plan o
una maqueta; inspecciona el proyecto existente, conserva lo útil y deja
instrucciones reales para ejecutar y desplegar.

### Stack y despliegue

- React + TypeScript + Vite, mobile-first, PWA instalable.
- Backend Node.js + Express + TypeScript como proxy del API. Sirve frontend y
  proxy desde el mismo origen cuando sea viable en Render.
- El navegador **no** llama directamente al API BT-Time ni recibe sus
  credenciales/cookies. El backend mantiene cookie de sesión upstream aislada
  por usuario y expone rutas propias autenticadas a la SPA.
- Configura upstream con `NEO_API_BASE_URL` en el servidor, nunca con una
  variable `VITE_`. URL de referencia:
  `http://ALB-Cluster-neo-api-1301981680.us-east-1.elb.amazonaws.com:8081/api`.
- Esa URL es HTTP. No despliegues credenciales ni cookies en texto claro por
  Internet. Producción requiere upstream HTTPS o gateway HTTPS privado y
  autorizado. Si solo existe HTTP, bloquea el despliegue productivo hasta
  resolver TLS; no expongas secretos desde el navegador.
- Usa cookie de sesión propia `HttpOnly`, `Secure` en producción, `SameSite`
  apropiado y protección CSRF para escrituras. Nunca devuelvas la cookie
  upstream. No guardes ni registres contraseñas. Sesiones aisladas por usuario;
  documenta expiración y reautenticación tras reinicios. No dependas de memoria
  efímera de Render para garantizar sesiones persistentes.
- No incluyas credenciales, cookies, información personal ni IDs reales en
  código, logs, fixtures ni documentación.

### IDs de 64 bits en JavaScript: no perder precisión

IDs del API pueden superar `Number.MAX_SAFE_INTEGER`. `JSON.parse()` y
`response.json()` pueden redondearlos y romper llamadas. Implementa en el
backend un parser/serializer lossless para enteros grandes. Convierte IDs a
strings en DTOs enviados al navegador y mantenlos como strings en React. Al
construir cuerpos para upstream, serializa los IDs como enteros JSON exactos si
el contrato Java espera `Long`; no los conviertas a `Number`. Prueba IDs
mayores que 2^53.

### Sesiones, proxy y contrato upstream

Implementa rutas propias `/api/...` en Express para login, logout, perfil,
check-in/pausa/check-out, tareas, hoja de horas y calendario. En login el
backend envía `username`, `password` y zona horaria IANA, captura las cookies
`Set-Cookie` y las asocia a ese usuario. Valida sesión en cada ruta. En 401,
limpia la sesión propia y devuelve un error claro.

Rutas upstream observadas (relativas a `NEO_API_BASE_URL`):

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/signin` | JSON `username`, `password`, `timeZone` |
| POST | `/auth/signout` | Cerrar sesión |
| GET | `/user/info` | Estado/perfil |
| POST | `/user/online` | Check-in / ONLINE |
| POST | `/user/pause` | Pausar |
| POST | `/user/offline` | Check-out |
| GET | `/tasks/open` | `dueTasks`, `currentTasks`, `weekTasks`, `bugs` |
| GET | `/tasks/active` | Tarea/cronómetro activo |
| POST | `/tasks/{type}/{taskId}/start` | Iniciar; sin body conocido |
| POST | `/tasks/{type}/{taskId}/pause` | Pausar |
| GET | `/tasks/{type}/{taskId}/time` | Leer tiempo/estado |
| POST | `/tasks/{type}/{taskId}/end` | Terminar tarea |
| GET | `/tasks/timesheet` | Entradas actuales |
| POST | `/tasks/timesheet` | Enviar `{ "timesheet": [...] }` |
| GET | `/tasks/timesheet/{timesheetId}/` | Entrada y campos |
| GET | `/tasks/timesheet/{timesheetId}/time` | Tiempo de la entrada |
| POST | `/tasks/timesheet/{timesheetId}/end` | Finalizar entrada pendiente |
| GET | `/tasks/timesheetExpired` | Hojas pendientes/expiradas |
| GET | `/timesheet_month/{year}/{month}` | Calendario, año/mes |

Usa `type`, `id` y `timesheetId` que devuelve el API; no fijes valores ni
literal `TASK`. Login devuelve `codeResponse`, `descriptionResponse`, perfil y
estado; respuesta exitosa observada usa `codeResponse: "000"`. Comprueba HTTP y
código de negocio. No inventes rutas, parámetros o cuerpos. Usa la zona del
navegador con `Intl.DateTimeFormat().resolvedOptions().timeZone`.

No reintentes automáticamente escrituras. Si fin/envío termina en timeout,
indica que el resultado es incierto, consulta estado/hoja y confirma antes de
permitir repetir. Protege doble clic/doble envío.

### Flujo funcional

1. **Login**: usuario y contraseña; al entrar carga perfil, estado, tarea y
   cronómetro activos, listas, hoja actual y pendientes. No guardes la
   contraseña ni implementes un “recordarme” inseguro.
2. **Dashboard** mobile-first con nombre, estado, Check In/Pausar, Check Out,
   cronómetro y tarea activa. Navegación: Dashboard, Hoja de Horas, Calendario,
   Ajustes y Cerrar Sesión.
3. **Asignaciones**: grupos Vencidas, Hoy, Resto de la Semana e Incidencias;
   muestra proyecto, key, tarea, estado, horas y acciones. Incluye refresco
   manual y estados vacíos. Antes de iniciar tarea, exige estado `ONLINE` y
   ofrece Check In si está `OFFLINE` o `PAUSE`. Si existen hojas expiradas
   pendientes, guíalo a resolverlas antes de iniciar otra tarea o hacer Check
   Out, como el cliente actual.
4. **Estado**: OFFLINE/PAUSE -> `POST /user/online`; ONLINE ->
   `POST /user/pause`; Check Out -> `POST /user/offline` y luego abrir/refrescar
   resumen. Check Out no es la sincronización final.
5. **Cronómetro**: iniciar/pausar con rutas task/type/id. Rehidrata al recargar
   desde `/tasks/active` o `.../time`. El contador local solo es visual; el
   servidor manda (`currentTimeTaskSeconds`, `logTimeTaskSeconds`,
   `durationTimeTaskSeconds`, `taskStatus`).
6. **Finalizar tarea**: pide comentario obligatorio y carga `customFields`
   dinámicos desde la entrada correspondiente. Envía `note`,
   `percentComplete` y `customFields` a la ruta `/end` apropiada. Reglas:
   - `percentComplete` siempre `0`, aunque el API devuelva otro avance.
   - `Activity Type` inicia en `Gestión`; es campo obligatorio.
   - `Commit ID` queda vacío; no inventar un commit.
   - Preserva IDs/forma de los campos devueltos; no hardcodees IDs ni borres
     campos no modificados.
   - Valida otros campos obligatorios y refresca hoja tras completar.
7. **Resumen de horas**: muestra duración automática y real editable como
   `HH:mm`. Valida y calcula
   `timeRealInSeconds = horas * 3600 + minutos * 60`. Conserva todos los campos
   retornados por `GET /tasks/timesheet`; modifica solo lo elegido por el
   usuario y envía `{ "timesheet": [ ... ] }` a `POST /tasks/timesheet`.
8. El botón inferior **Enviar** sincroniza; es distinto de finalizar tarea.
   Habilítalo solo si todas las entradas actuales tienen
   `timeSheetStatus == "END"`. Si quedan tareas activas, informa cuántas y
   bloquea envío. Tras éxito (`codeResponse == "000"`), refresca hoja,
   pendientes y calendario. Evita doble envío.
9. **Pendientes/expiradas**: agrupa por fecha, deja reabrir/finalizar una
   entrada existente y cambiar su tiempo real. Distingue pendiente de
   sincronizada usando datos del API, no inferencias.
10. **Calendario**: vista mensual responsive con total mes/día y detalle usando
    `timesheetDays[].date`, `totalMinutesDay`, `timesheets[]`,
    `synchronizeStatus` y `timesheetType`. El endpoint observado es de consulta.
11. **Ajustes de recordatorios**: dos horas configurables y días activos:
    (a) Check In/iniciar cronómetro, (b) revisar/enviar horas. Al tocar alerta,
    abre la pantalla apropiada; **nunca** inicia, finaliza, hace check-out ni
    envía automáticamente.

### Fecha manual / backdating: no inventar soporte

El cliente no manda fecha al iniciar/finalizar: inicio no tiene body y fin
solo lleva comentario, avance y campos. El resumen edita `timeRealInSeconds` de
entradas existentes; no crea entradas ni permite cambiar su fecha. Calendario
es GET.

No inventes endpoint para crear horas con fecha ni alteres
`createdDate`/`startDate` sin contrato del servidor. Deja la arquitectura
extensible, pero deshabilita esa función con explicación hasta que el
responsable del API confirme ruta, cuerpo y reglas. No simules éxito.

### Notificaciones en web

Una PWA no puede garantizar notificaciones con la pestaña cerrada usando solo
`setTimeout` ni hosting estático. Implementa recordatorios en primer plano y
notificaciones del navegador con permiso. Para app cerrada se requiere Service
Worker + Web Push, suscripción persistida por usuario y un worker/servicio que
evalúe horarios con zona IANA. Documenta el servicio persistente/plan de Render
necesario. Si push servidor no está configurado, explica que solo funciona con
la app abierta. Las notificaciones nunca ejecutan cambios en background.

### Diseño, seguridad y entrega

- Usa capturas como guía: azul/blanco, navegación lateral en desktop y barra
  móvil, estado, cronómetro, tareas agrupadas, formulario de comentario,
  Activity Type, Commit ID y avance, resumen editable y botón Enviar.
- Incluye carga, error, sesión expirada, offline, refresh, confirmación y
  estados vacíos; controles táctiles accesibles.
- Backend con validación, rate limit razonable en login, CORS limitado al
  mismo origen, CSRF, CSP y headers seguros. Nunca registres contraseñas,
  cookies o respuestas completas que contengan datos personales.
- Usa fixtures anonimizados. No pruebes escrituras contra el API real.
- Añade `.env.example` sin secretos, scripts `dev`, `build`, `test`, health
  check e instrucciones para Render. Ningún secreto debe quedar en el bundle.
- Pruebas: IDs grandes sin pérdida; login/expiración; campos dinámicos,
  comentario requerido, avance cero, Gestión y Commit ID vacío; conversión de
  horas; bloqueo Enviar con tarea activa; gates por check-in/hojas expiradas;
  errores/doble envío y horario/timezone de recordatorios.
- Ejecuta build y tests, corrige errores y entrega limitaciones del API,
  especialmente la fecha manual.

---
