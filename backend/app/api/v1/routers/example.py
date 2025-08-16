"""Example router module."""

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

router = APIRouter()

# Example data store (in production, this would be a database)
example_data = [
    {"id": 1, "name": "Example Item 1", "description": "This is an example item"},
    {"id": 2, "name": "Example Item 2", "description": "This is another example item"},
]


@router.get("/items", response_model=List[Dict[str, Any]])
async def get_items():
    """Get all example items"""
    return example_data


@router.get("/items/{item_id}", response_model=Dict[str, Any])
async def get_item(item_id: int):
    """Get a specific item by ID"""
    for item in example_data:
        if item["id"] == item_id:
            return item
    raise HTTPException(status_code=404, detail="Item not found")


@router.post("/items", response_model=Dict[str, Any])
async def create_item(name: str, description: str = ""):
    """Create a new item"""
    new_id = max((item["id"] for item in example_data), default=0) + 1
    new_item = {"id": new_id, "name": name, "description": description}
    example_data.append(new_item)
    return new_item
