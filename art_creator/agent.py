import os
import time
from google.adk.agents.llm_agent import Agent
from google.adk.tools.tool_context import ToolContext
from google.genai import types
from a2ui.schema.manager import A2uiSchemaManager
from a2ui.basic_catalog.provider import BasicCatalog

# Load env variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


async def generate_image(prompt: str, tool_context: ToolContext) -> dict:
    """Generates a high-quality image based on the user's detailed description prompt."""
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


schema_manager = A2uiSchemaManager(
    version="0.8",
    catalogs=[BasicCatalog.get_config("0.8")],
)

instruction = schema_manager.generate_system_prompt(
    role_description=(
        "You are a specialized Image Creator agent. "
        "When given an image description, analyze the prompt and ask the user for any missing details. "
        "The image generation prompt should include: "
        "Subject, environment, style, lighting, color and mood. "
    ),
    workflow_description=(
        "1. if the user greets you, greet the user back explaining your purpose. "
        "2. if the user describes an image, DO NOT GENERATE IT IMMEDIATELY: compare with "
        "   the ideal generation prompt and ask the user for any missing details using "
        "   rich A2UI UI elements only. NOTE: only run this step once per image, if the user "
        "   decides to not detail one or more elements it is ok. "
        "3. combine the original prompt with the responses in the UI elements and call `generate_image` "
        "   with the generated prompt. "
        "   DO NOT INCLUDE EXAMPLES IN THE GENERATED PROMPT, ONLY THE ELEMENTS THE USER ASKED FOR. "
        "4. display the resulting image to the user in a card including the image, the prompt and a "
        "   download button"
    ),
    ui_description=(
        "Use Card, Text, Image, Multichoice and Button components to present the options. "
        "Always include a single choice selection box for image resolution (1K, 2K or 4K) and one for "
        "aspect ratio (1:1, 16:9 or 9:16). "
        "When rendering the final output (generated image) always render the generated image using an "
        "Image component with the url bound to the image's URL/path returned by the tool. "
        "Add a Text component with the prompt that generated the image. "
        "Include a Button component labeled 'Download PNG' to allow downloading the image. "
        "Do NOT use markdown formatting in text values. Use the usageHint property for heading levels instead. "
        "Respond ONLY with the A2UI JSON array. Do NOT include any text "
        "outside the JSON. Put all explanations into Text components."
    ),
    include_schema=True,
)

root_agent = Agent(
    model="gemini-3.5-flash",
    name="art_agent_a2ui",
    instruction=instruction,
    tools=[generate_image],
)
