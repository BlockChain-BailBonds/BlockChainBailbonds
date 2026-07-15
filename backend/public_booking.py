"""Public-safe normalization for the Tulsa booking feed."""
from __future__ import annotations


def public_booking_record(record: dict) -> dict:
    """Preserve source-returned public fields without inventing restricted data."""
    if not isinstance(record, dict):
        return {}
    def first(*keys):
        for key in keys:
            if record.get(key) not in (None, ""):
                return record[key]
        return None
    result = {
        "booking_id": first("booking_id", "bookingNumber", "booking_number", "id", "Booking Number"),
        "booked_at": first("booked_at", "booking_date", "bookingDate", "Booked"),
        "status": first("status", "Status") or "booked",
        "charges": first("charges", "charge", "Charges"),
        "bond_amount": first("bond_amount", "bondAmount", "Bond Amount"),
    }
    name = first("name", "full_name", "Name")
    if name not in (None, ""):
        result["name"] = name
    return {key: value for key, value in result.items() if value not in (None, "")}


def public_booking_records(payload) -> list[dict]:
    if isinstance(payload, dict):
        records = payload.get("records", payload.get("data", payload.get("bookings", [])))
    else:
        records = payload
    if isinstance(records, dict):
        records = [records]
    if not isinstance(records, list):
        return []
    return [item for item in (public_booking_record(record) for record in records[:500]) if item]
