from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ModelName(str, Enum):
    GPT4_O = "gpt-4o"


class Message(BaseModel):
    role: str  # "human" or "ai"
    content: str

class QueryInput(BaseModel):
    question: str
    session_id: str = Field(default=None)  # type: ignore
    history: Optional[List[Message]] = [] 
    source_documents: Optional[List[str]] = [] 
    
class QueryResponse(BaseModel):
    response: dict
    session_id: str


class DocumentInfo(BaseModel):
    id: int
    filename: str
    upload_timestamp: datetime


class DeleteFileRequest(BaseModel):
    file_id: int
