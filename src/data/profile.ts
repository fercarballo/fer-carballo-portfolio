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
  details: string[];
  tags: string[];
  level: string;
  repo?: string;
};

export const projects: Project[] = [
  {
    id: 'playwright-framework',
    icon: 'bot',
    iconHue: 152,
    title: 'Framework E2E con Playwright',
    org: 'QA Automation',
    category: 'qa',
    summary:
      'Framework de pruebas end-to-end con Playwright + TypeScript: Page Object Model, fixtures reutilizables, ejecución paralela y reportes con evidencia (trace, video, screenshots).',
    details: [
      'Arquitectura Page Object Model con fixtures tipados y datos de prueba desacoplados.',
      'Ejecución paralela multi-browser (Chromium, Firefox, WebKit) con sharding en CI.',
      'Reportes HTML con traces, videos y screenshots adjuntos como evidencia por caso.',
      'Integración con GitLab CI: la suite corre en cada merge request y bloquea regresiones.',
    ],
    tags: ['Playwright', 'TypeScript', 'POM'],
    level: 'E2E',
  },
  {
    id: 'cypress-regression',
    icon: 'refresh',
    iconHue: 217,
    title: 'Suite de Regresión con Cypress',
    org: 'QA Automation',
    category: 'qa',
    summary:
      'Automatización de regresiones funcionales sobre flujos críticos de negocio: login, checkout y formularios, con comandos custom, intercepts de red y datos controlados.',
    details: [
      'Cobertura de flujos críticos priorizada por análisis de riesgo e impacto.',
      'Comandos custom e intercepts (cy.intercept) para aislar el frontend de servicios inestables.',
      'Estrategia de datos de prueba con seeds y estados controlados por escenario.',
      'Reducción del tiempo de regresión manual de horas a minutos por ciclo.',
    ],
    tags: ['Cypress', 'JavaScript', 'Regresión'],
    level: 'Funcional',
  },
  {
    id: 'api-testing',
    icon: 'braces',
    iconHue: 28,
    title: 'API Testing: Contratos REST',
    org: 'QA · API Testing',
    category: 'qa',
    summary:
      'Validación de APIs REST con Postman/Newman: contratos, esquemas, códigos de estado, flujos encadenados y evidencia de resultados integrada al ciclo de vida del defecto.',
    details: [
      'Colecciones Postman con tests de contrato: esquema JSON, headers, status codes y tiempos.',
      'Flujos encadenados con variables de entorno y pre-request scripts.',
      'Ejecución headless con Newman en pipelines CI para validación continua.',
      'Evidencia trazable en Jira/Xray: requerimiento → prueba → evidencia → resultado.',
    ],
    tags: ['Postman', 'Newman', 'REST'],
    level: 'API',
  },
  {
    id: 'jira-xray',
    icon: 'shield',
    iconHue: 145,
    title: 'Gestión de Calidad con Jira + Xray',
    org: 'QA Manual',
    category: 'qa',
    summary:
      'Diseño de planes de prueba, ejecución documentada y gestión del ciclo de vida del defecto con trazabilidad completa requerimiento-prueba-evidencia-resultado. Resultado: −30% en tiempos de gestión.',
    details: [
      'Planes y sets de prueba en Xray vinculados a historias de usuario y requerimientos.',
      'Criterios de aceptación y alcance documentados en Confluence junto a desarrollo y producto.',
      'Ciclo de vida del defecto: detección, severidad/prioridad, seguimiento y verificación.',
      'Mejoras de proceso que redujeron un 30% los tiempos de gestión y resolución de defectos.',
    ],
    tags: ['Jira', 'Xray', 'Confluence'],
    level: 'Manual',
  },
  {
    id: 'sql-data-validation',
    icon: 'chart',
    iconHue: 265,
    title: 'Validación de Datos con SQL',
    org: 'QA · Data',
    category: 'qa',
    summary:
      'Validación de consistencia de datos entre UI, APIs y base de datos con consultas SQL: reconciliación de registros, verificación de estados y soporte a pruebas de integración.',
    details: [
      'Consultas SQL para validar que la UI y las APIs reflejen el estado real de los datos.',
      'Reconciliación de registros entre sistemas con JOINs y agregaciones.',
      'Detección temprana de inconsistencias de datos antes del despliegue.',
      'Evidencia de resultados adjunta al ciclo de prueba en Xray.',
    ],
    tags: ['SQL', 'MySQL', 'Data QA'],
    level: 'Integración',
  },
  {
    id: 'gitlab-pipelines',
    icon: 'infinity',
    iconHue: 12,
    title: 'Quality Gates en CI/CD',
    org: 'QA × DevOps',
    category: 'devops',
    summary:
      'Integración de suites automatizadas como quality gates en pipelines GitLab CI: la calidad bloquea despliegues con fallas. Experiencia operando OpenShift/Kubernetes y GitOps con ArgoCD.',
    details: [
      'Suites de Cypress/Playwright ejecutándose en cada merge request.',
      'Stages de build, test y deploy con jobs paralelos y cache de dependencias.',
      'Quality gates: la automatización y el linting bloquean despliegues con fallas.',
      'Contexto DevOps: OpenShift/Kubernetes, ArgoCD y prácticas GitOps.',
    ],
    tags: ['GitLab CI', 'Docker', 'OpenShift'],
    level: 'CI/CD',
  },
  {
    id: 'frontend-capsula',
    icon: 'code',
    iconHue: 330,
    title: 'Interfaces Web Responsivas',
    org: 'Corporación Cápsula',
    category: 'dev',
    summary:
      'Desarrollo de interfaces frontend responsivas con React.js y Vue.js integradas a servicios backend, con persistencia MySQL y despliegue vía Jenkins + Docker.',
    details: [
      'Componentes UI responsivos en React.js y Vue.js integrados a servicios backend.',
      'Modelado y consultas MySQL para la persistencia de aplicaciones web.',
      'Flujo Git con revisiones e integración continua en Jenkins.',
      'Entornos Docker reproducibles para desarrollo y despliegue.',
    ],
    tags: ['Vue.js', 'React', 'Jenkins'],
    level: 'Frontend',
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
