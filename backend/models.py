import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    Text,
    func
)
from sqlalchemy.orm import relationship
from .db import Base


class SoftDeleteMixin:
    deleted_at = Column(DateTime, nullable=True, default=None, index=True)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class VersionedMixin:
    version = Column(Integer, nullable=False, default=1)


class CompanyUser(Base, SoftDeleteMixin):
    __tablename__ = "company_users"
    __table_args__ = (
        Index("ix_company_users_lower_email", func.lower(Column("email", String(255))), unique=True),
    )

    user_id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="Employee")  # Employee, Manager, HR_Admin
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    employee = relationship("Employee", back_populates="company_user", uselist=False)


class Employee(Base, SoftDeleteMixin, VersionedMixin):
    __tablename__ = "employees"
    __table_args__ = (
        Index("ix_employees_lower_email", func.lower(Column("email", String(255))), unique=True),
    )

    employee_id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("company_users.user_id"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False, default="Software Engineer")
    department = Column(String(128), nullable=False, default="Engineering", index=True)
    team = Column(String(128), nullable=False, default="Core Platform")
    location = Column(String(128), nullable=False, default="Remote")
    manager_id = Column(String(64), nullable=True)
    hire_date = Column(String(32), nullable=True)
    availability_percent = Column(Float, nullable=False, default=80.0)
    hours_per_week_free = Column(Float, nullable=False, default=32.0)
    last_active_date = Column(String(32), nullable=True)
    current_workload_percent = Column(Float, nullable=False, default=20.0)
    weekly_learning_hours = Column(Float, nullable=False, default=5.0)
    available_from = Column(String(32), nullable=True)
    target_role_id = Column(String(64), ForeignKey("roles.role_id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    company_user = relationship("CompanyUser", back_populates="employee")
    target_role = relationship("Role", foreign_keys=[target_role_id])
    skills = relationship("EmployeeSkill", back_populates="employee")
    evidence_items = relationship("Evidence", back_populates="employee")
    certifications = relationship("Certification", back_populates="employee")
    applications = relationship("ProjectApplication", back_populates="employee")
    progress_items = relationship("UpskillingProgress", back_populates="employee")
    projects = relationship("EmployeeProject", back_populates="employee")


class Skill(Base, SoftDeleteMixin):
    __tablename__ = "skills"

    skill_id = Column(String(64), primary_key=True)
    skill_name = Column(String(128), nullable=False, unique=True, index=True)
    category = Column(String(64), nullable=False, index=True)
    domain = Column(String(64), nullable=True)
    synonyms = Column(Text, nullable=True)          # Pipe-delimited aliases
    related_skill_ids = Column(Text, nullable=True) # Pipe-delimited IDs

    employee_skills = relationship("EmployeeSkill", back_populates="skill")
    role_skills = relationship("RoleSkill", back_populates="skill")
    learning_resources = relationship("LearningResource", back_populates="skill")


class Role(Base, SoftDeleteMixin):
    __tablename__ = "roles"

    role_id = Column(String(64), primary_key=True)
    role_title = Column(String(255), nullable=False, index=True)
    department = Column(String(128), nullable=False, index=True)
    priority = Column(String(32), nullable=False, default="Normal")
    status = Column(String(32), nullable=False, default="Open", index=True)  # Open, Closed
    min_availability_percent = Column(Float, nullable=False, default=40.0)
    description = Column(Text, nullable=True)

    required_skills = relationship("RoleSkill", back_populates="role")
    progress_items = relationship("UpskillingProgress", back_populates="role")


class RoleSkill(Base, SoftDeleteMixin):
    __tablename__ = "role_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(String(64), ForeignKey("roles.role_id"), nullable=False, index=True)
    skill_id = Column(String(64), ForeignKey("skills.skill_id"), nullable=False, index=True)
    required_level = Column(String(32), nullable=False, default="Advanced")
    importance = Column(String(16), nullable=False, default="Must")  # Must, Nice

    role = relationship("Role", back_populates="required_skills")
    skill = relationship("Skill", back_populates="role_skills")

    __table_args__ = (
        UniqueConstraint("role_id", "skill_id", name="uq_role_skill"),
    )


class Project(Base, SoftDeleteMixin):
    __tablename__ = "projects"

    project_id = Column(String(64), primary_key=True)
    project_name = Column(String(255), nullable=False, index=True)
    domain = Column(String(128), nullable=False, default="Engineering")
    complexity = Column(Float, nullable=False, default=3.0)
    technologies = Column(Text, nullable=True)  # Pipe-delimited
    start_date = Column(String(32), nullable=True)
    end_date = Column(String(32), nullable=True)
    status = Column(String(32), nullable=False, default="Active")

    members = relationship("EmployeeProject", back_populates="project")


class EmployeeProject(Base, SoftDeleteMixin):
    __tablename__ = "employee_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    project_id = Column(String(64), ForeignKey("projects.project_id"), nullable=False, index=True)
    role = Column(String(64), nullable=False, default="Contributor")
    contribution_summary = Column(Text, nullable=True)

    employee = relationship("Employee", back_populates="projects")
    project = relationship("Project", back_populates="members")

    __table_args__ = (
        UniqueConstraint("employee_id", "project_id", name="uq_employee_project"),
    )


class EmployeeSkill(Base, SoftDeleteMixin, VersionedMixin):
    __tablename__ = "employee_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    skill_id = Column(String(64), ForeignKey("skills.skill_id"), nullable=False, index=True)
    proficiency_level = Column(String(32), nullable=False, default="Independent")
    claimed_level = Column(String(32), nullable=True)
    years_experience = Column(Float, nullable=False, default=1.0)
    source = Column(String(32), nullable=False, default="self")
    verification_status = Column(String(32), nullable=False, default="Self-reported")
    last_used_date = Column(String(32), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    employee = relationship("Employee", back_populates="skills")
    skill = relationship("Skill", back_populates="employee_skills")

    __table_args__ = (
        UniqueConstraint("employee_id", "skill_id", name="uq_employee_skill"),
    )


class Evidence(Base, SoftDeleteMixin, VersionedMixin):
    __tablename__ = "evidence"

    evidence_id = Column(String(64), primary_key=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    skill_id = Column(String(64), ForeignKey("skills.skill_id"), nullable=False, index=True)
    project_id = Column(String(64), ForeignKey("projects.project_id"), nullable=True, index=True)
    evidence_type = Column(String(32), nullable=False, default="PR")  # PR, commit, project, cert, feedback
    title = Column(String(255), nullable=False)
    url = Column(String(512), nullable=True)
    artifact_date = Column(String(32), nullable=False)
    base_weight = Column(Float, nullable=False, default=1.0)
    complexity_score = Column(Float, nullable=False, default=3.0)
    verification_status = Column(String(32), nullable=False, default="Self-reported")  # Self-reported, Link checked, Verified by HR, Rejected, Needs info
    share_percentage = Column(Float, nullable=False, default=100.0)
    hr_notes = Column(Text, nullable=True)
    is_duplicate = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    employee = relationship("Employee", back_populates="evidence_items")
    skill = relationship("Skill")
    project = relationship("Project")

    __table_args__ = (
        # Note: If URL is non-empty, url per employee must be unique
        Index("idx_evidence_emp_url", "employee_id", "url"),
    )


class Certification(Base, SoftDeleteMixin):
    __tablename__ = "certifications"

    cert_id = Column(String(64), primary_key=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    skill_id = Column(String(64), ForeignKey("skills.skill_id"), nullable=True, index=True)
    cert_name = Column(String(255), nullable=False)
    issuer = Column(String(255), nullable=False)
    issued_date = Column(String(32), nullable=True)
    expiry_date = Column(String(32), nullable=True)

    employee = relationship("Employee", back_populates="certifications")
    skill = relationship("Skill")


class LearningResource(Base, SoftDeleteMixin):
    __tablename__ = "learning_resources"

    resource_id = Column(String(64), primary_key=True)
    skill_id = Column(String(64), ForeignKey("skills.skill_id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    provider = Column(String(128), nullable=False, default="Internal Academy")
    type = Column(String(32), nullable=False, default="course")  # course, cert, project, mentor
    mentor_employee_id = Column(String(64), nullable=True)
    duration_weeks = Column(String(16), nullable=False, default="2")
    estimated_hours = Column(Float, nullable=False, default=16.0)
    target_level = Column(String(32), nullable=False, default="Advanced")

    skill = relationship("Skill", back_populates="learning_resources")
    progress_items = relationship("UpskillingProgress", back_populates="resource")


class UpskillingProgress(Base, SoftDeleteMixin, VersionedMixin):
    __tablename__ = "upskilling_progress"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    role_id = Column(String(64), ForeignKey("roles.role_id"), nullable=False, index=True)
    resource_id = Column(String(64), ForeignKey("learning_resources.resource_id"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="Not started")  # Not started, In progress, Done, Awaiting approval
    progress_percent = Column(Float, nullable=False, default=0.0)
    hours_logged = Column(Float, nullable=False, default=0.0)
    completion_proof_url = Column(String(512), nullable=True)
    approval_status = Column(String(32), nullable=False, default="Pending")  # Pending, Approved, Rejected
    approval_note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    employee = relationship("Employee", back_populates="progress_items")
    role = relationship("Role", back_populates="progress_items")
    resource = relationship("LearningResource", back_populates="progress_items")

    __table_args__ = (
        UniqueConstraint("employee_id", "role_id", "resource_id", name="uq_upskilling_enrollment"),
    )


class ProjectApplication(Base, SoftDeleteMixin, VersionedMixin):
    __tablename__ = "project_applications"

    application_id = Column(String(64), primary_key=True)
    opportunity_id = Column(String(64), nullable=False, index=True)
    opportunity_type = Column(String(32), nullable=False, default="project")  # project, role
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    employee_name = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    hours_per_week = Column(Float, nullable=False, default=10.0)
    applied_at = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="Pending")  # Pending, Shortlisted, Accepted, Rejected, Withdrawn, Filled
    hr_decision_note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    employee = relationship("Employee", back_populates="applications")

    __table_args__ = (
        UniqueConstraint("employee_id", "opportunity_id", name="uq_employee_opportunity"),
    )


class ProjectShortlist(Base, SoftDeleteMixin):
    __tablename__ = "project_shortlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String(64), nullable=False, index=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    shortlisted_by = Column(String(255), nullable=True)
    shortlisted_at = Column(String(32), nullable=True)
    note = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("project_id", "employee_id", name="uq_project_shortlist"),
    )


class CourseSuggestion(Base, SoftDeleteMixin):
    __tablename__ = "course_suggestions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String(64), ForeignKey("employees.employee_id"), nullable=False, index=True)
    skill_id = Column(String(64), nullable=True)
    suggested_title = Column(String(255), nullable=False)
    suggested_provider = Column(String(255), nullable=True)
    suggested_url = Column(String(512), nullable=True)
    estimated_hours = Column(Float, nullable=True, default=10.0)
    why_helpful = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="Submitted")  # Submitted, Approved, Rejected
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    event_id = Column(String(64), primary_key=True)
    event_type = Column(String(64), nullable=False, index=True)
    actor_id = Column(String(64), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    target_id = Column(String(64), nullable=True, index=True)
    target_email = Column(String(255), nullable=True)
    ip = Column(String(64), nullable=True)
    timestamp = Column(String(64), nullable=False)
    details = Column(Text, nullable=True)
    # Note: Append-only table. No deleted_at column.


class DataVersion(Base):
    __tablename__ = "data_versions"

    scope = Column(String(64), primary_key=True)  # "global", "employee:<employee_id>"
    version = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
