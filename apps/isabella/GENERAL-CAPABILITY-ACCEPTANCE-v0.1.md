# General Capability Acceptance v0.1

Esta matriz se utiliza para impedir que MINDS evolucione hacia una colección de handlers específicos por formato.

## Casos

### A — Spreadsheet

Prompt representativo:

> Compara estas ofertas y déjame un resultado utilizable.

Resultado esperado: un workbook XLSX real cuando spreadsheet sea el soporte adecuado.

No aceptable: tabla Markdown como sustituto del workbook.

### B — Presentation

Prompt representativo:

> Prepara una presentación clara de este Entwurf para los Bauherren.

Resultado esperado: PPTX con slides reales.

No aceptable: outline de diapositivas en chat como sustituto del archivo.

### C — Edit existing deliverable

Prompt representativo:

> En el Word que hiciste antes cambia el título y conserva el resto.

Resultado esperado: Isabella localiza el artifact existente y lo entrega como input al mismo general execution runtime.

No aceptable: pedir a Gari que vuelva a copiar manualmente el contenido del archivo.

### D — Transform project source

Prompt representativo:

> Toma este archivo de Bernried y devuélveme una versión organizada para imprimir.

Resultado esperado: el archivo real de Work entra como input y general execution decide/proporciona el output útil.

No aceptable: un motor especial “Work PDF converter”.

### E — Background survival

Prompt representativo:

> Prepáralo bien; puedes seguir aunque cierre Isabella.

Resultado esperado: el provider run y `minds_capability_runs` sobreviven a la sesión del navegador y el runner entrega la salida posteriormente.

## Regla de regresión

Una solución que añade una herramienta específica para un formato falla esta suite aunque el ejemplo individual funcione.

La capacidad debe crecer horizontalmente mediante tools generales y composición, no verticalmente mediante casos codificados uno por uno.
