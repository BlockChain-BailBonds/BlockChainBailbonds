import unittest
from unittest.mock import patch

from backend.notifications import deliver_notification, webhook_signature


class NotificationTests(unittest.TestCase):
    def test_notification_is_not_claimed_delivered_without_provider(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(("provider_not_configured", None), deliver_notification({"id": 1}))

    def test_signature_is_deterministic(self):
        self.assertEqual(webhook_signature(b'{"id":1}', "secret"), webhook_signature(b'{"id":1}', "secret"))


if __name__ == "__main__":
    unittest.main()
