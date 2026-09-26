"""Post-mandate notification providers."""

from .smtp_email import SmtpEmailError, SmtpEmailSender

__all__ = ["SmtpEmailError", "SmtpEmailSender"]
