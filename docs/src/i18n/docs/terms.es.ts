// Copy en español de la página /terms — traducción fiel del texto legal de
// terms.en.ts (misma estructura de secciones y bloques; mantener en sync).
import type { LegalContent } from './legal';

export const termsEs: LegalContent = {
  meta: {
    title: 'Términos del servicio — NoteFlow',
    description:
      'Los términos que rigen los servicios online opcionales de NoteFlow: la cuenta de NoteFlow y los planes de pago NoteFlow AI y NoteFlow Cloud. La app en sí es software libre y de código abierto, regido por su propia licencia (GPL-3.0-or-later).',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Términos<br />del servicio',
    tagline: 'Última actualización: 19 de octubre de 2026',
  },

  summary: {
    title: 'Resumen',
    html: 'La app de NoteFlow es software libre y de código abierto — el software en sí se rige por su licencia (GNU General Public License v3.0 o posterior), no por estos términos. Estos términos regulan los <strong>servicios online opcionales</strong>: la cuenta de NoteFlow y los planes de pago NoteFlow AI y NoteFlow Cloud. Los planes se venden a través de Lemon Squeezy, se renuevan automáticamente y pueden cancelarse en cualquier momento. Hay una cosa que merece énfasis: <strong>NoteFlow Cloud siempre cifra tus notas, y ofrece un modo privado opcional con cifrado de extremo a extremo — si lo activas y pierdes la passphrase y también el código de recuperación, nadie (nosotros incluidos) puede recuperar tus notas.</strong>',
  },

  toc: [
    { id: 'scope', label: 'Qué cubren estos términos' },
    { id: 'account', label: 'Tu cuenta' },
    { id: 'billing', label: 'Facturación y cancelación' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'content', label: 'Tu contenido' },
    { id: 'free', label: 'Gratuito y terceros' },
    { id: 'availability', label: 'Disponibilidad' },
    { id: 'liability', label: 'Responsabilidad' },
    { id: 'termination', label: 'Terminación' },
    { id: 'law', label: 'Ley aplicable' },
    { id: 'changes', label: 'Cambios' },
    { id: 'contact', label: 'Contacto' },
  ],

  sections: [
    {
      id: 'scope',
      title: '1. Qué cubren estos términos',
      blocks: [
        {
          t: 'p',
          html: 'Estos términos son un acuerdo entre tú y NoteFlow, operado por un desarrollador independiente con base en España («nosotros»), y aplican a los <strong>servicios online de NoteFlow</strong>: la cuenta de NoteFlow, NoteFlow AI y NoteFlow Cloud.',
        },
        {
          t: 'p',
          html: 'Estos términos <strong>no</strong> cubren:',
        },
        {
          t: 'ul',
          items: [
            '<strong>El código de la aplicación de escritorio</strong>, que es software libre y de código abierto licenciado por separado bajo la <a href="https://github.com/yagoid/noteflow/blob/main/LICENSE" target="_blank" rel="noopener">GNU General Public License v3.0 o posterior</a> (GPL-3.0-or-later).',
            'Las <strong>integraciones gratuitas con terceros</strong> (GitHub Sync, IA con tu propia clave de API o modelos locales), que son acuerdos entre tú y esos terceros (ver sección 7).',
          ],
        },
        {
          t: 'p',
          html: 'Al crear una cuenta o usar los servicios, aceptas estos términos.',
        },
      ],
    },
    {
      id: 'account',
      title: '2. Tu cuenta',
      blocks: [
        {
          t: 'ul',
          items: [
            'Debes tener al menos <strong>14 años</strong> para crear una cuenta.',
            'Debes facilitar una dirección de correo válida que controles — es como inicias sesión y como podemos contactarte.',
            'Eres responsable de mantener seguro el acceso a tu correo y a tu dispositivo, y — si activas el modo privado (cifrado de extremo a extremo) de NoteFlow Cloud — de custodiar tu passphrase y tu código de recuperación.',
            'Podemos suspender o cerrar cuentas que incumplan estos términos, abusen de los servicios o creen riesgos de seguridad.',
          ],
        },
      ],
    },
    {
      id: 'billing',
      title: '3. Suscripciones, facturación y cancelación',
      blocks: [
        {
          t: 'ul',
          items: [
            'Los planes de pago los vende <strong>Lemon Squeezy como Merchant of Record</strong>: Lemon Squeezy es el vendedor de la suscripción, y a la compra le aplican sus <a href="https://www.lemonsqueezy.com/terms" target="_blank" rel="noopener">términos</a> y su política de reembolsos, junto con tus derechos legales (incluido el derecho de desistimiento del consumidor en la UE).',
            'Los precios incluyen el IVA cuando corresponde. El precio y el periodo de facturación (mensual o anual) se muestran en el checkout; Lemon Squeezy, como Merchant of Record, recauda e ingresa el IVA.',
            'Las suscripciones <strong>se renuevan automáticamente</strong> hasta que se cancelan. Puedes cancelar en cualquier momento desde el portal de cliente; tu plan sigue activo hasta el final del periodo ya pagado y no se renueva.',
            'Si un pago falla, las funciones del plan afectado pueden quedar suspendidas hasta que el pago se resuelva.',
          ],
        },
      ],
    },
    {
      id: 'ai',
      title: '4. NoteFlow AI',
      blocks: [
        {
          t: 'ul',
          items: [
            'El plan incluye una <strong>cuota mensual de uso medida en tokens</strong> (actualmente 3 millones de tokens al mes). La cuota no usada no se acumula al mes siguiente. Podemos ajustar la cuota o la lista de modelos disponibles con el tiempo; las reducciones sustanciales se anunciarán con antelación.',
            'Las peticiones se encaminan a modelos de IA de terceros. <strong>Lo que genera la IA lo generan esos modelos y puede ser inexacto, incompleto o inapropiado — verifícalo antes de confiar en ello.</strong> Eres responsable del uso que hagas de esos resultados.',
            'Uso justo y aceptable: no puedes usar el servicio para contenido o actividades ilegales, para dañar a otros, para intentar eludir las cuotas, las restricciones de modelos o la autenticación, ni para acceder al proxy fuera de la app. También aplican las políticas de uso aceptable de los proveedores de modelos subyacentes.',
            'Conservas los derechos que tengas sobre tus prompts y, en la medida en que lo permitan los proveedores subyacentes, sobre los resultados.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '5. NoteFlow Cloud',
      blocks: [
        {
          t: 'ul',
          items: [
            'NoteFlow Cloud siempre <strong>cifra tus notas</strong>, en tránsito y en reposo, y ofrece dos modos. En el <strong>modo por defecto (gestionado)</strong> nosotros custodiamos la clave de cifrado para que la sincronización funcione sin que tengas que recordar nada; esto significa que técnicamente podemos acceder al contenido de tus notas, algo que solo hacemos donde sea estrictamente necesario para operar el servicio. En el <strong>modo privado (cifrado de extremo a extremo) opcional</strong>, la clave está protegida por una passphrase que solo tú conoces y nosotros solo guardamos texto cifrado que no podemos leer.',
            '<strong>En el modo privado, eres el único responsable de tu passphrase y de tu código de recuperación.</strong> No podemos restablecerlos. Perder ambos significa que tus datos en la nube quedan irrecuperables para siempre. La app te avisa de esto al activar el modo privado; tómatelo en serio.',
            'Si tu suscripción termina, dejan de subirse cambios, pero <strong>conservas la posibilidad de descargar y borrar tus datos de la nube</strong>.',
            'Podemos borrar los datos en la nube de cuentas cuya suscripción haya caducado tras un largo periodo de inactividad, con un mínimo de 6 meses desde el fin de la suscripción y aviso previo por correo.',
            'El servicio incluye límites de almacenamiento de uso justo adecuados para notas personales; podemos introducir límites concretos, con aviso, si hace falta para mantener el servicio sostenible.',
            'La sincronización es una comodidad, no una garantía de copia de seguridad — guarda copias locales de todo lo crítico (tus notas están siempre en tu propio disco como archivos Markdown).',
          ],
        },
      ],
    },
    {
      id: 'content',
      title: '6. Tu contenido',
      blocks: [
        {
          t: 'p',
          html: 'Tus notas son tuyas. No reclamamos ninguna propiedad ni ninguna licencia sobre tu contenido más allá de las operaciones estrictamente técnicas necesarias para prestar los servicios (almacenar y transmitir datos cifrados y — en las peticiones de IA — reenviar al modelo los extractos que envías). Eres responsable de que tu contenido sea lícito.',
        },
      ],
    },
    {
      id: 'free',
      title: '7. Funciones gratuitas y servicios de terceros',
      blocks: [
        {
          t: 'p',
          html: 'GitHub Sync, los proveedores de IA usados con tu propia clave y los modelos locales son integraciones con servicios que tienen sus propios términos y políticas de privacidad, que aceptas directamente con esos proveedores. Estas integraciones se ofrecen tal cual, y no somos parte de tu relación con esos servicios.',
        },
      ],
    },
    {
      id: 'availability',
      title: '8. Disponibilidad y cambios en los servicios',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow lo construye y lo opera un desarrollador independiente. Los servicios se prestan <strong>sin garantía de disponibilidad ni SLA</strong>. Podemos modificar funciones con el tiempo. Si alguna vez discontinuamos un servicio de pago, avisaremos con al menos <strong>30 días de antelación</strong> y cualquier periodo prepagado restante se reembolsará prorrateado a través del proveedor de pagos.',
        },
      ],
    },
    {
      id: 'liability',
      title: '9. Exenciones y limitación de responsabilidad',
      blocks: [
        {
          t: 'p',
          html: 'Los servicios se prestan «tal cual» y «según disponibilidad». En la máxima medida permitida por la ley, nuestra responsabilidad total derivada de los servicios se limita a las cantidades que hayas pagado por ellos en los 12 meses anteriores a la reclamación. Nada en estos términos limita la responsabilidad que legalmente no pueda limitarse (como la responsabilidad por dolo o negligencia grave) ni afecta a los derechos legales imperativos que tienes como consumidor.',
        },
      ],
    },
    {
      id: 'termination',
      title: '10. Terminación',
      blocks: [
        {
          t: 'p',
          html: 'Puedes dejar de usar los servicios y cancelar tu suscripción en cualquier momento. También puedes solicitar el borrado de tu cuenta y de sus datos en el servidor contactándonos. Podemos terminar o suspender los servicios para cuentas que incumplan estos términos, con aviso previo cuando sea razonablemente posible. Tras el cierre de la cuenta, a los datos que queden en la nube les aplican las reglas de acceso a datos de la sección 5.',
        },
      ],
    },
    {
      id: 'law',
      title: '11. Ley aplicable',
      blocks: [
        {
          t: 'p',
          html: 'Estos términos se rigen por la ley española. Si eres consumidor en la Unión Europea, te amparan además las normas imperativas de protección del consumidor de tu país de residencia, y puedes plantear disputas ante los tribunales de tu propio domicilio.',
        },
      ],
    },
    {
      id: 'changes',
      title: '12. Cambios en estos términos',
      blocks: [
        {
          t: 'p',
          html: 'Podemos actualizar estos términos a medida que los servicios evolucionen. Para cambios sustanciales avisaremos con al menos 30 días de antelación en la app o por correo; seguir usando los servicios después de que los cambios entren en vigor significa que los aceptas. Si no estás de acuerdo, cancela tu suscripción antes de que apliquen los nuevos términos.',
        },
      ],
    },
    {
      id: 'contact',
      title: '13. Contacto',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
