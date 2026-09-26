"""SMTP adapter tests replace the socket client and never send real email."""

from backend.notifications.smtp_email import SmtpEmailSender


def test_smtp_sender_uses_starttls_login_and_plan_links(monkeypatch) -> None:
    """Configured credentials stay in transport calls and plan links reach the body."""
    events = []

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            events.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            events.append(("close",))

        def starttls(self, context):
            events.append(("starttls",))

        def login(self, username, password):
            events.append(("login", username, password))

        def send_message(self, message):
            events.append(("send", message["To"], message.get_content()))

    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_SECURITY", "starttls")
    monkeypatch.setenv("SMTP_USERNAME", "affinity-user")
    monkeypatch.setenv("SMTP_PASSWORD", "test-secret")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "plans@example.com")
    monkeypatch.setattr("backend.notifications.smtp_email.smtplib.SMTP", FakeSmtp)

    SmtpEmailSender()._send_plan_sync(
        recipient_name="Maya",
        recipient_email="maya@example.com",
        mission={
            "kind": "plan",
            "occasion": "Family night",
            "budget": 100,
            "freeText": "Dinner",
            "type": "shared",
            "invitedSpriteIds": ["wife"],
        },
        plan={
            "stops": [
                {
                    "id": "place-1",
                    "slot": "dinner",
                    "name": "Garden Table",
                    "address": "1 Main St",
                    "tags": ["restaurant"],
                    "googleMapsUri": "https://maps.example/place-1",
                }
            ],
            "location": "Atlanta",
            "serves": {"wife": ["place-1"]},
            "source": "google_places",
        },
        message_id="<test@affinity.local>",
    )

    assert ("starttls",) in events
    assert ("login", "affinity-user", "test-secret") in events
    sent = next(event for event in events if event[0] == "send")
    assert "maya@example.com" in sent[1]
    assert "https://maps.example/place-1" in sent[2]
