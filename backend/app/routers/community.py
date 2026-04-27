"""
Flow Natura Backend - Community Router
Social features: posts, reactions, comments.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import CommunityPost, CommunityReaction, CommunityComment
from app.dependencies import get_current_user

router = APIRouter(prefix="/community", tags=["Community"])


@router.get("/posts")
async def list_posts(
    topic: str | None = Query(None),
    limit: int = Query(50, le=200),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List community posts with reactions and comment counts."""
    stmt = (
        select(CommunityPost)
        .options(
            selectinload(CommunityPost.reactions),
            selectinload(CommunityPost.comments),
        )
        .order_by(CommunityPost.created_at.desc())
        .limit(limit)
    )
    if topic and topic != "all":
        stmt = stmt.where(CommunityPost.topic == topic)

    result = await db.execute(stmt)
    posts = result.scalars().unique().all()

    response = []
    for p in posts:
        # Count reactions by type
        reaction_counts: dict[str, int] = {}
        user_reactions: list[str] = []
        for r in p.reactions:
            reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
            if r.user_id == user_id:
                user_reactions.append(r.reaction_type)

        response.append({
            "id": str(p.id),
            "author_id": str(p.author_id),
            "author_name": p.author_name,
            "content": p.content,
            "topic": p.topic,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "reactions": reaction_counts,
            "user_reactions": user_reactions,
            "comment_count": len(p.comments),
        })

    return response


@router.post("/posts", status_code=201)
async def create_post(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new community post."""
    post = CommunityPost(
        author_id=user_id,
        author_name=data.get("author_name", "Consultora"),
        content=data["content"],
        topic=data.get("topic", "general"),
    )
    db.add(post)
    await db.commit()
    return {"id": str(post.id), "content": post.content}


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    post_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a community post (only author)."""
    stmt = select(CommunityPost).where(
        and_(CommunityPost.id == post_id, CommunityPost.author_id == user_id)
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado")

    await db.delete(post)
    await db.commit()


@router.post("/reactions")
async def toggle_reaction(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a reaction on a post."""
    post_id = uuid.UUID(data["post_id"])
    reaction_type = data["reaction_type"]

    # Check existing
    stmt = select(CommunityReaction).where(
        and_(
            CommunityReaction.post_id == post_id,
            CommunityReaction.user_id == user_id,
            CommunityReaction.reaction_type == reaction_type,
        )
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"action": "removed", "reaction_type": reaction_type}
    else:
        reaction = CommunityReaction(
            post_id=post_id, user_id=user_id, reaction_type=reaction_type
        )
        db.add(reaction)
        await db.commit()
        return {"action": "added", "reaction_type": reaction_type}


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List comments for a post."""
    stmt = (
        select(CommunityComment)
        .where(CommunityComment.post_id == post_id)
        .order_by(CommunityComment.created_at.asc())
    )
    result = await db.execute(stmt)
    comments = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "author_id": str(c.author_id),
            "author_name": c.author_name,
            "content": c.content,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]


@router.post("/comments", status_code=201)
async def create_comment(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a post."""
    comment = CommunityComment(
        post_id=uuid.UUID(data["post_id"]),
        author_id=user_id,
        author_name=data.get("author_name", "Consultora"),
        content=data["content"],
    )
    db.add(comment)
    await db.commit()
    return {"id": str(comment.id), "content": comment.content}


@router.get("/stats")
async def community_stats(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get community statistics."""
    post_count = (await db.execute(select(func.count(CommunityPost.id)))).scalar() or 0
    reaction_count = (await db.execute(select(func.count(CommunityReaction.id)))).scalar() or 0
    comment_count = (await db.execute(select(func.count(CommunityComment.id)))).scalar() or 0

    # Unique authors
    author_stmt = select(func.count(func.distinct(CommunityPost.author_id)))
    unique_authors = (await db.execute(author_stmt)).scalar() or 0

    # Top contributors
    contrib_stmt = (
        select(CommunityPost.author_id, CommunityPost.author_name, func.count(CommunityPost.id).label("count"))
        .group_by(CommunityPost.author_id, CommunityPost.author_name)
        .order_by(func.count(CommunityPost.id).desc())
        .limit(3)
    )
    contrib_result = await db.execute(contrib_stmt)

    return {
        "post_count": post_count,
        "reaction_count": reaction_count,
        "comment_count": comment_count,
        "unique_authors": unique_authors,
        "top_contributors": [
            {"author_id": str(r.author_id), "author_name": r.author_name, "count": r.count}
            for r in contrib_result.all()
        ],
    }
