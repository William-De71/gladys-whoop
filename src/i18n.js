// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, the recovery zones, sport names, widget
// contents, scene summaries, messages of the Configuration screen.
// Vocabulary of the Gladys interface (appareil / Gerät / dispositivo, scène /
// Szene / escena). WHOOP's own words (Recovery, Strain, HRV) are translated
// the way the WHOOP app does in each language where it does, kept otherwise.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

// WHOOP's recovery zones.
const ZONES = {
  green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
};

// The most common WHOOP sport names (v2 `sport_name`). Any other name is
// shown as WHOOP writes it, capitalized.
const SPORTS = {
  activity: { en: 'Activity', fr: 'Activité', de: 'Aktivität', es: 'Actividad' },
  running: { en: 'Running', fr: 'Course à pied', de: 'Laufen', es: 'Carrera' },
  cycling: { en: 'Cycling', fr: 'Vélo', de: 'Radfahren', es: 'Ciclismo' },
  'mountain-biking': {
    en: 'Mountain biking',
    fr: 'VTT',
    de: 'Mountainbiken',
    es: 'Bicicleta de montaña',
  },
  spin: { en: 'Spin', fr: 'Vélo en salle', de: 'Indoor-Cycling', es: 'Spinning' },
  walking: { en: 'Walking', fr: 'Marche', de: 'Gehen', es: 'Caminar' },
  hiking: { en: 'Hiking', fr: 'Randonnée', de: 'Wandern', es: 'Senderismo' },
  swimming: { en: 'Swimming', fr: 'Natation', de: 'Schwimmen', es: 'Natación' },
  weightlifting: { en: 'Weightlifting', fr: 'Musculation', de: 'Krafttraining', es: 'Pesas' },
  powerlifting: {
    en: 'Powerlifting',
    fr: 'Force athlétique',
    de: 'Kraftdreikampf',
    es: 'Powerlifting',
  },
  'functional-fitness': {
    en: 'Functional fitness',
    fr: 'Entraînement fonctionnel',
    de: 'Funktionelles Training',
    es: 'Entrenamiento funcional',
  },
  hiit: { en: 'HIIT', fr: 'HIIT', de: 'HIIT', es: 'HIIT' },
  yoga: { en: 'Yoga', fr: 'Yoga', de: 'Yoga', es: 'Yoga' },
  pilates: { en: 'Pilates', fr: 'Pilates', de: 'Pilates', es: 'Pilates' },
  stretching: { en: 'Stretching', fr: 'Étirements', de: 'Dehnen', es: 'Estiramientos' },
  rowing: { en: 'Rowing', fr: 'Aviron', de: 'Rudern', es: 'Remo' },
  elliptical: { en: 'Elliptical', fr: 'Vélo elliptique', de: 'Crosstrainer', es: 'Elíptica' },
  stairmaster: { en: 'Stairmaster', fr: 'Stepper', de: 'Stepper', es: 'Escaladora' },
  boxing: { en: 'Boxing', fr: 'Boxe', de: 'Boxen', es: 'Boxeo' },
  tennis: { en: 'Tennis', fr: 'Tennis', de: 'Tennis', es: 'Tenis' },
  padel: { en: 'Padel', fr: 'Padel', de: 'Padel', es: 'Pádel' },
  soccer: { en: 'Soccer', fr: 'Football', de: 'Fußball', es: 'Fútbol' },
  basketball: { en: 'Basketball', fr: 'Basket-ball', de: 'Basketball', es: 'Baloncesto' },
  golf: { en: 'Golf', fr: 'Golf', de: 'Golf', es: 'Golf' },
  skiing: { en: 'Skiing', fr: 'Ski', de: 'Skifahren', es: 'Esquí' },
  snowboarding: { en: 'Snowboarding', fr: 'Snowboard', de: 'Snowboarden', es: 'Snowboard' },
  climber: { en: 'Climbing', fr: 'Escalade', de: 'Klettern', es: 'Escalada' },
  'rock-climbing': { en: 'Climbing', fr: 'Escalade', de: 'Klettern', es: 'Escalada' },
  dance: { en: 'Dance', fr: 'Danse', de: 'Tanzen', es: 'Baile' },
  meditation: { en: 'Meditation', fr: 'Méditation', de: 'Meditation', es: 'Meditación' },
};

const TEXTS = {
  unknown: { en: 'unknown', fr: 'inconnu', de: 'unbekannt', es: 'desconocido' },

  deviceName: { en: 'WHOOP {name}', fr: 'WHOOP {name}', de: 'WHOOP {name}', es: 'WHOOP {name}' },
  deviceNameDefault: { en: 'WHOOP', fr: 'WHOOP', de: 'WHOOP', es: 'WHOOP' },
  feature_recovery: { en: 'Recovery', fr: 'Récupération', de: 'Erholung', es: 'Recuperación' },
  feature_recovery_zone: {
    en: 'Recovery zone',
    fr: 'Zone de récupération',
    de: 'Erholungszone',
    es: 'Zona de recuperación',
  },
  feature_resting_heart_rate: {
    en: 'Resting heart rate (bpm)',
    fr: 'Fréquence cardiaque au repos (bpm)',
    de: 'Ruhepuls (S/min)',
    es: 'Frecuencia cardíaca en reposo (ppm)',
  },
  feature_hrv: {
    en: 'Heart rate variability (HRV)',
    fr: 'Variabilité cardiaque (VFC)',
    de: 'Herzfrequenzvariabilität (HRV)',
    es: 'Variabilidad cardíaca (VFC)',
  },
  feature_spo2: {
    en: 'Blood oxygen (SpO2)',
    fr: 'Oxygène sanguin (SpO2)',
    de: 'Blutsauerstoff (SpO2)',
    es: 'Oxígeno en sangre (SpO2)',
  },
  feature_skin_temperature: {
    en: 'Skin temperature',
    fr: 'Température cutanée',
    de: 'Hauttemperatur',
    es: 'Temperatura de la piel',
  },
  feature_day_strain: {
    en: 'Day strain (0-21)',
    fr: 'Effort du jour (0-21)',
    de: 'Tagesbelastung (0-21)',
    es: 'Esfuerzo del día (0-21)',
  },
  feature_calories: {
    en: 'Calories today (kcal)',
    fr: 'Calories du jour (kcal)',
    de: 'Kalorien heute (kcal)',
    es: 'Calorías de hoy (kcal)',
  },
  feature_sleep_performance: {
    en: 'Sleep performance',
    fr: 'Performance du sommeil',
    de: 'Schlafleistung',
    es: 'Rendimiento del sueño',
  },
  feature_sleep_time: {
    en: 'Time asleep',
    fr: 'Temps de sommeil',
    de: 'Schlafdauer',
    es: 'Tiempo dormido',
  },
  feature_sleep_efficiency: {
    en: 'Sleep efficiency',
    fr: 'Efficacité du sommeil',
    de: 'Schlafeffizienz',
    es: 'Eficiencia del sueño',
  },
  feature_respiratory_rate: {
    en: 'Breathing rate (/min)',
    fr: 'Fréquence respiratoire (/min)',
    de: 'Atemfrequenz (/min)',
    es: 'Frecuencia respiratoria (/min)',
  },
  feature_last_workout_strain: {
    en: 'Last workout strain (0-21)',
    fr: 'Effort du dernier entraînement (0-21)',
    de: 'Belastung des letzten Trainings (0-21)',
    es: 'Esfuerzo del último entrenamiento (0-21)',
  },

  bpm: { en: 'bpm', fr: 'bpm', de: 'S/min', es: 'ppm' },
  minutes: { en: '{m} min', fr: '{m} min', de: '{m} Min.', es: '{m} min' },
  hoursMinutes: { en: '{h} h {m}', fr: '{h} h {m}', de: '{h} Std. {m}', es: '{h} h {m}' },
  heartRateAvgText: {
    en: 'average heart rate {value}',
    fr: 'fréquence cardiaque moyenne {value}',
    de: 'Durchschnittspuls {value}',
    es: 'frecuencia cardíaca media {value}',
  },
  strainText: {
    en: 'strain {value}',
    fr: 'effort {value}',
    de: 'Belastung {value}',
    es: 'esfuerzo {value}',
  },
  summaryRecovery: {
    en: 'Recovery {score} % ({zone}), HRV {hrv} ms, resting heart rate {rhr} bpm',
    fr: 'Récupération {score} % ({zone}), VFC {hrv} ms, fréquence au repos {rhr} bpm',
    de: 'Erholung {score} % ({zone}), HRV {hrv} ms, Ruhepuls {rhr} S/min',
    es: 'Recuperación {score} % ({zone}), VFC {hrv} ms, frecuencia en reposo {rhr} ppm',
  },
  summarySleep: {
    en: 'Slept {duration}, sleep performance {performance} %',
    fr: 'Dormi {duration}, performance du sommeil {performance} %',
    de: '{duration} geschlafen, Schlafleistung {performance} %',
    es: 'Dormido {duration}, rendimiento del sueño {performance} %',
  },
  summaryNap: {
    en: 'Nap of {duration}',
    fr: 'Sieste de {duration}',
    de: 'Nickerchen von {duration}',
    es: 'Siesta de {duration}',
  },
  summaryStrain: {
    en: 'Day strain {value}',
    fr: 'Effort du jour {value}',
    de: 'Tagesbelastung {value}',
    es: 'Esfuerzo del día {value}',
  },
  summaryNothing: {
    en: 'No WHOOP data yet.',
    fr: 'Pas encore de données WHOOP.',
    de: 'Noch keine WHOOP-Daten.',
    es: 'Todavía no hay datos de WHOOP.',
  },

  widgetUpdated: { en: 'Updated', fr: 'Mis à jour', de: 'Aktualisiert', es: 'Actualizado' },
  widgetNotConnected: {
    en: 'Connect your WHOOP account in the configuration of the integration.',
    fr: 'Connectez votre compte WHOOP dans la configuration de l’intégration.',
    de: 'Verbinde dein WHOOP-Konto in der Konfiguration der Integration.',
    es: 'Conecte su cuenta WHOOP en la configuración de la integración.',
  },
  widgetNotRead: {
    en: 'WHOOP has not been read yet: wait a moment.',
    fr: 'WHOOP n’a pas encore été lu : patientez un instant.',
    de: 'WHOOP wurde noch nicht gelesen: Warte einen Moment.',
    es: 'WHOOP todavía no se ha leído: espere un momento.',
  },
  tileRecovery: { en: 'Recovery', fr: 'Récupération', de: 'Erholung', es: 'Recuperación' },
  widgetZone: { en: 'Zone', fr: 'Zone', de: 'Zone', es: 'Zona' },
  widgetCalibrating: { en: 'calibrating', fr: 'calibrage', de: 'Kalibrierung', es: 'calibrando' },
  widgetNoRecovery: {
    en: 'No recovery scored yet today.',
    fr: 'Pas encore de récupération calculée aujourd’hui.',
    de: 'Heute noch keine Erholung berechnet.',
    es: 'Todavía no hay recuperación calculada hoy.',
  },
  tileStrain: { en: 'Strain', fr: 'Effort', de: 'Belastung', es: 'Esfuerzo' },
  tileHrv: { en: 'HRV', fr: 'VFC', de: 'HRV', es: 'VFC' },
  tileRestingHr: { en: 'Resting HR', fr: 'FC repos', de: 'Ruhepuls', es: 'FC reposo' },
  tileCalories: { en: 'Calories', fr: 'Calories', de: 'Kalorien', es: 'Calorías' },
  buttonSync: { en: 'Sync now', fr: 'Synchroniser', de: 'Jetzt abrufen', es: 'Sincronizar' },
  widgetNoSleep: {
    en: 'No scored sleep yet.',
    fr: 'Pas encore de sommeil calculé.',
    de: 'Noch kein berechneter Schlaf.',
    es: 'Todavía no hay sueño calculado.',
  },
  widgetNightOf: {
    en: 'Night to {date}',
    fr: 'Nuit au {date}',
    de: 'Nacht zum {date}',
    es: 'Noche al {date}',
  },
  tilePerformance: { en: 'Performance', fr: 'Performance', de: 'Leistung', es: 'Rendimiento' },
  tileAsleep: { en: 'Asleep', fr: 'Sommeil', de: 'Geschlafen', es: 'Dormido' },
  tileDeep: { en: 'Deep sleep', fr: 'Profond', de: 'Tiefschlaf', es: 'Profundo' },
  tileRem: { en: 'REM sleep', fr: 'Paradoxal', de: 'REM-Schlaf', es: 'REM' },
  widgetEfficiency: { en: 'Efficiency', fr: 'Efficacité', de: 'Effizienz', es: 'Eficiencia' },
  widgetBreathing: {
    en: 'Breathing rate',
    fr: 'Respiration',
    de: 'Atemfrequenz',
    es: 'Respiración',
  },
  widgetSleepNeed: {
    en: 'Sleep need',
    fr: 'Besoin de sommeil',
    de: 'Schlafbedarf',
    es: 'Sueño necesario',
  },
  widgetSleepWindow: { en: 'In bed', fr: 'Au lit', de: 'Im Bett', es: 'En la cama' },
  widgetDisturbances: {
    en: 'Disturbances',
    fr: 'Perturbations',
    de: 'Störungen',
    es: 'Interrupciones',
  },
  widgetNoWorkout: {
    en: 'No workout yet.',
    fr: 'Pas encore d’entraînement.',
    de: 'Noch kein Training.',
    es: 'Todavía no hay entrenamientos.',
  },
  badgeStrain: {
    en: 'Strain {value}',
    fr: 'Effort {value}',
    de: 'Last {value}',
    es: 'Esf. {value}',
  },
  widgetDayStrain: {
    en: 'Day strain',
    fr: 'Effort du jour',
    de: 'Tagesbelastung',
    es: 'Esfuerzo del día',
  },
  chart_recovery: {
    en: 'Recovery, last 7 days',
    fr: 'Récupération, 7 derniers jours',
    de: 'Erholung, letzte 7 Tage',
    es: 'Recuperación, últimos 7 días',
  },
  chart_strain: {
    en: 'Day strain, last 7 days',
    fr: 'Effort du jour, 7 derniers jours',
    de: 'Tagesbelastung, letzte 7 Tage',
    es: 'Esfuerzo del día, últimos 7 días',
  },
  chart_sleep_performance: {
    en: 'Sleep performance, 7 days',
    fr: 'Performance du sommeil, 7 jours',
    de: 'Schlafleistung, 7 Tage',
    es: 'Rendimiento del sueño, 7 días',
  },
  chart_hrv: {
    en: 'HRV, last 7 days',
    fr: 'VFC, 7 derniers jours',
    de: 'HRV, letzte 7 Tage',
    es: 'VFC, últimos 7 días',
  },
  series_recovery: { en: 'Recovery', fr: 'Récupération', de: 'Erholung', es: 'Recuperación' },
  series_strain: { en: 'Strain', fr: 'Effort', de: 'Belastung', es: 'Esfuerzo' },
  series_sleep_performance: {
    en: 'Performance',
    fr: 'Performance',
    de: 'Leistung',
    es: 'Rendimiento',
  },
  series_hrv: { en: 'HRV', fr: 'VFC', de: 'HRV', es: 'VFC' },
  widgetNoWeek: {
    en: 'No scored day in the last seven days.',
    fr: 'Aucun jour calculé ces sept derniers jours.',
    de: 'Kein berechneter Tag in den letzten sieben Tagen.',
    es: 'Ningún día calculado en los últimos siete días.',
  },
  widgetAverage: { en: 'Average', fr: 'Moyenne', de: 'Durchschnitt', es: 'Media' },
  widgetBestDay: { en: 'Best day', fr: 'Meilleur jour', de: 'Bester Tag', es: 'Mejor día' },
  widgetHardestDay: {
    en: 'Hardest day',
    fr: 'Jour le plus dur',
    de: 'Härtester Tag',
    es: 'Día más duro',
  },

  statusNoClient: {
    en: 'Enter the Client ID and Client Secret of your WHOOP app, save, then connect your account.',
    fr: 'Saisissez le Client ID et le Client Secret de votre application WHOOP, enregistrez, puis connectez votre compte.',
    de: 'Gib Client ID und Client Secret deiner WHOOP-App ein, speichere und verbinde dann dein Konto.',
    es: 'Introduzca el Client ID y el Client Secret de su aplicación WHOOP, guarde y luego conecte su cuenta.',
  },
  statusNotConnected: {
    en: 'Not connected: press "Connect" to link your WHOOP account.',
    fr: 'Non connecté : appuyez sur « Connecter » pour lier votre compte WHOOP.',
    de: 'Nicht verbunden: Drücke „Verbinden“, um dein WHOOP-Konto zu verknüpfen.',
    es: 'No conectado: pulse «Conectar» para vincular su cuenta WHOOP.',
  },
  statusReauth: {
    en: 'WHOOP refused the connection (revoked or expired): press "Connect" again.',
    fr: 'WHOOP a refusé la connexion (révoquée ou expirée) : appuyez de nouveau sur « Connecter ».',
    de: 'WHOOP hat die Verbindung abgelehnt (widerrufen oder abgelaufen): Drücke erneut „Verbinden“.',
    es: 'WHOOP ha rechazado la conexión (revocada o caducada): pulse de nuevo «Conectar».',
  },
  statusForbidden: {
    en: 'WHOOP refused a permission: connect again and accept every requested permission.',
    fr: 'WHOOP a refusé une autorisation : reconnectez-vous et acceptez toutes les autorisations demandées.',
    de: 'WHOOP hat eine Berechtigung verweigert: Verbinde dich erneut und akzeptiere alle Berechtigungen.',
    es: 'WHOOP ha rechazado un permiso: vuelva a conectarse y acepte todos los permisos solicitados.',
  },
  statusConnected: {
    en: 'Connected to WHOOP ({name}). Read at {time}, next reading at {next}.',
    fr: 'Connecté à WHOOP ({name}). Lu à {time}, prochaine lecture à {next}.',
    de: 'Mit WHOOP verbunden ({name}). Gelesen um {time}, nächste Abfrage um {next}.',
    es: 'Conectado a WHOOP ({name}). Leído a las {time}, próxima lectura a las {next}.',
  },
  statusRateLimited: {
    en: 'WHOOP asks to slow down (too many requests): new try in {minutes} min.',
    fr: 'WHOOP demande de ralentir (trop de requêtes) : nouvel essai dans {minutes} min.',
    de: 'WHOOP bittet um Pause (zu viele Anfragen): neuer Versuch in {minutes} Min.',
    es: 'WHOOP pide ir más despacio (demasiadas solicitudes): nuevo intento en {minutes} min.',
  },
  statusServer: {
    en: 'WHOOP is unavailable (HTTP {status}): new try in {minutes} min.',
    fr: 'WHOOP est indisponible (HTTP {status}) : nouvel essai dans {minutes} min.',
    de: 'WHOOP ist nicht verfügbar (HTTP {status}): neuer Versuch in {minutes} Min.',
    es: 'WHOOP no está disponible (HTTP {status}): nuevo intento en {minutes} min.',
  },
  statusUnreachable: {
    en: 'WHOOP unreachable ({detail}): new try in {minutes} min.',
    fr: 'WHOOP injoignable ({detail}) : nouvel essai dans {minutes} min.',
    de: 'WHOOP nicht erreichbar ({detail}): neuer Versuch in {minutes} Min.',
    es: 'WHOOP inaccesible ({detail}): nuevo intento en {minutes} min.',
  },
  statusRefused: {
    en: 'WHOOP refused a request ({detail}): new try in {minutes} min.',
    fr: 'WHOOP a refusé une requête ({detail}) : nouvel essai dans {minutes} min.',
    de: 'WHOOP hat eine Anfrage abgelehnt ({detail}): neuer Versuch in {minutes} Min.',
    es: 'WHOOP ha rechazado una solicitud ({detail}): nuevo intento en {minutes} min.',
  },
  connectState: {
    en: 'The answer of WHOOP does not match the connection started here: press "Connect" again.',
    fr: 'La réponse de WHOOP ne correspond pas à la connexion lancée ici : appuyez de nouveau sur « Connecter ».',
    de: 'Die Antwort von WHOOP passt nicht zur hier gestarteten Verbindung: Drücke erneut „Verbinden“.',
    es: 'La respuesta de WHOOP no corresponde a la conexión iniciada aquí: pulse de nuevo «Conectar».',
  },
  connectFailed: {
    en: 'The connection to WHOOP failed ({reason}): check the Client ID, the secret and the redirect URL of the app, then connect again.',
    fr: 'La connexion à WHOOP a échoué ({reason}) : vérifiez le Client ID, le secret et l’URL de redirection de l’application, puis reconnectez-vous.',
    de: 'Die Verbindung zu WHOOP ist fehlgeschlagen ({reason}): Prüfe Client ID, Secret und Redirect-URL der App und verbinde dich erneut.',
    es: 'La conexión con WHOOP ha fallado ({reason}): compruebe el Client ID, el secreto y la URL de redirección de la aplicación y vuelva a conectarse.',
  },
  connectCodeUsed: {
    en: 'This WHOOP answer was already used: press "Connect" again.',
    fr: 'Cette réponse de WHOOP a déjà servi : appuyez de nouveau sur « Connecter ».',
    de: 'Diese Antwort von WHOOP wurde bereits verwendet: Drücke erneut „Verbinden“.',
    es: 'Esta respuesta de WHOOP ya se utilizó: pulse de nuevo «Conectar».',
  },
  connectNoRefresh: {
    en: 'WHOOP gave no refresh token (the "offline" permission is missing): connect again and accept every permission.',
    fr: 'WHOOP n’a pas donné de jeton de renouvellement (autorisation « offline » absente) : reconnectez-vous et acceptez toutes les autorisations.',
    de: 'WHOOP hat kein Refresh-Token geliefert (Berechtigung „offline“ fehlt): Verbinde dich erneut und akzeptiere alle Berechtigungen.',
    es: 'WHOOP no ha dado token de renovación (falta el permiso «offline»): vuelva a conectarse y acepte todos los permisos.',
  },
  refreshDone: {
    en: 'WHOOP read: {summary}',
    fr: 'WHOOP lu : {summary}',
    de: 'WHOOP gelesen: {summary}',
    es: 'WHOOP leído: {summary}',
  },
  refreshTooSoon: {
    en: 'WHOOP was read {minutes} min ago: try again in a moment.',
    fr: 'WHOOP a été lu il y a {minutes} min : réessayez dans un instant.',
    de: 'WHOOP wurde vor {minutes} Min. gelesen: Versuche es gleich noch einmal.',
    es: 'WHOOP se leyó hace {minutes} min: inténtelo de nuevo en un momento.',
  },
  diagnosticDone: {
    en: 'Diagnostic written in the logs of the integration ({count} line(s)).',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s)).',
    de: 'Diagnose in die Protokolle der Integration geschrieben ({count} Zeile(n)).',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s)).',
  },
  disconnected: {
    en: 'WHOOP account disconnected: its access was revoked.',
    fr: 'Compte WHOOP déconnecté : son accès a été révoqué.',
    de: 'WHOOP-Konto getrennt: Der Zugriff wurde widerrufen.',
    es: 'Cuenta WHOOP desconectada: su acceso se ha revocado.',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

const localeOf = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A text in a language (English fallback), with its substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('deviceName', 'fr', { name: 'Marie' }); // -> 'WHOOP Marie'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object|Function} [values] - The substitutions, or `(language) => values`.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The name of a recovery zone.
 * @param {string|null} zone - red, yellow or green.
 * @param {string} language - The language.
 * @returns {string} The name.
 */
function zoneLabel(zone, language) {
  const entry = ZONES[zone];
  return entry ? (entry[language] ?? entry.en) : t('unknown', language);
}

/**
 * @description The name of a sport.
 * @param {string|null} sport - The WHOOP sport name ("functional-fitness").
 * @param {string} language - The language.
 * @returns {string} "Entraînement fonctionnel", or WHOOP's name capitalized.
 */
function sportLabel(sport, language) {
  const code = String(sport ?? 'activity')
    .trim()
    .toLowerCase();
  const entry = SPORTS[code] ?? SPORTS[code.replace(/\s+/g, '-')];
  if (entry) {
    return entry[language] ?? entry.en;
  }
  const words = code.replace(/[_-]+/g, ' ').trim();
  return words
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : SPORTS.activity[localeOf(language)];
}

/**
 * @description A number written the way of a language ("1,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} [digits] - Decimals at most.
 * @returns {string} The text, '?' without a value.
 */
function formatNumber(value, language, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: digits }).format(value);
}

/**
 * @description A duration in minutes, the short way ("45 min", "7 h 32").
 * @param {number|null} minutes - The minutes.
 * @param {string} language - The language.
 * @returns {string} The text, '?' without a value.
 */
function formatMinutes(minutes, language) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return '?';
  }
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) {
    return t('minutes', language, { m: total });
  }
  return t('hoursMinutes', language, {
    h: Math.floor(total / 60),
    m: String(total % 60).padStart(2, '0'),
  });
}

/**
 * @description A time of day in the timezone of Gladys ("15:42").
 * @param {number} instant - The instant, in ms.
 * @param {string} language - The language.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The text.
 */
function shortTime(instant, language, timeZone) {
  return new Intl.DateTimeFormat(localeOf(language), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

/**
 * @description A calendar day, the short way ("Thu 29 Oct").
 * @param {string} date - 'YYYY-MM-DD'.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function shortDate(date, language) {
  return new Intl.DateTimeFormat(localeOf(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * @description The clock time of an instant as the member lived it (the
 * `timezone_offset` WHOOP gives with the record): '23:41'.
 * @param {number|null} instant - The instant, in ms.
 * @param {number|null} offset - Minutes east of UTC.
 * @returns {string|null} 'HH:MM'.
 */
function clockAt(instant, offset) {
  if (typeof instant !== 'number' || !Number.isFinite(instant)) {
    return null;
  }
  return new Date(instant + (offset ?? 0) * 60000).toISOString().slice(11, 16);
}

/**
 * @description A day and time as the member lived it ("Thu 29 Oct, 18:05").
 * @param {number} instant - The instant, in ms.
 * @param {number|null} offset - Minutes east of UTC.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function dayTimeAt(instant, offset, language) {
  return new Intl.DateTimeFormat(localeOf(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(instant + (offset ?? 0) * 60000));
}

export {
  LANGUAGES,
  TEXTS,
  ZONES,
  SPORTS,
  isLanguage,
  t,
  all,
  zoneLabel,
  sportLabel,
  formatNumber,
  formatMinutes,
  shortTime,
  shortDate,
  clockAt,
  dayTimeAt,
};
