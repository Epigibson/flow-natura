"""
Flow Natura Backend - Mentorship Router
Session scheduling and learning progress tracking.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import (
    MentorshipSession, MentorshipProgress,
    MentorshipModule, MentorshipLesson,
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/mentorship", tags=["Mentorship"])


@router.get("/modules")
async def list_modules(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List mentorship modules with their lessons."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(MentorshipModule)
        .options(selectinload(MentorshipModule.lessons))
        .order_by(MentorshipModule.sort_order)
    )
    result = await db.execute(stmt)
    modules = result.scalars().unique().all()

    return [
        {
            "id": str(m.id),
            "title": m.title,
            "description": m.description,
            "icon": m.icon,
            "sort_order": m.sort_order,
            "lessons": [
                {
                    "id": str(l.id),
                    "module_id": str(l.module_id),
                    "title": l.title,
                    "description": l.description,
                    "content": l.content,
                    "content_type": l.content_type,
                    "duration_minutes": l.duration_minutes,
                    "sort_order": l.sort_order,
                }
                for l in m.lessons
            ],
        }
        for m in modules
    ]


@router.get("/sessions")
async def list_sessions(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List mentorship sessions for the consultant."""
    stmt = (
        select(MentorshipSession)
        .where(MentorshipSession.consultant_id == user_id)
        .order_by(MentorshipSession.scheduled_date.desc())
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "session_type": s.session_type,
            "scheduled_date": s.scheduled_date.isoformat() if s.scheduled_date else None,
            "status": s.status,
            "topic": s.topic,
            "notes": s.notes,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.post("/sessions", status_code=201)
async def create_session(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Schedule a new mentorship session."""
    session = MentorshipSession(
        consultant_id=user_id,
        session_type=data.get("session_type", "general"),
        scheduled_date=data.get("scheduled_date"),
        topic=data.get("topic"),
        notes=data.get("notes"),
        status=data.get("status", "scheduled"),
    )
    db.add(session)
    await db.commit()
    return {"id": str(session.id), "status": session.status}


@router.patch("/sessions/{session_id}/cancel")
async def cancel_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a mentorship session."""
    stmt = select(MentorshipSession).where(
        and_(MentorshipSession.id == session_id, MentorshipSession.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.status = "canceled"
    await db.commit()
    return {"id": str(session.id), "status": "canceled"}


@router.get("/progress")
async def get_progress(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get learning progress for the consultant."""
    stmt = (
        select(MentorshipProgress)
        .where(MentorshipProgress.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    progress = result.scalars().all()

    return [
        {
            "id": str(p.id),
            "module_id": p.module_id,
            "lesson_id": p.lesson_id,
            "completed": p.completed,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        }
        for p in progress
    ]


@router.post("/progress", status_code=201)
async def save_progress(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update learning progress. Replaces delete+insert pattern."""
    module_id = data["module_id"]
    lesson_id = data["lesson_id"]

    # Delete existing entry for this module+lesson
    del_stmt = delete(MentorshipProgress).where(
        and_(
            MentorshipProgress.consultant_id == user_id,
            MentorshipProgress.module_id == module_id,
            MentorshipProgress.lesson_id == lesson_id,
        )
    )
    await db.execute(del_stmt)

    # Insert new
    progress = MentorshipProgress(
        consultant_id=user_id,
        module_id=module_id,
        lesson_id=lesson_id,
        completed=data.get("completed", True),
    )
    db.add(progress)
    await db.commit()
    return {"id": str(progress.id), "module_id": module_id, "lesson_id": lesson_id}


@router.delete("/progress")
async def clear_progress(
    module_id: str = Query(...),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear all progress for a module."""
    del_stmt = delete(MentorshipProgress).where(
        and_(
            MentorshipProgress.consultant_id == user_id,
            MentorshipProgress.module_id == module_id,
        )
    )
    await db.execute(del_stmt)
    await db.commit()
    return {"deleted": True, "module_id": module_id}
