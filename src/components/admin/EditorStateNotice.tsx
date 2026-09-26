import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";

import styles from "../../app/admin/admin.module.css";

const notices = {
  creado: {
    kind: "success",
    message:
      "Juego creado como borrador privado. Revisa sus datos y pulsa Publicar cuando esté listo para aparecer en la web.",
  },
  "actualizacion-creada": {
    kind: "success",
    message:
      "Actualización creada como borrador privado. Revisa sus datos y pulsa Publicar cuando deba aparecer en la web.",
  },
  "version-por-actualizacion": {
    kind: "warning",
    message:
      "La ficha no se guardó porque intentaste cambiar la versión de un juego ya publicado. Haz ese cambio desde Actualizar para que versión, descargas y aviso público permanezcan sincronizados.",
  },
  "actualizacion-publicada": {
    kind: "success",
    message:
      "Actualización publicada. La ficha conserva su misma URL y ya usa la nueva versión y las nuevas fuentes de descarga; el aviso quedó registrado en Actualizaciones.",
  },
  "actualizacion-juego-no-publicado": {
    kind: "warning",
    message:
      "Este juego todavía no está publicado. Completa primero su publicación inicial; las actualizaciones están reservadas para versiones posteriores de un juego ya visible.",
  },
  "actualizacion-cambios-pendientes": {
    kind: "warning",
    message:
      "El juego tiene otros cambios sin publicar. Por seguridad no se mezclaron con la actualización. Publica o descarta esos cambios manualmente y vuelve a intentarlo.",
  },
  "actualizacion-preparacion-incompleta": {
    kind: "error",
    message:
      "La nueva versión no se publicó porque la ficha no cumple todos los controles esenciales. Completa Portada, Hero, Card y Galería desde Multimedia y vuelve a intentarlo.",
  },
  "actualizacion-asset": {
    kind: "error",
    message:
      "La nueva versión no se publicó porque falta una imagen o un video referenciado en el almacenamiento editorial. Corrige Multimedia antes de volver a intentarlo.",
  },
  "actualizacion-misma-version": {
    kind: "warning",
    message:
      "La nueva versión coincide con la versión pública actual. Para mantenimiento de mirrors o enlaces sin una versión nueva, usa Descargas; para anunciar una versión nueva, indica aquí su nuevo número.",
  },
  "actualizacion-sin-descarga": {
    kind: "error",
    message:
      "La actualización necesita al menos una fuente de descarga válida, visible y marcada como Disponible.",
  },
  "actualizacion-duplicada": {
    kind: "warning",
    message:
      "Ya existe un aviso registrado para esa versión de este juego. Revisa las actualizaciones existentes antes de intentar publicarla nuevamente.",
  },
  duplicado: {
    kind: "warning",
    message:
      "Ese identificador ya existe. Usa uno distinto o edita el contenido existente.",
  },
  "juego-no-encontrado": {
    kind: "warning",
    message:
      "El juego relacionado no existe en el espacio editorial. Créalo o corrige el identificador antes de continuar.",
  },
  guardado: {
    kind: "success",
    message:
      "Borrador guardado. La web pública todavía no fue modificada.",
  },
  "catalogo-guardado": {
    kind: "success",
    message:
      "Catálogos guardados como borrador actual. Ningún juego ni página pública fue modificado.",
  },
  "catalogo-en-uso": {
    kind: "warning",
    message:
      "No se guardó el cambio porque quitaría o renombraría un término que todavía usa algún juego. Desactívalo si ya no quieres ofrecerlo para nuevas fichas.",
  },
  clasificacion: {
    kind: "error",
    message:
      "La clasificación no coincide con los Catálogos actuales. Selecciona categorías, géneros y etiquetas activas; los valores antiguos ya asignados se conservan hasta que decidas reemplazarlos.",
  },
  "rendimiento-sin-pc": {
    kind: "warning",
    message:
      "No se guardó la calibración porque este juego no tiene un release PC publicado en el borrador actual. Agrega primero PC en Plataformas y descargas; los FPS nunca se infieren para otras consolas.",
  },
  "valoracion-sugerencia": {
    kind: "warning",
    message:
      "La sugerencia automática no se aplicó porque el Índice DeUna todavía no tiene migración activa, evidencias suficientes o confianza media/alta. La valoración editorial existente no fue modificada.",
  },
  "imagen-subida": {
    kind: "success",
    message:
      "Imagen normalizada a WebP seguro, almacenada y guardada en el borrador. Aún no fue publicada.",
  },
  "recurso-subido": {
    kind: "success",
    message:
      "Recurso almacenado de forma segura en la biblioteca compartida. Todavía no modifica ningún destino hasta que lo asignes.",
  },
  "recurso-asignado": {
    kind: "success",
    message:
      "Recurso asignado desde la biblioteca compartida sin duplicar ni recodificar el archivo físico.",
  },
  "recurso-invalido": {
    kind: "error",
    message:
      "Ese recurso ya no está disponible o no supera la validación del almacén editorial. Recarga Multimedia y selecciona otro archivo.",
  },
  "recurso-en-uso": {
    kind: "warning",
    message:
      "Ese master está protegido porque el borrador todavía lo referencia. Quita primero la asignación del destino o de Galería; Biblioteca nunca elimina una referencia activa de forma implícita.",
  },
  "recurso-eliminado": {
    kind: "success",
    message:
      "Master huérfano eliminado de la biblioteca editorial y del almacenamiento. No estaba referenciado por el borrador ni por la publicación actual.",
  },
  "recurso-eliminacion-pendiente": {
    kind: "warning",
    message:
      "El master quedó marcado para limpieza, pero todavía existe una referencia pública que obliga a conservar el archivo físico. El sistema volverá a reconciliarlo de forma segura cuando esa referencia deje de existir.",
  },
  "recurso-eliminado-base": {
    kind: "warning",
    message:
      "Ese recurso pertenece a los archivos base compartidos del proyecto y no puede eliminarse desde la biblioteca editorial del juego. El archivo original se conservó.",
  },
  "recurso-eliminacion-incompleta": {
    kind: "warning",
    message:
      "La limpieza física no pudo completarse. Recarga Multimedia: el sistema volverá a validar referencias y reintentará únicamente si el master sigue siendo realmente huérfano.",
  },
  "imagen-encuadre-guardado": {
    kind: "success",
    message:
      "Encuadre de imagen guardado como metadata del destino. El archivo original no fue recortado, duplicado ni recodificado.",
  },
  "imagen-encuadre-invalido": {
    kind: "error",
    message:
      "El encuadre de la imagen no es válido. Restablécelo y vuelve a guardar sin cambiar el recurso original.",
  },
  "preview-subido": {
    kind: "success",
    message:
      "Preview convertido a WebM/VP9 sin audio y guardado en el borrador. Las tarjetas públicas no cambiarán hasta publicar el juego.",
  },
  "preview-quitado": {
    kind: "success",
    message:
      "Preview retirado del borrador. Al publicar, las tarjetas volverán a mostrar únicamente la portada.",
  },
  ffmpeg: {
    kind: "error",
    message:
      "FFmpeg no está disponible en este servidor. Instálalo o configura DEUNA_FFMPEG_PATH y reinicia DeUna antes de convertir previews.",
  },
  "video-pesado": {
    kind: "error",
    message:
      "El preview no pudo quedar dentro del límite de peso incluso después de la recompresión. Prueba un fragmento con menos movimiento o menor resolución.",
  },
  "video-invalido": {
    kind: "error",
    message:
      "El archivo no pudo validarse o decodificarse como video. Usa MP4, WebM, MOV, M4V, MKV o AVI de hasta 64 MB.",
  },
  "slug-plataforma": {
    kind: "error",
    message:
      "Ese identificador está reservado por una plataforma y no puede usarse como slug de colección. Usa otro slug para evitar que una saga o franquicia tape la colección automática de esa consola.",
  },
  "coleccion-en-conflicto": {
    kind: "error",
    message:
      "No se guardó el catálogo porque uno de los IDs de plataforma coincide con una colección editorial existente. Usa identificadores distintos para mantener URLs de Colecciones inequívocas.",
  },
  "relacion-publica": {
    kind: "error",
    message:
      "La publicación fue bloqueada porque una plataforma, un juego o un programa relacionado todavía no existe en el estado público vigente. Publica primero esas dependencias y vuelve a intentarlo.",
  },
  "relacion-publica-en-uso": {
    kind: "warning",
    message:
      "No se ocultó el contenido porque todavía está referenciado por otra publicación visible. Retíralo primero de los juegos o colecciones que lo usan y publica esos cambios antes de volver a intentarlo.",
  },
  "plataforma-publicada-en-uso": {
    kind: "error",
    message:
      "La publicación del catálogo fue bloqueada porque quitaría una plataforma que todavía usa contenido público. Actualiza u oculta primero ese contenido antes de volver a publicar el catálogo.",
  },
  conflicto: {
    kind: "warning",
    message:
      "Otra pestaña guardó una versión más reciente. Revisa los datos actuales antes de volver a guardar.",
  },
  "galeria-llena": {
    kind: "warning",
    message:
      "La galería ya contiene ocho capturas. Quita una de las capturas asignadas antes de añadir otra imagen.",
  },
  "galeria-actualizada": {
    kind: "success",
    message:
      "Galería actualizada. La captura se quitó sólo de este destino y su archivo sigue disponible en la biblioteca compartida.",
  },
  datos: {
    kind: "error",
    message:
      "Hay datos inválidos. Revisa los límites y formatos del formulario.",
  },
  asset: {
    kind: "error",
    message:
      "Una de las imágenes indicadas no existe en el almacén permitido. Corrige la selección antes de guardar.",
  },
  "imagen-invalida": {
    kind: "error",
    message:
      "La imagen no pudo almacenarse. Vuelve a prepararla desde Multimedia; el panel puede convertir PNG, JPEG, AVIF o WebP y ajustar tamaño/calidad antes de guardar.",
  },
  solicitud: {
    kind: "error",
    message:
      "La solicitud fue rechazada por seguridad. Vuelve a abrir el editor.",
  },
  "no-encontrado": {
    kind: "warning",
    message:
      "El registro editorial ya no está disponible.",
  },
  eliminado: {
    kind: "success",
    message:
      "Juego creado desde Admin eliminado definitivamente junto con sus dependencias editoriales asociadas.",
  },
  "eliminado-media-pendiente": {
    kind: "warning",
    message:
      "El juego y sus datos asociados fueron eliminados, pero la limpieza física de uno o más recursos multimedia quedó pendiente. El contenido ya no es público y no queda ninguna versión anterior recuperable.",
  },
  "eliminacion-media-no-verificada": {
    kind: "error",
    message:
      "La eliminación definitiva no se ejecutó porque el namespace multimedia no pudo verificarse de forma exhaustiva. La base no fue modificada.",
  },
  "limpieza-media-pendiente": {
    kind: "warning",
    message:
      "Existe una limpieza multimedia pendiente para ese identificador. El slug permanece bloqueado hasta que Mantenimiento elimine por completo el namespace anterior.",
  },
  "limpieza-media-completa": {
    kind: "success",
    message:
      "La limpieza multimedia pendiente terminó correctamente. El namespace anterior fue eliminado y el identificador volvió a quedar disponible.",
  },
  "limpieza-media-confirmacion": {
    kind: "error",
    message:
      "El reintento no se ejecutó porque la contraseña o el identificador de confirmación no son válidos.",
  },
  "limpieza-general-completa": {
    kind: "success",
    message:
      "Limpieza general completada. Se eliminaron únicamente residuos seguros y el sitio fue analizado nuevamente al finalizar.",
  },
  "limpieza-general-parcial": {
    kind: "warning",
    message:
      "La limpieza general eliminó lo que pudo verificar con seguridad, pero quedaron residuos pendientes o el estado cambió durante la operación. Revisa el diagnóstico actualizado.",
  },
  "limpieza-general-conflicto": {
    kind: "warning",
    message:
      "El diagnóstico cambió desde que cargaste Mantenimiento. No se inició la limpieza general; revisa los conteos y vuelve a confirmar.",
  },
  "limpieza-general-confirmacion": {
    kind: "error",
    message:
      "La limpieza general no se ejecutó porque la contraseña, la frase de confirmación o el snapshot esperado no son válidos.",
  },
  reauth: {
    kind: "error",
    message:
      "La contraseña actual del Owner no pudo verificarse. La operación crítica no se ejecutó.",
  },
} as const;

export default function EditorStateNotice({
  state,
}: {
  state?: string;
}) {
  if (!state || !(state in notices)) return null;

  const notice = notices[
    state as keyof typeof notices
  ];
  const variant =
    notice.kind === "success"
      ? styles.editorNoticeSuccess
      : notice.kind === "warning"
        ? styles.editorNoticeWarning
        : styles.editorNoticeError;
  const Icon =
    notice.kind === "success"
      ? CheckCircle2
      : notice.kind === "warning"
        ? AlertTriangle
        : CircleAlert;

  return (
    <div
      className={`${styles.editorNotice} ${variant} admin-editor-notice`}
      data-kind={notice.kind}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <span>{notice.message}</span>
    </div>
  );
}
