---
title: "Facilitar una design review desde calidad"
description: "Cómo facilitar una design review sin autoridad formal: preparación asíncrona, orden del día, cómo hacer visible un modo de fallo sin confrontar, y cómo registrar decisión y disenso."
pubDate: 2026-07-10
tags: ['design-review', 'facilitacion', 'liderazgo-tecnico', 'rfc', 'quality-engineering']
cluster: 'a13'
clusterTitle: "RFC y design review de calidad"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere comunicación escrita y lectura de arquitectura."
repo: "nexo-quality-platform"
icon: 'book'
iconHue: 220
---

> **Aviso.** Nexo Finanzas es **ficticio**. Las personas (`@ficticio-*`) son ficticias. **Este contenido no afirma haber liderado un equipo.** Un portfolio individual demuestra criterio de decisión, no autoridad organizacional. Si nunca facilitaste una revisión con un equipo real, decilo: practicar la escritura de RFCs sobre tu propio proyecto es una preparación legítima, y afirmar lo contrario se detecta.

> **Promesa del artículo.** Al terminar vas a poder conducir una revisión de diseño sin autoridad formal, hacer visible un modo de fallo sin que nadie se ponga a la defensiva, y cerrar con una decisión registrada en vez de con una sensación compartida.

> Asume la distinción entre RFC, ADR y runbook del [pilar](/blog/rfc-adr-y-runbook-tres-documentos-tres-preguntas/).

## La reunión que no es una revisión

Una persona presenta un diseño durante veinticinco minutos. Al final pregunta si hay comentarios. Silencio. Alguien de mayor jerarquía dice "me parece bien, avancemos". Se aprueba.

Nadie mintió. Nadie fue negligente. Y aun así **no hubo revisión**: hubo una aprobación con testigos.

Tres cosas fallaron, y las tres son de diseño de la reunión, no de las personas:

1. **Nadie leyó el documento antes.** Están procesando la información mientras la escuchan, y no se puede pensar críticamente sobre algo que estás oyendo por primera vez.
2. **La primera opinión ancló al resto.** Cuando el senior habla primero, el espacio de lo decible se cierra.
3. **No había una pregunta específica que responder.** "¿Comentarios?" no es una pregunta: es una invitación a no decir nada.

Todo lo que sigue es corregir esas tres cosas.

## Preparación asíncrona: la reunión empieza tres días antes

**La regla que más cambia el resultado, y la más difícil de sostener:**

> **Si alguien no leyó el RFC, no participa de la revisión.** Y si nadie lo leyó, la reunión se cancela.

Suena rígido. Es la única forma de que la revisión no sea una lectura en voz alta.

El flujo que funciona:

1. **El RFC se comparte con al menos tres días de anticipación**, con una fecha límite de comentarios anterior a la reunión.
2. **Los comentarios se dejan en el documento**, escritos. Esto tiene una propiedad enorme: **las objeciones escritas son más precisas y menos personales que las habladas.** Es más fácil escribir "esta sección no explica qué pasa si el consumidor muere entre el commit y el ack" que decirlo en voz alta frente a quien lo escribió.
3. **El autor responde por escrito antes de la reunión.** La mitad de las objeciones se resuelven ahí.
4. **La reunión trata solo lo que no se resolvió por escrito.** Suele ser una o dos cosas, y son las importantes.

<figure class="diagram">
  <img src="/blog/diagrams/facilitar-una-design-review-desde-calidad-1.svg" width="852" height="889" alt="Diagrama: facilitar-una-design-review-desde-calidad (1)" loading="lazy" decoding="async" />
</figure>

El paso 3 es el que casi nadie hace, y es el que convierte una reunión de una hora en una de veinte minutos. El costo es disciplina.

**Si el equipo no lee:** el problema casi nunca es la gente. Es que los RFCs son demasiado largos, se abren para cambios triviales, o históricamente no cambiaron ninguna decisión. Arreglá eso primero.

## El orden del día que evita el anclaje

Cinco movimientos. El orden importa más que el contenido.

### 1. El problema, en voz de alguien que no es el autor (3 min)

Pedile a otra persona que resuma el problema. Si no puede, **el RFC no está listo** y la reunión termina ahí, sin drama.

Este movimiento hace tres cosas: verifica que el documento se entiende, evita que el autor venda su solución en los primeros minutos, y le da voz a alguien que no es el autor antes que a nadie más.

### 2. Rondas de preguntas, de menos senior a más senior (10 min)

**Explícitamente en ese orden.** La persona con menos antigüedad habla primero.

No es una cortesía. Es un mecanismo contra el anclaje: una vez que la persona más senior emitió una opinión, el espacio de lo decible se cierra. Y las mejores preguntas suelen venir de quien no tiene los supuestos internalizados.

Como facilitador, esto significa que **vos hablás último**, aunque seas quien más objeciones tenga.

### 3. Los modos de fallo (10 min)

Acá aportás las [nueve preguntas de calidad](/blog/rfc-adr-y-runbook-tres-documentos-tres-preguntas/). Pero **cómo** las hacés determina si producen información o defensa.

### 4. Decisión, o siguiente paso (5 min)

Tres salidas posibles, y todas son válidas:

- **Decidido.** Se escribe el ADR.
- **Decidido condicionalmente.** Se avanza, con una hipótesis a validar y una fecha.
- **No decidido.** Falta información específica; alguien tiene la acción de conseguirla; hay fecha.

**Lo que no es una salida:** "seguimos conversando". Eso es una reunión que no terminó.

### 5. Registro (asíncrono)

Decisión, disenso, preguntas abiertas, fecha de revisión. Sin esto, la reunión no ocurrió.

## Cómo hacer visible un modo de fallo sin confrontar

La técnica central del artículo, y la que separa a un facilitador de un crítico.

**Lo que no funciona** (aunque tengas razón):

> *"Esto no maneja duplicados. Va a fallar."*

Es una afirmación sobre el diseño, que se lee como una afirmación sobre quien lo diseñó. La respuesta previsible es una defensa, y las defensas no producen información.

**Lo que funciona:**

> *"Ayudame a seguir un caso. El consumidor procesa `TransferCompleted`, actualiza el saldo, y muere antes de mandar el `ack`. El broker reentrega. ¿Qué pasa con el saldo?"*

Cuatro propiedades de esta pregunta:

- **Es concreta.** Un caso, no una categoría.
- **Es una pregunta genuina.** Puede que haya una respuesta que no viste.
- **El autor descubre el problema**, en vez de que se lo señalen. Es suyo, y lo va a arreglar mejor.
- **No hay nada que defender.** No dijiste que el diseño está mal.

Formulá tus objeciones como **trayectorias**, no como veredictos. *"Seguime este camino"*, no *"esto está roto"*.

### Cuando la respuesta es "el broker lo garantiza"

Ocurre siempre. Y la respuesta correcta no es "no, no lo garantiza".

> *"Bien. ¿Podemos anotar la configuración exacta que da esa garantía, y hasta dónde llega? Porque el consumidor escribe en PostgreSQL, y quiero entender si la garantía cubre esa escritura o termina en el broker."*

No estás contradiciendo. Estás pidiendo que se escriba el alcance. Y en el 90 % de los casos, al intentar escribirlo, el propio autor descubre que la garantía termina en la frontera del broker.

**Que alguien descubra algo escribiéndolo es infinitamente mejor que que vos se lo digas.**

## La pregunta que siempre se hace al final

Antes de cerrar, una vez, en voz alta:

> **"¿Qué afirmación de este documento sigue siendo una hipótesis?"**

Es incómoda a propósito. Y produce dos efectos:

1. **Desarma la retórica.** Nadie sigue afirmando algo con seguridad después de que le preguntaron, delante de todos, si es una hipótesis.
2. **Genera el plan de evidencia.** Cada hipótesis identificada necesita una forma de validarse después de implementar.

La respuesta correcta casi siempre es *"varias"*, y eso es una buena señal. Un diseño sin hipótesis es un diseño donde nadie sabe cuáles son.

## Qué hacer cuando el senior decide por autoridad

Va a pasar. Alguien con más peso dice "hagámoslo así" y la conversación se cierra.

**Lo que no funciona:** discutir la autoridad. Perdés, y además no importa.

**Lo que funciona:** convertir la decisión en algo verificable.

> *"Perfecto. Para poder escribirlo en el ADR: ¿cuál es el supuesto que hace que esta sea la mejor opción? Si ese supuesto resultara falso, ¿qué haríamos?"*

Ahora la decisión tiene un supuesto explícito y un plan de contingencia. Si el supuesto era sólido, no perdiste nada. Si no lo era, **acabás de crear el mecanismo que lo va a revelar**, y lo hiciste sin confrontar a nadie.

**Esto es influencia sin autoridad**, y es la habilidad que este capítulo enseña. No consiste en ganar la discusión: consiste en asegurarte de que la decisión sea revisable.

Y si aun así la decisión se toma en contra de tu juicio: **registrá el disenso, con tu nombre y tu argumento**, y avanzá con el equipo. Un disenso registrado hace dos cosas. Cuando el problema aparezca en un año, nadie va a decir "nadie lo previó". Y —más importante— te obliga a articular el argumento con precisión, lo cual a veces revela que estabas equivocado.

## Las tres cosas que se registran

Sin esto, la reunión no ocurrió.

**1. La decisión, y su razón.** No solo qué se decidió. Por qué esa opción y no la otra.

**2. El disenso, con nombre, argumento y rol futuro.**

> **Disenso.** @ficticio-bob sostiene que CDC es la opción correcta desde el inicio: migrar de polling a CDC más adelante exigirá reprocesar el histórico y coordinar un corte.
>
> **Se decidió igual porque** el volumen actual no justifica la complejidad operativa, y el ADR declara la señal concreta que dispararía la migración.
>
> **@ficticio-bob revisará esa señal en 6 meses.**

Quien disintió no perdió: tiene una fecha y un rol. Eso mantiene el disenso vivo, que es lo que querés.

**3. Las preguntas abiertas, sin responder.**

> **Preguntas abiertas.**
> - ¿Cuál es el intervalo de polling adecuado? **No lo sabemos.** Empezamos con un valor conservador y lo ajustamos midiendo la antigüedad del pendiente más viejo.
> - ¿Qué hacemos si el outbox acumula más de N filas? Hay un runbook, pero **no fue ensayado**.

**Un RFC sin preguntas abiertas es un anuncio.** Toda decisión de diseño no trivial tiene bordes que nadie resolvió, y escribirlos es lo que permite que alguien los resuelva después.

## El seguimiento que hace creíble todo lo demás

Un mes después de implementar, alguien vuelve al RFC y escribe:

> **Validación de supuestos (2026-08-15).**
>
> - *"El intervalo de polling de N segundos es suficiente."* → **Confirmado.** La antigüedad p99 del pendiente más viejo se mantuvo por debajo del objetivo.
> - *"El outbox no impactará la latencia de `POST /transfers`."* → **Parcialmente falso.** Se observó un aumento de latencia p99 atribuible a la escritura adicional. Es aceptable, pero **la afirmación original era demasiado fuerte**.
> - *"El runbook de backlog es ejecutable."* → **No verificado.** Se ensayó el 2026-08-10; el paso 3 estaba mal escrito. Corregido.

Ese bloque, hecho **una sola vez**, cambia la relación del equipo con los RFCs para siempre. Porque demuestra que escribir la hipótesis fue lo que permitió notar que era falsa.

Un equipo que nunca cierra este circuito acumula documentos que nadie relee, y aprende —correctamente— que escribirlos no servía de nada.

## Cómo demostrar esto en un portfolio individual

Sin equipo, no hay design review. Pero hay algo mejor de lo que la gente cree.

**Lo que podés hacer y demuestra la capacidad:**

- Escribir el RFC **antes** del código, y que el historial de Git lo pruebe. El commit del RFC precede al de la implementación. Eso es verificable y es exactamente lo que un entrevistador va a mirar.
- Registrar **preguntas abiertas** que no resolviste.
- **Validar las hipótesis** después de implementar, y escribir cuáles resultaron falsas. Un RFC con un supuesto refutado vale más que uno perfecto.
- Escribir un ADR que concluya **"no lo hacemos"**. Es la decisión que más criterio demuestra.

**Lo que no podés afirmar, y se detecta con dos preguntas:**

- Que lideraste un equipo.
- Que facilitaste una revisión con partes en desacuerdo.
- Que operaste el sistema resultante.

Decir *"practiqué la escritura de RFCs sobre mi propio proyecto; nunca facilité una revisión con un equipo real"* **suma**. Es honesto, es verificable, y demuestra que entendés la diferencia. Insinuar lo contrario resta, y cuesta más de lo que gana.

## Anti-patrones

- **Reunión sin lectura previa.** *Consecuencia:* nadie puede pensar críticamente sobre algo que oye por primera vez. *Alternativa:* tres días, comentarios escritos, y se cancela si nadie leyó.
- **El senior habla primero.** *Consecuencia:* anclaje; el espacio de lo decible se cierra. *Alternativa:* rondas de menos a más senior; el facilitador último.
- **"¿Comentarios?"** *Consecuencia:* silencio. *Alternativa:* preguntas específicas sobre modos de fallo concretos.
- **Objeción como veredicto.** *Consecuencia:* defensa, no información. *Alternativa:* formulala como una trayectoria: *"seguime este caso"*.
- **Contradecir "el broker lo garantiza".** *Alternativa:* pedir que se escriba la configuración y el alcance. El autor lo descubre solo.
- **Discutir la autoridad.** *Consecuencia:* perdés, y no importa. *Alternativa:* convertí la decisión en verificable: cuál es el supuesto, y qué haríamos si fuera falso.
- **Salir con "seguimos conversando".** *Alternativa:* decidido, decidido condicionalmente, o no decidido con acción y fecha.
- **Disenso no registrado.** *Alternativa:* nombre, argumento y rol futuro.
- **RFC sin preguntas abiertas.** *Consecuencia:* es un anuncio. *Alternativa:* escribí los bordes que nadie resolvió.
- **No validar las hipótesis.** *Consecuencia:* el equipo aprende, con razón, que los RFCs no sirven. *Alternativa:* cerrá el circuito una vez.
- **Afirmar haber liderado un equipo desde un portfolio individual.** *Consecuencia:* se detecta con dos preguntas y cuesta la entrevista. *Alternativa:* la verdad suma.

## Qué publicar en GitHub

```text
.github/ISSUE_TEMPLATE/design-review.md   # la plantilla, en artefactos
docs/rfcs/RFC-001-transactional-outbox.md # con preguntas abiertas y validación posterior
docs/adr/                                 # incluyendo al menos un "no lo hacemos"
```

El commit del RFC debe **preceder** al de la implementación. Es la única evidencia de que lo escribiste antes, y es exactamente lo que alguien va a verificar.

## Qué aprendimos / próximos pasos

- Una revisión sin lectura previa es una lectura en voz alta.
- El orden de la palabra —de menos a más senior— es un mecanismo contra el anclaje, no una cortesía.
- Formulá objeciones como trayectorias, no como veredictos. Que el autor descubra el problema.
- Ante "el broker lo garantiza", pedí que se escriba el alcance. Se resuelve solo.
- Ante una decisión por autoridad, no discutas la autoridad: hacé la decisión verificable.
- El disenso registrado con nombre, argumento y fecha mantiene viva la objeción.
- Un RFC sin preguntas abiertas es un anuncio.
- Validar las hipótesis una sola vez cambia la relación del equipo con el proceso.

**Los artefactos completos:** RFC-001, ADR-003, plantilla de design review y runbook.

## Checklist final

- [ ] El RFC se compartió con al menos tres días de anticipación.
- [ ] Los comentarios se dejaron por escrito antes de la reunión.
- [ ] El autor respondió por escrito antes de la reunión.
- [ ] Alguien que no es el autor resumió el problema al empezar.
- [ ] Las rondas fueron de menos a más senior.
- [ ] El facilitador habló último.
- [ ] Las objeciones se formularon como casos concretos, no como veredictos.
- [ ] Toda garantía citada tiene su configuración y su alcance escritos.
- [ ] La reunión terminó en decidido / condicional / no decidido con acción y fecha.
- [ ] Se preguntó qué afirmaciones siguen siendo hipótesis.
- [ ] La decisión, el disenso y las preguntas abiertas quedaron registrados.
- [ ] Quien disintió tiene un rol y una fecha.
- [ ] Un mes después, alguien validó las hipótesis y actualizó el documento.
- [ ] En un portfolio individual: el commit del RFC precede al de la implementación, y no se afirma haber liderado un equipo.

---

## Fuentes (consultadas 2026-07-10)

- Este artículo describe una práctica de facilitación. **No depende de la versión de ninguna herramienta.**
- [Google SRE — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — el tono sin culpables, que una design review comparte con un postmortem.
- Las nueve preguntas de calidad y los modos de fallo sobre los que se hacen están desarrollados en los [capítulos 01 a 08](/blog/de-qa-automation-a-quality-engineering-mapa-de-180-dias/) de esta serie.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
