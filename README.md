# DeUna Games — baseline técnico

Aplicación activa de DeUna Games. La base está pensada para ser reproducible, auditable y mantenible: el repositorio no conserva diagnósticos temporales, backups, snapshots de reparación ni artefactos históricos dentro del código activo.

## Stack

- Next.js 16 con App Router
- React 19
- TypeScript estricto
- CSS Modules + tokens globales
- PostgreSQL para el espacio editorial privado y las cuentas
- lucide-react
- Node.js 24 o superior

## Desarrollo

Instala exactamente las dependencias fijadas y levanta el servidor local:

```bash
npm ci
npm run dev
```

Abre `http://localhost:3000` en el navegador. `npm ci` se ejecuta al clonar o
cuando cambia `package-lock.json`; para el trabajo diario normalmente basta con
`npm run dev`. Detén el servidor con `Ctrl+C`.

Para exponer la web en la red local sin habilitar el panel privado:

```bash
npm run lan
```

El panel administrativo permanece deshabilitado salvo que `DEUNA_ADMIN_ENABLED` sea exactamente `true`.

### Probar desde un móvil con HTTPS

El móvil y la computadora deben estar en la misma red local. La primera vez,
con OpenSSL disponible en Ubuntu/WSL, prepara la autoridad certificadora y el
certificado para la IP privada actual:

```bash
npm run mobile:secure:setup
```

Copia al móvil únicamente el archivo público
`.deuna-local-certs/deuna-games-lan-ca.cer` e instálalo como certificado de
confianza. Nunca copies ni compartas archivos `.key`. Después inicia el sitio:

```bash
npm run mobile:secure
```

El comando muestra la URL exacta, por ejemplo `https://192.168.1.8:3000`,
habilita el panel administrativo sólo para esa ejecución y mantiene PostgreSQL
y el worker multimedia limitados a la propia computadora. Si cambia la IP del
equipo, vuelve a ejecutar `mobile:secure:setup`. Detén todo con `Ctrl+C`.

## Verificación

Antes de integrar cambios:

```bash
npm run check
npm run audit:deps
npm run security:scan
```

CI ejecuta, entre otras comprobaciones:

- lint y TypeScript estricto, incluidos símbolos y parámetros sin uso;
- grafo de arquitectura para impedir módulos fuente huérfanos;
- mantenimiento del repositorio y alcance de herramientas;
- higiene de código fuente (`TODO`, `FIXME`, `HACK`, `debugger`, trazas y supresiones quedan bloqueados);
- privacidad pública y de cuentas;
- seguridad administrativa;
- validación del importador editorial;
- encoding UTF-8;
- integridad de catálogo, Home, ranking, personalización explícita y detección de hardware;
- integridad bidireccional de assets;
- rutas internas;
- variables CSS y CSS Modules, incluidas clases o módulos sin uso;
- security scan;
- build de producción;
- smoke test del runtime standalone;
- auditoría de dependencias.

Los checks específicos también pueden ejecutarse por separado desde los scripts de `package.json`.

## Arquitectura editorial

El panel privado usa PostgreSQL y un flujo explícito de publicación. Guardar y publicar son operaciones distintas:

```text
editar
  ↓
borrador actual
  ↓
publicar
  ↓
snapshot público actual
  ↓
web pública
```

La web pública consume `published_payload` visible; no debe leer `draft_payload`.

Todo el contenido administrable conserva únicamente su estado editorial actual en `editorial_items`: borrador, publicación, `revision` y `publication_number`. Guardar o publicar reemplaza el estado vigente correspondiente y no crea snapshots restaurables ni permite volver a una versión anterior. Los contadores de revisión/publicación se conservan sólo para concurrencia, trazabilidad operativa y coherencia del flujo actual.

Catálogos mantiene una taxonomía maestra de **Clasificaciones** y una lista separada de **Etiquetas**. Los campos físicos heredados de `Game` se conservan sólo por compatibilidad de almacenamiento; la interfaz pública y editorial trabaja con el modelo unificado.

La Portada dispone de curaduría **Manual**, **Automática** e **Híbrida**. El ranking automático es determinista dentro del día UTC, explicable y usa una única definición de perfiles/pesos compartida entre la vista previa administrativa y la Home pública.

## Mi DeUna y recomendaciones

Una cuenta pública puede guardar de forma explícita:

- juegos favoritos;
- estado `Quiero jugarlo`, `Lo estoy jugando` o `Terminado`;
- seguimiento de actualizaciones de un juego;
- una PC elegida por el usuario mediante IDs del catálogo de CPU/GPU, RAM y modo de memoria.

Estas señales se reutilizan entre `/cuenta`, las fichas de juegos, la Home y `/requisitos`. No existe un historial paralelo de navegación para personalización.

El ranking personalizado parte del ranking editorial existente en lugar de reemplazarlo. Favoritos y estados de biblioteca aportan afinidad por clasificación, géneros y etiquetas; seguir actualizaciones por sí solo no se interpreta como gusto. Cuando existe una PC guardada, la compatibilidad usa el mismo motor de FPS que el Finder. Si faltan señales suficientes, la Home conserva el ranking general.

Los avisos de Mi DeUna se derivan de las actualizaciones públicas reales de cada juego. La cuenta sólo conserva desde cuándo se sigue un juego y hasta qué momento se vieron sus avisos; no duplica una tabla de notificaciones por usuario.

## Arquitectura multiplataforma, Programas y Colecciones

Los juegos pueden publicar varios `releases` independientes. Cada release
pertenece a una plataforma del catálogo maestro, conserva su versión, región,
requisitos y FPS cuando corresponden, y puede contener varios paquetes de
descarga. Los paquetes declaran su formato (`installer`, `archive`, `iso`,
`chd`, `cso`, `rvz`, `gdi`, `pkg`, etc.), canal, SHA-256 y mirrors
con estado independiente.

El catálogo de plataformas se administra desde **Admin > Plataformas**. Las
familias y plataformas publicadas son extensibles: agregar una nueva consola no
requiere modificar la navegación pública ni las colecciones automáticas. Los
identificadores que ya están referenciados por juegos o programas no pueden
eliminarse mientras sigan en uso.

**Programas** publica emuladores, utilidades, escaladores, launchers y runtimes
como contenido editorial current-only. Cada ficha diferencia las plataformas
donde el programa se ejecuta de las plataformas que emula, y sus paquetes de
descarga usan el mismo contrato de integridad/mirrors que los juegos. Un release
de juego puede recomendar programas publicados concretos.

**Colecciones** combina dos fuentes:

- colecciones editoriales de sagas o franquicias, cuyo orden de juegos se
  conserva exactamente como se definió en Admin;
- colecciones automáticas por plataforma, agrupadas por la familia publicada
  (PC, PlayStation, Xbox, Nintendo, Sega u otras que se creen después).

Guardar y publicar siguen siendo operaciones separadas para Plataformas,
Programas y Colecciones. La web pública sólo consume `published_payload`
visible; nunca lee borradores.

La migración `022_multiplatform_editorial.sql` amplía los tipos permitidos de
`editorial_items` con `platform_catalog`, `software` y
`game_collection`. Después de traer esta rama a un entorno local existente,
la actualización soportada sigue siendo:

```bash
npm run admin:update-local
```

Este comando aplica migraciones, importa contenido fuente vigente, diagnostica
residuos y ejecuta los preflights sin purgar datos automáticamente.

## Finder de hardware y FPS

`/requisitos` realiza una detección local orientativa usando únicamente lo que el navegador puede exponer cuando no existe un perfil explícito más fiable.

Un navegador web estándar no puede garantizar el modelo exacto de CPU. Por eso DeUna diferencia entre:

- CPU estimada por señales disponibles, con intervalo de capacidad y menor confianza;
- CPU confirmada por el usuario desde el catálogo de procesadores.

El selector no inventa modelos: escribir sólo filtra el catálogo y la confirmación siempre es explícita. Un perfil confirmado puede guardarse localmente en el navegador. Si el usuario inició sesión y eligió guardar **Mi PC** en su cuenta, esa selección explícita tiene prioridad y se reutiliza en el Finder y en las estimaciones de las fichas.

La detección automática no se convierte en datos de cuenta: DeUna no persiste en PostgreSQL el renderer detectado por el navegador, user-agent, sistema operativo detectado ni otros metadatos del dispositivo. Mi PC guarda sólo los componentes que el usuario selecciona expresamente.

GPU, RAM, sistema y modo de memoria se incorporan según su nivel de certeza. La incertidumbre del hardware se propaga al rango de FPS en lugar de presentarse como una cifra exacta falsa. Los FPS son orientativos y pueden variar por drivers, temperatura, procesos en segundo plano, versión del juego y configuración real.

Las pruebas de datos cubren el catálogo de CPUs, variantes de nombres/modelos, intervalos de CPU, propagación a FPS, búsqueda manual, personalización de ranking y coherencia de hidratación servidor/cliente.

## Privacidad pública

El sitio evita analítica de visitantes y no almacena IP, ubicación, user-agent ni huellas de dispositivo como parte del producto actual.

`npm run check:privacy` bloquea huellas regionales configuradas, trackers externos conocidos, campos estructurados de ubicación y otros patrones incompatibles con esta política. La barrera de cuentas verifica además que Mi DeUna mantenga únicamente señales explícitas y no incorpore navegación, detección cruda de hardware ni identificadores de seguimiento. El contenido público usa español neutral y UTC.

## Panel administrativo privado

El área `/admin` incorpora:

- una única cuenta propietaria;
- contraseña derivada con `scrypt` y sal aleatoria;
- sesiones opacas y revocables en PostgreSQL;
- cookies `HttpOnly`, `Secure`, `SameSite=Strict` y prioridad alta;
- bloqueo progresivo y controles de rate limiting;
- reautenticación del Owner para crear, activar, desactivar o restablecer accesos;
- validación estricta de origen y de campos de formulario;
- publicación explícita con estado actual único para todas las superficies; sin historial restaurable ni rollback editorial;
- `noindex`, `noarchive` y `no-store` en rutas administrativas;
- ausencia deliberada de telemetría de visitantes en la base administrativa.

La cuenta propietaria dispone además de **Mantenimiento** como consola general
de higiene del sitio. La pantalla combina un diagnóstico de PostgreSQL y del
almacén multimedia con una limpieza general segura. La acción automática sólo
elimina residuos deterministas: sesiones administrativas o de cuenta
revocadas/vencidas, códigos de recuperación ya usados, eventos transitorios
administrativos de más de 90 días, preferencias/ratings/insights cuyo juego ya
no existe, masters multimedia sin ninguna referencia editorial y con más de 24
horas, marcadores de borrado sin master, namespaces conocidos que sigan vacíos,
temporales multimedia DeUna reconocidos que lleven más de 24 horas abandonados
y limpiezas físicas pendientes de juegos ya eliminados.

La protección multimedia recorre únicamente los estados editoriales vigentes: fuente, borrador actual y publicación actual. Una referencia que existía sólo en una versión anterior ya no retiene el master. Los archivos sin
referencia de menos de 24 horas conservan un período de gracia para no competir
con cargas recientes. Namespaces desconocidos, entradas inesperadas y
actualizaciones editoriales que apuntan a un juego inexistente se presentan
como **revisión manual** y nunca se eliminan mediante la limpieza general. La
operación tampoco borra cuentas válidas, avatares, perfiles de hardware,
recompensas, `admin_audit_log` ni contenido editorial vigente. El historial
restaurable no forma parte del modelo de datos.

La limpieza general exige Owner, reautenticación, la frase exacta de
confirmación y un fingerprint del diagnóstico mostrado. El servidor recalcula
el estado antes de mutar; PostgreSQL vuelve a comparar los conteos dentro de una
función transaccional y cada archivo se revalida inmediatamente antes del
`unlink`. Si el estado cambió, la operación aborta o informa una limpieza
parcial y obliga a revisar el diagnóstico actualizado.

Los juegos pueden eliminarse definitivamente desde Admin después de ocultarlos
y cuando Inicio no los referencia. Si un juego proviene de `src/data/games.ts`,
el hard-delete registra además un retiro persistente para impedir que futuras
importaciones lo recreen. El catálogo público con PostgreSQL configurado consume
exclusivamente publicaciones vigentes y no resucita juegos retirados mediante
fallback de archivos. El hard-delete registra en PostgreSQL una limpieza
multimedia pendiente dentro de la misma transacción que elimina el juego. El identificador queda bloqueado hasta que el namespace físico
desaparece por completo; si el filesystem falla, Mantenimiento permite al
Owner reintentarlo y una limpieza exitosa elimina también el directorio vacío
antes de liberar el slug.

No existe historial editorial restaurable en ninguna superficie del panel. Mantenimiento se limita a residuos operativos, PostgreSQL y multimedia huérfana; nunca conserva versiones antiguas como baseline recuperable. `admin_audit_log` permanece separado como registro de seguridad y trazabilidad, sin payloads destinados a restauración.

Antes de ejecutar una limpieza destructiva sobre datos valiosos debe existir
un backup verificado; en local se puede crear con
`npm run admin:backup-local`.

`DEUNA_ADMIN_ORIGIN` fija el origen exacto aceptado por formularios y redirects del panel. En producción no debe derivarse del encabezado `Host`.

### Entorno local seguro

El flujo local soportado usa WSL2/Ubuntu con PostgreSQL en loopback. El bootstrap completo exige Node.js 24 o superior y PostgreSQL 18 o superior con `data_checksums=on`; el repositorio debe estar dentro del filesystem Linux y no bajo `/mnt/*`. La CI mantiene además una base aislada en PostgreSQL 17 para detectar incompatibilidades de la aplicación, sin rebajar el baseline endurecido del instalador local.

El instalador repetible es:

```bash
npm run local:setup
```

`local:setup` crea o valida `.env.local` y `.env.admin-migration.local` con permisos privados, mantiene separadas las credenciales runtime/migrador y genera la clave `DEUNA_ACCOUNT_DATA_KEY` necesaria para cifrar datos opcionales de cuentas. Si encuentra un `.env.local` antiguo creado sin las variables de cuentas, completa únicamente ese contrato sin rotar las credenciales de PostgreSQL. Antes de terminar ejecuta el preflight contra los env files y la base locales reales.

Para actualizar un entorno ya instalado después de traer cambios editoriales/migraciones:

```bash
npm run admin:update-local
```

Tanto `local:setup` como `admin:update-local` diagnostican residuos, pero no
ejecutan purgas destructivas automáticamente. La eliminación se realiza desde
**Mantenimiento** con reautenticación y confirmación explícita, o mediante los
comandos `admin:purge-*` cuando el operador los invoca deliberadamente.

Para rotar la contraseña propietaria:

```bash
npm run admin:change-password
```

Las credenciales runtime y migrador permanecen separadas. `.env.local` no debe contener credenciales del migrador y ningún archivo `.env.local` se versiona.

La configuración de PostgreSQL está documentada en `ops/postgresql/README.md` y el despliegue en `ops/deploy/README.md`.

## Build seguro de deploy

`NEXT_PUBLIC_SITE_URL` debe ser un origen absoluto válido. En producción debe apuntar al dominio HTTPS real, sin credenciales, ruta, query ni fragmento.

El artefacto endurecido se genera con:

```bash
npm run build:secure
```

`build:secure` prepara un staging neutral, ejecuta las mismas barreras relevantes de CI y genera `deploy/`. Los scripts y credenciales de migración no forman parte del runtime público.

## Estructura

```text
src/app/          rutas, metadata y endpoints de Next.js
src/components/   componentes compartidos
src/data/         contenido fuente y fallbacks editoriales
src/features/     features encapsuladas, incluido game-finder
src/lib/          lógica reutilizable y lectores públicos
src/theme/        sistema visual
src/types/        tipos compartidos
public/           assets públicos validados
ops/              infraestructura y deploy
tools/            build, seguridad, migración e integridad mantenidos
```

## Convenciones

- `src/theme/deuna-theme.css` es la fuente activa de la paleta visual.
- `UniversalGameCard` concentra las variantes generales de tarjetas de juegos.
- No versionar snapshots, backups, ZIPs, dumps, diagnósticos consumidos ni scripts de reparación temporales.
- No dejar `TODO`, `FIXME`, `HACK`, `debugger`, supresiones de lint/TypeScript ni trazas de diagnóstico en `src/`.
- No agregar módulos fuente, CSS Modules o herramientas mantenidas sin un consumidor real.
- Las páginas con filtros/query deben mantener canonical estable y evitar indexar combinaciones arbitrarias.
- No agregar enlaces internos a rutas inexistentes ni assets públicos sin referencia real.
- Una actualización sólo puede aparecer como descargable si el juego tiene un destino de descarga real y validado.
- Ratings, reseñas, fechas y demás métricas editoriales deben tener una fuente o metodología definida antes de tratarse como datos públicos reales.
- Los cambios estructurales deben pasar por rama/PR y mantener CI verde antes de llegar a `master`.