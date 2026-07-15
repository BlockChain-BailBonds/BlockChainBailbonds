import unittest
from backend.public_booking import public_booking_record, public_booking_records


class PublicBookingTests(unittest.TestCase):
    def test_public_name_returned_by_source_is_preserved(self):
        safe = public_booking_record({"name": "Jane Doe", "booking_number": "B-1", "charges": "Example"})
        self.assertEqual(safe["name"], "Jane Doe")
        self.assertEqual(safe["booking_id"], "B-1")

    def test_non_public_sensitive_fields_are_not_republished(self):
        safe = public_booking_record({"Name": "Jane Doe", "DOB": "2000-01-01", "Address": "private"})
        self.assertEqual(safe["name"], "Jane Doe")
        self.assertNotIn("DOB", safe)
        self.assertNotIn("Address", safe)

    def test_payload_shapes_are_normalized(self):
        records = public_booking_records({"data": [{"id": "1"}, {"id": "2"}]})
        self.assertEqual(len(records), 2)


if __name__ == "__main__":
    unittest.main()
