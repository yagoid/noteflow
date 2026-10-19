// Copy en español de la página /legal-notice — traducción fiel del texto legal de
// legal-notice.en.ts (misma estructura de secciones y bloques; mantener en sync). Los
// datos identificativos del titular viven UNA sola vez en legal-notice.owner.ts.
import type { LegalContent } from './legal';
import { OWNER } from './legal-notice.owner';

const LICENSE_URL = 'https://github.com/yagoid/noteflow/blob/main/LICENSE';

export const legalNoticeEs: LegalContent = {
  meta: {
    title: 'Aviso legal — NoteFlow',
    description:
      'Aviso legal del sitio web de NoteFlow: identificación del titular (art. 10 de la LSSI-CE), objeto del sitio, propiedad intelectual, responsabilidad y legislación aplicable.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Aviso<br />legal',
    tagline: 'Última actualización: 19 de octubre de 2026',
  },

  summary: {
    title: 'Resumen',
    html: 'Este sitio web pertenece a un <strong>desarrollador independiente — una persona física autónoma con domicilio en España</strong> — que lo gestiona y cuyos datos identificativos figuran en la sección 1. Informa sobre NoteFlow, una app de notas de escritorio gratuita y open source, y sobre sus suscripciones opcionales NoteFlow AI y NoteFlow Cloud. Cómo tratamos los datos se explica en la <a href="%PRIVACY_URL%">Política de privacidad</a>, y los servicios de pago se rigen por los <a href="%TERMS_URL%">Términos del servicio</a>.',
  },

  toc: [
    { id: 'owner', label: 'Titular del sitio' },
    { id: 'purpose', label: 'Objeto' },
    { id: 'ip', label: 'Propiedad intelectual' },
    { id: 'liability', label: 'Responsabilidad y enlaces' },
    { id: 'law', label: 'Legislación aplicable' },
    { id: 'related', label: 'Políticas relacionadas' },
  ],

  sections: [
    {
      id: 'owner',
      title: '1. Titular del sitio web',
      blocks: [
        {
          t: 'p',
          html: 'En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), el titular de este sitio web es:',
        },
        {
          t: 'table',
          head: ['Dato', 'Detalle'],
          rows: [
            ['Titular', OWNER.name],
            ['Condición', 'Persona física — desarrollador independiente autónomo (España)'],
            ['NIF', OWNER.nif],
            ['Domicilio', OWNER.address],
            ['Email de contacto', OWNER.email],
            ['Sitio web', OWNER.website],
          ],
        },
        {
          t: 'p',
          html: 'Al tratarse de una persona física que actúa como profesional autónomo, el titular no está inscrito en el Registro Mercantil ni en otro registro público a los efectos del artículo 10.1.b) de la LSSI-CE, por lo que no aplican datos registrales.',
        },
      ],
    },
    {
      id: 'purpose',
      title: '2. Objeto del sitio web',
      blocks: [
        {
          t: 'p',
          html: 'Este sitio web ofrece información sobre <strong>NoteFlow</strong>, una app de notas de escritorio gratuita y open source, y su documentación, así como sobre las <strong>suscripciones opcionales NoteFlow AI y NoteFlow Cloud</strong>. La app se descarga desde GitHub Releases.',
        },
        {
          t: 'p',
          html: 'Las suscripciones se contratan desde la propia app. Las compras las procesa <strong>Lemon Squeezy como Merchant of Record</strong>: Lemon Squeezy es el vendedor de la suscripción y gestiona el pago, la facturación y los impuestos. Los servicios en sí se rigen por los <a href="%TERMS_URL%">Términos del servicio</a>.',
        },
      ],
    },
    {
      id: 'ip',
      title: '3. Propiedad intelectual e industrial',
      blocks: [
        {
          t: 'ul',
          items: [
            `El código fuente de NoteFlow — incluido el de este sitio web, que vive en el mismo repositorio — se publica bajo la <a href="${LICENSE_URL}" target="_blank" rel="noopener">GNU General Public License v3.0 o posterior</a> (GPL-3.0-or-later). Puedes usarlo, estudiarlo, modificarlo y redistribuirlo en los términos de esa licencia.`,
            'El <strong>nombre y el logotipo de NoteFlow</strong> identifican el proyecto y pertenecen al titular. La licencia del software cubre el código; no concede derechos para usar el nombre o el logotipo de NoteFlow de forma que sugiera que una versión modificada o un producto de terceros es el NoteFlow oficial, o que cuenta con el respaldo del titular.',
            'Las demás marcas y nombres mencionados en este sitio web (GitHub, Lemon Squeezy, los proveedores de modelos de IA, etc.) pertenecen a sus respectivos titulares y se usan solo para identificar sus productos.',
          ],
        },
      ],
    },
    {
      id: 'liability',
      title: '4. Responsabilidad y enlaces externos',
      blocks: [
        {
          t: 'p',
          html: 'La información de este sitio web se ofrece con fines informativos. El titular hace esfuerzos razonables por mantenerla correcta y actualizada, pero no puede garantizar que esté libre de errores o siempre al día, ni que el sitio esté disponible sin interrupciones. En la medida en que lo permita la ley, el titular no responde de los daños derivados del uso de la información de este sitio web. La app en sí se ofrece bajo su licencia, y los servicios de pago bajo los <a href="%TERMS_URL%">Términos del servicio</a>.',
        },
        {
          t: 'p',
          html: 'Este sitio web contiene enlaces a sitios de terceros (como GitHub, Lemon Squeezy o los proveedores de modelos de IA). El titular no controla esos sitios y no es responsable de su contenido, disponibilidad o prácticas de privacidad. Conforme al artículo 17 de la LSSI-CE, si el titular tiene conocimiento efectivo de que un sitio enlazado contiene contenido ilícito, retirará el enlace con diligencia.',
        },
      ],
    },
    {
      id: 'law',
      title: '5. Legislación aplicable',
      blocks: [
        {
          t: 'p',
          html: 'Este aviso legal y el uso de este sitio web se rigen por la legislación española. Si eres consumidor en la Unión Europea, ello no te priva de la protección de las normas imperativas de protección de los consumidores de tu país de residencia, y puedes acudir a los tribunales de tu propio domicilio.',
        },
      ],
    },
    {
      id: 'related',
      title: '6. Políticas relacionadas',
      blocks: [
        {
          t: 'ul',
          items: [
            '<a href="%PRIVACY_URL%">Política de privacidad</a> — cómo tratan los datos personales la app, los servicios opcionales y este sitio web.',
            '<a href="%TERMS_URL%">Términos del servicio</a> — la cuenta de NoteFlow y los planes de pago NoteFlow AI y NoteFlow Cloud.',
            'Cookies — este sitio web usa cookies de Google Analytics solo si las aceptas en el banner de consentimiento (detalles en la <a href="%PRIVACY_URL%#website">Política de privacidad</a>). Puedes cambiar tu elección en cualquier momento: <a href="%PRIVACY_URL%#website" data-cookie-settings>configuración de cookies</a>.',
          ],
        },
      ],
    },
  ],
};
