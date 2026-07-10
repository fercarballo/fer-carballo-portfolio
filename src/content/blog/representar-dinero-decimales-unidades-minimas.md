---
title: "Cómo representar dinero sin perder centavos: decimales, unidades mínimas y pruebas"
description: "Por qué float/double es un bug latente en dinero, cuándo usar decimal vs unidades mínimas, cómo tratar redondeo y multi-moneda con ISO 4217, y cómo probar la representación con property-based testing."
pubDate: 2026-07-09
tags: ["dinero", "decimal", "ieee-754", "iso-4217", "redondeo", "property-based-testing", "fintech"]
cluster: "13"
clusterTitle: "Quality Engineering en fintech"
type: "satelite"
order: 3
icon: "flask"
iconHue: 88
readingLevel: "Intermedio–Avanzado"
---
> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Los ejemplos de código son ilustrativos y no constituyen una suite ejecutada: no se reportan cobertura, benchmarks ni resultados de corrida.

## El problema: 0,1 + 0,2 no es 0,3

Abrí cualquier consola y evaluá `0.1 + 0.2`. Vas a obtener `0.30000000000000004`. No es un bug del lenguaje: es cómo funciona el **punto flotante binario** (IEEE 754). En un formulario, ese error es cosmético. En Nexo Finanzas, cuando ese cálculo decide cuánto debitar, el error se **acumula**, y al cabo de miles de operaciones la reconciliación cierra "por unos centavos" que nadie sabe explicar.

> Este artículo profundiza la invariante de **conservación** que el pilar (`/probar-dinero-no-es-probar-formularios`) solo enuncia.

## Prerrequisitos y glosario

- **IEEE 754:** el estándar de aritmética de punto flotante (IEEE 754-2019). `float`/`double` son binarios: no pueden representar exactamente fracciones decimales como `0.1`.
- **Decimal / BigDecimal:** tipos de punto flotante o fijo **decimal**, que representan exactamente valores como `0.1`.
- **Unidad mínima (minor unit):** la subdivisión más pequeña de una moneda (centavo). Guardar `10000` (enteros) en vez de `100.00`.
- **Exponente de moneda:** cuántos decimales tiene la unidad mínima. Definido por [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html): USD/EUR = 2, JPY = 0, KWD/BHD/TND = 3.
- **Modo de redondeo:** la regla para cortar decimales sobrantes (HALF_UP, HALF_EVEN, etc.).

## Por qué float/double es un bug latente

Tres fallas concretas:

1. **Representación inexacta:** `0.1` no existe en binario; se guarda una aproximación. Sumar muchas aproximaciones acumula deriva.
2. **Redondeo no controlado:** el redondeo ocurre "por casualidad" del hardware, no por una regla de negocio explícita.
3. **Comparaciones frágiles:** `a == b` entre floats es poco fiable; en dinero, "igual" debe ser exacto.

Anti-patrón a desmontar: **usar `float` por comodidad.** Consecuencia: pérdida/creación de centavos, reconciliaciones que no cierran, imposibilidad de auditar. Alternativa: una **decisión explícita** entre decimal y unidades mínimas.

## Dos representaciones correctas (y una regla)

### Opción A — Enteros en unidades mínimas

Guardás el importe como **entero** en la subdivisión más pequeña: $100.00 → `10000` centavos.

- **Ventajas:** aritmética entera exacta y rápida; imposible "medio centavo" accidental; serialización trivial.
- **Cuidado:** necesitás guardar **la moneda y su exponente** junto al número, porque `10000` significa $100.00 en USD pero ¥10000 en JPY (exponente 0). Nunca un entero "pelado".

### Opción B — Tipo decimal (BigDecimal / DECIMAL)

Guardás el importe como decimal de precisión fija (`DECIMAL(19,4)` en SQL, `BigDecimal` en Java).

- **Ventajas:** legible, natural para cálculos con tasas/intereses que requieren más decimales que la unidad mínima.
- **Cuidado:** hay que fijar precisión, escala y **modo de redondeo** explícitos; nunca dejar el default del lenguaje.

### La regla, sea cual sea la opción

**Encapsulá el dinero en un tipo dedicado `Money(amount, currency)`.** No un `double`, no un `int` suelto: un objeto que conoce su moneda, prohíbe sumar monedas distintas y centraliza el redondeo. Es el patrón "Money" clásico del diseño de dominio.

```java
// Pseudocodigo de un tipo Money con unidades minimas. Ilustrativo.
public final class Money {
    private final long amountMinor;   // p. ej. 10000 = 100.00 en una moneda de exponente 2
    private final Currency currency;  // lleva el exponente (ISO 4217)

    public Money plus(Money other) {
        requireSameCurrency(other);        // sumar USD + JPY debe fallar, no "funcionar"
        return new Money(Math.addExact(this.amountMinor, other.amountMinor), currency);
    }
    // No hay constructor desde double: se prohibe entrar por punto flotante.
}
```

Bloque a bloque: `amountMinor` es entero (exacto); `requireSameCurrency` convierte un error de dominio (sumar peras con manzanas) en una excepción temprana; `addExact` hace explícito el **overflow** (importes enormes) en vez de envolver silenciosamente; y **no hay constructor desde `double`**, que cierra la puerta al bug de origen.

## Redondeo: una decisión de negocio, no del hardware

Cuando un cálculo produce más decimales que la unidad mínima (una tasa, un split), hay que **redondear con una regla explícita**:

- **HALF_UP** ("redondeo comercial"): 0.5 sube. Intuitivo.
- **HALF_EVEN** ("banker's rounding"): 0.5 va al par más cercano; reduce el sesgo acumulado en grandes volúmenes. Es común en finanzas.

No hay un ganador universal: **HALF_EVEN** reduce sesgo estadístico; **HALF_UP** es más fácil de explicar a un usuario. Lo importante es **elegir, documentar y probar** la regla, no heredar la del lenguaje.

### El problema del reparto (allocation)

Dividir $10.00 entre 3 no da un número redondo. Si redondeás cada parte por separado, podés "perder" o "crear" un centavo. La técnica correcta es **repartir el resto**: 333 + 333 + 334 = 1000 centavos. La invariante a probar: **la suma de las partes es exactamente igual al total**. Nunca se crea ni se pierde valor al dividir.

## Serialización y almacenamiento: dónde se filtra el float

- **JSON:** el tipo `number` de JSON puede ser interpretado como `double` por muchos parsers, y **JavaScript representa todos los números como IEEE 754 double**. Para importes grandes o de alta precisión, transportá el importe como **string** (`"amount": "100.00"`) o como **entero de unidades mínimas** (`"amount_minor": 10000`), y documentá cuál. Nunca un `number` decimal si el consumidor podría ser JS.
- **SQL:** usá `DECIMAL/NUMERIC`, **nunca `FLOAT/REAL`** para dinero. `FLOAT` reintroduce el bug en la capa de almacenamiento aunque la app esté bien.
- **Multi-moneda:** guardá siempre `(amount, currency)` juntos y validá el exponente contra [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html). Un mismo entero significa distinto según la moneda.

## Probar la representación: property-based testing

Los ejemplos puntuales (`assert 0.1 + 0.2 == 0.3`) no alcanzan: querés propiedades que valgan para *cualquier* entrada. El **property-based testing** genera cientos de casos y verifica invariantes.

```java
// Pseudocodigo estilo jqwik (Java) / Hypothesis (Python). Ilustrativo.
@Property
void sumar_es_asociativo(@ForAll @MoneyGen Money a,
                         @ForAll @MoneyGen Money b,
                         @ForAll @MoneyGen Money c) {
    // (a+b)+c == a+(b+c) SIEMPRE, sin deriva de punto flotante.
    assertEqual(a.plus(b).plus(c), a.plus(b.plus(c)));
}

@Property
void repartir_no_crea_ni_destruye_valor(@ForAll @MoneyGen Money total,
                                        @ForAll @IntRange(min = 1, max = 50) int n) {
    List<Money> partes = total.allocate(n);           // reparto con resto
    assertEqual(total, Money.sum(partes));            // la suma exacta vuelve al total
}
```

Propiedades valiosas para dinero: asociatividad/commutatividad de la suma; el reparto conserva el total; redondear dos veces con la misma escala es idempotente; no se puede sumar monedas distintas (debe lanzar). Estas pruebas atrapan clases enteras de bugs que un ejemplo suelto no ve.

> Aclaración honesta: estos ejemplos son **ilustrativos**, no una suite ejecutada; no reporto números de cobertura ni resultados de corrida.

## Trade-offs

- **Unidades mínimas vs decimal:** enteros son más seguros y rápidos, pero incómodos cuando el negocio necesita más precisión que la unidad mínima (tasas, intereses diarios). Decimal es más flexible pero obliga a fijar escala y redondeo.
- **String vs entero en JSON:** string es inequívoco pero exige parseo cuidadoso; entero de unidades mínimas es compacto pero necesita que el consumidor conozca el exponente.
- **HALF_EVEN vs HALF_UP:** menor sesgo vs mayor explicabilidad.

Ninguna opción es "la mejor" en abstracto: dependen del alcance de monedas, del tipo de cálculos y de quién consume la API. Documentá la elección en un ADR.

## Anti-patrones

- **`float`/`double` para importes.** → deriva acumulada. Alternativa: `Money` con enteros o decimal.
- **`FLOAT` en la columna de la base.** → el bug entra por almacenamiento. Alternativa: `DECIMAL/NUMERIC`.
- **Entero "pelado" sin moneda.** → `10000` ambiguo entre USD y JPY. Alternativa: `(amount_minor, currency)` inseparables.
- **Redondear "cuando haga falta" sin regla.** → resultados irreproducibles. Alternativa: modo de redondeo explícito y probado.
- **Redondear cada parte de un reparto por separado.** → se pierde/crea un centavo. Alternativa: reparto con distribución de resto.

## Qué publicar en GitHub

- `docs/adr/ADR-001-representacion-de-dinero.md`: decisión (enteros vs decimal), exponente por moneda, modo de redondeo, formato de serialización, y **por qué** se aceptó cada costo.
- Un tipo `Money` con tests unitarios y **property-based**, con comando de ejecución y propiedades documentadas.
- En `openapi.yaml`: declarar el formato del importe (`amount_minor` entero o `amount` string) y el campo `currency`.

## Qué aprendimos / próximos pasos

- `float` no es "casi bien": es un bug latente que la reconciliación te va a cobrar.
- Elegí explícitamente entre unidades mínimas y decimal, y encapsulá en `Money`.
- El redondeo y el reparto son decisiones de negocio que se **prueban** con propiedades.

Enlaces internos:

- Pilar: `/probar-dinero-no-es-probar-formularios`.
- Idempotencia: `/idempotencia-y-reintentos-en-transferencias` (el importe idempotente debe además estar bien tipado).
- Reconciliación: `/reconciliacion-auditoria-observabilidad-financiera` (donde la mala representación aparece como "diferencia de centavos").

## Checklist final

- [ ] Ningún importe usa `float`/`double` ni columnas `FLOAT`.
- [ ] Existe un tipo `Money(amount, currency)` que prohíbe mezclar monedas.
- [ ] El exponente por moneda respeta ISO 4217 (JPY=0, KWD=3, etc.).
- [ ] El modo de redondeo es explícito y está documentado.
- [ ] El reparto conserva el total (suma de partes == total).
- [ ] La serialización JSON no depende de `number` decimal para consumidores JS.
- [ ] Hay property-based tests para asociatividad y conservación.
- [ ] La decisión está registrada en ADR-001.

---

## Fuentes (consultadas 2026-07-09)

- [ISO 4217 — Currency codes](https://www.iso.org/iso-4217-currency-codes.html)
- IEEE 754-2019 — *IEEE Standard for Floating-Point Arithmetic* (citado por designación de estándar; ver [IEEE](https://standards.ieee.org/))
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) (contexto de media types y representación)

