export const encryption = {
  encryptNote: 'Cifrar nota',
  unlockNote: 'Desbloquear nota',
  removeEncryption: 'Quitar cifrado',

  encryptWarning:
    'Si pierdes la contraseña, el contenido de la nota se perderá de forma permanente. No hay opción de recuperación.',
  agentTasksWarning:
    'Esta nota tiene tareas encargadas a agentes de IA. Al cifrarla se borran sus informes para siempre, en todos los dispositivos sincronizados. Las tareas se quedan en la nota.',
  agentTasksConfirm: 'Borrar los informes de los agentes',
  removeWarning:
    'Esto descifrará la nota de forma permanente. El contenido se guardará sin cifrar en el disco.',

  password: 'Contraseña',
  enterPassword: 'Introduce la contraseña',
  confirmPassword: 'Confirma la contraseña',
  passwordsDoNotMatch: 'Las contraseñas no coinciden',

  advancedOptions: 'Opciones avanzadas',
  iterations: 'Iteraciones',
  iterationsInfo:
    'Número de rondas de derivación de clave PBKDF2. Cuanto mayor, más difícil de forzar por fuerza bruta pero más lento al cifrar/descifrar. OWASP recomienda ≥ 210.000.',
  saltLength: 'Longitud del salt',
  saltLengthInfo:
    'Tamaño en bytes del salt aleatorio usado para derivar la clave. 16 bytes (128 bits) es el mínimo estándar.',
  bytesRange: 'bytes ({min}–{max})',
  hashAlgorithm: 'Algoritmo de hash',
  hashAlgorithmInfo:
    'Función de hash para PBKDF2. SHA-512 es más lento en GPU, lo que ofrece mejor resistencia a los ataques de fuerza bruta en paralelo.',

  encryptError: 'Se produjo un error al cifrar. Inténtalo de nuevo.',
  wrongPassword: 'Contraseña incorrecta. Inténtalo de nuevo.',

  noteEncrypted: 'Esta nota está cifrada',
  unlock: 'Desbloquear',
}
