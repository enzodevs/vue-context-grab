# Security policy

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for issues that could expose application data, bypass sanitization, or run the picker in production unexpectedly. Do not open a public issue with a working exploit or sensitive payload.

For ordinary bugs that do not expose private data, use the public issue tracker.

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Data boundary

Vue Context Grab runs during Vite development only and writes to the local clipboard after an explicit selection. It should never transmit captured context over the network or inspect application state, cookies, storage, request headers, or form values.
