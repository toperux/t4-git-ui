#!/usr/bin/env python3
"""Reads and drives T4 Git UI's GTK parts through AT-SPI: what WebDriver can't see, such as a text field's native
menu. Run it inside the app's own session bus (docs/smoke/smoke-linux.md, "AT-SPI"), with accessibility on there.

  atspi.py dump [depth]               the app's tree, role 'name'; a run of same-role siblings shows 3 and a count
  atspi.py menu                       the open GTK popup's items, each with whether it is sensitive
  atspi.py click "<role>" "<name>"    do_action(0) on the first match, e.g. click "menu item" "Paste"
  atspi.py wait "<role>" "<name>" [s] poll until it appears (default 5 s); exits 1 on a timeout

Every verb prints one line per item, or one line on an error, and exits 1 when it fails. ATSPI_APP names the
application (default t4-git-ui).
"""
import os
import sys
import time
from itertools import groupby

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

APP = os.environ.get("ATSPI_APP", "t4-git-ui")
RUN = 3  # dump shows this many siblings of one role in a row, then a count


def fail(msg):
    print(msg)
    sys.exit(1)


def app():
    desk = Atspi.get_desktop(0)
    for i in range(desk.get_child_count()):
        a = desk.get_child_at_index(i)
        if a is not None and a.get_name() == APP:
            return a
    fail(f"no application named {APP!r} on this bus (is accessibility on, and the app in this session?)")


def kids(acc):
    for i in range(acc.get_child_count()):
        c = acc.get_child_at_index(i)
        if c is not None:
            yield c


def walk(acc):
    yield acc
    for c in kids(acc):
        yield from walk(c)


def label(acc):
    return f"{acc.get_role_name()} {acc.get_name()!r}"


def dump(acc, depth, level=0):
    n = acc.get_child_count()
    print("  " * level + label(acc) + (f" [{n} children]" if n > RUN else ""))
    if level >= depth:
        return
    for role, run in groupby(kids(acc), key=lambda c: c.get_role_name()):
        run = list(run)
        for c in run[:RUN]:
            dump(c, depth, level + 1)
        if len(run) > RUN:
            print("  " * (level + 1) + f"… {len(run) - RUN} more {role}")


def find(role, name):
    return next((a for a in walk(app()) if a.get_role_name() == role and a.get_name() == name), None)


def menu():
    # A submenu is a named `menu` among the items (Insert Unicode Control Character); the popup itself is unnamed.
    items = [a for a in walk(app()) if a.get_state_set().contains(Atspi.StateType.SHOWING)
             and (a.get_role_name() in ("menu item", "check menu item", "radio menu item")
                  or (a.get_role_name() == "menu" and a.get_name()))]
    if not items:
        fail("no menu open")
    for a in items:
        print(f"{label(a)} sensitive={a.get_state_set().contains(Atspi.StateType.SENSITIVE)}")


def main(argv):
    verb = argv[1] if len(argv) > 1 else ""
    if verb == "dump":
        dump(app(), int(argv[2]) if len(argv) > 2 else 6)
    elif verb == "menu":
        menu()
    elif verb == "click" and len(argv) == 4:
        acc = find(argv[2], argv[3]) or fail(f"no {argv[2]} {argv[3]!r}")
        acc.get_action_iface().do_action(0)
        print(f"clicked {label(acc)}")
    elif verb == "wait" and len(argv) in (4, 5):
        end = time.time() + float(argv[4] if len(argv) == 5 else 5)
        while (acc := find(argv[2], argv[3])) is None:
            if time.time() > end:
                fail(f"timeout waiting for {argv[2]} {argv[3]!r}")
            time.sleep(0.2)
        print(f"found {label(acc)}")
    else:
        fail("usage: atspi.py dump [depth] | menu | click <role> <name> | wait <role> <name> [s]")


if __name__ == "__main__":
    main(sys.argv)
