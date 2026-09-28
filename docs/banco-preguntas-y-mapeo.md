# Banco de Preguntas Likert, Preguntas Abiertas y Tabla de Mapeo Dimensión → Área

> **Nota de versión:** este documento incorpora la revisión de agosto de 2026, que corrigió redundancia conceptual en varias preguntas, reformuló la dimensión Técnico (mezclaba lo manual y lo digital de forma difusa), sacó dos preguntas de Social que medían personalidad en vez de interés vocacional y ajustó 3 filas de la tabla de mapeo (Economía, Derecho, Organizacional+Social). La arquitectura de scoring (top-2/3 condicional vs. siempre top-3 vs. modelo ponderado con % de afinidad) se evaluó explícitamente y se mantuvo el diseño original: top-2, o top-3 solo si hay casi-empate de ≤2 pasos. La lógica de `test-engine.js` no cambió.
>
> La fuente de verdad para la base de datos es `supabase/migrations/0002_seed_datos_test.sql`. Este documento explica el contenido; si hay diferencia entre ambos, manda el seed.

## 1. Banco de 42 preguntas Likert (7 por dimensión)

Escala de respuesta: 1 (Totalmente en desacuerdo) a 5 (Totalmente de acuerdo). El número entre paréntesis es el campo `orden` en la base de datos.

### Analítico

1. (1) Disfruto resolver problemas dividiéndolos en pasos pequeños y manejables.
2. (2) Antes de aceptar una explicación, me gusta verificar si realmente tiene sentido con los datos disponibles.
3. (3) Me gusta comparar varias opciones de forma estructurada antes de tomar una decisión.
4. (4) Encuentro satisfactorio identificar un patrón o relación que otros no notaron.
5. (5) Prefiero un argumento sustentado en evidencia sobre uno solo persuasivo.
6. (6) Disfruto los ejercicios de lógica, matemáticas o razonamiento abstracto.
7. (7) Me resulta natural detectar inconsistencias o errores en un razonamiento.

### Técnico

1. (8) Disfruto entender cómo está construido o programado algo por dentro, ya sea un objeto físico o un sistema digital.
2. (9) Me gusta aprender a usar una herramienta, programa o máquina nueva hasta dominarla.
3. (10) Prefiero aprender haciendo (probando directamente) en vez de solo leer instrucciones.
4. (11) Disfruto seguir un procedimiento técnico preciso hasta que el resultado funcione correctamente.
5. (12) Me interesa más construir o programar algo funcional que solo diseñar la idea en teoría.
6. (13) Disfruto diagnosticar por qué algo no funciona y corregirlo paso a paso.
7. (14) Prefiero un problema con una solución técnica concreta y verificable sobre uno puramente conceptual.

### Social

1. (15) Disfruto trabajar en equipo más que trabajar solo.
2. (16) Me interesa comprender las necesidades de otras personas para encontrar formas de ayudarlas.
3. (17) Prefiero actividades donde ayudo directamente a otras personas.
4. (18) Me gusta escuchar los problemas de otros y pensar cómo podría ayudar.
5. (19) Disfruto explicarle algo a alguien hasta que lo entiende.
6. (20) Me interesa entender cómo funcionan las relaciones y dinámicas entre personas o grupos.
7. (21) Prefiero un trabajo con contacto humano directo sobre uno mayormente solitario.

### Creativo

1. (22) Disfruto imaginar soluciones distintas a las que ya existen.
2. (23) Me gusta expresar ideas a través de diseño, escritura, música o arte.
3. (24) Prefiero un problema sin una única respuesta correcta sobre uno con procedimiento fijo.
4. (25) Disfruto experimentar con distintas formas de hacer algo, aunque no sea lo más eficiente.
5. (26) Me resulta natural conectar ideas de áreas distintas para crear algo nuevo.
6. (27) Disfruto rediseñar o mejorar la estética de algo que ya funciona.
7. (28) Prefiero improvisar sobre seguir un guion estricto.

### Organizacional

1. (29) Disfruto planear los pasos de un proyecto antes de empezarlo.
2. (30) Me resulta natural coordinar tareas entre varias personas.
3. (31) Disfruto liderar o coordinar cuando un grupo necesita dirección.
4. (32) Me incomoda el desorden o la falta de estructura en un proyecto.
5. (33) Disfruto optimizar procesos para que algo funcione de forma más eficiente.
6. (34) Prefiero delegar tareas según la fortaleza de cada persona del equipo.
7. (35) Cuando tengo varias tareas pendientes, priorizo con criterio antes de empezar a trabajar.

### Investigativo

1. (36) Disfruto profundizar en un tema hasta entenderlo a fondo, más allá de lo necesario.
2. (37) Me gusta cuestionar explicaciones que otros dan por sentadas.
3. (38) Prefiero investigar por mi cuenta antes de preguntarle a alguien la respuesta.
4. (39) Disfruto buscar información en distintas fuentes para comprender mejor un tema.
5. (40) Me interesa descubrir cómo se llegó a una conclusión, no solo cuál es.
6. (41) Disfruto formular hipótesis y después comprobar si son ciertas.
7. (42) Prefiero un proyecto de investigación largo sobre una tarea rápida y repetitiva.

---

## 2. Preguntas abiertas — Módulo 3 (3 preguntas)

Pensadas para darle a la IA texto real y específico del estudiante que pueda citar, nunca para calcular nada (ver `prompt-ia-test-vocacional.md`). Capturan señales que un Likert no puede medir: intereses concretos, disposición frente a un problema real y rechazos claros.

1. ¿Qué actividad podrías hacer durante varias horas sin aburrirte?
2. Si tuvieras que resolver un problema importante de tu comunidad, ¿qué tipo de problema escogerías y cómo intentarías solucionarlo?
3. ¿Qué tipo de trabajo definitivamente no te gustaría hacer, y por qué?

---

## 3. Universo de áreas de carrera (15)

Economía · Administración de Empresas · Ingeniería Industrial · Ciencia de Datos · Ingeniería de Sistemas · Derecho · Psicología · Medicina · Diseño · Comunicación Social y Periodismo · Arquitectura · Ciencias Políticas y Relaciones Internacionales · Contaduría Pública · Biología y Ciencias Ambientales · Marketing y Publicidad

La Edge Function `interpretar-resultado` no mantiene una copia propia de esta lista: la lee de la tabla `areas_carrera` (con caché de 5 minutos) para validar la respuesta de la IA. Por eso basta con que el seed esté cargado; no hay una segunda lista que sincronizar.

## 4. Tabla de mapeo — 15 combinaciones (C(6,2))

Dimensiones ordenadas alfabéticamente: Analítico, Creativo, Investigativo, Organizacional, Social, Técnico. En total son 44 filas en `mapeo_dimensiones_areas`: 14 pares × 3 áreas + 1 par × 2 áreas.

| # | Par de dimensiones | Áreas candidatas |
|---|---|---|
| 1 | Analítico + Creativo | Arquitectura, Diseño |
| 2 | Analítico + Investigativo | Economía, Ciencia de Datos, Medicina |
| 3 | Analítico + Organizacional | Administración de Empresas, Contaduría Pública, Ingeniería Industrial |
| 4 | Analítico + Social | Economía, Ciencias Políticas y Relaciones Internacionales, Derecho |
| 5 | Analítico + Técnico | Ingeniería de Sistemas, Ciencia de Datos, Ingeniería Industrial |
| 6 | Creativo + Investigativo | Arquitectura, Diseño, Biología y Ciencias Ambientales |
| 7 | Creativo + Organizacional | Marketing y Publicidad, Diseño, Administración de Empresas |
| 8 | Creativo + Social | Comunicación Social y Periodismo, Diseño, Marketing y Publicidad |
| 9 | Creativo + Técnico | Diseño, Arquitectura, Ingeniería de Sistemas |
| 10 | Investigativo + Organizacional | Economía, Administración de Empresas, Ciencia de Datos |
| 11 | Investigativo + Social | Psicología, Ciencias Políticas y Relaciones Internacionales, Derecho |
| 12 | Investigativo + Técnico | Medicina, Biología y Ciencias Ambientales, Ciencia de Datos |
| 13 | Organizacional + Social | Administración de Empresas, Economía, Ciencias Políticas y Relaciones Internacionales |
| 14 | Organizacional + Técnico | Ingeniería Industrial, Administración de Empresas, Ingeniería de Sistemas |
| 15 | Social + Técnico | Medicina, Psicología, Biología y Ciencias Ambientales |

**Cambios de esta revisión respecto a la primera versión:**

- Fila 1 (Analítico + Creativo): se quitó Economía por encaje débil. Quedan Arquitectura y Diseño.
- Fila 4 (Analítico + Social): se cambió Psicología por Derecho, porque argumentación, análisis e interpretación conectan mejor con esta combinación.
- Fila 13 (Organizacional + Social): se cambió Psicología por Economía, lo que completa la cobertura de Economía en las 4 dimensiones donde tiene peso real.

Economía queda representada en las filas 2, 4, 10 y 13. Derecho, en las filas 4 y 11.

## 5. Pendiente

- El catálogo de universidades no está en este seed. Va en una migración separada, porque sus cifras requieren verificación contra fuentes oficiales antes de cargarse.
- Seguir ajustando matices de la tabla de mapeo es una decisión de producto, no técnica. Cualquier cambio se hace con una migración nueva, no editando el seed ya aplicado.
