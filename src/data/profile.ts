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
  category: 'nexo' | 'qa' | 'devops';
  summary: string;
  tags: string[];
  level: string;
  repo: string; // repo público de GitHub — fuente de la verdad del proyecto
};

/**
 * Proyectos = repos públicos reales de github.com/fercarballo, curados.
 * Orden: primero el ecosistema Nexo Finanzas (lo más reciente y lo que
 * documenta el blog), luego la suite de fundamentos SDET.
 * La descripción sale del repo; el botón lleva al código.
 */
export const projects: Project[] = [
  // ── Ecosistema Nexo Finanzas (7 repos, sistema completo) ──
  {
    id: 'nexo-transfer-api',
    icon: 'braces',
    iconHue: 28,
    title: 'API de transferencias',
    org: 'Ecosistema Nexo · 1/7',
    category: 'nexo',
    summary:
      'API de transferencias segura y trazable: Java 21, Spring Boot, Cucumber BDD y REST-assured, con Docker y CI. El sistema bajo prueba del ecosistema.',
    tags: ['Java 21', 'Spring Boot', 'Cucumber'],
    level: 'Backend + BDD',
    repo: 'https://github.com/fercarballo/nexo-transfer-api',
  },
  {
    id: 'nexo-web-banking-e2e',
    icon: 'code',
    iconHue: 210,
    title: 'E2E web con Selenium',
    org: 'Ecosistema Nexo · 2/7',
    category: 'nexo',
    summary:
      'Portal web y su automatización end-to-end: Selenium 4 + Cucumber BDD + Page Object Model en Java, ejecutando en Chrome headless.',
    tags: ['Selenium 4', 'Cucumber', 'POM'],
    level: 'E2E Web',
    repo: 'https://github.com/fercarballo/nexo-web-banking-e2e',
  },
  {
    id: 'nexo-wallet-mobile',
    icon: 'phone',
    iconHue: 300,
    title: 'Automatización mobile',
    org: 'Ecosistema Nexo · 3/7',
    category: 'nexo',
    summary:
      'Billetera Android y su automatización con Appium 9 + Cucumber BDD + POM en Java, con un modo simulado que corre sin emulador.',
    tags: ['Appium 9', 'Android', 'Cucumber'],
    level: 'E2E Mobile',
    repo: 'https://github.com/fercarballo/nexo-wallet-mobile',
  },
  {
    id: 'nexo-cross-channel-regression',
    icon: 'refresh',
    iconHue: 45,
    title: 'Regresión cross-canal',
    org: 'Ecosistema Nexo · 4/7',
    category: 'nexo',
    summary:
      'Smoke cross-channel (API + Web + Mobile) con Katalon Studio, más un validador estático propio que actúa como gate de CI.',
    tags: ['Katalon', 'Cross-channel', 'CI gate'],
    level: 'Regresión',
    repo: 'https://github.com/fercarballo/nexo-cross-channel-regression',
  },
  {
    id: 'nexo-performance-lab',
    icon: 'chart',
    iconHue: 12,
    title: 'Laboratorio de performance',
    org: 'Ecosistema Nexo · 5/7',
    category: 'nexo',
    summary:
      'Carga y análisis de capacidad con Apache JMeter: hipótesis, modelo de carga, SLOs como gate y conclusiones medidas sobre un SUT propio.',
    tags: ['JMeter', 'SLO', 'Capacidad'],
    level: 'Performance',
    repo: 'https://github.com/fercarballo/nexo-performance-lab',
  },
  {
    id: 'nexo-quality-control-tower',
    icon: 'shield',
    iconHue: 145,
    title: 'Torre de control de calidad',
    org: 'Ecosistema Nexo · 6/7',
    category: 'nexo',
    summary:
      'Ingiere JUnit XML de todo el ecosistema, construye la matriz de trazabilidad requisito→prueba→resultado y publica en Jira/Xray. Bloquea requisitos sin cobertura.',
    tags: ['Java', 'Jira/Xray', 'JUnit XML'],
    level: 'Trazabilidad',
    repo: 'https://github.com/fercarballo/nexo-quality-control-tower',
  },
  {
    id: 'nexo-quality-platform',
    icon: 'container',
    iconHue: 190,
    title: 'Plataforma de calidad',
    org: 'Ecosistema Nexo · 7/7',
    category: 'nexo',
    summary:
      'Entorno de pruebas reproducible: Docker Compose y Kubernetes con kind (rolling update verificado sin corte), más pipelines GitLab CI / Jenkins con quality gates.',
    tags: ['Kubernetes', 'GitLab CI', 'Jenkins'],
    level: 'Plataforma',
    repo: 'https://github.com/fercarballo/nexo-quality-platform',
  },

  // ── Suite de fundamentos SDET ──
  {
    id: 'playwright-e2e-framework-saucedemo',
    icon: 'flask',
    iconHue: 210,
    title: 'Framework E2E de UI',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Automatización end-to-end con Playwright + TypeScript: Page Object Model con componentes reutilizables, fixtures, datos desacoplados y ejecución cross-browser.',
    tags: ['Playwright', 'TypeScript', 'POM'],
    level: 'E2E UI',
    repo: 'https://github.com/fercarballo/playwright-e2e-framework-saucedemo',
  },
  {
    id: 'api-testing-framework-restful-booker',
    icon: 'braces',
    iconHue: 28,
    title: 'Testing de API con contratos',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'API Clients como Page Objects, schemas Zod para contract testing y tipado, CRUD encadenado, casos negativos y preparación de datos por API.',
    tags: ['Playwright', 'Zod', 'Contract testing'],
    level: 'API',
    repo: 'https://github.com/fercarballo/api-testing-framework-restful-booker',
  },
  {
    id: 'flakiness-hunting-playwright',
    icon: 'refresh',
    iconHue: 45,
    title: 'Estabilidad y flakiness',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Experimento controlado que demuestra, mide y elimina el flakiness de timing: una suite frágil, una estable y un medidor de tasa de fallo. Resultado medido: 85 % → 0 %.',
    tags: ['Playwright', 'Flakiness', 'Web-first'],
    level: 'Estabilidad',
    repo: 'https://github.com/fercarballo/flakiness-hunting-playwright',
  },
  {
    id: 'visual-and-contract-testing',
    icon: 'set',
    iconHue: 280,
    title: 'Regresión visual & contract testing',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Regresión visual con baselines versionados y tolerancia configurada, más contract testing consumer-driven con Pact. Ambos integrados como gates en CI.',
    tags: ['Playwright', 'Pact', 'Visual regression'],
    level: 'Visual + Contract',
    repo: 'https://github.com/fercarballo/visual-and-contract-testing',
  },
  {
    id: 'performance-testing-k6',
    icon: 'chart',
    iconHue: 12,
    title: 'Performance & load testing',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Suite de performance con k6 (smoke, load, stress, spike, soak) con think times realistas y SLOs expresados como thresholds que actúan de gate en el pipeline.',
    tags: ['k6', 'Load testing', 'SLO gates'],
    level: 'Performance',
    repo: 'https://github.com/fercarballo/performance-testing-k6',
  },
  {
    id: 'integration-testing-testcontainers',
    icon: 'container',
    iconHue: 190,
    title: 'Integración con dependencias reales',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Testcontainers levanta un PostgreSQL descartable por corrida y valida constraints (UNIQUE/CHECK), defaults y tipos reales, con aislamiento por test.',
    tags: ['Testcontainers', 'PostgreSQL', 'Integración'],
    level: 'Integración',
    repo: 'https://github.com/fercarballo/integration-testing-testcontainers',
  },
  {
    id: 'qa-insights',
    icon: 'terminal',
    iconHue: 145,
    title: 'Tooling interno de QA',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'CLI en TypeScript: análisis de impacto de tests (grafo de dependencias para correr sólo lo afectado) y detección de flaky tests desde el histórico de ejecuciones.',
    tags: ['TypeScript', 'Test impact', 'Flaky detection'],
    level: 'Tooling',
    repo: 'https://github.com/fercarballo/qa-insights',
  },
  {
    id: 'llm-evals-harness',
    icon: 'bot',
    iconHue: 265,
    title: 'Evals de aplicaciones con IA',
    org: 'Suite SDET',
    category: 'qa',
    summary:
      'Harness de evaluación para una app basada en LLM: golden dataset, tres scorers (exact-match, similitud semántica y LLM-as-judge) y un umbral como gate de regresión.',
    tags: ['LLM testing', 'Evals', 'Golden dataset'],
    level: 'IA / LLM',
    repo: 'https://github.com/fercarballo/llm-evals-harness',
  },
  {
    id: 'qa-automation-cicd-pipeline',
    icon: 'infinity',
    iconHue: 200,
    title: 'Pipeline CI/CD de dos velocidades',
    org: 'Suite SDET',
    category: 'devops',
    summary:
      'GitHub Actions con verificación rápida y bloqueante por pull request (quality gates + smoke) y regresión completa cross-browser nocturna con matriz, sharding y merge de reportes.',
    tags: ['GitHub Actions', 'Sharding', 'Quality gates'],
    level: 'CI/CD',
    repo: 'https://github.com/fercarballo/qa-automation-cicd-pipeline',
  },
  {
    id: 'devsecops-pipeline',
    icon: 'shield',
    iconHue: 0,
    title: 'DevSecOps shift-left',
    org: 'Suite SDET',
    category: 'devops',
    summary:
      'Pipeline de seguridad que integra tres capas como quality gates: SAST (Semgrep), SCA (npm audit) y DAST, bloqueando la integración ante vulnerabilidades graves.',
    tags: ['Semgrep', 'SAST/SCA/DAST', 'Shift-left'],
    level: 'DevSecOps',
    repo: 'https://github.com/fercarballo/devsecops-pipeline',
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
  { id: 'nexo', label: 'Ecosistema Nexo' },
  { id: 'qa', label: 'QA & Testing' },
  { id: 'devops', label: 'CI/CD' },
] as const;
