import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize model
try:
    model = genai.GenerativeModel("gemini-2.5-flash-lite")
    logger.info("✅ Gemini model initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Gemini: {e}")
    model = None

app = FastAPI(title="CS2 Tactical Chat API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request validation
class Message(BaseModel):
    role: str
    parts: List[str]

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    history: List[Message] = Field(default_factory=list, max_items=10)
    map_name: str = Field(default="Mirage")
    side: str = Field(default="CT")

class HealthResponse(BaseModel):
    status: str
    model_available: bool

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "ok",
        "model_available": model is not None
    }

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat responses with proper error handling and rate limit awareness
    """
    if model is None:
        raise HTTPException(status_code=503, detail="AI model not available. Check API key.")
    
    def generate():
        try:
            # Build message history
            contents = [
                {
                    "role": "user",
                    "parts": [f"You are a professional Counter-Strike 2 IGL (In-Game Leader) specializing in {request.map_name} {request.side} side strategy. Provide tactical advice, positioning tips, and economic decisions. Be concise and actionable."]
                }
            ]
            
            # Add conversation history (limit to last 6 exchanges to save tokens)
            contents.extend(request.history[-6:])
            
            # Add current message
            contents.append({"role": "user", "parts": [request.message]})
            
            logger.info(f"📤 Sending request to Gemini | Map: {request.map_name} | Side: {request.side}")
            
            # Generate response with streaming
            response = model.generate_content(contents, stream=True)
            
            for chunk in response:
                if chunk.text:
                    # Stream text chunks
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n"
            
            # Send completion signal
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            logger.info("✅ Stream completed successfully")
            
        except Exception as e:
            error_message = str(e)
            logger.error(f"❌ Stream error: {error_message}")
            
            # Provide user-friendly error messages
            if "quota" in error_message.lower() or "rate" in error_message.lower():
                user_message = "⚠️ API quota exceeded. Please wait a few minutes before trying again, or upgrade your Gemini API plan."
            elif "api" in error_message.lower():
                user_message = "⚠️ API key error. Please check your GEMINI_API_KEY in .env"
            else:
                user_message = f"⚠️ Error: {error_message[:100]}"
            
            yield f"data: {json.dumps({'type': 'error', 'content': user_message})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

# Alternative endpoints for future flexibility
@app.post("/chat/completion")
async def chat_completion(request: ChatRequest):
    """
    Non-streaming chat endpoint (useful for slow clients)
    """
    if model is None:
        raise HTTPException(status_code=503, detail="AI model not available")
    
    try:
        contents = [
            {
                "role": "user",
                "parts": [f"You are a professional Counter-Strike 2 IGL on {request.map_name} {request.side}."]
            }
        ]
        contents.extend(request.history[-6:])
        contents.append({"role": "user", "parts": [request.message]})
        
        response = model.generate_content(contents)
        return {"response": response.text}
    
    except Exception as e:
        logger.error(f"Completion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
