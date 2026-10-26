"""
conftest.py
-----------
Pytest configuration and sandbox compatibility layer for Windows.
Avoids loopback socket connections when running under sandboxed/restricted environments.
"""

import sys

if sys.platform == "win32":
    import asyncio.proactor_events

    class _DummySock:
        def fileno(self):
            return -1

        def close(self):
            pass

        def setblocking(self, b):
            pass

    def _dummy_make_self_pipe(self):
        self._ssock = _DummySock()
        self._csock = _DummySock()
        self._internal_fds += 1

    def _patched_init(self, proactor):
        super(asyncio.proactor_events.BaseProactorEventLoop, self).__init__()
        self._proactor = proactor
        self._selector = proactor
        self._self_reading_future = None
        self._accept_futures = {}
        proactor.set_loop(self)
        self._make_self_pipe()

    asyncio.proactor_events.BaseProactorEventLoop._make_self_pipe = _dummy_make_self_pipe
    asyncio.proactor_events.BaseProactorEventLoop._loop_self_reading = lambda self, f=None: None
    asyncio.proactor_events.BaseProactorEventLoop.__init__ = _patched_init
