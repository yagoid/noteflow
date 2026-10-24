// Copy en español de la página /privacy — traducción fiel del texto legal de
// privacy.en.ts (misma estructura de secciones y bloques; mantener en sync). El párrafo
// del responsable (§1) nombra al titular y enlaza al aviso legal solo cuando
// legal-notice.owner.ts está relleno.
import type { LegalContent } from './legal';
import { OWNER, legalNoticeReady, ownerNameHtml } from './legal-notice.owner';

const controllerHtml = legalNoticeReady
  ? `El responsable del tratamiento de tus datos personales es <strong>${ownerNameHtml}</strong>, titular de NoteFlow, cuyos datos identificativos completos figuran en el <a href="%LEGAL_NOTICE_URL%">Aviso legal</a>.`
  : `El responsable del tratamiento de tus datos personales es el desarrollador independiente que opera NoteFlow, contactable en <strong>${OWNER.email}</strong>.`;

export const privacyEs: LegalContent = {
  meta: {
    title: 'Política de privacidad — NoteFlow',
    description:
      'Cómo trata NoteFlow los datos: la app de escritorio es local-first y sin telemetría, y los servicios opcionales (cuenta de NoteFlow, NoteFlow AI, NoteFlow Cloud) solo tratan el mínimo descrito aquí — con sincronización en la nube cifrada y cifrado de extremo a extremo opcional.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Política de<br />privacidad',
    tagline: 'Última actualización: 24 de octubre de 2026',
  },

  summary: {
    title: 'Resumen',
    html: 'NoteFlow es local-first. Tus notas son archivos Markdown planos guardados en tu propio dispositivo, y la aplicación de escritorio no contiene telemetría, analítica ni anuncios. No hace falta ninguna cuenta para usarla. Si decides crear una cuenta de NoteFlow y suscribirte a los servicios gestionados opcionales, tratamos los datos mínimos que se describen abajo — y NoteFlow Cloud siempre cifra tus notas, con un modo cifrado de extremo a extremo opcional en el que no podemos leerlas ni siquiera cuando están almacenadas en nuestros servidores.',
  },

  toc: [
    { id: 'controller', label: 'Quiénes somos' },
    { id: 'local-first', label: 'Local-first por defecto' },
    { id: 'optional', label: 'Integraciones opcionales' },
    { id: 'account', label: 'Cuenta de NoteFlow' },
    { id: 'payments', label: 'Pagos' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'website', label: 'Sitio web' },
    { id: 'processors', label: 'Proveedores' },
    { id: 'transfers', label: 'Transferencias' },
    { id: 'retention', label: 'Conservación' },
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
          html: 'NoteFlow es una aplicación de escritorio para tomar notas, un sitio web público y un conjunto de servicios online opcionales (la cuenta de NoteFlow, NoteFlow AI y NoteFlow Cloud) desarrollados y operados por un desarrollador independiente con base en España («NoteFlow», «nosotros»).',
        },
        { t: 'p', html: controllerHtml },
        {
          t: 'p',
          html: 'Para cualquier cosa relacionada con esta política o con tus datos, escribe a: <strong>yago.igle@gmail.com</strong>.',
        },
        {
          t: 'p',
          html: 'La app móvil de NoteFlow tiene su propia política de privacidad, separada: <a href="%MOBILE_PRIVACY_URL%">política de privacidad de NoteFlow Mobile</a>.',
        },
      ],
    },
    {
      id: 'local-first',
      title: '2. La app por defecto: tus datos se quedan en tu dispositivo',
      blocks: [
        {
          t: 'p',
          html: 'Recién instalada, la aplicación de escritorio <strong>no recoge ningún dato personal</strong>:',
        },
        {
          t: 'ul',
          items: [
            'Las notas, los grupos, los ajustes, las plantillas y el índice semántico de la IA se guardan <strong>localmente en tu dispositivo</strong> como archivos y una base de datos local.',
            'En la app <strong>no hay telemetría, ni analítica, ni informes de errores, ni publicidad</strong>.',
            'El cifrado por nota ocurre íntegramente en tu dispositivo; las notas cifradas solo pueden abrirse con tu contraseña.',
            'No se transmite nada a ningún sitio salvo que actives explícitamente alguna de las funciones opcionales descritas abajo.',
          ],
        },
      ],
    },
    {
      id: 'optional',
      title: '3. Integraciones opcionales que tú controlas',
      blocks: [
        {
          t: 'p',
          html: 'Estas funciones se activan solo si tú quieres, y cada una habla con un tercero <strong>directamente desde tu dispositivo</strong> — NoteFlow no tiene ningún servidor en medio:',
        },
        {
          t: 'ul',
          items: [
            '<strong>GitHub Sync (gratis).</strong> Tus notas se suben a un repositorio privado de GitHub que te pertenece, y se descargan de él. Tu token de GitHub se guarda cifrado en tu dispositivo y solo se envía a la API de GitHub. A los datos de tu repositorio les aplica la <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">declaración de privacidad</a> de GitHub.',
            '<strong>IA con tu propia clave o modelos locales (gratis).</strong> Si configuras un proveedor de IA con tu propia clave de API, tus mensajes de chat, junto con los extractos relevantes de tus notas (recuperados localmente), se envían directamente desde tu dispositivo a ese proveedor, bajo la política de privacidad de ese proveedor. Con un proveedor local (Ollama), nada sale de tu máquina.',
            'En todas las funciones de IA: las secciones que marques como <strong>«Hide from AI»</strong> y las <strong>notas cifradas</strong> quedan excluidas del índice semántico y, por tanto, nunca se incluyen en nada que se envíe a ningún proveedor de IA. El propio índice semántico (los embeddings) se calcula y se guarda localmente.',
          ],
        },
      ],
    },
    {
      id: 'account',
      title: '4. La cuenta de NoteFlow',
      blocks: [
        {
          t: 'p',
          html: 'Crear una cuenta es opcional y solo hace falta para los servicios de pago. Cuando creas una, tratamos:',
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
          html: 'Estos datos se almacenan en <strong>Supabase</strong>, nuestro proveedor de backend (ver sección 9).',
        },
      ],
    },
    {
      id: 'payments',
      title: '5. Pagos',
      blocks: [
        {
          t: 'p',
          html: 'Los planes de pago se venden a través de <strong>Lemon Squeezy</strong>, que actúa como <strong>Merchant of Record</strong>: Lemon Squeezy es el vendedor legal y se encarga del checkout, el procesamiento del pago, la facturación, los impuestos/IVA y los reembolsos. <strong>Nunca recibimos los datos de tu tarjeta ni de tu pago.</strong> De Lemon Squeezy solo recibimos eventos que describen el estado de tu suscripción (producto, estado, fecha de renovación), vinculados a tu cuenta.',
        },
        {
          t: 'p',
          html: 'Al proceso de compra y pago le aplica la <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener">política de privacidad</a> de Lemon Squeezy.',
        },
      ],
    },
    {
      id: 'ai',
      title: '6. NoteFlow AI (plan de IA gestionada)',
      blocks: [
        {
          t: 'p',
          html: 'Cuando usas el plan de IA gestionada, cada petición funciona así:',
        },
        {
          t: 'ul',
          items: [
            'Tu mensaje de chat, junto con los extractos relevantes de tus notas recuperados <strong>localmente en tu dispositivo</strong>, se envían por TLS a nuestro proxy de IA, que los reenvía a <strong>OpenRouter</strong>, que los encamina al proveedor del modelo de IA que hayas elegido. Son <strong>exactamente los mismos datos</strong> que viajarían si usaras ese proveedor con tu propia clave de API.',
            '<strong>No registramos ni almacenamos en nuestros servidores el contenido de tus prompts ni las respuestas del modelo.</strong> Lo único que anotamos por petición son datos de medición: tu ID de usuario, el modelo usado, el número de tokens, el coste de la petición según OpenRouter, el ID de generación de OpenRouter y una marca de tiempo — necesarios para aplicar la asignación mensual de uso, que se mide por ese coste.',
            'OpenRouter y el proveedor del modelo subyacente tratan la petición bajo sus propias políticas de privacidad (<a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">política de privacidad de OpenRouter</a>). Nuestra configuración de OpenRouter no se acoge a programas de registro de prompts ni de entrenamiento.',
            'Como siempre, las secciones «Hide from AI» y las notas cifradas nunca salen de tu dispositivo.',
            'NoteFlow AI es <strong>independiente de NoteFlow Cloud</strong>: usar el plan de IA no sube tus notas a nuestros servidores ni las almacena en ellos.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '7. NoteFlow Cloud (sincronización cifrada)',
      blocks: [
        {
          t: 'p',
          html: 'Tus notas se <strong>cifran en tu dispositivo</strong> (AES-256-GCM) antes de subirse. Tú eliges cuánta confianza depositar en nosotros, mediante uno de dos modos:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Modo gestionado (el de por defecto).</strong> La clave que protege tus notas se guarda en el servidor envuelta por una clave que custodiamos nosotros. Esto permite que la sincronización funcione automáticamente sin que tengas que recordar nada, pero significa que <strong>técnicamente podemos descifrar el contenido de tus notas</strong>. Solo accedemos a él donde sea estrictamente necesario para operar el servicio, nunca para leer tus notas con ningún otro fin.',
            '<strong>Modo privado (opcional, cifrado de extremo a extremo).</strong> Si lo activas, la clave está protegida por una <strong>passphrase que solo tú conoces</strong>, y el servidor solo almacena claves <em>envueltas</em> que no puede abrir. En este modo <strong>no podemos leer tus notas</strong>, y por lo mismo <strong>no podemos restablecer tu passphrase</strong>: si pierdes la passphrase y también el código de recuperación, tus datos en la nube quedan irrecuperables para siempre — para cualquiera.',
            'En ambos modos, el servidor almacena el contenido de tus notas, las rutas de archivo y la estructura de carpetas solo como <strong>texto cifrado</strong>, junto a identificadores de ruta opacos y marcas de tiempo de modificación.',
            'Los metadatos de sincronización que sí podemos ver se limitan a datos técnicos: marcas de tiempo de las filas, tamaños aproximados y registros de peticiones (IP, marcas de tiempo) en nuestro proveedor de infraestructura.',
          ],
        },
        {
          t: 'p',
          html: 'Los datos de la nube se almacenan en <strong>Supabase</strong> (ver sección 9).',
        },
      ],
    },
    {
      id: 'website',
      title: '8. Sitio web',
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
          html: 'Las descargas de la app se sirven desde GitHub Releases.',
        },
      ],
    },
    {
      id: 'processors',
      title: '9. Proveedores de servicio (encargados y destinatarios)',
      blocks: [
        {
          t: 'table',
          head: ['Proveedor', 'Función', 'Qué trata'],
          rows: [
            [
              'Supabase',
              'Infraestructura de backend (autenticación, base de datos, funciones)',
              'Correo de la cuenta, estado de suscripción, medición de IA, datos cifrados de la nube, registros del servicio',
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
              'Alojamiento del sitio web, descargas de la app; GitHub Sync opcional (tu propio repositorio)',
              'Registros del servidor web; tus notas sincronizadas si activas GitHub Sync',
            ],
            [
              'Google',
              'Analítica y fuentes del sitio web (solo el sitio web, no la app)',
              'Cookies, IP, uso del sitio web',
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
      title: '10. Transferencias internacionales',
      blocks: [
        {
          t: 'p',
          html: 'Algunos de los proveedores anteriores tratan datos en Estados Unidos o en otros países fuera del EEE. Cuando eso ocurre, las transferencias se apoyan en las Cláusulas Contractuales Tipo de la Comisión Europea y/o en el EU-U.S. Data Privacy Framework, según aplique a cada proveedor.',
        },
      ],
    },
    {
      id: 'retention',
      title: '11. Conservación de los datos',
      blocks: [
        {
          t: 'ul',
          items: [
            'Los <strong>datos de la cuenta</strong> se conservan mientras tu cuenta exista.',
            'Los <strong>registros de medición de IA</strong> se conservan mientras tu cuenta exista, para aplicar la cuota y prevenir abusos.',
            'Los <strong>datos de la nube (texto cifrado)</strong> se conservan hasta que los borres o borres tu cuenta. Si tu suscripción caduca, sigues pudiendo descargar y borrar tus datos de la nube.',
            'Para <strong>borrar tu cuenta y todos los datos asociados en el servidor</strong>, escríbenos a la dirección de arriba y los eliminaremos sin dilación indebida. (El borrado de cuenta autoservicio desde la app está planificado.)',
          ],
        },
        {
          t: 'p',
          html: 'Todo lo que se guarda localmente en tu dispositivo es tuyo, para conservarlo o borrarlo cuando quieras — las notas son archivos Markdown planos.',
        },
      ],
    },
    {
      id: 'rights',
      title: '12. Tus derechos',
      blocks: [
        {
          t: 'p',
          html: 'Bajo el RGPD puedes pedirnos el acceso a tus datos personales, su rectificación o supresión, la limitación de su tratamiento u oposición a él, y su portabilidad. La portabilidad de tus notas viene de serie: son archivos Markdown planos en tu propio disco, y los datos de la nube pueden descargarse desde la app en cualquier momento.',
        },
        {
          t: 'p',
          html: 'Para ejercer cualquier derecho, escribe a <strong>yago.igle@gmail.com</strong>. También tienes derecho a presentar una reclamación ante tu autoridad de control — en España, la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">aepd.es</a>).',
        },
      ],
    },
    {
      id: 'children',
      title: '13. Menores',
      blocks: [
        {
          t: 'p',
          html: 'Los servicios online de NoteFlow no están dirigidos a menores de 14 años, y no tratamos sus datos a sabiendas. Si crees que un menor ha creado una cuenta, contáctanos y la eliminaremos.',
        },
      ],
    },
    {
      id: 'changes',
      title: '14. Cambios en esta política',
      blocks: [
        {
          t: 'p',
          html: 'Si esta política cambia, actualizaremos la fecha de arriba y, para cambios sustanciales que afecten a titulares de cuenta, avisaremos en la app o por correo.',
        },
      ],
    },
    {
      id: 'contact',
      title: '15. Contacto',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
