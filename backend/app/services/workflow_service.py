from typing import AsyncGenerator, Dict, Any
from app.models.workflow import WorkflowRequest, WorkflowResponse
from app.services.agents.workflow_agent import stream_workflow_graph


class WorkflowService:
    """Service class for handling workflow operations."""
    
    @staticmethod
    async def execute_workflow_stream(
        request: WorkflowRequest,
    ) -> AsyncGenerator[str, None]:
        """
        Executes a workflow and streams the results back.

        Args:
            request: WorkflowRequest containing the user's prompt

        Returns:
            An async generator yielding Server-Sent Events.
        """
        try:
            # The service now calls the streaming agent and returns the generator
            return stream_workflow_graph(request)
        except Exception as e:
            # In a real app, you'd have more robust logging/error handling here
            print(f"Error executing workflow stream: {str(e)}")
            raise
    
    @staticmethod
    async def validate_workflow_request(prompt: str) -> Dict[str, Any]:
        """
        Validate a workflow request before execution.
        
        Args:
            prompt: The user's natural language prompt
            
        Returns:
            Dict containing validation results
        """
        if not prompt or not prompt.strip():
            return {
                "valid": False,
                "error": "Prompt cannot be empty"
            }
        
        if len(prompt.strip()) < 10:
            return {
                "valid": False,
                "error": "Prompt is too short. Please provide more detailed instructions."
            }
        
        return {
            "valid": True,
            "message": "Prompt is valid"
        }
