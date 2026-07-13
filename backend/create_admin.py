#!/usr/bin/env python3
"""Print a password hash for BAILBONDS_ADMIN_PASSWORD_HASH."""
from getpass import getpass
from .auth import hash_password

if __name__ == "__main__":
    print(hash_password(getpass("Password: ")))
