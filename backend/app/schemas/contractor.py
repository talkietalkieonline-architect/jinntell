"""
Contractor schemas — Pydantic модели для API контрагента.
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ContractorCreate(BaseModel):
    company_name: str
    login: str
    password: str  # plain text, хэшируем при создании
    inn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    bank_details: Optional[str] = None
    director_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    discount_percent: Optional[float] = 0


class ContractorUpdate(BaseModel):
    company_name: Optional[str] = None
    inn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    bank_details: Optional[str] = None
    director_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    discount_percent: Optional[float] = None
    is_active: Optional[bool] = None


class ContractorOut(BaseModel):
    id: int
    uid: Optional[str] = None
    company_name: str
    inn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    bank_details: Optional[str] = None
    director_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    login: str
    balance_kopecks: int
    discount_percent: float
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContractorLogin(BaseModel):
    login: str
    password: str


class ContractorTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    contractor_id: int
    company_name: str


class AddBalanceRequest(BaseModel):
    amount_kopecks: int


class AssignAgentRequest(BaseModel):
    agent_id: int
