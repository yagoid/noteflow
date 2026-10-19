// Copy en español de la página /pricing — debe satisfacer la forma de pricing.en.ts.
// Los datos (planes, modelos curados, cuota, estado de Cloud) salen de
// .claude/context/monetization.md — incluidas las cifras de precio de `plans` y
// los bullets de ai/cloud: mantenerlas en sync con monetization.md (§ visión) y
// las variantes de Lemon Squeezy. El checkout sigue mostrando el precio final.
import type { PricingContent } from './pricing.en';

export const pricingEs: PricingContent = {
  meta: {
    title: 'Precios de NoteFlow — gratis para siempre, con planes gestionados opcionales',
    description:
      'NoteFlow es gratis y todo lo esencial lo seguirá siendo. Solo existen dos suscripciones opcionales, por pura comodidad — NoteFlow AI (LLM gestionado) y NoteFlow Cloud (nube cifrada gestionada), ambas ya disponibles — y ambas capacidades se consiguen gratis autogestionándolas.',
  },

  hero: {
    kicker: 'NoteFlow · Precios',
    h1: 'Gratis.<br />Siempre.',
    tagline:
      'Todo lo esencial es gratis y lo seguirá siendo. Los planes de pago compran comodidad, no capacidad: todo lo que hacen puedes autogestionarlo sin coste.',
  },

  toc: [
    { id: 'free', label: 'Gratis para siempre' },
    { id: 'plans', label: 'Planes y precios' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'compare', label: 'Gestionado vs DIY' },
    { id: 'privacy', label: 'Privacidad' },
  ],

  free: {
    title: 'Todo lo esencial es gratis',
    intro: [
      'NoteFlow es local-first: tus notas son archivos <code>.md</code> planos en tu máquina, y todo el producto funciona sin cuenta, sin servidor y sin suscripción. Es la app completa — no un tier de prueba.',
    ],
    cards: [
      {
        title: 'Editor y organización',
        html: 'El editor markdown, grupos → carpetas → notas → secciones, plantillas, sticky notes, vistas y atajos — todo.',
      },
      {
        title: 'El Cerebro',
        html: 'El índice semántico, el grafo de notas y las secciones relacionadas funcionan <strong>100% en local</strong>: los embeddings se calculan en tu máquina, sin nube de por medio.',
      },
      {
        title: 'Chat y agente de IA',
        html: 'Trae tu propio modelo: ejecuta <strong>Ollama</strong> en local (sin key, totalmente offline) o usa tu propia API key de cualquiera de los <a href="%AI_PROVIDERS_URL%">9 proveedores soportados</a>.',
      },
      {
        title: 'Cifrado',
        html: 'Cifrado AES-256-GCM por nota con tu contraseña. Sin puerta trasera y sin plan de por medio.',
      },
      {
        title: 'GitHub Sync',
        html: 'Sincroniza entre dispositivos con tu propio repo privado de GitHub. Gratis, autogestionado, tuyo.',
      },
      {
        title: 'CLI',
        html: 'El CLI companion lee y edita las mismas notas desde tu terminal — y desde tus agentes de código.',
      },
    ],
    keep: {
      title: 'Los planes suman, nunca sustituyen',
      html: 'Las dos suscripciones de abajo son <strong>alternativas gestionadas</strong> para quien no quiere montarse nada. Las vías gratuitas — modelo local, tu propia key, GitHub Sync — siguen siendo ciudadanos de primera y funcionan exactamente igual que hoy.',
    },
  },

  plans: {
    title: 'Planes y precios',
    intro: [
      'Los planes compran comodidad, no capacidad — y se contratan <strong>desde la propia app</strong>: Settings → Account, con pago mensual o anual. El checkout se abre en tu navegador y el pago lo procesa <strong>Lemon Squeezy</strong>, nuestro merchant of record.',
    ],
    perMonth: '/mes',
    perYear: '/año',
    cards: [
      {
        name: 'NoteFlow AI',
        subtitle: 'El modelo gestionado',
        monthly: '€5.99',
        yearly: '€49.99',
        badge: '',
      },
      {
        name: 'NoteFlow Cloud',
        subtitle: 'Nube cifrada gestionada',
        monthly: '€3.99',
        yearly: '€39.99',
        badge: '',
      },
      {
        name: 'NoteFlow Bundle',
        subtitle: 'NoteFlow AI + NoteFlow Cloud juntos',
        monthly: '€7.99',
        yearly: '€79.99',
        badge: 'Mejor precio',
      },
    ],
    note: 'Precios con IVA incluido. El precio final se muestra siempre en el checkout. El pago anual sale más barato que 12 meses al precio mensual.',
  },

  ai: {
    badge: 'Ya disponible',
    title: 'NoteFlow AI — el modelo gestionado',
    intro: [
      'El chat de IA necesita un modelo de lenguaje. Las vías gratuitas: ejecutar uno en local con Ollama, o pegar tu propia API key. <strong>NoteFlow AI</strong> es la tercera vía, para quien no quiere lidiar con ninguna de las dos: un modelo gestionado por NoteFlow que funciona en cuanto te suscribes.',
    ],
    bullets: [
      'Sin instalar Ollama, sin cuentas de terceros, sin comprar, guardar ni rotar API keys.',
      'Incluye una cuota mensual de tokens — <strong>3M de tokens al mes</strong> por defecto.',
      'Suscripción mensual o anual — <strong>€5.99/mes o €49.99/año</strong>, IVA incluido. Se contrata desde la propia app: <strong>Settings → Account → Subscribe</strong> — el checkout se abre en tu navegador, a cargo de Lemon Squeezy, nuestro merchant of record.',
      'En cuanto se completa el pago, NoteFlow AI se activa solo como tu proveedor — nada que configurar.',
    ],
    modelsTitle: 'Modelos estándar — cuota base',
    models: [
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'xiaomi/mimo-v2.5-pro',
      'openai/gpt-5.6-luna',
      'anthropic/claude-haiku-4.5',
    ],
    modelsMidTitle: 'Modelos intermedios — 2× de cuota',
    modelsMid: [
      'x-ai/grok-4.5',
    ],
    modelsAdvancedTitle: 'Modelos avanzados — 6× de cuota',
    modelsAdvanced: [
      'moonshotai/kimi-k3',
    ],
    modelsNote:
      'Todos los modelos curados soportan tool-calling (el agente), y todos soportan visión (adjuntar imágenes) excepto los dos modelos DeepSeek y Xiaomi MiMo, que son solo texto. La cuota mensual se pondera por modelo: los estándar la consumen a razón base, los intermedios a <strong>razón de 2×</strong> y los avanzados a <strong>6×</strong> — es decir, en un modelo avanzado cada token cuenta como seis.',
    alt: {
      title: 'La vía gratuita a la misma capacidad',
      html: 'Ejecuta un modelo local con <strong>Ollama</strong> — nada sale nunca de tu máquina — o trae tu propia API key de cualquier proveedor soportado. Mismo chat, mismo agente, mismas funciones; solo que el modelo lo gestionas tú.',
    },
  },

  cloud: {
    badge: 'Ya disponible',
    title: 'NoteFlow Cloud — nube de notas cifrada',
    intro: [
      '<strong>NoteFlow Cloud</strong> es la sincronización gestionada: sync automática y sin manos entre dispositivos, sin la fricción de push/pull de un flujo basado en git.',
      'Tus notas van <strong>cifradas en tránsito y en reposo</strong>, y tú eliges el modelo de confianza: modo <strong>gestionado</strong> (el de por defecto — nada que recordar, inicias sesión y sincroniza solo) o <strong>cifrado de extremo a extremo privado</strong> (opt-in, se desbloquea con una passphrase más un código de recuperación, donde ni siquiera el operador puede leer tus notas).',
    ],
    bullets: [
      'Sync automática entre dispositivos — sin pushes manuales, sin esperar a un flujo de git.',
      'Dos modos de cifrado: gestionado por defecto (cero secretos que guardar) u opt-in a E2EE estricto donde las claves nunca salen de tus dispositivos.',
      'Suscripción mensual o anual — <strong>€3.99/mes o €39.99/año</strong>, IVA incluido, contratada desde la propia app (Settings → Account).',
      'Para quien no quiere crear y mantener un repo de GitHub solo para sincronizar notas.',
    ],
    alt: {
      title: 'GitHub Sync sigue siendo gratis',
      html: 'El <strong>GitHub Sync</strong> actual contra tu propio repo privado sigue funcionando y sigue siendo gratis — Cloud es una alternativa más cómoda por encima, no un sustituto.',
    },
  },

  compare: {
    title: 'Gestionado vs autogestionado',
    intro: [
      'Las mismas capacidades, dos formas de conseguirlas. Elige por capacidad — se mezclan libremente y cambiar nunca está bloqueado.',
    ],
    cols: {
      capability: 'Capacidad',
      managed: 'Gestionado (suscripción)',
      self: 'Autogestionado (gratis)',
    },
    rows: [
      {
        capability: 'Modelo de IA',
        managed: '<strong>NoteFlow AI</strong> — modelos curados, cero configuración, cuota de tokens incluida',
        self: '<strong>Ollama</strong> en local (sin key, offline) o tu propia API key de cualquiera de los 9 proveedores soportados',
      },
      {
        capability: 'Configuración y mantenimiento',
        managed: 'Ninguno — te suscribes desde la app y se activa solo',
        self: 'Instalar Ollama, o crear una cuenta en un proveedor y gestionar una key',
      },
      {
        capability: 'Sincronización de notas',
        managed: '<strong>NoteFlow Cloud</strong> — sync automática y cifrada (gestionada por defecto, o E2EE opt-in)',
        self: '<strong>GitHub Sync</strong> con tu propio repo privado',
      },
      {
        capability: 'Todo lo demás',
        managed: 'Gratis para todos — editor, el Cerebro, cifrado, stickies, CLI',
        self: 'Igual — sin plan de por medio',
      },
    ],
  },

  privacy: {
    title: 'Privacidad con la IA gestionada',
    intro: [
      'Suscribirse a NoteFlow AI no cambia la arquitectura local-first: los límites documentados en <a href="%AI_PRIVACY_URL%">Cómo funciona la IA → privacidad</a> se mantienen exactamente igual.',
    ],
    items: [
      {
        title: 'El índice nunca sale',
        html: 'El índice semántico — embeddings, grafo, búsqueda — se construye y se guarda <strong>100% en tu máquina</strong>. Suscribirse no cambia nada de eso.',
      },
      {
        title: 'Los mismos datos que con tu propia key',
        html: 'Lo que viaja al proxy de NoteFlow es exactamente lo que viajaría a cualquier proveedor que uses con tu propia key: tu pregunta más los fragmentos de notas recuperados.',
      },
      {
        title: 'Lo oculto sigue oculto',
        html: 'Las secciones marcadas con <em>Hide from AI</em> y las notas cifradas quedan fuera del índice, así que nunca se envían — ni a NoteFlow AI ni a ningún otro proveedor.',
      },
      {
        title: 'Subsistemas independientes',
        html: 'NoteFlow AI no pasa por la nube de notas: la IA gestionada y NoteFlow Cloud son subsistemas separados. Usar uno nunca implica el otro.',
      },
    ],
  },
};
