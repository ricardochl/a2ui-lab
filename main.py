import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.adk.runners import InMemoryRunner
from google.adk.agents.run_config import RunConfig
from google.genai import types

from art_creator.agent import root_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Art Agent - Simple Chat")


class ChatRequest(BaseModel):
    prompt: str
    session_id: str = "default_session"


static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)

runner = InMemoryRunner(agent=root_agent)
runner.auto_create_session = True


@app.get("/api/artifacts/{session_id}/{filename}")
async def get_artifact(session_id: str, filename: str):
    user_id = "default_user"
    part = await runner.artifact_service.load_artifact(
        app_name=runner.app_name,
        user_id=user_id,
        filename=filename,
        session_id=session_id
    )
    if not part:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if part.inline_data:
        from fastapi.responses import Response
        return Response(content=part.inline_data.data, media_type=part.inline_data.mime_type)
    raise HTTPException(status_code=400, detail="Unsupported artifact format")


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    user_id = "default_user"
    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=request.prompt)]
    )

    full_response_text = ""
    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=request.session_id,
            new_message=content,
            run_config=RunConfig(save_input_blobs_as_artifacts=True),
        ):
            if event.content and event.content.parts:
                if event.author != "user":
                    for part in event.content.parts:
                        if part.text:
                            full_response_text += part.text
                        elif part.inline_data:
                            try:
                                # Process raw binary/custom text parts (A2UI callback packages)
                                text_data = part.inline_data.data.decode("utf-8")
                                full_response_text += text_data
                            except Exception:
                                pass
    except Exception as e:
        logger.exception("Error running ADK agent:")
        raise HTTPException(status_code=500, detail=str(e))

    image_url = None
    try:
        artifact_keys = await runner.artifact_service.list_artifact_keys(
            app_name=runner.app_name,
            user_id=user_id,
            session_id=request.session_id
        )
        image_keys = [k for k in artifact_keys if k.startswith("image_") and k.endswith(".png")]
        if image_keys:
            sorted_keys = sorted(image_keys, reverse=True)
            image_url = f"/api/artifacts/{request.session_id}/{sorted_keys[0]}"
    except Exception:
        pass

    return {
        "text": full_response_text.strip(),
        "image_url": image_url
    }


app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def read_index():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(static_dir, "index.html"))
