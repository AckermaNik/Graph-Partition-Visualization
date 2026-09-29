from pydantic import BaseModel, Field
from typing import Any, Dict, Optional,List

#FastAPI request classes 
class ConnectionPayload(BaseModel):
    url: str
    username: str
    password: str
    
    
class SchemaRequest(BaseModel):
    conn_id: str
    refresh: bool = False 


class CypherRequest(BaseModel):
    conn_id: str
    query: str
    params: Dict[str, Any] = Field(default_factory=dict)
    anonymous:bool= False 


class SavedQueryRequest(BaseModel):
    conn_id: str
    query: str


class DeleteSavedQueryRequest(BaseModel):
    conn_id: str
    query_id: str
