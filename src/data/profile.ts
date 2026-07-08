/**
 * ─────────────────────────────────────────────────────────────
 *  FUENTE ÚNICA DE DATOS DEL PORTFOLIO
 *  Sincronizado con LinkedIn (linkedin.com/in/fercarballo).
 *  Editá este archivo para actualizar todo el sitio.
 * ─────────────────────────────────────────────────────────────
 */

export const profile = {
  name: 'Fernando Carballo',
  headline: 'QA Engineer · QA Manual & Automation · SDET',
  // Roles que rotan en el hero
  roles: ['QA Manual', 'QA Automation', 'SDET', 'API Testing'],
  location: 'Buenos Aires, Argentina',
  email: 'fercarballodev@gmail.com',
  cvUrl: '/cv/Fernando-Carballo-CV.pdf',
  links: {
    linkedin: 'https://linkedin.com/in/fercarballo',
    github: 'https://github.com/fercarballo',
  },
  about: [
    'Un bug encontrado en producción cuesta hasta 10 veces más que uno detectado a tiempo. Mi trabajo es que nunca llegue tan lejos.',
    'QA Engineer con más de 4 años en tecnología y telecomunicaciones. Aseguro la calidad de las plataformas digitales de Personal (Telecom Argentina): diseño y ejecuto pruebas funcionales, de regresión, integración, smoke y UAT, y automatizo flujos críticos y APIs con Cypress, Playwright y Postman.',
    'Mi diferencial: vengo del desarrollo (JavaScript, React, Vue) y operé plataformas OpenShift/Kubernetes con CI/CD, así que pruebo entendiendo cómo se construye y despliega el producto — no solo la interfaz.',
  ],
  highlights: [
    { value: '−30%', label: 'tiempos de gestión y resolución de defectos (Jira + Xray)' },
    { value: '🏆 2025', label: 'Reconocimiento a la Práctica de Calidad · Telecom' },
    { value: '4+', label: 'años en tecnología y telecomunicaciones' },
  ],
};

/**
 * Presencia profesional: tarjetas de GitHub y LinkedIn.
 * - GitHub: los stats se traen en tiempo de build desde la API pública
 *   (github.com/users/fercarballo). Estos valores son el fallback si la
 *   API no responde durante el build.
 * - LinkedIn: no tiene API pública, así que usamos datos reales conocidos
 *   del perfil (linkedin.com/in/fercarballo). Actualizá acá si cambian.
 */
export const presence = {
  github: {
    username: 'fercarballo',
    url: 'https://github.com/fercarballo',
    // Fallback (se sobreescribe con datos en vivo si el build alcanza la API)
    repos: 35,
    followers: 27,
    following: 38,
  },
  linkedin: {
    url: 'https://linkedin.com/in/fercarballo',
    handle: 'in/fercarballo',
    headline: 'QA Engineer | QA Manual & Automation | SDET',
    currentRole: 'QA Engineer',
    currentCompany: 'Personal (Telecom Argentina)',
    connections: '160+',
    followers: '340+',
  },
};

export type Experience = {
  role: string;
  company: string;
  badge: string; // iniciales para el logo
  badgeHue: number; // tono del badge (0-360)
  type: string;
  start: string;
  end: string;
  duration: string;
  bullets: string[];
  tools?: string[]; // stack usado en ese puesto (chips en la timeline)
};

export const experience: Experience[] = [
  {
    role: 'QA Engineer',
    company: 'Personal (Telecom Argentina)',
    badge: 'PE',
    badgeHue: 217,
    type: 'Full Time · Híbrido',
    start: 'Jul 2023',
    end: 'Actualidad',
    duration: '3 años',
    bullets: [
      'Tribu Canales Digitales y Contact Center: aseguramiento de calidad de extremo a extremo de las plataformas digitales y de contacto.',
      'Diseñé y ejecuté casos de prueba funcionales, de regresión, integración, smoke y UAT.',
      'Reduje un 30% los tiempos de gestión y resolución de defectos implementando mejoras en Jira y Xray, aumentando la transparencia del seguimiento de incidentes.',
      'Automaticé regresiones de flujos críticos y validación de APIs REST con Cypress, Playwright y Postman (JavaScript), liberando tiempo del equipo para pruebas exploratorias.',
      'Analicé especificaciones funcionales y técnicas asegurando cobertura completa de testing y reduciendo el riesgo de retrabajo.',
      'Colaboré en equipos Scrum con desarrolladores, analistas y product owners, alineando objetivos de calidad con el negocio.',
      'Reconocimiento interno a la Práctica de Calidad (Telecom, 2025). 🏆',
    ],
    tools: ['Cypress', 'Playwright', 'Postman', 'JavaScript', 'SQL', 'Jira', 'Xray', 'Confluence', 'GitLab CI/CD'],
  },
  {
    role: 'Software Developer',
    company: 'Corporación Cápsula',
    badge: 'CC',
    badgeHue: 265,
    type: 'Full Time · Híbrido',
    start: 'Sep 2022',
    end: 'Jul 2023',
    duration: '11 meses',
    bullets: [
      'Desarrollé interfaces frontend responsivas con JavaScript, React.js y Vue.js integradas a servicios backend mediante APIs REST.',
      'Modelé y consulté bases de datos MySQL para la persistencia de aplicaciones web.',
      'Trabajé con Git, CI/CD en Jenkins y contenedores Docker en entornos de desarrollo y pruebas.',
      'Esta experiencia como developer es la base de mi perfil SDET: escribo automatización como código mantenible.',
    ],
    tools: ['React.js', 'Vue.js', 'JavaScript', 'MySQL', 'Jenkins', 'Docker'],
  },
  {
    role: 'Asesor de Atención al Cliente',
    company: 'Telecentro',
    badge: 'T',
    badgeHue: 190,
    type: 'Full Time · Presencial',
    start: 'Sep 2021',
    end: 'Ago 2022',
    duration: '1 año',
    bullets: [
      'Resolución de consultas, reclamos y gestiones con alto volumen de llamadas y registro en sistemas de gestión.',
      'Base de mis habilidades actuales de QA: escucha activa, análisis del problema, documentación precisa y seguimiento hasta el cierre.',
    ],
  },
  {
    role: 'Asesor de Atención al Cliente',
    company: 'Konecta (ex Allus BPO) · Telefónica/Personal',
    badge: 'K',
    badgeHue: 330,
    type: 'Full Time · Presencial',
    start: 'Sep 2019',
    end: 'Ago 2021',
    duration: '2 años',
    bullets: [
      'Atención telefónica para la cuenta Telefónica/Personal cumpliendo objetivos de servicio (SLA), con registro de gestiones en sistema.',
      'Primer contacto con el mundo telco, donde desarrollé la orientación al usuario que hoy aplico como QA.',
    ],
  },
];

export type Project = {
  id: string;
  icon: string; // nombre del glifo en Icon.astro
  iconHue: number;
  title: string;
  org: string;
  category: 'qa' | 'devops' | 'dev';
  summary: string;
  tags: string[];
  level: string;
  repo: string; // repo público de GitHub — fuente de la verdad del proyecto
};

/**
 * Proyectos = últimos repos públicos reales de github.com/fercarballo.
 * Descripción breve tomada del repo; para más detalle, el botón lleva directo a GitHub.
 */
export const projects: Project[] = [
  {
    id: 'playwright-e2e-framework-saucedemo',
    icon: 'flask',
    iconHue: 210,
    title: 'Framework E2E de UI',
    org: 'Suite QA · Fundamentos',
    category: 'qa',
    summary:
      'Framework de automatización end-to-end sobre Playwright + TypeScript con arquitectura por capas: Page Object Model con componentes reutilizables, fixtures, datos desacoplados y ejecución cross-browser (Chromium, Firefox, WebKit).',
    tags: ['Playwright', 'TypeScript', 'POM'],
    level: 'E2E UI',
    repo: 'https://github.com/fercarballo/playwright-e2e-framework-saucedemo',
  },
  {
    id: 'api-testing-framework-restful-booker',
    icon: 'braces',
    iconHue: 28,
    title: 'Testing de API',
    org: 'Suite QA · Fundamentos',
    category: 'qa',
    summary:
      'Suite de testing de API con validación de contratos: API Clients como Page Objects, schemas Zod para contract testing y tipado, CRUD encadenado, casos negativos, autenticación y preparación de datos por API.',
    tags: ['Playwright', 'Zod', 'Contract testing'],
    level: 'API',
    repo: 'https://github.com/fercarballo/api-testing-framework-restful-booker',
  },
  {
    id: 'qa-automation-cicd-pipeline',
    icon: 'infinity',
    iconHue: 200,
    title: 'Pipeline CI/CD',
    org: 'Suite QA · Fundamentos',
    category: 'devops',
    summary:
      'Pipeline de Integración Continua sobre GitHub Actions con estrategia de dos velocidades: verificación rápida y bloqueante por pull request (quality gates + smoke) y regresión completa cross-browser nocturna con matriz, sharding y merge de reportes.',
    tags: ['GitHub Actions', 'Sharding', 'Quality gates'],
    level: 'CI/CD',
    repo: 'https://github.com/fercarballo/qa-automation-cicd-pipeline',
  },
  {
    id: 'flakiness-hunting-playwright',
    icon: 'refresh',
    iconHue: 45,
    title: 'Estabilidad y flakiness',
    org: 'Suite QA · Fundamentos',
    category: 'qa',
    summary:
      'Experimento controlado que demuestra, mide y elimina el flakiness de timing: una misma app con latencia variable, una suite frágil y una estable, y un medidor que reporta la tasa de fallo. Resultado medido: 85 % → 0 %.',
    tags: ['Playwright', 'Flakiness', 'Web-first'],
    level: 'Estabilidad',
    repo: 'https://github.com/fercarballo/flakiness-hunting-playwright',
  },
  {
    id: 'visual-and-contract-testing',
    icon: 'set',
    iconHue: 280,
    title: 'Regresión visual & contract testing',
    org: 'Suite QA · Fundamentos',
    category: 'qa',
    summary:
      'Dos técnicas avanzadas en un repositorio: regresión visual con comparación de screenshots (baselines versionados y tolerancia configurada) y contract testing consumer-driven con Pact, ambos integrados como gates en CI.',
    tags: ['Playwright', 'Pact', 'Visual regression'],
    level: 'Visual + Contract',
    repo: 'https://github.com/fercarballo/visual-and-contract-testing',
  },
  {
    id: 'performance-testing-k6',
    icon: 'chart',
    iconHue: 12,
    title: 'Performance & load testing',
    org: 'Suite QA · SDET',
    category: 'qa',
    summary:
      'Suite de performance con k6 (smoke, load, stress, spike, soak) contra un servicio propio, con think times realistas y SLOs expresados como thresholds que actúan de gate en el pipeline.',
    tags: ['k6', 'Load testing', 'SLO gates'],
    level: 'Performance',
    repo: 'https://github.com/fercarballo/performance-testing-k6',
  },
  {
    id: 'integration-testing-testcontainers',
    icon: 'container',
    iconHue: 190,
    title: 'Integración con dependencias reales',
    org: 'Suite QA · SDET',
    category: 'qa',
    summary:
      'Tests de integración contra dependencias reales y efímeras: Testcontainers levanta un PostgreSQL descartable por corrida, valida constraints (UNIQUE/CHECK), defaults y tipos reales, con aislamiento por test.',
    tags: ['Testcontainers', 'PostgreSQL', 'Integración'],
    level: 'Integración',
    repo: 'https://github.com/fercarballo/integration-testing-testcontainers',
  },
  {
    id: 'devsecops-pipeline',
    icon: 'shield',
    iconHue: 0,
    title: 'DevSecOps',
    org: 'Suite QA · SDET',
    category: 'devops',
    summary:
      'Pipeline de seguridad shift-left que integra tres capas como quality gates: SAST (Semgrep), SCA (npm audit) y DAST (pruebas dinámicas), bloqueando la integración ante vulnerabilidades graves.',
    tags: ['Semgrep', 'SAST/SCA/DAST', 'Shift-left'],
    level: 'DevSecOps',
    repo: 'https://github.com/fercarballo/devsecops-pipeline',
  },
  {
    id: 'qa-insights',
    icon: 'terminal',
    iconHue: 145,
    title: 'Tooling interno de QA',
    org: 'Suite QA · SDET',
    category: 'qa',
    summary:
      'Herramienta interna de QA (CLI TypeScript): análisis de impacto de tests (grafo de dependencias + cierre transitivo para correr solo lo afectado) y detección de flaky tests a partir del histórico de ejecuciones.',
    tags: ['TypeScript', 'Test impact', 'Flaky detection'],
    level: 'Tooling',
    repo: 'https://github.com/fercarballo/qa-insights',
  },
  {
    id: 'llm-evals-harness',
    icon: 'bot',
    iconHue: 265,
    title: 'Evals de aplicaciones con IA',
    org: 'Suite QA · SDET',
    category: 'qa',
    summary:
      'Harness de evaluación (evals) para testear una aplicación basada en un LLM: golden dataset, tres scorers (exact-match, similitud semántica y LLM-as-judge) y un umbral como gate para detectar regresiones de prompt.',
    tags: ['LLM testing', 'Evals', 'Golden dataset'],
    level: 'IA / LLM',
    repo: 'https://github.com/fercarballo/llm-evals-harness',
  },
  {
    id: 'performance-reliability-testing-suite',
    icon: 'chart',
    iconHue: 12,
    title: 'Performance & Reliability Testing Suite',
    org: 'Proyecto personal',
    category: 'qa',
    summary:
      'Suite de pruebas de performance y reliability con k6 (carga, estrés, spike, soak) e inyección de fallas, con observabilidad end-to-end vía Prometheus, Grafana, OpenTelemetry, Tempo y Loki sobre una demo de self-care telco.',
    tags: ['TypeScript', 'k6', 'OpenTelemetry'],
    level: 'Performance',
    repo: 'https://github.com/fercarballo/performance-reliability-testing-suite',
  },
  {
    id: 'telco-reliability-lab',
    icon: 'shield',
    iconHue: 145,
    title: 'Telco Reliability Lab',
    org: 'Proyecto personal',
    category: 'qa',
    summary:
      'API de autogestión telco instrumentada de punta a punta: suite de performance con k6, observabilidad completa en Grafana (métricas, trazas y logs vía OpenTelemetry), idempotencia de pagos a nivel de base de datos, inyección de fallas y CI con gates de SLO.',
    tags: ['k6', 'Grafana', 'SLO gates'],
    level: 'Reliability',
    repo: 'https://github.com/fercarballo/telco-reliability-lab',
  },
  {
    id: 'qa-linkedin-drafts',
    icon: 'chat',
    iconHue: 265,
    title: 'QA LinkedIn Drafts',
    org: 'Proyecto personal',
    category: 'dev',
    summary:
      'Asistente local con Human-in-the-Loop para preparar publicaciones técnicas de QA/SDET en LinkedIn: genera borradores de texto e imágenes de apoyo, pero la persona siempre revisa, aprueba y publica a mano.',
    tags: ['Python', 'Human-in-the-Loop'],
    level: 'Tooling',
    repo: 'https://github.com/fercarballo/TESTING-LIDERAZGO',
  },
  {
    id: 'carballotech-social-feed-api',
    icon: 'braces',
    iconHue: 28,
    title: 'CarballoTech Social Feed API',
    org: 'Proyecto personal',
    category: 'dev',
    summary: 'Salida JSON estática pública del feed social de CarballoTech, servida vía GitHub Pages.',
    tags: ['GitHub Pages', 'JSON API'],
    level: 'API',
    repo: 'https://github.com/fercarballo/carballotech-social-feed-api-pages',
  },
];

export type Certification = {
  title: string;
  issuer: string;
  year: string; // año o mes/año de expedición
  thumb?: string; // miniatura PNG generada desde el PDF oficial
  pdf?: string; // documento oficial
  tag?: 'QA' | 'IA' | 'Seguridad' | 'Dev';
};

/** Certificaciones con documento oficial verificable (galería) */
export const certifications: Certification[] = [
  {
    title: 'QA Fase II · Programación para Testers II (Java y POO)',
    issuer: 'Tech Station · Telecom/Personal',
    year: 'Dic 2025',
    thumb: '/certs/thumbs/qa2-programacion-testers-2-java.png',
    pdf: '/certs/qa2-programacion-testers-2-java.pdf',
    tag: 'QA',
  },
  {
    title: 'QA Fase II · Estrategias de Automatización',
    issuer: 'Tech Station · Telecom/Personal',
    year: 'Sep 2025',
    thumb: '/certs/thumbs/qa2-estrategias-automatizacion.png',
    pdf: '/certs/qa2-estrategias-automatizacion.pdf',
    tag: 'QA',
  },
  {
    title: 'Gestión de Riesgos con ejemplos de Software Testing',
    issuer: 'Mi Aprendizaje · Personal',
    year: 'May 2025',
    thumb: '/certs/thumbs/gestion-riesgos-testing.png',
    pdf: '/certs/gestion-riesgos-testing.pdf',
    tag: 'QA',
  },
  {
    title: 'API Testing con Postman',
    issuer: 'Mi Aprendizaje · Personal',
    year: 'May 2025',
    thumb: '/certs/thumbs/api-testing-postman.png',
    pdf: '/certs/api-testing-postman.pdf',
    tag: 'QA',
  },
  {
    title: 'IA Responsable: Ética & Seguridad',
    issuer: 'Mi Aprendizaje · Personal',
    year: 'Abr 2025',
    thumb: '/certs/thumbs/ia-responsable.png',
    pdf: '/certs/ia-responsable.pdf',
    tag: 'IA',
  },
  {
    title: 'Dominando el Arte del Prompting',
    issuer: 'Mi Aprendizaje · Personal',
    year: 'Abr 2025',
    thumb: '/certs/thumbs/prompting.png',
    pdf: '/certs/prompting.pdf',
    tag: 'IA',
  },
  {
    title: 'Fundamentos de Inteligencia Artificial',
    issuer: 'Digital Station · Telecom',
    year: 'Abr 2025',
    thumb: '/certs/thumbs/fundamentos-ia.png',
    pdf: '/certs/fundamentos-ia.pdf',
    tag: 'IA',
  },
  {
    title: 'Conociendo sobre IA',
    issuer: 'Digital Station · Telecom',
    year: 'Abr 2025',
    thumb: '/certs/thumbs/conociendo-ia.png',
    pdf: '/certs/conociendo-ia.pdf',
    tag: 'IA',
  },
  {
    title: 'Introducción a la Ciberseguridad',
    issuer: 'Digital Station · Telecom',
    year: 'Dic 2024',
    thumb: '/certs/thumbs/intro-ciberseguridad.png',
    pdf: '/certs/intro-ciberseguridad.pdf',
    tag: 'Seguridad',
  },
  {
    title: 'QA Fase II · Técnicas de Caja Blanca',
    issuer: 'Tech Station · Telecom/Personal',
    year: 'Dic 2024',
    thumb: '/certs/thumbs/qa2-caja-blanca.png',
    pdf: '/certs/qa2-caja-blanca.pdf',
    tag: 'QA',
  },
  {
    title: 'QA Fase II · Programación para Testers',
    issuer: 'Tech Station · Telecom/Personal',
    year: 'Oct 2024',
    thumb: '/certs/thumbs/qa2-programacion-testers.png',
    pdf: '/certs/qa2-programacion-testers.pdf',
    tag: 'QA',
  },
  {
    title: 'Bootcamp QA Manual',
    issuer: 'Tech Station · Telecom',
    year: 'Sep 2023',
    thumb: '/certs/thumbs/bootcamp-qa-manual.png',
    pdf: '/certs/bootcamp-qa-manual.pdf',
    tag: 'QA',
  },
];

/** Otras certificaciones (sin documento en el sitio) */
export const moreCertifications: Certification[] = [
  { title: 'Especialización en React JS', issuer: 'Informatorio Chaco', year: '2022', tag: 'Dev' },
  { title: 'Experiencia de Usuario (UX) Avanzado', issuer: 'LinkedIn Learning', year: '2022', tag: 'Dev' },
  { title: 'JavaScript Algorithms and Data Structures', issuer: 'freeCodeCamp', year: '2021', tag: 'Dev' },
  { title: 'SQL: Creación de Bases de Datos', issuer: 'Udemy', year: '2021', tag: 'Dev' },
  { title: 'Scrum Fundamentals Certified', issuer: 'VMEdu', year: '2021', tag: 'QA' },
  { title: 'Excel y Power BI: Análisis y Visualización de Datos', issuer: 'Udemy', year: '2021', tag: 'Dev' },
];

export type Education = {
  degree: string;
  school: string;
  period: string;
  status?: string;
};

export const education: Education[] = [
  {
    degree: 'Analista de Sistemas',
    school: 'Escuela Da Vinci',
    period: '2025 – 2028',
    status: 'En curso',
  },
  {
    degree: 'Tecnicatura Superior en Desarrollo Web y Aplicaciones Digitales',
    school: 'ISPC · Instituto Superior Politécnico Córdoba',
    period: '2022 – 2024',
  },
  {
    degree: 'Bootcamp Front End Developer (React + Redux)',
    school: 'EducacionIT',
    period: '2022',
  },
  {
    degree: 'Tecnicatura Superior en Programación',
    school: 'Teclab Instituto Técnico Superior',
    period: '2021',
  },
];

export const tabs = [
  { id: 'all', label: 'Todo' },
  { id: 'qa', label: 'QA & Testing' },
  { id: 'devops', label: 'CI/CD' },
  { id: 'dev', label: 'Desarrollo' },
] as const;
