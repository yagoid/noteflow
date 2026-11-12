// Copy en español de la página /privacy — traducción fiel del texto legal de
// privacy.en.ts (misma estructura de secciones y bloques; mantener en sync). Desde el
// 2026-11-12 cubre la app de escritorio Y la app de Android. El párrafo del responsable
// (§1) nombra al titular y enlaza al aviso legal solo cuando legal-notice.owner.ts está
// relleno. Los ids `feedback` y `deletion` se enlazan desde fuera: no renombrarlos.
import type { LegalContent } from './legal';
import { OWNER, legalNoticeReady, ownerNameHtml } from './legal-notice.owner';

const controllerHtml = legalNoticeReady
  ? `El responsable del tratamiento de tus datos personales es <strong>${ownerNameHtml}</strong>, titular de NoteFlow, cuyos datos identificativos completos figuran en el <a href="%LEGAL_NOTICE_URL%">Aviso legal</a>.`
  : `El responsable del tratamiento de tus datos personales es el desarrollador independiente que opera NoteFlow, contactable en <strong>${OWNER.email}</strong>.`;

export const privacyEs: LegalContent = {
  meta: {
    title: 'Política de privacidad — NoteFlow',
    description:
      'Cómo trata NoteFlow los datos en sus apps de escritorio y de Android: local-first y sin telemetría, y los servicios opcionales (cuenta de NoteFlow, NoteFlow AI, NoteFlow Cloud) solo tratan el mínimo descrito aquí — con sincronización en la nube cifrada, cifrado de extremo a extremo opcional y borrado de la cuenta desde la app.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Política de<br />privacidad',
    tagline: 'Última actualización: 12 de noviembre de 2026',
  },

  summary: {
    title: 'Resumen',
    html: 'NoteFlow es local-first. Tus notas son archivos Markdown planos guardados en tu propio dispositivo, y ni la aplicación de escritorio ni la de Android contienen telemetría, analítica ni anuncios. No hace falta ninguna cuenta para usarlas. Si decides crear una cuenta de NoteFlow y usar los servicios gestionados opcionales, tratamos los datos mínimos que se describen abajo — y NoteFlow Cloud siempre cifra tus notas, con un modo cifrado de extremo a extremo opcional en el que no podemos leerlas ni siquiera cuando están almacenadas en nuestros servidores. Puedes eliminar tu cuenta cuando quieras, desde la app de Android o por correo.',
  },

  toc: [
    { id: 'controller', label: 'Quiénes somos' },
    { id: 'local-first', label: 'Local-first por defecto' },
    { id: 'android', label: 'La app de Android' },
    { id: 'optional', label: 'Integraciones opcionales' },
    { id: 'account', label: 'Cuenta de NoteFlow' },
    { id: 'payments', label: 'Pagos' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'feedback', label: 'Comentarios y denuncias de IA' },
    { id: 'website', label: 'Sitio web' },
    { id: 'processors', label: 'Proveedores' },
    { id: 'transfers', label: 'Transferencias' },
    { id: 'retention', label: 'Conservación' },
    { id: 'deletion', label: 'Eliminar tu cuenta' },
    { id: 'rights', label: 'Tus derechos' },
    { id: 'children', label: 'Menores' },
    { id: 'changes', label: 'Cambios' },
    { id: 'contact', label: 'Contacto' },
  ],

  sections: [
    {
      id: 'controller',
      title: '1. Quiénes somos',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow es una aplicación para tomar notas para escritorio (Windows, macOS y Linux) y Android, un sitio web público y un conjunto de servicios online opcionales (la cuenta de NoteFlow, NoteFlow AI y NoteFlow Cloud) desarrollados y operados por un desarrollador independiente con base en España («NoteFlow», «nosotros»).',
        },
        { t: 'p', html: controllerHtml },
        {
          t: 'p',
          html: 'Para cualquier cosa relacionada con esta política o con tus datos, escribe a: <strong>yago.igle@gmail.com</strong>.',
        },
        {
          t: 'p',
          html: 'Esta política cubre <strong>tanto la app de escritorio como la app de NoteFlow para Android</strong> (sustituye a la anterior política de privacidad, separada, de la app móvil). Donde las dos apps se comportan de forma distinta, se indica la diferencia.',
        },
      ],
    },
    {
      id: 'local-first',
      title: '2. Las apps por defecto: tus datos se quedan en tu dispositivo',
      blocks: [
        {
          t: 'p',
          html: 'Recién instaladas, ninguna de las dos apps recoge <strong>ningún dato personal</strong>:',
        },
        {
          t: 'ul',
          items: [
            'Las notas, los grupos, los ajustes, las plantillas, el historial del chat de IA y el índice de búsqueda de la IA se guardan <strong>localmente en tu dispositivo</strong> como archivos y una base de datos local.',
            'En ninguna de las dos apps <strong>hay telemetría, ni analítica, ni informes de errores, ni publicidad</strong>.',
            'El cifrado por nota ocurre íntegramente en tu dispositivo; las notas cifradas solo pueden abrirse con tu contraseña.',
            'No se transmite nada a ningún sitio salvo que actives explícitamente alguna de las funciones opcionales descritas abajo, o decidas enviarnos comentarios o denunciar una respuesta de la IA desde la app (sección 9).',
          ],
        },
      ],
    },
    {
      id: 'android',
      title: '3. La app de Android: funciones del dispositivo y permisos',
      blocks: [
        {
          t: 'p',
          html: 'La app de Android usa estas funciones del dispositivo. Todas funcionan <strong>en tu dispositivo</strong>, y ninguna nos envía datos:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Almacenamiento local.</strong> Tus notas son archivos Markdown en el almacenamiento privado de la app, con una base de datos de búsqueda local y tus ajustes al lado. Los tokens de sesión, las claves de API y las credenciales de sincronización se guardan en el almacenamiento cifrado de Android. El historial del chat de IA se queda en el dispositivo y nunca se sincroniza.',
            '<strong>Cámara y fotos.</strong> Solo cuando decides insertar una imagen en una nota: o haces una foto con la cámara o eliges una con el selector de fotos de Android. La imagen se redimensiona y se guarda <strong>dentro de esa nota</strong>. No se sube a ningún sitio — salvo que sincronices la nota (GitHub Sync o NoteFlow Cloud), en cuyo caso viaja como parte de la nota. El permiso de cámara solo se pide la primera vez que haces una foto.',
            '<strong>Notificaciones (recordatorios de tareas).</strong> Cuando pones un recordatorio a una tarea, la app programa una notificación <strong>local</strong> con Android. No hay servidor de notificaciones push ni token de notificaciones: los recordatorios nunca pasan por nosotros. La notificación muestra el título de la nota y el texto de la tarea, así que puede verse en la pantalla de bloqueo según tus ajustes de Android. Las notas cifradas nunca programan recordatorios. El permiso de notificaciones se pide la primera vez que pones un recordatorio.',
            '<strong>Widgets de la pantalla de inicio.</strong> Si añades un widget de NoteFlow, muestra la nota o la lista que elijas — títulos y contenido de las secciones — en tu pantalla de inicio, donde cualquiera que vea tu pantalla puede leerlo. Los widgets se dibujan en el dispositivo a partir de tus notas locales. Las notas cifradas solo muestran su título y un candado.',
            '<strong>Importar, exportar y compartir.</strong> Los archivos que importas vienen del selector de archivos de Android, y lo que compartes va, a través del menú para compartir de Android, solo a la app que elijas.',
            '<strong>Copia de seguridad de Android.</strong> La app permite la copia de seguridad del sistema de Android. Si la copia de seguridad está activada en tu dispositivo, Android puede incluir los datos locales de la app (como tus notas y ajustes) en la copia de tu dispositivo, bajo las condiciones de Google; el almacenamiento cifrado que guarda tus tokens y claves queda excluido.',
          ],
        },
        {
          t: 'table',
          head: ['Permiso de Android', 'Para qué se usa'],
          rows: [
            ['Cámara', 'Hacer una foto para insertarla en una nota (solo cuando tú lo decides).'],
            ['Notificaciones', 'Mostrar los recordatorios de tareas que pongas.'],
            ['Ejecutar al iniciar', 'Volver a programar tus recordatorios después de reiniciar el dispositivo.'],
            ['Internet', 'Solo para las funciones opcionales: cuenta de NoteFlow, NoteFlow AI, NoteFlow Cloud, GitHub Sync, los proveedores de IA que configures y el envío de comentarios o denuncias de IA.'],
            ['Almacenamiento (Android 12 y anteriores)', 'Importar y exportar los archivos de notas que elijas.'],
            ['Vibración', 'Respuesta háptica en algunas interacciones.'],
          ],
        },
        {
          t: 'p',
          html: 'Puedes retirar cualquier permiso en cualquier momento desde los ajustes de Android; la función relacionada simplemente deja de funcionar. La app se distribuye a través de <strong>Google Play</strong>, que trata datos sobre tu instalación bajo la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">política de privacidad</a> de Google.',
        },
      ],
    },
    {
      id: 'optional',
      title: '4. Integraciones opcionales que tú controlas',
      blocks: [
        {
          t: 'p',
          html: 'Estas funciones se activan solo si tú quieres, y cada una habla con un tercero <strong>directamente desde tu dispositivo</strong> — NoteFlow no tiene ningún servidor en medio:',
        },
        {
          t: 'ul',
          items: [
            '<strong>GitHub Sync (gratis).</strong> Tus notas se suben a un repositorio privado de GitHub que te pertenece, y se descargan de él. Tu token de GitHub se guarda cifrado en tu dispositivo y solo se envía a la API de GitHub. A los datos de tu repositorio les aplica la <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">declaración de privacidad</a> de GitHub.',
            '<strong>IA con tu propia clave o modelos locales (gratis).</strong> Si configuras un proveedor de IA con tu propia clave de API, tus mensajes de chat, junto con el contenido relevante de tus notas (recuperado localmente, o leído por las herramientas del asistente cuando necesita abrir una nota), se envían directamente desde tu dispositivo a ese proveedor, bajo la política de privacidad de ese proveedor. Con un proveedor local (como Ollama), nada sale de tu máquina.',
            'En todas las funciones de IA: las secciones que marques como <strong>«Hide from AI»</strong> y las <strong>notas cifradas</strong> quedan excluidas del índice de búsqueda de la IA y de las herramientas del asistente y, por tanto, nunca se incluyen en nada que se envíe a ningún proveedor de IA. El propio índice de búsqueda se calcula y se guarda localmente (embeddings semánticos en escritorio, un índice de texto completo en Android).',
          ],
        },
      ],
    },
    {
      id: 'account',
      title: '5. La cuenta de NoteFlow',
      blocks: [
        {
          t: 'p',
          html: 'Crear una cuenta es opcional y solo hace falta para los servicios gestionados. Puedes iniciar sesión con la misma cuenta desde la app de escritorio y desde la de Android. Cuando creas una, tratamos:',
        },
        {
          t: 'ul',
          items: [
            'Tu <strong>dirección de correo</strong> y un identificador técnico de usuario (la autenticación se hace con códigos de un solo uso enviados por correo; no se almacena ninguna contraseña).',
            '<strong>Tokens de autenticación.</strong> El token de sesión de tu dispositivo se guarda cifrado. Nuestro proveedor de infraestructura conserva los registros de seguridad estándar de nuestro backend (marcas de tiempo, direcciones IP).',
            'Tu <strong>estado de suscripción</strong>: qué plan tienes, su estado y su fecha de renovación, más una referencia opaca del proveedor de pagos. Lo usamos para activar las funciones de tu plan.',
          ],
        },
        {
          t: 'p',
          html: 'Finalidades y bases jurídicas (RGPD): prestar el servicio que has contratado (ejecución de un contrato, art. 6.1.b) y mantener el servicio seguro y prevenir abusos (interés legítimo, art. 6.1.f).',
        },
        {
          t: 'p',
          html: 'Estos datos se almacenan en <strong>Supabase</strong>, nuestro proveedor de backend (ver sección 11). Puedes eliminar tu cuenta en cualquier momento (ver sección 14).',
        },
      ],
    },
    {
      id: 'payments',
      title: '6. Pagos',
      blocks: [
        {
          t: 'p',
          html: 'Los planes de pago se venden a través de <strong>Lemon Squeezy</strong>, que actúa como <strong>Merchant of Record</strong>: Lemon Squeezy es el vendedor legal y se encarga del checkout, el procesamiento del pago, la facturación, los impuestos/IVA y los reembolsos. <strong>Nunca recibimos los datos de tu tarjeta ni de tu pago.</strong> De Lemon Squeezy solo recibimos eventos que describen el estado de tu suscripción (producto, estado, fecha de renovación), vinculados a tu cuenta. La app de Android no procesa ningún pago.',
        },
        {
          t: 'p',
          html: 'Al proceso de compra y pago le aplica la <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener">política de privacidad</a> de Lemon Squeezy.',
        },
      ],
    },
    {
      id: 'ai',
      title: '7. NoteFlow AI (plan de IA gestionada)',
      blocks: [
        {
          t: 'p',
          html: 'Cuando usas el plan de IA gestionada, desde cualquiera de las dos apps, cada petición funciona así:',
        },
        {
          t: 'ul',
          items: [
            'Tu mensaje de chat, junto con el contenido relevante de tus notas recuperado <strong>localmente en tu dispositivo</strong>, se envían por TLS a nuestro proxy de IA, que los reenvía a <strong>OpenRouter</strong>, que los encamina al proveedor del modelo de IA que hayas elegido. Son <strong>exactamente los mismos datos</strong> que viajarían si usaras ese proveedor con tu propia clave de API.',
            '<strong>No registramos ni almacenamos en nuestros servidores el contenido de tus prompts ni las respuestas del modelo.</strong> Lo único que anotamos por petición son datos de medición: tu ID de usuario, el modelo usado, el número de tokens, el coste de la petición según OpenRouter, el ID de generación de OpenRouter y una marca de tiempo — necesarios para aplicar la asignación mensual de uso, que se mide por ese coste. (Una respuesta que decidas denunciar solo nos llega como se describe en la sección 9.)',
            'OpenRouter y el proveedor del modelo subyacente tratan la petición bajo sus propias políticas de privacidad (<a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">política de privacidad de OpenRouter</a>). Nuestra configuración de OpenRouter no se acoge a programas de registro de prompts ni de entrenamiento.',
            'Como siempre, las secciones «Hide from AI» y las notas cifradas nunca salen de tu dispositivo.',
            'NoteFlow AI es <strong>independiente de NoteFlow Cloud</strong>: usar el plan de IA no sube tus notas a nuestros servidores ni las almacena en ellos.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '8. NoteFlow Cloud (sincronización cifrada)',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow Cloud sincroniza tus notas entre tus dispositivos de escritorio y Android. Tus notas se <strong>cifran en tu dispositivo</strong> (AES-256-GCM) antes de subirse. Tú eliges cuánta confianza depositar en nosotros, mediante uno de dos modos:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Modo gestionado (el de por defecto).</strong> La clave que protege tus notas se guarda en el servidor envuelta por una clave que custodiamos nosotros. Esto permite que la sincronización funcione automáticamente sin que tengas que recordar nada, pero significa que <strong>técnicamente podemos descifrar el contenido de tus notas</strong>. Solo accedemos a él donde sea estrictamente necesario para operar el servicio, nunca para leer tus notas con ningún otro fin.',
            '<strong>Modo privado (opcional, cifrado de extremo a extremo).</strong> Si lo activas, la clave está protegida por una <strong>passphrase que solo tú conoces</strong>, y el servidor solo almacena claves <em>envueltas</em> que no puede abrir. En este modo <strong>no podemos leer tus notas</strong>, y por lo mismo <strong>no podemos restablecer tu passphrase</strong>: si pierdes la passphrase y también el código de recuperación, tus datos en la nube quedan irrecuperables para siempre — para cualquiera.',
            'En ambos modos, el servidor almacena el contenido de tus notas (incluidas las imágenes que contengan), las rutas de archivo y la estructura de carpetas solo como <strong>texto cifrado</strong>, junto a identificadores de ruta opacos y marcas de tiempo de modificación.',
            'Los metadatos de sincronización que sí podemos ver se limitan a datos técnicos: marcas de tiempo de las filas, tamaños aproximados y registros de peticiones (IP, marcas de tiempo) en nuestro proveedor de infraestructura.',
          ],
        },
        {
          t: 'p',
          html: 'Los datos de la nube se almacenan en <strong>Supabase</strong> (ver sección 11).',
        },
      ],
    },
    {
      id: 'feedback',
      title: '9. Comentarios y denuncias de respuestas de IA desde las apps',
      blocks: [
        {
          t: 'p',
          html: '<strong>Comentarios (app de escritorio).</strong> La app de escritorio tiene un formulario de <strong>Enviar comentarios</strong> (Ajustes → Acerca de) para informar de errores o hacer sugerencias. Es totalmente opcional, funciona <strong>con o sin cuenta</strong>, y no se envía nada hasta que pulsas <strong>Enviar</strong>. Cada envío guarda:',
        },
        {
          t: 'ul',
          items: [
            'El <strong>tipo</strong> que eliges (bug, sugerencia u otro) y el <strong>mensaje</strong> que escribes.',
            'Una <strong>dirección de correo</strong>, solo si la escribes para que podamos responderte.',
            'Solo si marcas <strong>«Incluir versión de la app y del sistema»</strong> (desmarcado por defecto): la versión de la app, el sistema operativo y la arquitectura de CPU, la versión del sistema y el idioma de la interfaz.',
            'Si has iniciado sesión en una cuenta de NoteFlow, tu <strong>ID de usuario</strong>, que vincula el envío a tu cuenta. Si no has iniciado sesión, se envía sin ningún vínculo a una cuenta.',
            '<strong>Nunca incluye tus notas</strong> ni ningún otro contenido de tu dispositivo. Como en cualquier petición, nuestro proveedor de infraestructura conserva los registros habituales del servicio (dirección IP, marcas de tiempo).',
          ],
        },
        {
          t: 'p',
          html: '<strong>Denunciar una respuesta de la IA (app de Android).</strong> En el asistente de IA de la app de Android puedes denunciar cualquier respuesta que te parezca ofensiva, dañina o errónea. No se envía nada hasta que confirmas la denuncia. Cada denuncia guarda:',
        },
        {
          t: 'ul',
          items: [
            'El <strong>texto de la respuesta denunciada</strong> (acortado si es muy largo), el <strong>motivo</strong> que escribas, si lo escribes, y qué proveedor y modelo de IA la generaron.',
            'La <strong>versión de la app</strong> y la plataforma (Android).',
            'Si has iniciado sesión en una cuenta de NoteFlow, tu <strong>ID de usuario</strong>; si no, se envía sin ningún vínculo a una cuenta.',
            '<strong>Nunca incluye tus notas, el resto de la conversación ni una dirección de contacto</strong>. Ten en cuenta, eso sí, que una respuesta de la IA puede citar contenido de tus notas: revísala antes de denunciarla.',
          ],
        },
        {
          t: 'p',
          html: 'Finalidades y bases legales (RGPD): leer y responder a tus comentarios y revisar las respuestas de IA denunciadas — tu consentimiento, que das al decidir enviarlos y qué incluir (art. 6.1.a) — y usarlos para corregir errores, mejorar NoteFlow y mantener seguras sus funciones de IA (interés legítimo, art. 6.1.f). Los comentarios y las denuncias se almacenan en <strong>Supabase</strong> (ver sección 11) y solo nosotros tenemos acceso a ellos.',
        },
      ],
    },
    {
      id: 'website',
      title: '10. Sitio web',
      blocks: [
        {
          t: 'p',
          html: 'El sitio web (este sitio) está alojado en <strong>GitHub Pages</strong>, así que GitHub recibe los registros de servidor estándar (dirección IP, user agent) cuando lo visitas. El sitio usa actualmente:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Google Analytics</strong>, para medir visitas agregadas (instala cookies).',
            '<strong>Google Fonts</strong>, servido desde los servidores de Google (tu IP se envía a Google al cargar las fuentes).',
          ],
        },
        {
          t: 'p',
          html: 'Las descargas de la app de escritorio se sirven desde GitHub Releases.',
        },
      ],
    },
    {
      id: 'processors',
      title: '11. Proveedores de servicio (encargados y destinatarios)',
      blocks: [
        {
          t: 'table',
          head: ['Proveedor', 'Función', 'Qué trata'],
          rows: [
            [
              'Supabase',
              'Infraestructura de backend (autenticación, base de datos, funciones)',
              'Correo de la cuenta, estado de suscripción, medición de IA, datos cifrados de la nube, comentarios y denuncias de respuestas de IA enviados desde las apps, registros del servicio',
            ],
            [
              'Lemon Squeezy',
              'Merchant of Record (responsable independiente de la venta)',
              'Datos de pago y facturación en el checkout',
            ],
            [
              'OpenRouter',
              'Encaminado de peticiones de IA (solo con el plan de IA gestionada)',
              'Contenido de los prompts en tránsito, uso de modelos',
            ],
            [
              'Proveedores de modelos de IA (vía OpenRouter)',
              'Inferencia del modelo (solo con el plan de IA gestionada)',
              'Contenido de los prompts en tránsito',
            ],
            [
              'GitHub',
              'Alojamiento del sitio web, descargas de la app de escritorio; GitHub Sync opcional (tu propio repositorio)',
              'Registros del servidor web; tus notas sincronizadas si activas GitHub Sync',
            ],
            [
              'Google',
              'Analítica y fuentes del sitio web; distribución de la app de Android en Google Play (responsable independiente); copia de seguridad de Android si la activas',
              'Sitio web: cookies, IP, uso. Android: datos de la instalación bajo las condiciones de Google; la copia de seguridad de tu dispositivo',
            ],
          ],
        },
        {
          t: 'p',
          html: 'No vendemos datos personales, y no los compartimos con nadie más allá de los proveedores listados arriba.',
        },
      ],
    },
    {
      id: 'transfers',
      title: '12. Transferencias internacionales',
      blocks: [
        {
          t: 'p',
          html: 'Algunos de los proveedores anteriores tratan datos en Estados Unidos o en otros países fuera del EEE. Cuando eso ocurre, las transferencias se apoyan en las Cláusulas Contractuales Tipo de la Comisión Europea y/o en el EU-U.S. Data Privacy Framework, según aplique a cada proveedor.',
        },
      ],
    },
    {
      id: 'retention',
      title: '13. Conservación de los datos',
      blocks: [
        {
          t: 'ul',
          items: [
            'Los <strong>datos de la cuenta</strong> se conservan mientras tu cuenta exista.',
            'Los <strong>registros de medición de IA</strong> se conservan mientras tu cuenta exista, para aplicar la cuota y prevenir abusos.',
            'Los <strong>datos de la nube (texto cifrado)</strong> se conservan hasta que los borres o elimines tu cuenta. Si tu suscripción caduca, sigues pudiendo descargar y borrar tus datos de la nube.',
            'Los <strong>comentarios y las denuncias de respuestas de IA</strong> se conservan hasta que se han atendido y mientras sigan siendo útiles para mejorar NoteFlow, y se borran cuando lo pidas. Si eliminas tu cuenta, dejan de estar vinculados a ella; pídenoslo si también quieres que se borren.',
            'Los <strong>registros de seguridad y del servicio</strong> que conserva nuestro proveedor de infraestructura (eventos de inicio de sesión, direcciones IP, marcas de tiempo) se borran automáticamente tras un periodo limitado, de 90 días como máximo.',
          ],
        },
        {
          t: 'p',
          html: 'Todo lo que se guarda localmente en tu dispositivo es tuyo, para conservarlo o borrarlo cuando quieras — las notas son archivos Markdown planos. Desinstalar la app de Android borra sus datos locales del dispositivo.',
        },
      ],
    },
    {
      id: 'deletion',
      title: '14. Eliminar tu cuenta',
      blocks: [
        {
          t: 'p',
          html: 'Puedes eliminar tu cuenta de NoteFlow y sus datos en el servidor en cualquier momento, de cualquiera de estas formas (instrucciones paso a paso en la <a href="%DELETE_ACCOUNT_URL%">página de eliminación de la cuenta</a>):',
        },
        {
          t: 'ul',
          items: [
            '<strong>En la app de Android:</strong> Ajustes → Suscripción → <strong>Eliminar cuenta</strong> (con la sesión iniciada). El borrado es inmediato.',
            '<strong>Por correo:</strong> escribe a <strong>yago.igle@gmail.com</strong> desde la dirección de tu cuenta. Comprobaremos que la petición es tuya y la completaremos en un plazo de 30 días.',
          ],
        },
        {
          t: 'p',
          html: 'Eliminar tu cuenta:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Cancela cualquier suscripción activa</strong>, para que no se te vuelva a cobrar. Si en ese momento no se puede cancelar una suscripción, no se borra nada y la app te pide que lo intentes de nuevo.',
            '<strong>Borra para siempre</strong> de nuestros servidores tu cuenta (dirección de correo e ID de usuario), tus datos y claves de NoteFlow Cloud, tus registros de medición de IA y tus registros de suscripción. No se puede deshacer.',
            '<strong>No borra las notas de tus dispositivos</strong>: son archivos locales que nunca hemos tenido, y se quedan donde están (igual que cualquier repositorio de GitHub con el que sincronices).',
            'Conserva tus comentarios y denuncias de respuestas de IA, <strong>desvinculados de tu cuenta</strong>; pídenoslo si quieres que también se borren.',
            'Lemon Squeezy, como Merchant of Record, conserva sus propios registros de las transacciones pasadas durante el tiempo que exija la ley, bajo su política de privacidad. Los registros de seguridad y del servicio caducan como se describe en la sección 13.',
          ],
        },
      ],
    },
    {
      id: 'rights',
      title: '15. Tus derechos',
      blocks: [
        {
          t: 'p',
          html: 'Bajo el RGPD puedes pedirnos el acceso a tus datos personales, su rectificación o supresión, la limitación de su tratamiento u oposición a él, y su portabilidad. La portabilidad de tus notas viene de serie: son archivos Markdown planos en tu propio dispositivo, y los datos de la nube pueden descargarse desde la app en cualquier momento.',
        },
        {
          t: 'p',
          html: 'Para ejercer cualquier derecho, escribe a <strong>yago.igle@gmail.com</strong>. También tienes derecho a presentar una reclamación ante tu autoridad de control — en España, la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">aepd.es</a>).',
        },
      ],
    },
    {
      id: 'children',
      title: '16. Menores',
      blocks: [
        {
          t: 'p',
          html: 'Los servicios online de NoteFlow no están dirigidos a menores de 14 años, y no tratamos sus datos a sabiendas. Si crees que un menor ha creado una cuenta, contáctanos y la eliminaremos.',
        },
      ],
    },
    {
      id: 'changes',
      title: '17. Cambios en esta política',
      blocks: [
        {
          t: 'p',
          html: 'Si esta política cambia, actualizaremos la fecha de arriba y, para cambios sustanciales que afecten a titulares de cuenta, avisaremos en la app o por correo.',
        },
      ],
    },
    {
      id: 'contact',
      title: '18. Contacto',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
