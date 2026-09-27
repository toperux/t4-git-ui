#!/usr/bin/env python3
"""Closes an X11 window the way its title-bar x does: sends it WM_DELETE_WINDOW (ICCCM).

Under Xvfb there is no window manager to do that for a click, and `xdotool windowclose` destroys the
window instead, which skips the app's close handling. See docs/smoke/smoke-linux.md.

    DISPLAY=:99 python3 xclose.py <window id>      # the id from `xdotool search` / xdialog.sh --dump
"""
import ctypes
import sys

x = ctypes.cdll.LoadLibrary("libX11.so.6")
x.XOpenDisplay.restype = ctypes.c_void_p
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XInternAtom.restype = ctypes.c_ulong
x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
x.XFlush.argtypes = [ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]


class ClientMessage(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int),
        ("l", ctypes.c_long * 5),
    ]


class Event(ctypes.Union):  # XEvent is 24 longs; XSendEvent reads that much
    _fields_ = [("xclient", ClientMessage), ("pad", ctypes.c_long * 24)]


win = int(sys.argv[1], 0)
dpy = x.XOpenDisplay(None)
if not dpy:
    sys.exit("cannot open display")
ev = Event()
ev.xclient.type = 33  # ClientMessage
ev.xclient.window = win
ev.xclient.message_type = x.XInternAtom(dpy, b"WM_PROTOCOLS", 0)
ev.xclient.format = 32
ev.xclient.l[0] = x.XInternAtom(dpy, b"WM_DELETE_WINDOW", 0)
ev.xclient.l[1] = 0  # CurrentTime
x.XSendEvent(dpy, win, 0, 0, ctypes.byref(ev))
x.XFlush(dpy)
x.XCloseDisplay(dpy)
print("sent WM_DELETE_WINDOW to", hex(win))
