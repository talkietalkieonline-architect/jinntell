# Задача для Sonnet: Модель Contractor + Авторизация + Админка

**Задача #002** | Подготовлена: Opus | Дата: Май 2026

---

## Контекст

Aimigo — AI-платформа. Нужно добавить сущность "Контрагент" (бизнес-клиент), чтобы:
1. Админ мог создавать контрагентов в админке
2. Контрагент входил в ЛК по логину/паролю (отдельно от SMS-авторизации пользователей)
3. Контрагент видел своих агентов и мог их настраивать

---

## Что нужно сделать

### 1. Backend: Модель Contractor

**Файл:** `backend/app/models/contractor.py` (НОВЫЙ)

```python
from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Float
from sqlalchemy.sql import func
from app.core.database import Base

class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True, index=True)
    # Юр. данные
    company_name = Column(String(200), nullable=False)
    inn = Column(String(20))
    legal_address = Column(String(500))
    actual_address = Column(String(500))
    bank_details = Column(String(500))
    # Контакты
    director_name = Column(String(100))
    contact_name = Column(String(100))
    contact_phone = Column(String(20))
    contact_email = Column(String(200))
    # Авторизация
    login = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    # Биллинг
    balance_kopecks = Column(BigInteger, default=0)  # баланс в копейках
    discount_percent = Column(Float, default=0)  # корп. скидка (видит только админ)
    # Статус
    is_active = Column(Boolean, default=True)
    # Мета
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### 2. Backend: Схемы

**Файл:** `backend/app/schemas/contractor.py` (НОВЫЙ)

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ContractorCreate(BaseModel):
    company_name: str
    login: str
    password: str  # plain text, хэшируем при создании
    inn: Optional[str] = None
    legal_address: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    director_name: Optional[str] = None
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
    company_name: str
    inn: Optional[str]
    legal_address: Optional[str]
    actual_address: Optional[str]
    contact_name: Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str]
    director_name: Optional[str]
    login: str
    balance_kopecks: int
    discount_percent: float
    is_active: bool
    created_at: Optional[datetime]

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
```

### 3. Backend: API авторизации контрагента

**Файл:** `backend/app/api/contractor_auth.py` (НОВЫЙ)

Эндпоинты:
- `POST /api/contractor/login` — вход по логину/паролю → JWT
- `GET /api/contractor/me` — профиль контрагента (из JWT)
- `PATCH /api/contractor/me` — обновить свои юр. данные

JWT для контрагента должен содержать `{"sub": contractor_id, "type": "contractor"}`.

Dependency `get_current_contractor` — проверяет JWT, тип "contractor", возвращает Contractor из БД.

Использовать bcrypt для хэширования пароля (уже есть в проекте: `app/core/security.py`).

### 4. Backend: API агентов контрагента

**Файл:** `backend/app/api/contractor_agents.py` (НОВЫЙ)

Эндпоинты:
- `GET /api/contractor/agents` — список моих агентов (contractor_id из JWT)
- `GET /api/contractor/agents/{id}` — полная карточка агента (только свой)
- `PATCH /api/contractor/agents/{id}` — обновить настройки агента (только свой)

Контрагент может менять: description, greeting, system_prompt, llm_model, manner_*, knowledge_text, voice_id, voice_speed, voice_pitch, outfit_*, appearance_*.

Контрагент НЕ может: менять name, profession, brand, agent_type, owner_id, is_active.

### 5. Backend: Админка — CRUD контрагентов

**Файл:** `backend/app/api/admin.py` (ДОПОЛНИТЬ)

Добавить эндпоинты:
- `GET /api/admin/contractors` — список всех контрагентов
- `POST /api/admin/contractors` — создать контрагента (хэширует пароль)
- `GET /api/admin/contractors/{id}` — карточка
- `PATCH /api/admin/contractors/{id}` — обновить (включая discount_percent)
- `DELETE /api/admin/contractors/{id}` — деактивировать
- `POST /api/admin/contractors/{id}/add-balance` — пополнить баланс (body: `{"amount_kopecks": 15000000}`)
- `POST /api/admin/contractors/{id}/assign-agent` — привязать агента к контрагенту (body: `{"agent_id": 5}`)

### 6. Backend: Модель Agent — добавить поля

**Файл:** `backend/app/models/agent.py` (ДОПОЛНИТЬ)

Добавить если нет:
```python
contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=True)
is_template = Column(Boolean, default=False)
template_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
visibility = Column(String(20), default="public")  # public/link_only/private/personal
unavailable_message = Column(String(500), nullable=True)  # кастомное сообщение при отключении
```

### 7. Backend: Регистрация роутеров

**Файл:** `backend/app/main.py` (или где регистрируются роутеры)

Добавить:
```python
from app.api.contractor_auth import router as contractor_auth_router
from app.api.contractor_agents import router as contractor_agents_router

app.include_router(contractor_auth_router)
app.include_router(contractor_agents_router)
```

### 8. Backend: Импорт модели

**Файл:** `backend/app/models/__init__.py` (ДОПОЛНИТЬ)

Добавить импорт Contractor чтобы таблица создавалась автоматически.

### 9. Frontend: API функции

**Файл:** `frontend/src/services/api.ts` (ДОПОЛНИТЬ)

Добавить:
```typescript
// Contractor auth
export interface ContractorLoginData { login: string; password: string; }
export interface ContractorTokenResponse { access_token: string; contractor_id: number; company_name: string; }
export interface ContractorProfile { id: number; company_name: string; inn?: string; /* ... все поля */ }

export function contractorLogin(data: ContractorLoginData): Promise<ContractorTokenResponse> { ... }
export function contractorGetMe(): Promise<ContractorProfile> { ... }
export function contractorGetAgents(): Promise<AgentFullOut[]> { ... }
export function contractorUpdateAgent(id: number, data: AgentPersonaUpdate): Promise<AgentFullOut> { ... }

// Admin: contractors
export interface ContractorOut { id: number; company_name: string; login: string; balance_kopecks: number; discount_percent: number; is_active: boolean; /* ... */ }

export function adminGetContractors(): Promise<ContractorOut[]> { ... }
export function adminCreateContractor(data: any): Promise<ContractorOut> { ... }
export function adminUpdateContractor(id: number, data: any): Promise<ContractorOut> { ... }
export function adminAddBalance(id: number, amount: number): Promise<ContractorOut> { ... }
export function adminAssignAgentToContractor(contractorId: number, agentId: number): Promise<void> { ... }
```

Для contractor endpoints использовать отдельный токен (хранить в `localStorage` как `aimigo_contractor_token`).

### 10. Frontend: Админка — вкладка "Контрагенты"

**Файл:** `frontend/src/app/admin/page.tsx` (ДОПОЛНИТЬ)

Добавить таб "Контрагенты" (`contractors`) в навигацию:
- Таблица: компания, ИНН, логин, баланс, скидка%, статус, дата
- Создание контрагента (форма: компания, логин, пароль, ИНН, контакты, скидка)
- Редактирование (все поля + скидка)
- Пополнение баланса (ввод суммы)
- Привязка агента (выбор из списка агентов)
- Деактивация

Стиль: как существующие вкладки (dark theme, gray-900 фоны, amber-500 акценты).

### 11. Frontend: ЛК Контрагента — авторизация

**Файл:** `frontend/src/components/communicator/BusinessDashboardModal.tsx` (ПЕРЕПИСАТЬ)

Сейчас ЛК показывает агентов привязанных к пользователю (owner_id). Нужно:
1. Добавить форму входа (логин/пароль) если нет contractor-сессии
2. При успешном входе — показать полный ЛК
3. Хранить contractor_token отдельно от user_token

Если контрагент не залогинен — показать форму входа.
Если залогинен — показать ЛК с агентами.

---

## Файлы для создания/изменения

НОВЫЕ:
1. `backend/app/models/contractor.py`
2. `backend/app/schemas/contractor.py`
3. `backend/app/api/contractor_auth.py`
4. `backend/app/api/contractor_agents.py`

ИЗМЕНИТЬ:
5. `backend/app/models/__init__.py` — импорт Contractor
6. `backend/app/models/agent.py` — поля contractor_id, is_template, visibility, unavailable_message
7. `backend/app/api/admin.py` — CRUD контрагентов
8. `backend/app/main.py` — регистрация роутеров
9. `frontend/src/services/api.ts` — API функции
10. `frontend/src/app/admin/page.tsx` — вкладка "Контрагенты"
11. `frontend/src/components/communicator/BusinessDashboardModal.tsx` — авторизация контрагента

---

## Важные замечания

- Пароли хэшировать через bcrypt (`from passlib.context import CryptContext` — уже есть в `app/core/security.py`)
- JWT для контрагента: `{"sub": str(contractor_id), "type": "contractor"}` — отличается от пользовательского
- Таблицы создаются автоматически через SQLAlchemy `Base.metadata.create_all` (уже настроено)
- Не ломать существующую авторизацию пользователей (SMS)
- Стиль фронтенда: тёмная тема, amber акценты (как в остальной админке)
- Build должен проходить чисто (TypeScript + Next.js)

---

## Как проверить

1. В админке: создать контрагента (логин: test_business, пароль: 123456)
2. В админке: привязать агента к контрагенту
3. Открыть Город Агентов → "Для бизнеса" → ввести логин/пароль
4. Должен появиться ЛК с привязанным агентом
5. Изменить настройки агента → проверить что сохранилось
