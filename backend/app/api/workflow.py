from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from app.models.workflow import WorkflowRequest, WorkflowResponse
from app.services.workflow_service import WorkflowService

router = APIRouter()


@router.post("/execute-stream", tags=["Workflow"])
async def execute_workflow_stream(request: WorkflowRequest):
    """
    Execute a workflow and stream the results in real-time.

    This endpoint takes a natural language prompt and returns a stream of
    Server-Sent Events (SSE) as the workflow executes.

    Events you can listen for on the client:
    - **plan_created**: The initial plan is generated.
    - **api_call_completed**: An API call step has finished.
    - **data_extracted**: Data has been extracted from an API response.
    - **error**: An error occurred.
    - **end**: The workflow has successfully completed.
    """
    try:
        validation = await WorkflowService.validate_workflow_request(request.prompt)
        if not validation["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation["error"],
            )

        event_generator = await WorkflowService.execute_workflow_stream(request)

        return StreamingResponse(event_generator, media_type="text/event-stream")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute workflow stream: {str(e)}",
        )


@router.post("/validate", tags=["Workflow"])
async def validate_workflow_prompt(request: WorkflowRequest):
    """
    Validate a workflow prompt without executing it.

    This endpoint checks if a prompt is valid and well-formed
    before actual execution.
    """
    try:
        validation = await WorkflowService.validate_workflow_request(request.prompt)
        return JSONResponse(
            status_code=status.HTTP_200_OK if validation["valid"] else status.HTTP_400_BAD_REQUEST,
            content=validation
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate workflow: {str(e)}"
        )


@router.get("/health", tags=["Workflow"])
async def workflow_health_check():
    """
    Health check endpoint for the workflow service.
    """
    return {
        "status": "healthy",
        "service": "workflow",
        "message": "Workflow service is running"
    }
