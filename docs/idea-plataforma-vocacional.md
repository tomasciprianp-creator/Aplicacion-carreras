# Plataforma de Orientación Universitaria — Documento de Aterrizaje

## Problema real

En Colombia, un estudiante de bachillerato que empieza a pensar en universidad se enfrenta a dos procesos que casi nunca están conectados: (1) descubrir qué carrera/área encaja con su perfil, y (2) descubrir qué universidades están genuinamente a su alcance según su presupuesto real (matrícula + ayudas financieras/becas/créditos). Existen tests vocacionales por un lado, y existe información dispersa de costos y becas por otro — pero nadie cruza ambas cosas de forma confiable y gratuita. El resultado: estudiantes que descartan universidades "caras" sin saber que tienen beca disponible, o que aplican a una que no pueden pagar sin darse cuenta a tiempo.

Este problema es personal: nace de la propia experiencia de navegar admisiones y ayuda financiera sin una herramienta que integrara ambas piezas.

## Panorama competitivo (Colombia)

Investigación de mercado identificó plataformas existentes que cubren parte del espacio (Guía Universitaria, Edumatch, Epicu), pero ninguna combina: razonamiento de IA + filtro automatizado y gratuito de ayuda financiera real + alternativas de cursos cortos/bootcamps en el mismo flujo. Ese cruce es el diferenciador.

## Diferenciador

Combinar un test vocacional real con datos verificados de costos y ayuda financiera, para que el estudiante vea — en el mismo resultado — no solo "qué estudiar" sino "dónde puedo estudiar eso sin que el dinero sea una sorpresa después".

## Estructura del test

Test mixto de tres módulos:
1. **Presupuesto y restricciones** (determinístico) — presupuesto semestral real, apertura a crédito, estrato/Sisbén, ciudad preferida. Filtra el dataset de universidades ANTES de que exista cualquier interpretación de IA.
2. **Preguntas fijas de perfil** (determinístico) — banco de preguntas tipo Likert que produce un perfil de dimensiones vocacionales mediante una fórmula fija, sin IA.
3. **2-3 preguntas abiertas** — pensadas para darle a la IA texto específico del estudiante que pueda citar y usar para personalizar, nunca para calcular el perfil.

## Formato del resultado

El resultado que ve el estudiante incluye:
- Áreas de carrera candidatas (2-3), explicadas con lenguaje natural que conecta con sus respuestas abiertas.
- Alternativas de curso corto/bootcamp cuando aplique (para áreas donde eso es una ruta real).
- Universidades específicas filtradas por su presupuesto real, con el costo y la ayuda financiera correspondiente.

## Arquitectura

Mismo patrón usado en el simulador empresarial ("Imperio en 15 Años"): **filtrado determinístico entrega datos ya verificados a un LLM que solo interpreta — nunca inventa cifras, becas ni universidades.** Este es el riesgo más serio del proyecto (que la IA alucine un costo o una beca que no existe) y la arquitectura lo neutraliza estructuralmente, no solo con instrucciones de prompt.

Stack: HTML/JS sin frameworks en el frontend, Supabase para persistencia, Edge Functions como proxy seguro hacia el LLM (la API key nunca vive en el cliente).

## Modelo de datos (resumen)

Universidades con costo, ayuda financiera y fuente; preguntas del test (Likert + abiertas); tabla de mapeo dimensión→área de carrera; sesiones de test y resultados. (El schema completo y definitivo está en `supabase/migrations/0001_init_schema.sql`.)

## Riesgos y mitigaciones

1. **La IA inventa una cifra o universidad** → mitigado estructuralmente por la arquitectura de 3 capas (determinístico → IA solo interpreta → validación programática post-respuesta).
2. **Alcance de datos limitado al inicio** (pocas universidades, mayoría Bogotá) → ser explícito en la interfaz de que es una primera versión con cobertura limitada, no todo el país, para no generar expectativas falsas.
3. **Cobertura de becas incompleta** → el resultado debe indicar claramente cuando no hay información suficiente de una universidad, en vez de omitir el dato silenciosamente ("no tenemos datos verificados de ayuda financiera para esta universidad" en vez de no decir nada).

## Criterios de éxito

- **Calidad del razonamiento de la IA**: no genérico, cita datos reales del estudiante y del dataset — no un wrapper simple sobre un prompt vago.
- **Coherencia con el perfil del autor**: valor narrativo para portafolio de admisiones (proyecto nacido de una necesidad real y propia).
- **Prueba con usuarios reales**: aunque no sea el estándar de 20-30 usuarios de otros proyectos, vale la pena probarlo con un grupo pequeño de compañeros de colegio (5-10 personas) antes de presentarlo, para poder hablar de una prueba real y no solo hipotética.

## Estado del proyecto (última actualización de este documento)

Diseño completo cerrado: dataset de 17 universidades, arquitectura de tres capas, test de 18 preguntas Likert + tabla de mapeo de dimensiones, prompt de IA con validación backend, schema de Supabase, y Edge Function `interpretar-resultado` conectada al schema real (con re-verificación de costos desde la base de datos y flujo de envío de resultado por email vía Resend). Pendiente: lógica determinística del frontend, interfaz del test, y pruebas end-to-end.
