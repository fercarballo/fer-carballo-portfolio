/**
 * ─────────────────────────────────────────────────────────────
 *  FUENTE ÚNICA DE DATOS DEL PORTFOLIO
 *  Editá este archivo para actualizar todo el sitio.
 * ─────────────────────────────────────────────────────────────
 */

export const profile = {
  name: 'Fernando Carballo',
  headline: 'QA Automation Engineer · SDET',
  // Roles que rotan en el hero
  roles: ['QA Manual', 'QA Automation', 'SDET', 'Developer'],
  location: 'CABA, Buenos Aires · Argentina',
  email: 'fercarballodev@gmail.com',
  cvUrl: '/cv/Fernando-Carballo-CV.pdf',
  links: {
    linkedin: 'https://linkedin.com/in/fercarballo',
    github: 'https://github.com/fercarballodev', // TODO: verificá tu usuario real de GitHub
  },
  about: [
    'QA Engineer con más de 4 años de trayectoria en tecnología y telecomunicaciones, con un recorrido integral que abarca atención al cliente, desarrollo fullstack, aseguramiento de calidad y operación de plataformas cloud-native.',
    'Combino una mirada centrada en el usuario con sólido criterio técnico para diseñar pruebas, automatizar flujos críticos y operar entornos de Kubernetes con pipelines CI/CD. Visión end-to-end del ciclo de vida del software.',
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
    company: 'Personal Argentina',
    badge: 'PE',
    badgeHue: 217,
    type: 'Full Time',
    start: 'Jul 2023',
    end: 'Actualidad',
    duration: '3 años',
    bullets: [
      'Diseñé, ejecuté y documenté casos de prueba funcionales, de regresión e integración previos al despliegue.',
      'Validé flujos críticos y APIs REST con Postman, verificando contratos, respuestas, códigos de estado y evidencia de resultados.',
      'Gestioné defectos con Jira y Xray, asegurando trazabilidad requerimiento-prueba-evidencia-resultado.',
      'Apliqué automatización para regresiones funcionales sobre flujos críticos, utilizando Cypress, Playwright y entornos JavaScript.',
      'Operé y di soporte a plataformas OpenShift/Kubernetes para aplicaciones contenerizadas y microservicios.',
      'Desarrollé y mantuve pipelines CI/CD en GitLab para build, validación, imágenes y despliegue en OpenShift.',
      'Implementé GitOps con ArgoCD y analicé logs e incidentes con prácticas DevSecOps.',
    ],
    tools: ['Cypress', 'Playwright', 'Postman', 'Jira', 'Xray', 'OpenShift', 'Kubernetes', 'GitLab CI/CD', 'ArgoCD'],
  },
  {
    role: 'Software Developer FullStack',
    company: 'Corporación Cápsula',
    badge: 'CC',
    badgeHue: 265,
    type: 'Full Time',
    start: 'Sep 2022',
    end: 'Jul 2023',
    duration: '11 meses',
    bullets: [
      'Desarrollé interfaces frontend responsivas con JavaScript, React.js y Vue.js integradas a servicios backend.',
      'Modelé y consulté bases de datos MySQL para la persistencia de aplicaciones web.',
      'Trabajé con Git, CI/CD en Jenkins y entornos Docker para optimizar integración y despliegue.',
    ],
    tools: ['React.js', 'Vue.js', 'MySQL', 'Jenkins', 'Docker'],
  },
  {
    role: 'Asesor de Atención al Cliente',
    company: 'Telecentro',
    badge: 'T',
    badgeHue: 190,
    type: 'Full Time',
    start: 'Sep 2021',
    end: 'Ago 2022',
    duration: '1 año',
    bullets: [
      'Atendí consultas, reclamos y gestiones de clientes, asegurando resolución y satisfacción.',
      'Manejé alto volumen de llamadas con registro en sistemas de gestión y comunicación clara.',
    ],
  },
  {
    role: 'Asesor de Atención al Cliente',
    company: 'Konecta (Allus BPO) · Telefónica/Personal',
    badge: 'K',
    badgeHue: 330,
    type: 'Full Time',
    start: 'Sep 2019',
    end: 'Ago 2021',
    duration: '2 años',
    bullets: [
      'Brindé atención telefónica para la cuenta Telefónica/Personal, priorizando calidad y satisfacción del cliente.',
      'Resolví consultas y reclamos cumpliendo objetivos de servicio (SLA) y registrando gestiones en sistema.',
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
  repo?: string; // TODO: agregá los links reales a tus repos
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
    id: 'gitlab-pipelines',
    icon: 'infinity',
    iconHue: 12,
    title: 'Pipelines CI/CD en GitLab',
    org: 'DevOps',
    category: 'devops',
    summary:
      'Diseño y mantenimiento de pipelines para build, validación, construcción de imágenes y despliegue en OpenShift, con stages de calidad como quality gates.',
    details: [
      'Stages de build, test, análisis y deploy con jobs paralelos y cache de dependencias.',
      'Construcción de imágenes de contenedor y push a registry con tags versionados.',
      'Quality gates: la suite automatizada y el linting bloquean despliegues con fallas.',
      'Despliegue continuo a entornos OpenShift con rollback ante incidentes.',
    ],
    tags: ['GitLab CI', 'Docker', 'OpenShift'],
    level: 'CI/CD',
  },
  {
    id: 'argocd-gitops',
    icon: 'ship',
    iconHue: 200,
    title: 'GitOps con ArgoCD',
    org: 'DevOps · Cloud-Native',
    category: 'devops',
    summary:
      'Implementación de GitOps con ArgoCD sobre Kubernetes/OpenShift: el estado deseado vive en Git, sincronización declarativa y análisis de logs e incidentes con prácticas DevSecOps.',
    details: [
      'Aplicaciones ArgoCD declarativas: el repositorio Git como única fuente de verdad.',
      'Sincronización automática con self-healing y detección de drift de configuración.',
      'Gestión de deployments, services, routes, secrets, configmaps, namespaces y PVCs.',
      'Análisis de logs e incidentes en contenedores con enfoque DevSecOps.',
    ],
    tags: ['ArgoCD', 'Kubernetes', 'GitOps'],
    level: 'Cloud',
  },
  {
    id: 'qa-dashboard',
    icon: 'chart',
    iconHue: 265,
    title: 'Dashboard de Métricas QA',
    org: 'Development',
    category: 'dev',
    summary:
      'Aplicación web en React para visualizar métricas de calidad: cobertura de casos, defectos por severidad, tendencia de regresiones y salud de pipelines, consumiendo APIs REST.',
    details: [
      'Frontend en React con componentes reutilizables y estado derivado de APIs REST.',
      'Visualización de KPIs de calidad: densidad de defectos, pass rate y flakiness.',
      'Persistencia en MySQL con consultas optimizadas para series temporales.',
      'Deploy contenerizado con Docker detrás de un pipeline CI/CD.',
    ],
    tags: ['React', 'REST APIs', 'MySQL'],
    level: 'Full Stack',
  },
  {
    id: 'jira-xray',
    icon: 'shield',
    iconHue: 145,
    title: 'Gestión de Calidad con Jira + Xray',
    org: 'QA Manual',
    category: 'qa',
    summary:
      'Diseño de planes de prueba, ejecución documentada y gestión del ciclo de vida del defecto con trazabilidad completa requerimiento-prueba-evidencia-resultado.',
    details: [
      'Planes y sets de prueba en Xray vinculados a historias de usuario y requerimientos.',
      'Criterios de aceptación y alcance documentados en Confluence junto a desarrollo y producto.',
      'Ciclo de vida del defecto: detección, severidad/prioridad, seguimiento y verificación.',
      'Métricas de ejecución por ciclo para decisiones de release go/no-go.',
    ],
    tags: ['Jira', 'Xray', 'Confluence'],
    level: 'Manual',
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

export type Certification = { title: string; issuer: string; year: string };

export const certifications: Certification[] = [
  { title: 'QA Fase II — Programación (Java y POO), Estrategias de Automatización, Técnicas de Caja Blanca', issuer: 'Tech Station Personal Argentina', year: '2024–2025' },
  { title: 'Bootcamp QA Manual', issuer: 'Tech Station Personal Argentina', year: '2023' },
  { title: 'Bootcamp Front End Developer', issuer: 'EducaciónIT + Telecom', year: '2022' },
  { title: 'Especialización en React JS', issuer: 'Informatorio Chaco', year: '2022' },
  { title: 'Experiencia de Usuario (UX) Avanzado', issuer: 'LinkedIn', year: '2022' },
  { title: 'JavaScript Algorithms and Data Structures', issuer: 'freeCodeCamp', year: '2021' },
  { title: 'Excel y Power BI: Análisis y Visualización de Datos', issuer: 'Udemy', year: '2021' },
];

export const education = {
  degree: 'Analista de Sistemas',
  school: 'Escuela Da Vinci',
  status: 'En curso',
};

export const tabs = [
  { id: 'all', label: 'Todo' },
  { id: 'qa', label: 'QA & Testing' },
  { id: 'devops', label: 'DevOps' },
  { id: 'dev', label: 'Desarrollo' },
] as const;
