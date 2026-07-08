"""API городов — список, ближайший по гео, админ-управление"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.city import City
from app.models.user import User

router = APIRouter(prefix="/api/cities", tags=["cities"])


class CityOut(BaseModel):
    id: int
    name: str
    slug: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class CityCreate(BaseModel):
    name: str
    slug: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class Coords(BaseModel):
    lat: float
    lng: float


@router.get("", response_model=list[CityOut])
async def list_cities(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(City).where(City.is_active == True).order_by(City.name))
    return [CityOut.model_validate(c) for c in res.scalars().all()]


@router.get("/all", response_model=list[CityOut])
async def list_all_cities(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(403, "Только админ")
    res = await db.execute(select(City).order_by(City.name))
    return [CityOut.model_validate(c) for c in res.scalars().all()]


@router.post("/nearest", response_model=Optional[CityOut])
async def nearest_city(body: Coords, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(City).where(City.is_active == True, City.lat.isnot(None)))
    cities = res.scalars().all()
    best, best_d = None, 1e18
    for c in cities:
        d = (c.lat - body.lat) ** 2 + (c.lng - body.lng) ** 2
        if d < best_d:
            best_d, best = d, c
    return CityOut.model_validate(best) if best else None


@router.post("", response_model=CityOut, status_code=201)
async def create_city(body: CityCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(403, "Только админ")
    c = City(name=body.name, slug=body.slug, lat=body.lat, lng=body.lng)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return CityOut.model_validate(c)


@router.patch("/{city_id}", response_model=CityOut)
async def update_city(city_id: int, body: dict, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(403, "Только админ")
    c = await db.get(City, city_id)
    if not c:
        raise HTTPException(404, "Город не найден")
    for f in ("name", "slug", "lat", "lng", "is_active"):
        if f in body and body[f] is not None:
            setattr(c, f, body[f])
    await db.commit()
    await db.refresh(c)
    return CityOut.model_validate(c)
