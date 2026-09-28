-- =============================================================================
-- SEED: Dimensiones, áreas de carrera, preguntas Likert (42), preguntas
-- abiertas (3), y tabla de mapeo — versión revisada tras feedback de
-- redundancia conceptual y correcciones al mapeo de carreras.
-- =============================================================================
-- Ver docs/banco-preguntas-y-mapeo.md para el razonamiento completo.
-- No incluye universidades: ese catálogo va en una migración aparte.

-- -----------------------------------------------------------------------------
-- 1. DIMENSIONES
-- -----------------------------------------------------------------------------
insert into dimensiones (nombre) values
  ('Analítico'),
  ('Técnico'),
  ('Social'),
  ('Creativo'),
  ('Organizacional'),
  ('Investigativo');

-- -----------------------------------------------------------------------------
-- 2. ÁREAS DE CARRERA
-- -----------------------------------------------------------------------------
insert into areas_carrera (nombre) values
  ('Economía'),
  ('Administración de Empresas'),
  ('Ingeniería Industrial'),
  ('Ciencia de Datos'),
  ('Ingeniería de Sistemas'),
  ('Derecho'),
  ('Psicología'),
  ('Medicina'),
  ('Diseño'),
  ('Comunicación Social y Periodismo'),
  ('Arquitectura'),
  ('Ciencias Políticas y Relaciones Internacionales'),
  ('Contaduría Pública'),
  ('Biología y Ciencias Ambientales'),
  ('Marketing y Publicidad');

-- -----------------------------------------------------------------------------
-- 3. PREGUNTAS LIKERT (42 — 7 por dimensión) — texto revisado
-- -----------------------------------------------------------------------------

-- Analítico (orden 1-7)
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto resolver problemas dividiéndolos en pasos pequeños y manejables.', 1),
  ('Antes de aceptar una explicación, me gusta verificar si realmente tiene sentido con los datos disponibles.', 2),
  ('Me gusta comparar varias opciones de forma estructurada antes de tomar una decisión.', 3),
  ('Encuentro satisfactorio identificar un patrón o relación que otros no notaron.', 4),
  ('Prefiero un argumento sustentado en evidencia sobre uno solo persuasivo.', 5),
  ('Disfruto los ejercicios de lógica, matemáticas o razonamiento abstracto.', 6),
  ('Me resulta natural detectar inconsistencias o errores en un razonamiento.', 7)
) as t(texto, orden)
where dimensiones.nombre = 'Analítico';

-- Técnico (orden 8-14) — reformulada para unificar manual/digital bajo "construir hasta que funcione"
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto entender cómo está construido o programado algo por dentro, ya sea un objeto físico o un sistema digital.', 8),
  ('Me gusta aprender a usar una herramienta, programa o máquina nueva hasta dominarla.', 9),
  ('Prefiero aprender haciendo (probando directamente) en vez de solo leer instrucciones.', 10),
  ('Disfruto seguir un procedimiento técnico preciso hasta que el resultado funcione correctamente.', 11),
  ('Me interesa más construir o programar algo funcional que solo diseñar la idea en teoría.', 12),
  ('Disfruto diagnosticar por qué algo no funciona y corregirlo paso a paso.', 13),
  ('Prefiero un problema con una solución técnica concreta y verificable sobre uno puramente conceptual.', 14)
) as t(texto, orden)
where dimensiones.nombre = 'Técnico';

-- Social (orden 15-21) — se sacaron las 2 preguntas que medían personalidad/introversión en vez de interés vocacional
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto trabajar en equipo más que trabajar solo.', 15),
  ('Me interesa comprender las necesidades de otras personas para encontrar formas de ayudarlas.', 16),
  ('Prefiero actividades donde ayudo directamente a otras personas.', 17),
  ('Me gusta escuchar los problemas de otros y pensar cómo podría ayudar.', 18),
  ('Disfruto explicarle algo a alguien hasta que lo entiende.', 19),
  ('Me interesa entender cómo funcionan las relaciones y dinámicas entre personas o grupos.', 20),
  ('Prefiero un trabajo con contacto humano directo sobre uno mayormente solitario.', 21)
) as t(texto, orden)
where dimensiones.nombre = 'Social';

-- Creativo (orden 22-28) — sin cambios
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto imaginar soluciones distintas a las que ya existen.', 22),
  ('Me gusta expresar ideas a través de diseño, escritura, música o arte.', 23),
  ('Prefiero un problema sin una única respuesta correcta sobre uno con procedimiento fijo.', 24),
  ('Disfruto experimentar con distintas formas de hacer algo, aunque no sea lo más eficiente.', 25),
  ('Me resulta natural conectar ideas de áreas distintas para crear algo nuevo.', 26),
  ('Disfruto rediseñar o mejorar la estética de algo que ya funciona.', 27),
  ('Prefiero improvisar sobre seguir un guion estricto.', 28)
) as t(texto, orden)
where dimensiones.nombre = 'Creativo';

-- Organizacional (orden 29-35) — se sacaron 2 preguntas redundantes con "planear pasos", se agregó delegación y priorización
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto planear los pasos de un proyecto antes de empezarlo.', 29),
  ('Me resulta natural coordinar tareas entre varias personas.', 30),
  ('Disfruto liderar o coordinar cuando un grupo necesita dirección.', 31),
  ('Me incomoda el desorden o la falta de estructura en un proyecto.', 32),
  ('Disfruto optimizar procesos para que algo funcione de forma más eficiente.', 33),
  ('Prefiero delegar tareas según la fortaleza de cada persona del equipo.', 34),
  ('Cuando tengo varias tareas pendientes, priorizo con criterio antes de empezar a trabajar.', 35)
) as t(texto, orden)
where dimensiones.nombre = 'Organizacional';

-- Investigativo (orden 36-42) — se cambió la pregunta que penalizaba perfiles investigativos pero prácticos
insert into preguntas_likert (dimension_id, texto, orden)
select id, texto, orden from dimensiones, (values
  ('Disfruto profundizar en un tema hasta entenderlo a fondo, más allá de lo necesario.', 36),
  ('Me gusta cuestionar explicaciones que otros dan por sentadas.', 37),
  ('Prefiero investigar por mi cuenta antes de preguntarle a alguien la respuesta.', 38),
  ('Disfruto buscar información en distintas fuentes para comprender mejor un tema.', 39),
  ('Me interesa descubrir cómo se llegó a una conclusión, no solo cuál es.', 40),
  ('Disfruto formular hipótesis y después comprobar si son ciertas.', 41),
  ('Prefiero un proyecto de investigación largo sobre una tarea rápida y repetitiva.', 42)
) as t(texto, orden)
where dimensiones.nombre = 'Investigativo';

-- -----------------------------------------------------------------------------
-- 4. PREGUNTAS ABIERTAS (3) — Módulo 3
-- -----------------------------------------------------------------------------
insert into preguntas_abiertas (texto, orden) values
  ('¿Qué actividad podrías hacer durante varias horas sin aburrirte?', 1),
  ('Si tuvieras que resolver un problema importante de tu comunidad, ¿qué tipo de problema escogerías y cómo intentarías solucionarlo?', 2),
  ('¿Qué tipo de trabajo definitivamente no te gustaría hacer, y por qué?', 3);

-- -----------------------------------------------------------------------------
-- 5. TABLA DE MAPEO — 15 combinaciones (C(6,2)) — 3 filas corregidas
-- -----------------------------------------------------------------------------
-- Cambios vs. la primera versión: fila Analítico+Creativo pierde Economía;
-- fila Analítico+Social gana Derecho (pierde Psicología); fila
-- Organizacional+Social gana Economía (pierde Psicología). Ver sección 4 de
-- docs/banco-preguntas-y-mapeo.md para el razonamiento.

insert into mapeo_dimensiones_areas (dimension_1_id, dimension_2_id, area_id)
select d1.id, d2.id, a.id
from dimensiones d1, dimensiones d2, areas_carrera a
where (d1.nombre, d2.nombre, a.nombre) in (
  -- 1. Analítico + Creativo
  ('Analítico', 'Creativo', 'Arquitectura'),
  ('Analítico', 'Creativo', 'Diseño'),

  -- 2. Analítico + Investigativo
  ('Analítico', 'Investigativo', 'Economía'),
  ('Analítico', 'Investigativo', 'Ciencia de Datos'),
  ('Analítico', 'Investigativo', 'Medicina'),

  -- 3. Analítico + Organizacional
  ('Analítico', 'Organizacional', 'Administración de Empresas'),
  ('Analítico', 'Organizacional', 'Contaduría Pública'),
  ('Analítico', 'Organizacional', 'Ingeniería Industrial'),

  -- 4. Analítico + Social
  ('Analítico', 'Social', 'Economía'),
  ('Analítico', 'Social', 'Ciencias Políticas y Relaciones Internacionales'),
  ('Analítico', 'Social', 'Derecho'),

  -- 5. Analítico + Técnico
  ('Analítico', 'Técnico', 'Ingeniería de Sistemas'),
  ('Analítico', 'Técnico', 'Ciencia de Datos'),
  ('Analítico', 'Técnico', 'Ingeniería Industrial'),

  -- 6. Creativo + Investigativo
  ('Creativo', 'Investigativo', 'Arquitectura'),
  ('Creativo', 'Investigativo', 'Diseño'),
  ('Creativo', 'Investigativo', 'Biología y Ciencias Ambientales'),

  -- 7. Creativo + Organizacional
  ('Creativo', 'Organizacional', 'Marketing y Publicidad'),
  ('Creativo', 'Organizacional', 'Diseño'),
  ('Creativo', 'Organizacional', 'Administración de Empresas'),

  -- 8. Creativo + Social
  ('Creativo', 'Social', 'Comunicación Social y Periodismo'),
  ('Creativo', 'Social', 'Diseño'),
  ('Creativo', 'Social', 'Marketing y Publicidad'),

  -- 9. Creativo + Técnico
  ('Creativo', 'Técnico', 'Diseño'),
  ('Creativo', 'Técnico', 'Arquitectura'),
  ('Creativo', 'Técnico', 'Ingeniería de Sistemas'),

  -- 10. Investigativo + Organizacional
  ('Investigativo', 'Organizacional', 'Economía'),
  ('Investigativo', 'Organizacional', 'Administración de Empresas'),
  ('Investigativo', 'Organizacional', 'Ciencia de Datos'),

  -- 11. Investigativo + Social
  ('Investigativo', 'Social', 'Psicología'),
  ('Investigativo', 'Social', 'Ciencias Políticas y Relaciones Internacionales'),
  ('Investigativo', 'Social', 'Derecho'),

  -- 12. Investigativo + Técnico
  ('Investigativo', 'Técnico', 'Medicina'),
  ('Investigativo', 'Técnico', 'Biología y Ciencias Ambientales'),
  ('Investigativo', 'Técnico', 'Ciencia de Datos'),

  -- 13. Organizacional + Social
  ('Organizacional', 'Social', 'Administración de Empresas'),
  ('Organizacional', 'Social', 'Economía'),
  ('Organizacional', 'Social', 'Ciencias Políticas y Relaciones Internacionales'),

  -- 14. Organizacional + Técnico
  ('Organizacional', 'Técnico', 'Ingeniería Industrial'),
  ('Organizacional', 'Técnico', 'Administración de Empresas'),
  ('Organizacional', 'Técnico', 'Ingeniería de Sistemas'),

  -- 15. Social + Técnico
  ('Social', 'Técnico', 'Medicina'),
  ('Social', 'Técnico', 'Psicología'),
  ('Social', 'Técnico', 'Biología y Ciencias Ambientales')
);
