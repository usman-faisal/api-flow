from fastapi import APIRouter
from app.api.test import router as test_router
from app.api.workflow import router as workflow_router

api_router = APIRouter()
api_router.include_router(test_router, prefix="/test", tags=["Test"])
api_router.include_router(workflow_router, prefix="/workflow", tags=["Workflow"])
