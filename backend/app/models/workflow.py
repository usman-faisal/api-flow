from enum import Enum
from pydantic import BaseModel, Field, RootModel
from typing import List, Dict, Any, Optional




'''
    NODE 1 PLAN NODE MODELS
'''

class ActionType(str, Enum):
    """Defines the type of action to be performed in a plan step."""
    API_CALL = "api_call"
    DATA_EXTRACTION = "data_extraction"

class PlanStep(BaseModel):
    description: str = Field(..., description="A clear, human-readable summary of what this step accomplishes.")
    action_type: ActionType = Field(..., description="The type of action to be performed in this step.")

class Plan(BaseModel):
    """A root model to hold the list of plan steps."""
    steps: List[PlanStep]


'''
    NODE 2 API CALLL NODE MODELS
'''
class HttpMethod(str, Enum):
    """Defines allowed HTTP methods."""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"

class ApiDetails(BaseModel):
    url: str = Field(..., description="The full API endpoint URL. Use placeholders like {step_1_var} for dynamic data.")
    method: HttpMethod = Field(..., description="The HTTP method for the request.")
    body: Optional[Dict[str, Any]] = Field(None, description="The JSON body for POST/PUT requests. Use placeholders for dynamic data.")
    headers: Optional[Dict[str, str]] = Field(None, description="Request headers. Use placeholders for dynamic values like auth tokens.")

'''
    NODE 3 DATA EXTRACTION NODE MODELS
'''
class ExtractedData(RootModel[Dict[str, Any]]):
    pass

'''
    WORKFLOW REQUEST AND RESPONSE MODELS
'''
class WorkflowRequest(BaseModel):
    prompt: str

class WorkflowStepResponse(BaseModel):
    step_title: str
    request_details: Dict[str, Any]
    response_details: Any
    extracted_data: Optional[Dict[str, Any]] = None

class WorkflowResponse(BaseModel):
    results: List[WorkflowStepResponse]
    plan: Optional[Plan]



