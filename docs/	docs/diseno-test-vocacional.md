# Diseño del Test Vocacional

## Principio de diseño central

El test tiene que producir dos cosas separadas, nunca mezcladas: un **perfil vocacional calculado de forma determinística** (números, sin IA) y **texto cualitativo** que la IA usa después para dar profundidad real — nunca al revés. Si la IA calculara el perfil, se pierde la garantía de que el resultado sea reproducible y auditable.

## Módulo 1 — Presupuesto y restricciones (determinístico)

Va primero porque filtra el dataset de universidades ANTES de que exista cualquier interpretación de IA. Captura:
- Presupuesto semestral real (`presupuesto_semestre_max`)
- Estrato socioeconómico (opcional — el estudiante puede no saberlo)
- Grupo Sisbén (A/B/C, opcional)
- Ciudad preferida

Con esto se filtra `universidades` contra el presupuesto: las de costo fijo se comparan directo, las de costo variable por estrato se resuelven con el estrato del estudiante, y las de Matrícula Cero pasan automáticamente si el estudiante está en estrato 1-3 o Sisbén A/B/C.

## Módulo 2 — 18 preguntas Likert, 6 dimensiones (determinístico)

Dimensiones: **Analítico, Técnico, Social, Creativo, Organizacional, Investigativo** — 3 preguntas por dimensión (3 × 6 = 18).

El perfil se calcula con una fórmula fija (promedio normalizado por dimensión, escala 0-100), sin IA. Las 2-3 dimensiones más altas del estudiante se cruzan con la **tabla de mapeo dimensión→área** (determinística) para obtener 2-3 áreas de carrera candidatas. La IA nunca decide esto — solo interpreta después, en el Módulo 3.

### Umbral de empate / perfil disperso

Fijado en **8.33 puntos** — no es un valor arbitrario, se deriva de la granularidad real de la grilla de puntuación: 3 preguntas Likert por dimensión, movimiento mínimo por pregunta = 8.33 puntos normalizados. Si la diferencia entre la 2ª y 3ª dimensión más alta es menor a ese umbral, se toman 3 dimensiones en vez de 2 (`es_perfil_disperso = true`), y esto se comunica honestamente al estudiante — no se fuerza una narrativa de claridad que los datos no respaldan.

### Regla para perfiles de 3 dimensiones

Cuando el perfil tiene 3 dimensiones (por el umbral de empate), se consultan las 3 combinaciones pareadas posibles en la tabla de mapeo y se hace la **unión sin duplicados** de las áreas resultantes de cada par.

## Tabla de mapeo dimensión → área de carrera

15 combinaciones posibles (C(6,2) = 15, todas las parejas únicas entre las 6 dimensiones). Cada combinación resuelve a 2-3 áreas de carrera candidatas. Esta tabla vive como datos en Supabase (`mapeo_dimensiones_areas`), no hardcodeada en el frontend, para poder ajustarla sin tocar código.

> Nota: las 15 filas exactas de esta tabla (qué áreas resultan de cada par de dimensiones) se definieron y completaron en sesión, y deben cargarse directamente en la tabla `mapeo_dimensiones_areas` de Supabase como seed data — no se reproducen aquí para evitar que una transcripción manual introduzca un error en un mapeo que después la IA usaría como si fuera dato verificado.

## Módulo 3 — 2-3 preguntas abiertas

Diseñadas para darle a la IA texto específico y real del estudiante que pueda citar — no para calcular nada. Ejemplos de tipo de pregunta: qué actividad reciente disfrutó y por qué, qué problema le gustaría resolver, qué materia o proyecto lo enganchó más y qué tenía en común con otros que también le gustaron.

Regla explícita: si la IA no puede conectar una respuesta abierta con ninguna de las áreas candidatas, tiene que decirlo explícitamente ("tu respuesta sobre X no se relaciona directamente con las áreas identificadas, pero puede ser un interés paralelo que vale la pena explorar por separado") en vez de forzar una conexión artificial.

## Flujo completo

```
Módulo 1 (presupuesto) ──► filtra universidades (determinístico, sin IA)
Módulo 2 (18 Likert)   ──► perfil de dimensiones ──► tabla de mapeo ──► áreas candidatas (determinístico, sin IA)
Módulo 3 (abiertas)    ──► texto crudo del estudiante
                              │
                              ▼
        Edge Function interpretar-resultado (única parte con IA)
        recibe: perfil + es_perfil_disperso + áreas candidatas + universidades filtradas + respuestas abiertas
        → interpreta y redacta, nunca recalcula ni inventa
        → validación programática post-respuesta (ver prompt-ia-test-vocacional.md)
                              │
                              ▼
                    resultado mostrado al estudiante
        (con disclaimer: no es test psicométrico certificado,
         verificar costos/becas en fuente oficial antes de decidir)
```

## Consideración de UX pendiente de decidir en el frontend

El test tiene 3 módulos y puede tomar 8-10 minutos — vale la pena guardar progreso parcial (por sesión) por si el estudiante lo abandona a mitad de camino, en vez de perder todo si cierra la pestaña.
