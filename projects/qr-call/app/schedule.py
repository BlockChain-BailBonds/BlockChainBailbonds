from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re

CLOCK = re.compile(r'^([01][0-9]|2[0-3]):([0-5][0-9])$')


def validate_schedule(tz, windows, start_at, end_at):
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValueError('Unknown IANA timezone')
    if start_at is not None and start_at.utcoffset() is None:
        raise ValueError('Start must have a timezone offset')
    if end_at is not None and end_at.utcoffset() is None:
        raise ValueError('End must have a timezone offset')
    if start_at is not None and end_at is not None and end_at <= start_at:
        raise ValueError('End must be after start')
    if not isinstance(windows, list) or len(windows) > 14:
        raise ValueError('Windows must be a list with at most 14 entries')
    for window in windows:
        if not isinstance(window, dict) or set(window.keys()) != {'days', 'start', 'end'}:
            raise ValueError('Window must have days, start, end')
        days = window['days']
        if not isinstance(days, list) or not days or len(days) > 7 or any(type(d) is not int or d not in range(7) for d in days) or len(set(days)) != len(days):
            raise ValueError('Choose valid weekdays 0=Monday through 6=Sunday')
        if not isinstance(window['start'], str) or not isinstance(window['end'], str) or not CLOCK.fullmatch(window['start']) or not CLOCK.fullmatch(window['end']) or window['start'] == window['end']:
            raise ValueError('Use distinct 24-hour HH:MM start/end times')


def allowed(code, at=None):
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if not code.enabled:
        return False
    if code.start_at and at < code.start_at.replace(tzinfo=code.start_at.tzinfo or timezone.utc).astimezone(timezone.utc):
        return False
    if code.end_at and at >= code.end_at.replace(tzinfo=code.end_at.tzinfo or timezone.utc).astimezone(timezone.utc):
        return False
    if not code.windows:
        return True
    local = at.astimezone(ZoneInfo(code.timezone))
    minute = local.hour * 60 + local.minute
    today, yesterday = local.weekday(), (local.weekday() - 1) % 7
    for w in code.windows:
        start = int(w['start'][:2]) * 60 + int(w['start'][3:])
        end = int(w['end'][:2]) * 60 + int(w['end'][3:])
        if end > start and today in w['days'] and start <= minute < end:
            return True
        if end < start and ((today in w['days'] and minute >= start) or (yesterday in w['days'] and minute < end)):
            return True
    return False


def next_change(code, at=None):
    """Return the next permission state change without expensive minute-by-minute scans."""
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    initial = allowed(code, at)
    candidates = set()
    for absolute in (code.start_at, code.end_at):
        if absolute is not None:
            candidate = absolute.replace(tzinfo=absolute.tzinfo or timezone.utc).astimezone(timezone.utc)
            if candidate > at:
                candidates.add(candidate)
    if code.windows:
        tz = ZoneInfo(code.timezone)
        start_day = at.astimezone(tz).date() - timedelta(days=1)
        for offset in range(11):
            day = start_day + timedelta(days=offset)
            if day.weekday() not in {d for window in code.windows for d in window['days']}:
                continue
            for window in code.windows:
                if day.weekday() not in window['days']:
                    continue
                first = datetime.combine(day, datetime.strptime(window['start'], '%H:%M').time())
                end_day = day + timedelta(days=int(window['end'] < window['start']))
                last = datetime.combine(end_day, datetime.strptime(window['end'], '%H:%M').time())
                for point in (first, last):
                    for fold in (0, 1):
                        candidate = point.replace(tzinfo=tz, fold=fold).astimezone(timezone.utc)
                        if candidate > at:
                            candidates.add(candidate)
    for candidate in sorted(candidates):
        if allowed(code, candidate) != initial:
            return candidate
    return None
