import os
import time
from google.adk.agents.llm_agent import Agent
from google.adk.tools.tool_context import ToolContext
from google.genai import types

# Load env variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


async def generate_image(prompt: str, tool_context: ToolContext) -> dict:
    """Generates a high-quality image based on the user's detailed description prompt.

    Args:
        prompt: A descriptive text prompt describing the image to generate.
        tool_context: Context for the tool execution.
    """
    from google.genai import Client
    client = Client(
        vertexai=True,
        project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    )

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-image",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
            )
        )

        image_bytes = None
        for part in response.parts or []:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                break

        if not image_bytes:
            return {"status": "failed", "detail": "No image data returned"}

        filename = f"image_{int(time.time())}.png"
        await tool_context.save_artifact(
            filename,
            types.Part.from_bytes(data=image_bytes, mime_type='image/png'),
        )

        return {
            "status": "success",
            "filename": filename,
            "url": f"/api/artifacts/{tool_context.session.id}/{filename}"
        }
    except Exception as e:
        return {"status": "failed", "detail": str(e)}


root_agent = Agent(
    name="art_agent",
    model="gemini-3.5-flash",
    description="A basic art generation agent.",
    instruction=(
        "You are an art assistant. When the user describes an image they want to generate, "
        "use the generate_image tool to create it, then return a text message containing the image's URL."
    ),
    tools=[generate_image],
)
