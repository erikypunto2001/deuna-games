<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Preferencias del usuario

- GitHub es la fuente de verdad del código versionado. Antes de preparar cambios, comprobar el repositorio, la rama y el commit actuales y no basarse en recuerdos o copias antiguas.
- Para cambios preparados por ChatGPT, usar primero el flujo de staging por Google Drive configurado para el proyecto: verificar `control/baseline.txt`, modificar sólo los archivos necesarios en `mirror/` y preparar `control/change-set.json` con hashes SHA-256.
- No hacer commit ni push del cambio recién preparado antes de que el usuario lo aplique y pruebe localmente mediante el flujo Drive, salvo pedido explícito. Después de la confirmación local, volver a comprobar concurrencia en GitHub e integrar exactamente lo probado en una rama de trabajo/PR cuando corresponda.
- No afirmar que se ejecutó un comando, servidor o prueba dentro del WSL del usuario sin acceso real a ese entorno. En cambios visuales, indicar al usuario cómo iniciar `npm run mobile:secure` cuando corresponda y basar cualquier URL o resultado local en la salida que el usuario muestre.
- En cambios de la home o de su panel de control, revisar y verificar ambos lados. Para el hero, comprobar las previews de escritorio, tableta y móvil, la edición y la prueba interactiva con el mismo diseño y ancho que la home.

## Implementación y verificación integral de cada pedido

- Antes de modificar, entender el objetivo del usuario, revisar el flujo existente y definir criterios de aceptación observables. Identificar las pantallas, controles, datos y dependencias afectados; resolver el pedido completo sin añadir funcionalidades ajenas.
- Evaluar los aspectos pertinentes: experiencia de uso, coherencia visual, accesibilidad, adaptación a dispositivos, lógica, validación, persistencia, permisos, privacidad, rendimiento y compatibilidad con lo existente. Ajustar la profundidad al impacto del cambio.
- Para cada comportamiento nuevo o modificado, identificar acción, resultado esperado y forma de comprobarlo. Cubrir cada control y variante del flujo afectado, incluyendo los estados aplicables de carga, vacío, éxito, error, cancelación y reintento; no limitarse al caso exitoso.
- Probar las funciones interactivas en un navegador real: pulsar botones, completar formularios, navegar y comprobar los resultados. Verificar guardado tras recargar o volver a entrar y su reflejo en las pantallas relacionadas. Las capturas, la compilación y los análisis estáticos no sustituyen las pruebas funcionales.
- En cambios visuales, generar y abrir las capturas para inspeccionarlas realmente en escritorio, tableta y móvil. Revisar desbordamientos, legibilidad, alineación, estados interactivos, navegación por teclado, foco y controles táctiles según corresponda. Distinguir emulación de una prueba en dispositivo físico.
- Reutilizar las herramientas existentes de `package.json` y `tools/`: `lint`, `typecheck`, comprobaciones del área afectada y pruebas de navegador. Revisar los requisitos de cada script antes de ejecutarlo; `visual:smoke` incluye flujos que modifican datos y requieren un entorno local aislado y credenciales de prueba. No usar datos reales para pruebas destructivas ni exponer credenciales.
- Cuando la lógica o el riesgo lo justifiquen, añadir o actualizar pruebas automatizadas de comportamiento que detecten regresiones reales. Para ajustes simples y reversibles, basta una verificación directa adecuada; evitar tests que sólo busquen texto en el código o repitan la implementación.
- Verificar las integraciones y los flujos vecinos afectados. Corregir los fallos introducidos y repetir las comprobaciones pertinentes; ampliar las pruebas cuando el alcance o los resultados lo requieran.
- Conservar evidencia útil de la verificación: comandos y resultados, escenarios recorridos y capturas o informes cuando corresponda, sin datos sensibles. No afirmar que algo fue visto, probado o aprobado si no se ejecutó e inspeccionó realmente.
- Dar por terminado el pedido cuando sus criterios de aceptación estén comprobados. Si falta acceso, una herramienta o un servicio, avanzar con lo verificable y comunicar exactamente qué quedó sin probar y por qué; no presentar una verificación parcial como completa.
- Al entregar, resumir qué cambió, qué se probó, qué ejecutó el usuario localmente y cualquier limitación pendiente. Distinguir claramente revisión de código, pruebas realmente ejecutadas, CI y comprobaciones pendientes.
