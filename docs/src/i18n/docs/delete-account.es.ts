// Copy en español de la página /delete-account — traducción fiel de delete-account.en.ts
// (misma estructura; mantener en sync). La ruta dentro de la app debe coincidir con las
// etiquetas de la app de Android en español (Ajustes → Suscripción → Eliminar cuenta, en
// src/i18n/es/settings.ts de noteflow-mobile).
import type { LegalContent } from './legal';

export const deleteAccountEs: LegalContent = {
  meta: {
    title: 'Eliminar tu cuenta — NoteFlow',
    description:
      'Cómo eliminar tu cuenta de NoteFlow — desde la app de NoteFlow para Android o por correo — y qué se borra y qué se conserva: se borran tu cuenta y tus datos de NoteFlow Cloud y se cancela cualquier suscripción; las notas de tus dispositivos siguen siendo tuyas.',
  },

  hero: {
    kicker: 'NoteFlow · Cuenta',
    h1: 'Eliminar tu<br />cuenta',
    tagline: 'Última actualización: 12 de noviembre de 2026',
  },

  summary: {
    title: 'En resumen',
    html: 'Puedes eliminar tu cuenta de NoteFlow en cualquier momento, desde la <strong>app de NoteFlow para Android</strong> o <strong>por correo</strong>. Eliminarla cancela cualquier suscripción activa y borra para siempre tu cuenta y tus datos de NoteFlow Cloud de nuestros servidores. <strong>Las notas de tus dispositivos no se tocan.</strong> No necesitas una cuenta para usar NoteFlow — si nunca iniciaste sesión, no hay nada que eliminar.',
  },

  toc: [
    { id: 'in-app', label: 'En la app de Android' },
    { id: 'email', label: 'Por correo' },
    { id: 'deleted', label: 'Qué se borra' },
    { id: 'kept', label: 'Qué se conserva' },
  ],

  sections: [
    {
      id: 'in-app',
      title: '1. Elimínala desde la app de Android',
      blocks: [
        {
          t: 'ol',
          items: [
            'Abre <strong>NoteFlow</strong> en tu dispositivo Android.',
            'Ve a <strong>Ajustes → Suscripción</strong>. Si no has iniciado sesión, inicia sesión con el correo de tu cuenta (te enviamos un código de un solo uso).',
            'Pulsa <strong>Eliminar cuenta</strong> y confirma.',
          ],
        },
        {
          t: 'p',
          html: 'El borrado es <strong>inmediato</strong> y se cierra la sesión en ese dispositivo. No se puede deshacer. Si en ese momento no se puede cancelar una suscripción, <strong>no se borra nada</strong> y la app muestra un error: vuelve a intentarlo un poco más tarde, o escríbenos.',
        },
      ],
    },
    {
      id: 'email',
      title: '2. Pídenoslo por correo',
      blocks: [
        {
          t: 'p',
          html: 'Si usas la app de escritorio, ya no tienes la app de Android o no puedes iniciar sesión, escribe a <strong>yago.igle@gmail.com</strong> con el asunto «Eliminar mi cuenta de NoteFlow», <strong>desde la dirección de correo de tu cuenta</strong>. Comprobaremos que la petición es tuya, eliminaremos la cuenta como se describe abajo <strong>en un plazo de 30 días</strong> y te avisaremos cuando esté hecho.',
        },
      ],
    },
    {
      id: 'deleted',
      title: '3. Qué se borra',
      blocks: [
        {
          t: 'ul',
          items: [
            'Tu <strong>cuenta</strong>: dirección de correo e ID de usuario.',
            'Tus <strong>datos de NoteFlow Cloud</strong>: tus notas cifradas y las claves cifradas que las protegen.',
            'Tus <strong>registros de uso de NoteFlow AI</strong> (datos de medición) y tus <strong>registros de suscripción</strong>.',
            'Tu <strong>suscripción</strong> se <strong>cancela</strong> antes de nada, para que no se te vuelva a cobrar.',
          ],
        },
        {
          t: 'p',
          html: 'Estos datos se borran de nuestros servidores en el momento (al instante desde la app; en cuanto se tramita tu petición por correo).',
        },
      ],
    },
    {
      id: 'kept',
      title: '4. Qué se conserva',
      blocks: [
        {
          t: 'ul',
          items: [
            '<strong>Las notas de tus dispositivos</strong>: son archivos locales que nunca hemos tenido, así que se quedan en tu móvil y en tu ordenador (igual que cualquier repositorio de GitHub con el que sincronices). Desinstala la app o borra los archivos si quieres que desaparezcan.',
            'Los <strong>comentarios y las denuncias de respuestas de IA</strong> que enviaste desde las apps se conservan, <strong>ya sin vínculo con tu cuenta</strong>. Pídenoslo por correo si quieres que también se borren.',
            '<strong>Registros de pago</strong>: Lemon Squeezy, nuestro Merchant of Record, conserva los registros de las transacciones pasadas que la ley le obliga a conservar (por ejemplo, a efectos fiscales), bajo su propia política de privacidad.',
            'Los <strong>registros de seguridad y del servicio</strong> de nuestro proveedor de infraestructura (eventos de inicio de sesión, direcciones IP, marcas de tiempo) se borran automáticamente en un plazo de 90 días.',
          ],
        },
        {
          t: 'p',
          html: 'Más detalles en nuestra <a href="%PRIVACY_URL%#deletion">política de privacidad</a>. Dudas: <strong>yago.igle@gmail.com</strong>.',
        },
      ],
    },
  ],
};
