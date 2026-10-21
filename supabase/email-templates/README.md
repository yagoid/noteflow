# Plantillas de email (Supabase Auth)

Emails transaccionales de NoteFlow con la estética de la marca ("The Brain"): fondo tinta, tarjeta con
tira de sinapsis (teal → cian → púrpura → rosa → ámbar), wordmark con el punto ámbar y el **código de
acceso** como protagonista.

## Dónde se pegan

Dashboard de Supabase → **Authentication → Emails → Templates**. Pegar el HTML completo del fichero en
el cuerpo de la plantilla que toca:

| Plantilla en Supabase | Fichero | Cuándo se dispara | Asunto sugerido |
|---|---|---|---|
| **Magic Link** | `magic-link.html` | `requestOtp()` de un usuario **existente** | `Your NoteFlow sign-in code` |
| **Confirm signup** | `confirm-signup.html` | `requestOtp()` de un email **nuevo** (`create_user: true`) | `Confirm your NoteFlow account` |
| **Change Email Address** | `email-change.html` | Cambio de email de la cuenta | `Confirm your new NoteFlow email` |
| **Reauthentication** | `reauthentication.html` | Operaciones sensibles (p. ej. borrado de cuenta) | `Confirm it's you` |

"Reset Password" e "Invite user" no se usan: NoteFlow no tiene contraseñas (solo OTP por email).

## Regla crítica: nada de `{{ .ConfirmationURL }}`

El login del cliente es **OTP** (`electron/account.ts` → `requestOtp` / `verifyOtp`): el usuario teclea el
código en la app. Si el email incluye `{{ .ConfirmationURL }}` y el usuario pulsa el enlace, **se consume el
token** y el código que teclee después falla. Por eso estas plantillas muestran **solo `{{ .Token }}`**.

Variables usadas: `{{ .Token }}`, `{{ .Email }}` y, en el cambio de email, `{{ .NewEmail }}`.

## Caducidad

Los textos dicen "expires in 1 hour", que es el default de Supabase (`MAILER_OTP_EXP` = 3600 s). Si se
cambia en **Authentication → Settings**, actualizar la frase en los cuatro ficheros.

## Compatibilidad

Layout de tablas, estilos inline, sin imágenes ni fuentes externas (el wordmark es una celda con
`border-radius` + texto, así que no hay imágenes que bloquear). Probado a ojo contra Gmail, Outlook
(bloque `<!--[if mso]>` para la fuente), Apple Mail y clientes móviles; el `<style>` del `<head>` solo
aporta el responsive y el hover, nada estructural.

## Bilingüe (opcional, no implementado)

Las plantillas están en inglés. Para mandarlas en el idioma del usuario, `requestOtp` puede pasar el
locale como metadata:

```ts
body: { email: trimmed, create_user: true, data: { lang: 'es' } },
```

y la plantilla ramifica con Go templates:

```html
{{ if eq .Data.lang "es" }}Tu código de acceso{{ else }}Your sign-in code{{ end }}
```
