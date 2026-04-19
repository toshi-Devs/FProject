import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# USE THE 2026 ACTIVE MODEL: gemini-3.1-flash-lite-preview
model = genai.GenerativeModel("gemini-3.1-flash-lite-preview") 

app = FastAPI()

# ... (middleware setup same as before) ...

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    def generate():
        # Level 2 Context: Keeping history for conversation memory
        contents = [{"role": "user", "parts": [f"System: You are a CS2 IGL on {request.map_name} {request.side}."]}]
        contents += request.history
        contents.append({"role": "user", "parts": [request.message]})

        try:
            response = model.generate_content(contents, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            # Send the error to your UI so you can see if it's still a quota issue
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")