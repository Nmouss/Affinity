"""SMTP plan email delivery with STARTTLS and SSL support.

SMTP is used only after the graph's human mandate. Passwords are read from the
environment at send time and are never placed in graph state or logs.
"""

from __future__ import annotations

import asyncio
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any

from ..models import Mission, Plan


class SmtpEmailError(RuntimeError):
    """Raised with a credential-free description of an SMTP failure."""


class SmtpEmailSender:
    """Send an approved Affinity plan to one opted-in participant."""

    async def send_plan(
        self,
        *,
        recipient_name: str,
        recipient_email: str,
        mission: Mission,
        plan: Plan,
        message_id: str,
    ) -> str:
        """Send without blocking LangGraph's async event loop."""
        await asyncio.to_thread(
            self._send_plan_sync,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            mission=mission,
            plan=plan,
            message_id=message_id,
        )
        return message_id

    def _send_plan_sync(
        self,
        *,
        recipient_name: str,
        recipient_email: str,
        mission: Mission,
        plan: Plan,
        message_id: str,
    ) -> None:
        host = os.getenv("SMTP_HOST", "").strip()
        username = os.getenv("SMTP_USERNAME", "").strip()
        password = os.getenv("SMTP_PASSWORD", "")
        from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
        from_name = os.getenv("SMTP_FROM_NAME", "Affinity").strip() or "Affinity"
        security = os.getenv("SMTP_SECURITY", "starttls").casefold()
        if security not in {"starttls", "ssl", "none"}:
            raise SmtpEmailError("SMTP_SECURITY must be starttls, ssl, or none")
        if not host or not from_email:
            raise SmtpEmailError("SMTP_HOST and SMTP_FROM_EMAIL are required")
        if username and not password:
            raise SmtpEmailError("SMTP_PASSWORD is required when SMTP_USERNAME is set")
        default_port = 465 if security == "ssl" else 587
        try:
            port = int(os.getenv("SMTP_PORT", str(default_port)))
            timeout = float(os.getenv("SMTP_TIMEOUT_SECONDS", "20"))
        except ValueError as error:
            raise SmtpEmailError("SMTP_PORT and SMTP_TIMEOUT_SECONDS must be numeric") from error

        message = EmailMessage()
        message["Subject"] = f"Affinity plan approved: {mission['occasion']}"
        message["From"] = formataddr((from_name, from_email))
        message["To"] = formataddr((recipient_name, recipient_email))
        reply_to = os.getenv("SMTP_REPLY_TO", "").strip()
        if reply_to:
            message["Reply-To"] = reply_to
        message["Message-ID"] = message_id
        message.set_content(self._plain_text(recipient_name, mission, plan))

        try:
            if security == "ssl":
                server: Any = smtplib.SMTP_SSL(
                    host, port, timeout=timeout, context=ssl.create_default_context()
                )
            else:
                server = smtplib.SMTP(host, port, timeout=timeout)
            with server:
                if security == "starttls":
                    server.starttls(context=ssl.create_default_context())
                if username:
                    server.login(username, password)
                server.send_message(message)
        except (OSError, smtplib.SMTPException) as error:
            raise SmtpEmailError(f"SMTP delivery failed: {error.__class__.__name__}") from error

    @staticmethod
    def _plain_text(recipient_name: str, mission: Mission, plan: Plan) -> str:
        lines = [
            f"Hi {recipient_name},",
            "",
            f"Your Affinity plan for {mission['occasion']} was approved.",
            f"Location: {plan['location']}",
        ]
        if plan.get("when"):
            lines.append(f"When: {plan['when']}")
        lines.extend(["", "Plan:"])
        for index, stop in enumerate(plan["stops"], start=1):
            lines.append(f"{index}. {stop['name']} — {stop['address']}")
            if stop.get("googleMapsUri"):
                lines.append(f"   Maps: {stop['googleMapsUri']}")
            if stop.get("websiteUri"):
                lines.append(f"   Website: {stop['websiteUri']}")
        lines.extend(
            [
                "",
                "Venue availability and pricing can change. Check the linked venue before going.",
                "",
                "— Affinity",
            ]
        )
        return "\n".join(lines)
