# UI Generativa con agentes: ADK + Gemini + A2UI

Código del taller **"UI Generativa con Angular: Construyendo Interfaces Impulsadas por Agentes con ADK y A2UI"**, basado en el codelab oficial de Google:
[Crea interfaces enriquecidas basadas en agentes con el ADK y A2UI](https://codelabs.developers.google.com/adk-gemini-a2ui?hl=es-419).

Un agente de [ADK](https://adk.dev/) genera imágenes con Gemini 3.1 Flash Image (Nano Banana 2) y, en lugar de responder solo con texto, envía componentes declarativos de [A2UI](https://a2ui.org/) (Card, Text, Image, MultipleChoice, Button) que el frontend renderiza de forma nativa.

## Pasos del taller (tags)

Cada paso del codelab tiene su propio tag, así puedes ver el código como quedaba en cada etapa:

| Tag | Paso | Qué agrega |
|---|---|---|
| `step-1-adk-agent` | Crea un agente nuevo del ADK | `art_creator/agent.py` con la tool `generate_image`; se prueba con `adk web` |
| `step-2-simple-frontend` | Crea un frontend simple | `main.py` (FastAPI + `InMemoryRunner`) y el chat en `static/` |
| `step-3-a2ui-agent` | Configura el agente para emitir A2UI | `A2uiSchemaManager` genera la instrucción; el agente responde en JSON A2UI |
| `step-4-a2ui-renderer` | Frontend personalizado | `static/app.js` interpreta `beginRendering`, `surfaceUpdate` y `dataModelUpdate` y renderiza los componentes |

```bash
git tag                              # ver los pasos
git checkout step-2-simple-frontend  # ir a un paso
git checkout main                    # volver a la versión final
git diff step-2-simple-frontend step-3-a2ui-agent   # ver qué cambió entre pasos
```

## Estructura

```
.
├── art_creator/
│   ├── __init__.py
│   ├── agent.py        # Agente ADK + tool generate_image + A2uiSchemaManager
│   └── .env.example    # Variables de entorno (copiar a .env)
├── static/
│   ├── index.html      # Chat de una sola página
│   ├── style.css
│   └── app.js          # Renderizador A2UI en JS puro
├── main.py             # Servidor FastAPI con InMemoryRunner del ADK
└── pyproject.toml
```

## Requisitos

- Proyecto de Google Cloud con facturación habilitada
- Python 3.10+ y [uv](https://docs.astral.sh/uv/)
- `gcloud` autenticado (`gcloud auth application-default login`)

## Cómo ejecutarlo

```bash
# 1. Dependencias
uv sync

# 2. Habilitar Vertex AI
gcloud services enable aiplatform.googleapis.com

# 3. Variables de entorno
cp art_creator/.env.example art_creator/.env
# edita GOOGLE_CLOUD_PROJECT en art_creator/.env

# 4a. Probar el agente en la UI de desarrollo del ADK
uv run adk web --port 8080 --allow_origins "*" --reload_agents

# 4b. O levantar la app con el frontend A2UI
uv run python -m uvicorn main:app --port 8080 --host 0.0.0.0
```

Abre http://localhost:8080 y prueba, por ejemplo:

- *Una chica de anime durmiendo bajo un árbol. Colores pastel 16:9*
- *Fotografía de una cabaña reflejada en el lago. Finales de la tarde. Sensación nostálgica*

El agente te pedirá los detalles que falten (estilo, iluminación, resolución, relación de aspecto…) con controles A2UI antes de generar la imagen, y luego la mostrará en una tarjeta con su prompt y un botón de descarga.

## Siguientes pasos: frontend de producción

El frontend de este repo es JS puro con fines didácticos. Para producción se usa un renderizador oficial de A2UI:

| Plataforma | Paquete |
|---|---|
| Angular | `npm install @a2ui/angular` |
| React | `npm install @a2ui/react` |
| Lit | `npm install @a2ui/lit` |
| Flutter | [GenUI SDK](https://docs.flutter.dev/ai/genui/get-started) |

## Referencias

- [Especificación A2UI](https://a2ui.org/) · [Repo A2UI](https://github.com/google/A2UI) · [Renderizadores](https://a2ui.org/reference/renderers/)
- [Documentación del ADK](https://adk.dev/) · [Integración A2UI en ADK](https://adk.dev/integrations/a2ui/)

## Licencia

Los ejemplos de código del codelab están bajo [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).
