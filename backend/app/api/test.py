from fastapi import APIRouter

router = APIRouter()

@router.get("/test", tags=["Test"])
async def test_endpoint():
    return {"message": "This is a test endpoint!"}