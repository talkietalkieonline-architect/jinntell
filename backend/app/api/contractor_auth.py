"""
Contractor Auth API — авторизация контрагента (логин/пароль).
Отдельная от пользовательской SMS-авторизации.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_contractor_token
from app.models.contractor import Contractor
from app.schemas.contractor import ContractorLogin, ContractorTokenResponse, ContractorOut, ContractorUpdate

router = APIRouter(prefix="/api/contractor", tags=["contractor"])


async def get_current_contractor(
    token: str = None,
    db: AsyncSession = Depends(get_db),
) -> Contractor:
    """Dependency: получить текущего контрагента из JWT."""
    # Токен приходит через query param или header
    raise HTTPException(401, "Not authenticated")


async def _get_contractor_from_token(token: str, db: AsyncSession) -> Contractor:
    """Вспомогательная: декодировать токен и загрузить контрагента."""
    contractor_id = decode_contractor_token(token)
    if not contractor_id:
        raise HTTPException(401, "Невалидный токен")
    result = await db.execute(
        select(Contractor).where(Contractor.id == contractor_id, Contractor.is_active == True)
    )
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(401, "Контрагент не найден или деактивирован")
    return contractor


@router.post("/login", response_model=ContractorTokenResponse)
async def contractor_login(
    body: ContractorLogin,
    db: AsyncSession = Depends(get_db),
):
    """Вход контрагента по логину/паролю → JWT"""
    result = await db.execute(
        select(Contractor).where(Contractor.login == body.login)
    )
    contractor = result.scalar_one_or_none()

    if not contractor or not verify_password(body.password, contractor.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")

    if not contractor.is_active:
        raise HTTPException(403, "Аккаунт деактивирован")

    token = create_access_token(contractor.id, token_type="contractor")

    return ContractorTokenResponse(
        access_token=token,
        contractor_id=contractor.id,
        company_name=contractor.company_name,
    )


@router.get("/me", response_model=ContractorOut)
async def contractor_me(
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Профиль контрагента. Токен передаётся как query ?token= или header Authorization."""
    from fastapi import Request
    # Будет вызываться с токеном — пока простая реализация
    if not token:
        raise HTTPException(401, "Токен не передан")
    contractor = await _get_contractor_from_token(token, db)
    return ContractorOut.model_validate(contractor)


@router.patch("/me", response_model=ContractorOut)
async def contractor_update_me(
    body: ContractorUpdate,
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Обновить свои юр. данные. Контрагент НЕ может менять: login, discount_percent, is_active."""
    if not token:
        raise HTTPException(401, "Токен не передан")
    contractor = await _get_contractor_from_token(token, db)

    # Контрагент может менять только свои данные (не скидку, не статус)
    allowed_fields = {
        "company_name", "inn", "legal_address", "actual_address",
        "bank_details", "director_name", "contact_name", "contact_phone", "contact_email"
    }
    for field in body.model_fields_set:
        if field in allowed_fields:
            value = getattr(body, field, None)
            if value is not None:
                setattr(contractor, field, value)

    await db.flush()
    await db.refresh(contractor)
    return ContractorOut.model_validate(contractor)
